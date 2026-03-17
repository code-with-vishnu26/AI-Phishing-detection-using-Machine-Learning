document.addEventListener('DOMContentLoaded', () => {
    // ===== DOM Elements =====
    const el = {
        // Tabs
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanels: document.querySelectorAll('.tab-panel'),
        // URL Scanner
        urlInput: document.getElementById('url-input'),
        checkBtn: document.getElementById('check-btn'),
        urlResult: document.getElementById('url-result'),
        urlPreview: document.getElementById('url-preview'),
        meterBar: document.getElementById('meter-bar'),
        safetyPct: document.getElementById('safety-percentage'),
        statusText: document.getElementById('status-text'),
        recommendation: document.getElementById('recommendation'),
        httpsStatus: document.getElementById('https-status'),
        sslStatus: document.getElementById('ssl-status'),
        domainAge: document.getElementById('domain-age'),
        urlLength: document.getElementById('url-length'),
        redirectCount: document.getElementById('redirect-count'),
        certExpiry: document.getElementById('cert-expiry'),
        redirectAlert: document.getElementById('redirect-alert'),
        redirectInfo: document.getElementById('redirect-info'),
        urlError: document.getElementById('url-error'),
        exportUrlPdf: document.getElementById('export-url-pdf'),
        // Email Analyzer
        emailInput: document.getElementById('email-input'),
        emailCheckBtn: document.getElementById('email-check-btn'),
        emailResult: document.getElementById('email-result'),
        riskCircle: document.getElementById('risk-circle'),
        riskScore: document.getElementById('risk-score'),
        riskLabel: document.getElementById('risk-label'),
        indicatorsList: document.getElementById('indicators-list'),
        emailRecText: document.getElementById('email-rec-text'),
        emailError: document.getElementById('email-error'),
        exportEmailPdf: document.getElementById('export-email-pdf'),
        // Bulk Scanner
        bulkInput: document.getElementById('bulk-input'),
        bulkCheckBtn: document.getElementById('bulk-check-btn'),
        bulkResult: document.getElementById('bulk-result'),
        bulkTbody: document.getElementById('bulk-tbody'),
        bulkSummary: document.getElementById('bulk-summary'),
        bulkError: document.getElementById('bulk-error'),
        exportBulkPdf: document.getElementById('export-bulk-pdf'),
        // Dashboard
        statTotal: document.getElementById('stat-total'),
        statThreats: document.getElementById('stat-threats'),
        statSafe: document.getElementById('stat-safe'),
        statEmails: document.getElementById('stat-emails'),
        historyTbody: document.getElementById('history-tbody'),
        emptyHistory: document.getElementById('empty-history'),
        historyTableWrap: document.getElementById('history-table-wrap'),
        clearHistoryBtn: document.getElementById('clear-history-btn'),
    };

    // Store latest results for PDF export
    let lastUrlResult = null;
    let lastEmailResult = null;
    let lastBulkResults = null;

    // ===== Tab Navigation =====
    el.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            el.tabBtns.forEach(b => b.classList.remove('active'));
            el.tabPanels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${tabId}`).classList.add('active');
            if (tabId === 'dashboard') renderDashboard();
        });
    });

    // ══════════════════════════════════════
    // URL Scanner
    // ══════════════════════════════════════
    el.checkBtn.addEventListener('click', checkUrl);
    el.urlInput.addEventListener('keypress', e => { if (e.key === 'Enter') checkUrl(); });

    async function checkUrl() {
        const raw = el.urlInput.value.trim();
        if (!raw) return showError(el.urlError, 'Please enter a URL to analyze.');

        setLoading(el.checkBtn, true);
        hideError(el.urlError);
        el.urlResult.classList.remove('show');
        el.redirectAlert.classList.add('hidden');

        try {
            const url = formatUrl(raw);
            el.urlPreview.textContent = url;
            const res = await fetch('/check/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server error: ${res.status}`);
            }
            const data = await res.json();
            lastUrlResult = data;
            displayUrlResult(data, url);
            saveHistory('url', url, data.status, data.safety_percentage, data.is_phishing);
        } catch (err) {
            showError(el.urlError, err.message);
        } finally {
            setLoading(el.checkBtn, false);
        }
    }

    function displayUrlResult(data, url) {
        // Redirect alert
        if (data.redirect && data.redirect.is_shortened) {
            el.redirectAlert.classList.remove('hidden');
            el.redirectInfo.innerHTML = `Original: <strong>${escapeHtml(url)}</strong><br>Expanded to: <strong>${escapeHtml(data.redirect.final_url)}</strong> (${data.redirect.total_redirects} redirect${data.redirect.total_redirects !== 1 ? 's' : ''})`;
        } else {
            el.redirectAlert.classList.add('hidden');
        }

        // Safety meter
        animateMeter(data.safety_percentage);
        el.statusText.textContent = data.status;
        el.statusText.style.backgroundColor = data.color;

        // HTTPS
        const analysisUrl = data.analyzed_url || url;
        const parsed = new URL(analysisUrl);
        el.httpsStatus.innerHTML = parsed.protocol === 'https:'
            ? '<span style="color:var(--accent-green)">✓ Secure (HTTPS)</span>'
            : '<span style="color:var(--accent-red)">✗ Insecure (HTTP)</span>';

        // SSL Certificate
        if (data.ssl && data.ssl.has_ssl) {
            el.sslStatus.innerHTML = `<span style="color:var(--accent-green)">✓ ${escapeHtml(data.ssl.issuer)}</span>`;
            // Cert expiry
            if (data.ssl.days_remaining !== null) {
                const daysLeft = data.ssl.days_remaining;
                const expiryColor = daysLeft < 30 ? 'var(--accent-red)' : daysLeft < 90 ? 'var(--accent-yellow)' : 'var(--accent-green)';
                el.certExpiry.innerHTML = `<span style="color:${expiryColor}">${daysLeft} days left</span>`;
            } else {
                el.certExpiry.innerHTML = '<span style="color:var(--text-muted)">N/A</span>';
            }
        } else if (data.ssl && data.ssl.error) {
            el.sslStatus.innerHTML = `<span style="color:var(--accent-red)">✗ ${escapeHtml(data.ssl.error.substring(0, 40))}</span>`;
            el.certExpiry.innerHTML = '<span style="color:var(--accent-red)">No cert</span>';
        } else {
            el.sslStatus.innerHTML = '<span style="color:var(--accent-red)">✗ No SSL</span>';
            el.certExpiry.innerHTML = '<span style="color:var(--text-muted)">N/A</span>';
        }

        // Domain age
        const age = data.domain_age;
        if (typeof age !== 'number') {
            el.domainAge.innerHTML = '<span style="color:var(--text-muted)">Unknown</span>';
        } else if (age < 30) {
            el.domainAge.innerHTML = `<span style="color:var(--accent-red)">${age} days — Very new</span>`;
        } else if (age < 365) {
            el.domainAge.innerHTML = `<span style="color:var(--accent-yellow)">${age} days</span>`;
        } else {
            el.domainAge.innerHTML = `<span style="color:var(--accent-green)">${Math.floor(age/365)} years</span>`;
        }

        // URL length
        const targetUrl = data.analyzed_url || url;
        el.urlLength.innerHTML = targetUrl.length > 75
            ? `<span style="color:var(--accent-red)">${targetUrl.length} chars — Suspicious</span>`
            : `<span style="color:var(--accent-green)">${targetUrl.length} chars — Normal</span>`;

        // Redirects
        const redirects = data.redirect ? data.redirect.total_redirects : 0;
        el.redirectCount.innerHTML = redirects > 0
            ? `<span style="color:var(--accent-orange)">${redirects} redirect${redirects > 1 ? 's' : ''}</span>`
            : '<span style="color:var(--accent-green)">Direct (0)</span>';

        // Recommendation
        const recs = {
            'Very Safe':     { icon: 'fa-check-circle', color: 'var(--accent-green)' },
            'Safe':          { icon: 'fa-check-circle', color: 'var(--accent-green)' },
            'Moderate Risk': { icon: 'fa-exclamation-triangle', color: 'var(--accent-yellow)' },
            'Risky':         { icon: 'fa-exclamation-triangle', color: 'var(--accent-orange)' },
            'Dangerous':     { icon: 'fa-times-circle', color: 'var(--accent-red)' },
        };
        const r = recs[data.status] || recs['Dangerous'];
        let msg = `This URL is rated <strong>${data.safety_percentage}% safe</strong> — ${data.status}.`;
        if (!analysisUrl.startsWith('https')) msg += ' <strong>Warning:</strong> No HTTPS encryption.';
        if (data.redirect && data.redirect.is_shortened) msg += ' <strong>Note:</strong> This was a shortened URL that was expanded for analysis.';
        el.recommendation.innerHTML = `<i class="fas ${r.icon}" style="color:${r.color}"></i><p>${msg}</p>`;

        el.urlResult.classList.add('show');
    }

    function animateMeter(target) {
        let current = 0;
        const step = Math.max(target / 60, 0.5);
        const timer = setInterval(() => {
            current = Math.min(current + step, target);
            el.meterBar.style.width = current + '%';
            el.safetyPct.textContent = Math.round(current) + '%';
            el.meterBar.style.background = getMeterGradient(current);
            if (current >= target) clearInterval(timer);
        }, 16);
    }

    function getMeterGradient(pct) {
        if (pct >= 80) return 'linear-gradient(90deg, #22c55e, #4ade80)';
        if (pct >= 60) return 'linear-gradient(90deg, #84cc16, #a3e635)';
        if (pct >= 40) return 'linear-gradient(90deg, #eab308, #facc15)';
        if (pct >= 20) return 'linear-gradient(90deg, #f97316, #fb923c)';
        return 'linear-gradient(90deg, #ef4444, #f87171)';
    }

    // ══════════════════════════════════════
    // Email Analyzer
    // ══════════════════════════════════════
    el.emailCheckBtn.addEventListener('click', checkEmail);

    async function checkEmail() {
        const text = el.emailInput.value.trim();
        if (!text) return showError(el.emailError, 'Please paste email content to analyze.');

        setLoading(el.emailCheckBtn, true);
        hideError(el.emailError);
        el.emailResult.classList.remove('show');

        try {
            const res = await fetch('/check/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email_text: text })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server error: ${res.status}`);
            }
            const data = await res.json();
            lastEmailResult = { ...data, inputText: text.substring(0, 200) };
            displayEmailResult(data);
            saveHistory('email', text.substring(0, 60) + '...', data.risk_level, data.risk_score, data.risk_score >= 50);
        } catch (err) {
            showError(el.emailError, err.message);
        } finally {
            setLoading(el.emailCheckBtn, false);
        }
    }

    function displayEmailResult(data) {
        const score = data.risk_score;
        let circleColor;
        if (score >= 70) circleColor = 'var(--accent-red)';
        else if (score >= 40) circleColor = 'var(--accent-yellow)';
        else circleColor = 'var(--accent-green)';

        el.riskCircle.style.borderColor = circleColor;
        el.riskCircle.style.color = circleColor;
        el.riskLabel.style.color = circleColor;
        el.riskLabel.textContent = data.risk_level;

        let cur = 0;
        const step = Math.max(score / 40, 1);
        const timer = setInterval(() => {
            cur = Math.min(cur + step, score);
            el.riskScore.textContent = Math.round(cur);
            if (cur >= score) clearInterval(timer);
        }, 16);

        el.indicatorsList.innerHTML = '';
        data.indicators.forEach(ind => {
            const li = document.createElement('li');
            const isSafe = ind.type === 'safe';
            if (isSafe) li.classList.add('safe-indicator');
            li.innerHTML = `<i class="fas ${isSafe ? 'fa-check' : 'fa-exclamation-circle'}"></i> ${ind.text}`;
            el.indicatorsList.appendChild(li);
        });

        el.emailRecText.innerHTML = data.recommendation;
        el.emailResult.classList.add('show');
    }

    // ══════════════════════════════════════
    // Bulk Scanner
    // ══════════════════════════════════════
    el.bulkCheckBtn.addEventListener('click', checkBulk);

    async function checkBulk() {
        const text = el.bulkInput.value.trim();
        if (!text) return showError(el.bulkError, 'Please enter URLs to scan (one per line).');

        const urls = text.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if (urls.length === 0) return showError(el.bulkError, 'No valid URLs found.');

        // Format URLs
        const formattedUrls = urls.map(u => {
            try { return formatUrl(u); } catch { return u; }
        });

        setLoading(el.bulkCheckBtn, true);
        hideError(el.bulkError);
        el.bulkResult.classList.add('hidden');

        try {
            const res = await fetch('/check/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: formattedUrls })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server error: ${res.status}`);
            }
            const data = await res.json();
            lastBulkResults = data.results;
            displayBulkResults(data.results);

            // Save each to history
            data.results.forEach(r => {
                if (!r.error) {
                    saveHistory('url', r.url, r.status, r.safety_percentage, r.is_phishing);
                }
            });
        } catch (err) {
            showError(el.bulkError, err.message);
        } finally {
            setLoading(el.bulkCheckBtn, false);
        }
    }

    function displayBulkResults(results) {
        const safe = results.filter(r => !r.is_phishing && !r.error).length;
        const threats = results.filter(r => r.is_phishing).length;
        const errors = results.filter(r => r.error).length;

        el.bulkSummary.textContent = `${results.length} scanned · ${safe} safe · ${threats} threats · ${errors} errors`;

        el.bulkTbody.innerHTML = results.map((r, i) => {
            const badgeClass = r.error ? 'badge-warning' : (r.is_phishing ? 'badge-danger' : 'badge-safe');
            const status = r.error ? 'Error' : r.status;
            const safety = r.error ? '—' : r.safety_percentage + '%';
            const shortened = r.is_shortened ? '<span style="color:var(--accent-orange)">Yes</span>' : '<span style="color:var(--text-muted)">No</span>';
            return `<tr>
                <td>${i + 1}</td>
                <td title="${escapeHtml(r.url)}">${escapeHtml(r.url)}</td>
                <td><span class="badge ${badgeClass}">${status}</span></td>
                <td>${safety}</td>
                <td>${shortened}</td>
            </tr>`;
        }).join('');

        el.bulkResult.classList.remove('hidden');
    }

    // ══════════════════════════════════════
    // PDF Export
    // ══════════════════════════════════════
    el.exportUrlPdf.addEventListener('click', () => exportUrlPdf());
    el.exportEmailPdf.addEventListener('click', () => exportEmailPdf());
    el.exportBulkPdf.addEventListener('click', () => exportBulkPdf());

    function exportUrlPdf() {
        if (!lastUrlResult) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const d = lastUrlResult;
        let y = 20;

        // Header
        doc.setFontSize(20);
        doc.setTextColor(6, 182, 212);
        doc.text('PhishGuard - URL Analysis Report', 20, y);
        y += 12;

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
        y += 15;

        // URL Info
        doc.setFontSize(12);
        doc.setTextColor(30);
        doc.text('URL Analyzed:', 20, y);
        doc.setFontSize(10);
        doc.setTextColor(60);
        y += 7;
        doc.text(d.url, 20, y, { maxWidth: 170 });
        y += 10;

        if (d.analyzed_url && d.analyzed_url !== d.url) {
            doc.setFontSize(10);
            doc.setTextColor(249, 115, 22);
            doc.text(`Expanded URL: ${d.analyzed_url}`, 20, y, { maxWidth: 170 });
            y += 10;
        }

        // Safety Score
        doc.setFontSize(16);
        const safetyColor = d.safety_percentage >= 60 ? [34, 197, 94] : d.safety_percentage >= 40 ? [234, 179, 8] : [239, 68, 68];
        doc.setTextColor(...safetyColor);
        doc.text(`Safety Score: ${d.safety_percentage}% — ${d.status}`, 20, y);
        y += 12;

        // Details
        doc.setFontSize(11);
        doc.setTextColor(30);
        doc.text('Analysis Details:', 20, y);
        y += 8;

        doc.setFontSize(10);
        doc.setTextColor(60);
        const details = [
            `HTTPS: ${d.analyzed_url?.startsWith('https') ? 'Yes (Secure)' : 'No (Insecure)'}`,
            `Domain Age: ${typeof d.domain_age === 'number' ? (d.domain_age >= 365 ? Math.floor(d.domain_age/365) + ' years' : d.domain_age + ' days') : 'Unknown'}`,
            `Phishing Detected: ${d.is_phishing ? 'YES' : 'No'}`,
        ];
        if (d.ssl) {
            details.push(`SSL Certificate: ${d.ssl.has_ssl ? 'Valid — ' + (d.ssl.issuer || 'Unknown issuer') : 'Not found'}`);
            if (d.ssl.days_remaining !== null) details.push(`Certificate Expires: ${d.ssl.valid_until} (${d.ssl.days_remaining} days)`);
        }
        if (d.redirect) {
            details.push(`Redirects: ${d.redirect.total_redirects}`);
            details.push(`Shortened URL: ${d.redirect.is_shortened ? 'Yes' : 'No'}`);
        }

        details.forEach(line => {
            doc.text(`• ${line}`, 25, y);
            y += 6;
        });

        y += 5;
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('This report was generated by PhishGuard — AI-Powered Phishing Detection & Prevention', 20, y);

        doc.save(`PhishGuard_URL_Report_${Date.now()}.pdf`);
    }

    function exportEmailPdf() {
        if (!lastEmailResult) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const d = lastEmailResult;
        let y = 20;

        doc.setFontSize(20);
        doc.setTextColor(6, 182, 212);
        doc.text('PhishGuard - Email Analysis Report', 20, y);
        y += 12;

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
        y += 15;

        // Risk score
        const riskColor = d.risk_score >= 70 ? [239, 68, 68] : d.risk_score >= 40 ? [234, 179, 8] : [34, 197, 94];
        doc.setFontSize(16);
        doc.setTextColor(...riskColor);
        doc.text(`Risk Score: ${d.risk_score}/100 — ${d.risk_level}`, 20, y);
        y += 12;

        // Indicators
        doc.setFontSize(11);
        doc.setTextColor(30);
        doc.text('Detected Indicators:', 20, y);
        y += 8;

        doc.setFontSize(10);
        doc.setTextColor(60);
        d.indicators.forEach(ind => {
            const prefix = ind.type === 'safe' ? '✓' : '⚠';
            doc.text(`${prefix} ${ind.text}`, 25, y);
            y += 6;
        });

        y += 5;
        if (d.inputText) {
            doc.setFontSize(11);
            doc.setTextColor(30);
            doc.text('Email Excerpt:', 20, y);
            y += 7;
            doc.setFontSize(9);
            doc.setTextColor(100);
            const lines = doc.splitTextToSize(d.inputText, 170);
            doc.text(lines, 20, y);
            y += lines.length * 5 + 5;
        }

        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('This report was generated by PhishGuard — AI-Powered Phishing Detection & Prevention', 20, y);

        doc.save(`PhishGuard_Email_Report_${Date.now()}.pdf`);
    }

    function exportBulkPdf() {
        if (!lastBulkResults || lastBulkResults.length === 0) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(20);
        doc.setTextColor(6, 182, 212);
        doc.text('PhishGuard - Bulk Scan Report', 20, y);
        y += 12;

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
        y += 5;
        doc.text(`Total URLs Scanned: ${lastBulkResults.length}`, 20, y);
        y += 12;

        // Table header
        doc.setFontSize(9);
        doc.setTextColor(30);
        doc.setFont(undefined, 'bold');
        doc.text('#', 20, y);
        doc.text('URL', 30, y);
        doc.text('Status', 140, y);
        doc.text('Safety', 170, y);
        doc.setFont(undefined, 'normal');
        y += 2;
        doc.setDrawColor(200);
        doc.line(20, y, 190, y);
        y += 5;

        doc.setFontSize(8);
        doc.setTextColor(60);
        lastBulkResults.forEach((r, i) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
            doc.text(`${i + 1}`, 20, y);
            const urlText = r.url.length > 60 ? r.url.substring(0, 57) + '...' : r.url;
            doc.text(urlText, 30, y);
            doc.text(r.error ? 'Error' : r.status, 140, y);
            doc.text(r.error ? '—' : `${r.safety_percentage}%`, 170, y);
            y += 6;
        });

        y += 8;
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('This report was generated by PhishGuard — AI-Powered Phishing Detection & Prevention', 20, y);

        doc.save(`PhishGuard_Bulk_Report_${Date.now()}.pdf`);
    }

    // ══════════════════════════════════════
    // History & Dashboard
    // ══════════════════════════════════════
    function getHistory() {
        try { return JSON.parse(localStorage.getItem('phishguard_history') || '[]'); }
        catch { return []; }
    }

    function saveHistory(type, input, result, score, isThreat) {
        const history = getHistory();
        history.unshift({
            type,
            input: input.substring(0, 100),
            result,
            score: Math.round(score),
            isThreat,
            time: new Date().toLocaleString()
        });
        if (history.length > 50) history.length = 50;
        localStorage.setItem('phishguard_history', JSON.stringify(history));
    }

    function renderDashboard() {
        const history = getHistory();
        const emailScans = history.filter(h => h.type === 'email');
        const threats = history.filter(h => h.isThreat);
        const safe = history.filter(h => !h.isThreat);

        animateCounter(el.statTotal, history.length);
        animateCounter(el.statThreats, threats.length);
        animateCounter(el.statSafe, safe.length);
        animateCounter(el.statEmails, emailScans.length);

        if (history.length === 0) {
            el.emptyHistory.classList.remove('hidden');
            el.historyTableWrap.classList.add('hidden');
        } else {
            el.emptyHistory.classList.add('hidden');
            el.historyTableWrap.classList.remove('hidden');
            el.historyTbody.innerHTML = history.slice(0, 20).map(h => {
                const badgeClass = h.isThreat ? 'badge-danger' : 'badge-safe';
                const typeIcon = h.type === 'url' ? 'fa-link' : 'fa-envelope';
                return `<tr>
                    <td><i class="fas ${typeIcon}" style="color:var(--accent-cyan)"></i> ${h.type.toUpperCase()}</td>
                    <td title="${escapeHtml(h.input)}">${escapeHtml(h.input)}</td>
                    <td><span class="badge ${badgeClass}">${h.result}</span></td>
                    <td>${h.score}%</td>
                    <td>${h.time}</td>
                </tr>`;
            }).join('');
        }
    }

    el.clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('phishguard_history');
        renderDashboard();
    });

    function animateCounter(element, target) {
        let cur = 0;
        const step = Math.max(Math.ceil(target / 30), 1);
        const timer = setInterval(() => {
            cur = Math.min(cur + step, target);
            element.textContent = cur;
            if (cur >= target) clearInterval(timer);
        }, 30);
    }

    // ══════════════════════════════════════
    // Utilities
    // ══════════════════════════════════════
    function formatUrl(url) {
        if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
        new URL(url);
        return url;
    }

    function setLoading(btn, loading) {
        btn.disabled = loading;
        const originalText = btn.dataset.originalText || btn.innerHTML;
        if (loading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        } else {
            btn.innerHTML = originalText;
        }
    }

    function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }
    function hideError(el) { el.style.display = 'none'; }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Initial render
    renderDashboard();
});

