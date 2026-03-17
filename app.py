from flask import Flask, request, jsonify, render_template, redirect, url_for, session, flash
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import pickle
import pandas as pd
from urllib.parse import urlparse
import datetime
import re
import ssl
import socket
import traceback
import logging
import json
import os
import requests as http_requests

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = 'phishguard_secret_key_2026'
CORS(app)

# User storage file
USERS_FILE = os.path.join(os.path.dirname(__file__), 'users.json')


def load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    return {}


def save_users(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_email' not in session:
            return redirect(url_for('signin'))
        return f(*args, **kwargs)
    return decorated


# Load the URL phishing detection model
try:
    with open('phishing.pkl', 'rb') as f:
        model = pickle.load(f)
    logger.info("URL model loaded successfully")
except Exception as e:
    logger.error(f"Failed to load URL model: {str(e)}")
    model = None


# ──────────────────────────────────────────────
# WHOIS Domain Age Helper
# ──────────────────────────────────────────────
def get_domain_age(domain):
    try:
        import whois
        w = whois.whois(domain)
        creation = w.creation_date
        if isinstance(creation, list):
            creation = creation[0]
        if creation:
            age = (datetime.datetime.now() - creation).days
            return max(age, 0)
    except Exception:
        pass
    return None


# ──────────────────────────────────────────────
# SSL Certificate Checker
# ──────────────────────────────────────────────
def check_ssl_certificate(hostname):
    result = {
        'has_ssl': False, 'issuer': None, 'subject': None,
        'valid_from': None, 'valid_until': None,
        'days_remaining': None, 'is_expired': None,
        'version': None, 'serial_number': None, 'error': None
    }
    try:
        hostname = hostname.split(':')[0].strip()
        context = ssl.create_default_context()
        with socket.create_connection((hostname, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                result['has_ssl'] = True
                result['version'] = ssock.version()
                issuer_dict = dict(x[0] for x in cert.get('issuer', []))
                result['issuer'] = issuer_dict.get('organizationName', issuer_dict.get('commonName', 'Unknown'))
                subject_dict = dict(x[0] for x in cert.get('subject', []))
                result['subject'] = subject_dict.get('commonName', 'Unknown')
                not_before = datetime.datetime.strptime(cert['notBefore'], '%b %d %H:%M:%S %Y %Z')
                not_after = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                result['valid_from'] = not_before.strftime('%Y-%m-%d')
                result['valid_until'] = not_after.strftime('%Y-%m-%d')
                days_remaining = (not_after - datetime.datetime.utcnow()).days
                result['days_remaining'] = days_remaining
                result['is_expired'] = days_remaining < 0
                serial = cert.get('serialNumber', '')
                result['serial_number'] = serial[:16] + '...' if len(serial) > 16 else serial
    except ssl.SSLCertVerificationError as e:
        result['error'] = f'Invalid certificate: {str(e)[:80]}'
    except (socket.timeout, socket.gaierror):
        result['error'] = 'Connection timeout or hostname not found'
    except ConnectionRefusedError:
        result['error'] = 'Connection refused — no SSL/TLS on port 443'
    except Exception as e:
        result['error'] = f'SSL check failed: {str(e)[:80]}'
    return result


# ──────────────────────────────────────────────
# URL Shortener Expander
# ──────────────────────────────────────────────
KNOWN_SHORTENERS = [
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
    'buff.ly', 'short.to', 'rebrand.ly', 'cutt.ly', 'rb.gy',
    'shorturl.at', 'tiny.cc', 'lnkd.in', 'soo.gd', 'bl.ink'
]


def expand_url(url):
    result = {
        'original_url': url, 'final_url': url, 'is_shortened': False,
        'redirect_chain': [], 'total_redirects': 0, 'error': None
    }
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace('www.', '')
        result['is_shortened'] = any(s in domain for s in KNOWN_SHORTENERS)
        response = http_requests.head(
            url, allow_redirects=True, timeout=8,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        if response.history:
            result['redirect_chain'] = [r.url for r in response.history]
            result['redirect_chain'].append(response.url)
            result['total_redirects'] = len(response.history)
        result['final_url'] = response.url
        if result['final_url'] != url:
            result['is_shortened'] = True
    except http_requests.exceptions.Timeout:
        result['error'] = 'Request timed out while expanding URL'
    except http_requests.exceptions.ConnectionError:
        result['error'] = 'Could not connect to the URL'
    except Exception as e:
        result['error'] = f'URL expansion failed: {str(e)[:80]}'
    return result


# ──────────────────────────────────────────────
# URL Feature Extraction
# ──────────────────────────────────────────────
def extract_features(url):
    features = {}
    parsed = urlparse(url)
    domain = parsed.netloc
    path = parsed.path
    features['qty_dot_url'] = url.count('.')
    features['qty_hyphen_url'] = url.count('-')
    features['qty_underline_url'] = url.count('_')
    features['qty_slash_url'] = url.count('/')
    features['qty_questionmark_url'] = url.count('?')
    features['qty_equal_url'] = url.count('=')
    features['qty_at_url'] = url.count('@')
    features['qty_and_url'] = url.count('&')
    features['qty_dot_domain'] = domain.count('.')
    features['qty_hyphen_domain'] = domain.count('-')
    features['length_domain'] = len(domain)
    features['length_path'] = len(path)
    features['ip_in_domain'] = 1 if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', domain) else 0
    features['https'] = 1 if parsed.scheme == 'https' else 0
    age = get_domain_age(domain)
    features['domain_age'] = age if age is not None else 1000
    return pd.DataFrame([features]), features['domain_age']


# ──────────────────────────────────────────────
# Email Phishing Analysis
# ──────────────────────────────────────────────
PHISHING_PATTERNS = {
    'urgency': {
        'keywords': ['immediately', 'urgent', 'right away', 'within 24 hours', 'act now', 'expire', 'suspended', 'limited time', 'final warning', 'last chance', "don't delay"],
        'weight': 12, 'label': 'Urgency/pressure language detected'
    },
    'credential_request': {
        'keywords': ['verify your account', 'confirm your identity', 'update your password', 'enter your credentials', 'login details', 'social security', 'credit card number', 'bank account', 'verify your information', 'reset your password'],
        'weight': 15, 'label': 'Requests for personal/credential information'
    },
    'threat': {
        'keywords': ['account will be closed', 'access will be revoked', 'legal action', 'unauthorized access', 'suspicious activity', 'security alert', 'account compromised', 'breach detected'],
        'weight': 12, 'label': 'Threat/fear-inducing language'
    },
    'impersonation': {
        'keywords': ['dear customer', 'dear user', 'dear valued', 'official notice', 'from the team', 'support team', 'help desk', 'IT department', 'security department'],
        'weight': 8, 'label': 'Generic/impersonation greetings'
    },
    'suspicious_links': {
        'keywords': ['click here', 'click below', 'click the link', 'click this', 'visit this link', 'follow this link', 'bit.ly', 'tinyurl', 'goo.gl', 'shorturl'],
        'weight': 10, 'label': 'Suspicious call-to-action links'
    },
    'reward_bait': {
        'keywords': ['congratulations', 'you have won', 'prize', 'lottery', 'selected winner', 'free gift', 'claim your reward', 'exclusive offer'],
        'weight': 14, 'label': 'Reward/lottery bait detected'
    },
    'grammar': {
        'keywords': ['kindly do the needful', 'please revert back', 'do the needful', 'we noticed some unusual'],
        'weight': 6, 'label': 'Poor grammar / unusual phrasing'
    },
}


def analyze_email(text):
    text_lower = text.lower()
    indicators = []
    total_score = 0
    for pattern_id, pattern in PHISHING_PATTERNS.items():
        matched = [kw for kw in pattern['keywords'] if kw in text_lower]
        if matched:
            total_score += pattern['weight']
            indicators.append({
                'type': 'danger',
                'text': f"{pattern['label']} ({len(matched)} match{'es' if len(matched) > 1 else ''})"
            })
    urls_in_text = re.findall(r'https?://\S+', text)
    if urls_in_text:
        total_score += 5
        indicators.append({'type': 'danger', 'text': f'{len(urls_in_text)} embedded URL(s) found in email body'})
    total_score = min(total_score, 100)
    if total_score < 30:
        indicators.append({'type': 'safe', 'text': 'No major phishing patterns detected'})

    if total_score >= 70:
        risk_level, recommendation = 'High Risk', '<strong>⚠️ High phishing probability.</strong> Do not click any links or provide personal information. Report this email as phishing.'
    elif total_score >= 40:
        risk_level, recommendation = 'Medium Risk', "<strong>⚡ Moderate risk detected.</strong> Verify the sender's identity before taking any action. Do not share sensitive data."
    elif total_score >= 15:
        risk_level, recommendation = 'Low Risk', '<strong>ℹ️ Some minor indicators found.</strong> Exercise normal caution. Verify the sender if unsure.'
    else:
        risk_level, recommendation = 'Safe', '<strong>✅ This email appears safe.</strong> No significant phishing indicators were detected.'

    return {'risk_score': total_score, 'risk_level': risk_level, 'indicators': indicators, 'recommendation': recommendation}


# ──────────────────────────────────────────────
# Auth Routes
# ──────────────────────────────────────────────
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if 'user_email' in session:
        return redirect(url_for('home'))

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        if not name or not email or not password:
            flash('All fields are required.', 'danger')
            return redirect(url_for('signup'))

        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'danger')
            return redirect(url_for('signup'))

        if password != confirm:
            flash('Passwords do not match.', 'danger')
            return redirect(url_for('signup'))

        users = load_users()
        if email in users:
            flash('An account with this email already exists.', 'danger')
            return redirect(url_for('signup'))

        users[email] = {
            'name': name,
            'password': generate_password_hash(password),
            'created': datetime.datetime.now().isoformat()
        }
        save_users(users)

        flash('Account created successfully! Please sign in.', 'success')
        return redirect(url_for('signin'))

    return render_template('signup.html')


@app.route('/signin', methods=['GET', 'POST'])
def signin():
    if 'user_email' in session:
        return redirect(url_for('home'))

    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        users = load_users()
        user = users.get(email)

        if not user or not check_password_hash(user['password'], password):
            flash('Invalid email or password.', 'danger')
            return redirect(url_for('signin'))

        session['user_email'] = email
        session['user_name'] = user['name']
        return redirect(url_for('home'))

    return render_template('signin.html')


@app.route('/logout')
def logout():
    session.clear()
    flash('You have been signed out.', 'success')
    return redirect(url_for('signin'))


# ──────────────────────────────────────────────
# Main App Routes
# ──────────────────────────────────────────────
@app.route('/')
@login_required
def home():
    return render_template('index.html', user_name=session.get('user_name', 'User'))


@app.route('/check/url', methods=['POST'])
@login_required
def check_url():
    if not model:
        return jsonify({'error': 'URL model not loaded'}), 500
    try:
        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({'error': 'Missing URL parameter'}), 400
        url = data['url']
        expansion = expand_url(url)
        analysis_url = expansion['final_url'] if expansion['final_url'] != url else url
        features, domain_age = extract_features(analysis_url)
        prediction = model.predict(features)[0]
        probability = model.predict_proba(features)[0][1]
        safety = round((1 - probability) * 100, 2)
        parsed = urlparse(analysis_url)
        ssl_info = check_ssl_certificate(parsed.netloc) if parsed.scheme == 'https' else {'has_ssl': False, 'error': 'Site does not use HTTPS'}
        return jsonify({
            'url': url, 'analyzed_url': analysis_url,
            'safety_percentage': safety, 'status': get_safety_status(safety),
            'color': get_safety_color(safety), 'is_phishing': bool(prediction == 1),
            'domain_age': domain_age, 'ssl': ssl_info,
            'redirect': {
                'is_shortened': expansion['is_shortened'], 'final_url': expansion['final_url'],
                'total_redirects': expansion['total_redirects'],
                'redirect_chain': expansion.get('redirect_chain', [])
            }
        })
    except Exception as e:
        logger.error(f"Error in check_url: {traceback.format_exc()}")
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500


@app.route('/check/email', methods=['POST'])
@login_required
def check_email():
    try:
        data = request.get_json()
        if not data or 'email_text' not in data:
            return jsonify({'error': 'Missing email_text parameter'}), 400
        return jsonify(analyze_email(data['email_text']))
    except Exception as e:
        logger.error(f"Error in check_email: {traceback.format_exc()}")
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500


@app.route('/check/bulk', methods=['POST'])
@login_required
def check_bulk():
    if not model:
        return jsonify({'error': 'URL model not loaded'}), 500
    try:
        data = request.get_json()
        if not data or 'urls' not in data:
            return jsonify({'error': 'Missing urls parameter'}), 400
        urls = data['urls']
        if not isinstance(urls, list) or len(urls) == 0:
            return jsonify({'error': 'urls must be a non-empty list'}), 400
        urls = urls[:20]
        results = []
        for url in urls:
            url = url.strip()
            if not url:
                continue
            try:
                expansion = expand_url(url)
                analysis_url = expansion['final_url'] if expansion['final_url'] != url else url
                features, domain_age = extract_features(analysis_url)
                prediction = model.predict(features)[0]
                probability = model.predict_proba(features)[0][1]
                safety = round((1 - probability) * 100, 2)
                results.append({
                    'url': url, 'analyzed_url': analysis_url,
                    'safety_percentage': safety, 'status': get_safety_status(safety),
                    'color': get_safety_color(safety), 'is_phishing': bool(prediction == 1),
                    'is_shortened': expansion['is_shortened'], 'error': None
                })
            except Exception as e:
                results.append({'url': url, 'safety_percentage': 0, 'status': 'Error', 'color': '#ef4444', 'is_phishing': None, 'error': str(e)[:80]})
        return jsonify({'results': results, 'total': len(results)})
    except Exception as e:
        logger.error(f"Error in check_bulk: {traceback.format_exc()}")
        return jsonify({'error': f'Bulk analysis failed: {str(e)}'}), 500


@app.route('/check/ssl', methods=['POST'])
@login_required
def check_ssl():
    try:
        data = request.get_json()
        if not data or 'hostname' not in data:
            return jsonify({'error': 'Missing hostname parameter'}), 400
        return jsonify(check_ssl_certificate(data['hostname']))
    except Exception as e:
        logger.error(f"Error in check_ssl: {traceback.format_exc()}")
        return jsonify({'error': f'SSL check failed: {str(e)}'}), 500


def get_safety_status(pct):
    if pct >= 80: return "Very Safe"
    if pct >= 60: return "Safe"
    if pct >= 40: return "Moderate Risk"
    if pct >= 20: return "Risky"
    return "Dangerous"


def get_safety_color(pct):
    if pct >= 80: return "#22c55e"
    if pct >= 60: return "#84cc16"
    if pct >= 40: return "#eab308"
    if pct >= 20: return "#f97316"
    return "#ef4444"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)