document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const elements = {
        urlInput: document.getElementById('url-input'),
        checkBtn: document.getElementById('check-btn'),
        resultContainer: document.querySelector('.result-container'),
        urlPreview: document.getElementById('url-preview'),
        meterBar: document.getElementById('meter-bar'),
        safetyPercentage: document.getElementById('safety-percentage'),
        statusText: document.getElementById('status-text'),
        recommendation: document.getElementById('recommendation'),
        httpsStatus: document.getElementById('https-status'),
        domainAge: document.getElementById('domain-age'),
        urlLength: document.getElementById('url-length'),
        errorMessage: document.createElement('div') // Create a div for error messages
    };

    // Add error message div to the main content
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) {
        console.error('Main content element not found!');
    } else {
        elements.errorMessage.style.color = '#F44336';
        elements.errorMessage.style.marginTop = '1rem';
        elements.errorMessage.style.display = 'none';
        mainContent.appendChild(elements.errorMessage);
    }

    // Test alert on page load
    console.log('Script loaded');
    alert('Script loaded successfully'); // Test alert

    // Event Listeners
    elements.checkBtn.addEventListener('click', checkUrl);
    elements.urlInput.addEventListener('keypress', (e) => e.key === 'Enter' && checkUrl());

    // Main Check URL Function
    async function checkUrl() {
        const url = elements.urlInput.value.trim();
        console.log('checkUrl called with URL:', url);
        if (!url) {
            showError('Please enter a URL');
            return;
        }

        setLoadingState(true);
        elements.resultContainer.classList.add('hidden');
        elements.errorMessage.style.display = 'none'; // Hide error message
        console.log('Set loading state to true, hid result container');
        
        try {
            const fullUrl = validateAndFormatUrl(url);
            console.log('Formatted URL:', fullUrl);
            elements.urlPreview.textContent = fullUrl;
            
            const response = await fetchUrlData(fullUrl);
            console.log('Received response:', response);
            processResponse(response, fullUrl);
        } catch (error) {
            console.error('Error in checkUrl:', error);
            showError(error.message);
        } finally {
            setLoadingState(false);
            console.log('Set loading state to false');
        }
    }

    // Helper Functions
    function validateAndFormatUrl(url) {
        console.log('Validating URL:', url);
        try {
            if (!url.match(/^https?:\/\//i)) {
                url = 'http://' + url;
            }
            new URL(url); // Will throw if invalid
            return url;
        } catch {
            throw new Error('Invalid URL format');
        }
    }

    async function fetchUrlData(url) {
        console.log('Fetching data for URL:', url);
        try {
            const response = await fetch('/check/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });

            console.log('Fetch response status:', response.status);
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                const errorMessage = error.error || `Server error: ${response.status}`;
                console.error('Fetch error details:', errorMessage);
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (networkError) {
            console.error('Network error:', networkError);
            throw new Error('Network error: Could not connect to the server. Please ensure the server is running.');
        }
    }

    function processResponse(data, url) {
        console.log('Processing response:', data);
        try {
            // Update safety display
            console.log('Updating safety display with percentage:', data.safety_percentage);
            animateMeter(data.safety_percentage);
            console.log('Setting status text to:', data.status);
            elements.statusText.textContent = data.status;
            console.log('Setting status background color to:', data.color);
            elements.statusText.style.backgroundColor = data.color;
            
            // Update technical details
            console.log('Updating technical details');
            updateTechnicalDetails(url, data.domain_age);
            
            // Set recommendation
            console.log('Updating recommendation');
            updateRecommendation(data, url);
            
            // Show results
            console.log('Removing hidden class from result container');
            elements.resultContainer.classList.remove('hidden');
            console.log('Result container class list after removal:', elements.resultContainer.classList.toString());
            // Force display to block to ensure visibility
            elements.resultContainer.style.display = 'block';
            console.log('Result container display style:', elements.resultContainer.style.display);
        } catch (error) {
            console.error('Error in processResponse:', error);
            showError('Failed to process the response: ' + error.message);
        }
    }

    function animateMeter(percentage) {
        console.log('Animating meter with percentage:', percentage);
        let current = 0;
        const timer = setInterval(() => {
            current += percentage / 50;
            if (current >= percentage) {
                current = percentage;
                clearInterval(timer);
            }

            elements.meterBar.style.width = current + '%';
            elements.safetyPercentage.textContent = Math.round(current) + '%';
            elements.meterBar.style.background = getMeterColor(current);
        }, 20);
    }

    function getMeterColor(percentage) {
        const colors = {
            20: '#F44336',
            40: '#FF9800',
            60: '#FFC107',
            80: '#8BC34A',
            100: '#4CAF50'
        };
        return colors[Math.ceil(percentage / 20) * 20] || colors[20];
    }

    function updateTechnicalDetails(url, domainAge) {
        console.log('Updating technical details for URL:', url, 'with domain age:', domainAge);
        try {
            const parsedUrl = new URL(url);
            
            // HTTPS Status
            console.log('Setting HTTPS status');
            elements.httpsStatus.innerHTML = parsedUrl.protocol === 'https:' 
                ? '<span style="color: #4CAF50;">Secure connection (HTTPS)</span>'
                : '<span style="color: #F44336;">Insecure connection (HTTP)</span>';
            
            // URL Length - Fixed the string literal syntax
            console.log('Setting URL length');
            elements.urlLength.innerHTML = url.length > 75 
                ? `<span style="color: #F44336;">Long (${url.length} chars)</span> - Warning: Suspicious length`
                : `Normal (${url.length} chars)`;
            
            // Domain Age (use actual value from server)
            console.log('Updating domain age');
            updateDomainAgeDisplay(domainAge);
        } catch (error) {
            console.error("URL parsing error:", error);
        }
    }

    function updateDomainAgeDisplay(ageDays) {
        console.log('Updating domain age display with ageDays:', ageDays);
        if (typeof ageDays !== 'number') {
            elements.domainAge.innerHTML = '<span style="color: #F44336;">Unable to determine age</span>';
            return;
        }
        if (ageDays < 30) {
            elements.domainAge.innerHTML = `<span style="color: #F44336;">Very new (${ageDays} days)</span> - Higher risk`;
        } else if (ageDays < 365) {
            elements.domainAge.innerHTML = `<span style="color: #FF9800;">Relatively new (${ageDays} days)</span>`;
        } else {
            elements.domainAge.innerHTML = `<span style="color: #4CAF50;">Established (${Math.floor(ageDays/365)} years)</span>`;
        }
    }

    function updateRecommendation(data, url) {
        console.log('Updating recommendation with data:', data);
        const recommendations = {
            'Very Safe': {
                icon: 'fa-check-circle',
                message: `This URL appears very safe (${data.safety_percentage}% safe). Still, be cautious with personal information.`
            },
            'Safe': {
                icon: 'fa-check-circle',
                message: `This URL appears safe (${data.safety_percentage}% safe). Exercise normal precautions.`
            },
            'Moderate Risk': {
                icon: 'fa-exclamation-triangle',
                message: `Moderate risk (${data.safety_percentage}% safe). Avoid sensitive information.`
            },
            'Risky': {
                icon: 'fa-exclamation-triangle',
                message: `Risky (${data.safety_percentage}% safe). Do not enter personal data.`
            },
            'Dangerous': {
                icon: 'fa-times-circle',
                message: `Dangerous (${data.safety_percentage}% safe). Do not visit this site.`
            }
        };

        let rec = recommendations[data.status];
        if (!url.startsWith('https')) {
            rec.message += ' Warning: This site does not use HTTPS encryption.';
        }

        elements.recommendation.innerHTML = 
            `<i class="fas ${rec.icon}"></i><p>${rec.message}</p>`;
    }

    function setLoadingState(isLoading) {
        console.log('Setting loading state:', isLoading);
        elements.checkBtn.disabled = isLoading;
        elements.checkBtn.innerHTML = isLoading 
            ? '<i class="fas fa-spinner fa-spin"></i> Analyzing...' 
            : 'Analyze';
    }

    function showError(message) {
        console.error('Showing error:', message);
        alert(`Error: ${message}`); // Show alert
        // Also display error in the UI
        elements.errorMessage.textContent = `Error: ${message}`;
        elements.errorMessage.style.display = 'block';
    }
});