// ══════════════════════════════════════
// Phishing Quiz (Global scope)
// ══════════════════════════════════════
let quizAnswered = 0;
let quizCorrect = 0;
const QUIZ_TOTAL = 5;

function checkQuiz(btn, chosen, correct) {
    const pair = btn.closest('.quiz-pair');
    if (pair.classList.contains('quiz-done')) return;
    pair.classList.add('quiz-done');
    quizAnswered++;

    const options = pair.querySelectorAll('.quiz-option');
    options.forEach(opt => {
        const choice = opt.dataset.choice;
        if (choice === correct) {
            opt.classList.add('quiz-correct');
        } else {
            opt.classList.add('quiz-wrong');
        }
    });

    if (chosen === correct) quizCorrect++;

    // Update score
    const scoreEl = document.getElementById('quiz-score');
    if (quizAnswered >= QUIZ_TOTAL) {
        const pct = Math.round((quizCorrect / QUIZ_TOTAL) * 100);
        let emoji, msg;
        if (pct === 100) { emoji = '🏆'; msg = 'Perfect! You can spot every phishing URL!'; }
        else if (pct >= 80) { emoji = '🌟'; msg = 'Great job! You have a sharp eye for phishing.'; }
        else if (pct >= 60) { emoji = '👍'; msg = 'Good effort! Review the ones you missed.'; }
        else { emoji = '⚠️'; msg = 'Keep practicing! Phishing URLs can be tricky.'; }
        scoreEl.innerHTML = `${emoji} Score: <strong>${quizCorrect}/${QUIZ_TOTAL}</strong> (${pct}%) — ${msg}`;
    } else {
        scoreEl.textContent = `Answered: ${quizAnswered}/${QUIZ_TOTAL}`;
    }
}