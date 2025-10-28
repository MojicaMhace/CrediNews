// Verify News Page JavaScript

// Firebase will be available globally after firebase-config.js loads

// DOM Elements
const textVerifyBtn = document.getElementById('verify-text-btn');
const urlVerifyBtn = document.getElementById('verify-url-btn');
const facebookVerifyBtn = document.getElementById('verify-facebook-btn');
const articleContent = document.getElementById('article-content');
const articleUrl = document.getElementById('article-url');
const facebookUrl = document.getElementById('facebook-url');
const facebookContent = document.getElementById('facebook-content');
const facebookCharCount = document.getElementById('facebook-char-count');
const textCharCount = document.getElementById('text-char-count');

// Character counter for text area
function updateCharacterCount() {
    
    if (articleContent && textCharCount) {
       const currentLength = articleContent.value.length;
        textCharCount.textContent = currentLength;
        
    // Change color based on character count
        if (currentLength > 2800) {
            textCharCount.style.color = '#ef4444';
        } else if (currentLength > 2500) {
            textCharCount.style.color = '#f59e0b';
        } else {
            textCharCount.style.color = '#6b7280';
        }
    }
}

// Text verification handler
function handleTextVerification() {
    const content = articleContent.value.trim();
    
    if (!content) {
        showNotification('Please enter article content to verify.', 'error');
        return;
    }
    
    if (content.length < 50) {
        showNotification('Article content is too short. Please provide at least 50 characters.', 'error');
        return;
    }
    
    // Disable button and show loading state
    textVerifyBtn.disabled = true;
    textVerifyBtn.textContent = 'Verifying...';
    
    // Call the fact check API
    fetch('http://127.0.0.1:5000/api/fact-check', {  // Replace with your actual API endpoint
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: '',
            content: content
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {

        // Cap the score at 100
        const adjustedScore = Math.min(Math.round(result.credibility.score * 100), 100);

        showVerificationResult('text', {
            credibilityScore: adjustedScore,
            sources: result.credibility.sources || 3,
            factChecks: result.credibility.factChecks || 1
            
        });
    })
    .catch(error => {
        console.error('Fact check API error:', error);
        showNotification('Error connecting to fact check service. Please try again later.', 'error');
    })
    .finally(() => {
        // Reset button
        textVerifyBtn.disabled = false;
        textVerifyBtn.textContent = 'Verify Content';
    });
}

// URL verification handler
function handleUrlVerification() {
    const url = articleUrl.value.trim();
    
    if (!url) {
        showNotification('Please enter a URL to verify.', 'error');
        return;
    }
    
    if (!isValidUrl(url)) {
        showNotification('Please enter a valid URL.', 'error');
        return;
    }
    
    // Disable button and show loading state
    urlVerifyBtn.disabled = true;
    urlVerifyBtn.textContent = 'Verifying...';
    
    // Call the fact check API
    fetch('http://127.0.0.1:5000/api/fact-check', { // Replace with your actual API endpoint
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: '',
            content: `URL: ${url}`,
            url: url
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        
        // Cap the score at 100
       const adjustedScore = Math.min(Math.round(result.credibility.score * 100), 100);

        showVerificationResult('url', {
            credibilityScore: adjustedScore,
            sources: (result.credibility && result.credibility.sources) ?? 0,
            factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
            domain: extractDomain(url),
            credibilityExplanation: result.credibility.explanation,
            credibilityLabel: result.credibility.label,
            fakeClaims: Array.isArray(result.fake_claims) ? result.fake_claims : [],
            realClaims: Array.isArray(result.real_claims) ? result.real_claims : [],
            claimAnalysis: Array.isArray(result.claim_analysis) ? result.claim_analysis : [],
            claimsChecked: Array.isArray(result.claims_checked) ? result.claims_checked : []
        });
    })
    .catch(error => {
        console.error('Fact check API error:', error);
        showNotification('Error connecting to fact check service. Please try again later.', 'error');
    })
    .finally(() => {
        // Reset button
        urlVerifyBtn.disabled = false;
        urlVerifyBtn.textContent = 'Verify URL';
    });
}

// URL validation
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Extract domain from URL
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch (_) {
        return 'Unknown';
    }
}

// Facebook URL validation
function isFacebookUrl(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return hostname === 'facebook.com' || 
               hostname === 'www.facebook.com' || 
               hostname === 'm.facebook.com' ||
               hostname.endsWith('.facebook.com');
    } catch (_) {
        return false;
    }
}

// Facebook verification handler
function handleFacebookVerification() {
    console.log('Facebook verification started');
    console.log('facebookUrl element:', facebookUrl);
    console.log('facebookContent element:', facebookContent);
    
    const url = facebookUrl ? facebookUrl.value.trim() : '';
    const content = facebookContent ? facebookContent.value.trim() : '';
    
    console.log('URL value:', url);
    console.log('Content value:', content);
    
    // Check if either URL or content is provided
    if (!url && !content) {
        showNotification('Please enter a Facebook URL or paste Facebook content to analyze.', 'error');
        return;
    }
    
    // Validate Facebook URL if provided
    if (url && !isValidUrl(url)) {
        showNotification('Please enter a valid URL.', 'error');
        return;
    }
    
    if (url && !isFacebookUrl(url)) {
        showNotification('Please enter a valid Facebook URL (facebook.com).', 'error');
        return;
    }
    
    // Validate content length if provided
    if (content && content.length < 60) {
        showNotification('Facebook content is too short. Please provide at least 60 characters.', 'error');
        return;
    }
    
    // Get analysis options
    const checkLinks = document.getElementById('check-links').checked;
    const checkSource = document.getElementById('check-source').checked;
    
    // Disable button and show loading state
    facebookVerifyBtn.disabled = true;
    facebookVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing Facebook Content...';
    
    // Call the fact check API for Facebook content
    if (firebase.auth().currentUser) {
        // Store verification request in Firebase
        firebase.firestore().collection('facebook_verification_requests').add({
            url: url || null,
            content: content || null,
            userId: firebase.auth().currentUser.uid,
            userEmail: firebase.auth().currentUser.email,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            options: {
                checkLinks,
                checkSource
            }
        });
    }
    
    // Call the fact check API for Facebook content
    fetch('http://127.0.0.1:5000/api/fact-check', { // Replace with your actual API endpoint
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: 'Facebook Content',
            content: content || `Facebook URL: ${url}`,
            url: url || null,
            options: {
                checkLinks,
                checkSource
            }
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        const analysisType = url ? 'facebook-url' : 'facebook-content';
        
        // Calculate adjusted score based on options
        let adjustedScore = Math.round(result.credibility.score * 100);
        if (checkLinks) adjustedScore += 3;
        if (checkSource) adjustedScore += 3;
        
        // Cap the score at 100
        adjustedScore = Math.min(adjustedScore, 100);
        
        showFacebookVerificationResult(analysisType, {
            credibilityScore: adjustedScore,
            sources: (result.credibility && result.credibility.sources) ?? 0,
            factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
            
            linkVerification: checkLinks,
            sourceCheck: checkSource,
            platform: 'Facebook',
            contentType: url ? 'Post/Article URL' : 'Text Content',
            url: url || null,
            credibilityExplanation: result.credibility.explanation,
            credibilityLabel: result.credibility.label,
            fakeClaims: Array.isArray(result.fake_claims) ? result.fake_claims : [],
            realClaims: Array.isArray(result.real_claims) ? result.real_claims : [],
            claimAnalysis: Array.isArray(result.claim_analysis) ? result.claim_analysis : [],
            claimsChecked: Array.isArray(result.claims_checked) ? result.claims_checked : []
        });
    })
    .catch(error => {
        console.error('Fact check API error:', error);
        showNotification('Error connecting to fact check service. Please try again later.', 'error');
    })
    .finally(() => {
        // Reset button
        facebookVerifyBtn.disabled = false;
        facebookVerifyBtn.innerHTML = '<i class="fab fa-facebook"></i> Analyze Facebook Content';
    });
}

// Show Facebook verification results
function showFacebookVerificationResult(type, data) {
    const fakeClaimsSection = (Array.isArray(data.fakeClaims) && data.fakeClaims.length > 0) ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Fake Claims Identified</h4>
            <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                ${data.fakeClaims.slice(0, 2).map(fc => `
                    <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                        <div><strong>Claim:</strong> ${fc.claim || 'N/A'}</div>
                        <div><strong>Explanation:</strong> ${fc.explanation || 'No explanation'}</div>
                        ${fc.url ? `<div><a href="${fc.url}" target="_blank">View fact check</a></div>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    const realClaimsSection = (Array.isArray(data.realClaims) && data.realClaims.length > 0) ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">True Claims Identified</h4>
            <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                ${data.realClaims.slice(0, 2).map(rc => `
                    <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                        <div><strong>Claim:</strong> ${rc.claim || 'N/A'}</div>
                        <div><strong>Explanation:</strong> ${rc.explanation || 'No explanation'}</div>
                        ${rc.url ? `<div><a href="${rc.url}" target="_blank">View fact check</a></div>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    const explanationSection = data.credibilityExplanation ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Explanation</h4>
            <p>${data.credibilityExplanation}</p>
        </div>
    ` : '';

    const resultHtml = `
        <div class="verification-result facebook-result">
            <div class="result-header">
                <div class="platform-badge">
                    <i class="fab fa-facebook"></i>
                    <span>Facebook Analysis</span>
                </div>
                <div class="content-type">${data.contentType || 'Post'}</div>
            </div>
            <div class="result-score">
                <div class="score-circle score-${getScoreClass(data.credibilityScore)}">
                    <span class="score-number">${data.credibilityScore}</span>
                    <span class="score-label">%</span>
                </div>
                <div class="score-description">
                    <h3>Credibility Score (${data.credibilityLabel || ''})</h3>
                    <p>${getFacebookScoreSummary(data.credibilityScore)}</p>
                </div>
            </div>
            <div class="result-details">
                <div class="result-item">
                    <span class="result-label">Platform:</span>
                    <span class="result-value">${data.platform || 'Facebook'}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Sources Found:</span>
                    <span class="result-value">${data.sources ?? 0}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Fact Checks:</span>
                    <span class="result-value">${data.factChecks ?? 0}</span>
                </div>
                ${data.url ? `
                <div class="result-item">
                    <span class="result-label">URL:</span>
                    <span class="result-value url-value">${data.url}</span>
                </div>
                ` : ''}
            </div>
            <div class="analysis-features">
                <h4>Analysis Features Used:</h4>
                <div class="feature-list">
                    <div class="feature-item ${data.linkVerification ? 'enabled' : 'disabled'}">
                        <i class="fas fa-link"></i>
                        <span>Link Verification</span>
                        ${data.linkVerification ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>'}
                    </div>
                    <div class="feature-item ${data.sourceCheck ? 'enabled' : 'disabled'}">
                        <i class="fas fa-shield-alt"></i>
                        <span>Source Credibility</span>
                        ${data.sourceCheck ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>'}
                    </div>
                </div>
            </div>
            <div class="result-summary facebook-summary">
                <p>${getFacebookDetailedSummary(data)}</p>
            </div>
            ${explanationSection}
            ${realClaimsSection}
            ${fakeClaimsSection}
        </div>
    `;
    
    // Create and show modal
    showModal('Credibility Analysis Complete', resultHtml);
}

// Get Facebook-specific score summary
function getFacebookScoreSummary(score) {
    if (score >= 80) {
        return 'Credible - Content appears reliable and trustworthy';
    } else if (score >= 50) {
        return 'Mixed - Some concerns identified, verify with additional sources';
    } else if (score >= 30) {
        return 'Likely Fake - Multiple red flags detected, approach with caution';
    } else {
        return 'low credibility - High likelihood of misinformation';
    }
}

// Get detailed Facebook analysis summary
function getFacebookDetailedSummary(data) {
    const features = [];
    if (data.linkVerification) features.push('embedded link verification');
    if (data.sourceCheck) features.push('source credibility assessment');
    
    const featuresText = features.length > 0 ? ` including ${features.join(', ')}` : '';
    
    return `This Facebook content has been analyzed using our AI-powered verification system${featuresText}. The analysis considered multiple factors including content patterns, source reliability, and cross-referencing with known fact-checking databases. ${data.sources} sources were consulted and ${data.factChecks} fact-checking reports were reviewed.`;
}

// Show verification results
async function showVerificationResult(type, data) {
    // Store verification result in Firebase
    try {
        const verificationData = {
            type: type, // 'text' or 'url'
            content: type === 'text' ? articleContent.value.trim() : null,
            url: type === 'url' ? articleUrl.value.trim() : null,
            domain: data.domain || null,
            credibilityScore: data.credibilityScore,
            sourcesFound: data.sources,
            factChecks: data.factChecks,
            verifiedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous',
            verifierEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
            verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
            summary: getScoreSummary(data.credibilityScore)
        };
        
        await firebase.firestore().collection('verification_results').add(verificationData);
        console.log('Verification result stored in Firebase');
    } catch (error) {
        console.error('Error storing verification result:', error);
    }
    
    const fakeClaimsSection = (Array.isArray(data.fakeClaims) && data.fakeClaims.length > 0) ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Fake Claims Identified</h4>
            <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                ${data.fakeClaims.slice(0, 2).map(fc => `
                    <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                        <div><strong>Claim:</strong> ${fc.claim || 'N/A'}</div>
                        <div><strong>Explanation:</strong> ${fc.explanation || 'No explanation'}</div>
                        ${fc.url ? `<div><a href="${fc.url}" target="_blank">View fact check</a></div>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    const realClaimsSection = (Array.isArray(data.realClaims) && data.realClaims.length > 0) ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">True Claims Identified</h4>
            <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                ${data.realClaims.slice(0, 2).map(rc => `
                    <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                        <div><strong>Claim:</strong> ${rc.claim || 'N/A'}</div>
                        <div><strong>Explanation:</strong> ${rc.explanation || 'No explanation'}</div>
                        ${rc.url ? `<div><a href="${rc.url}" target="_blank">View fact check</a></div>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    const explanationSection = data.credibilityExplanation ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Explanation</h4>
            <p>${data.credibilityExplanation}</p>
        </div>
    ` : '';
    
    const resultHtml = `
        <div class="verification-result url-result">
            <div class="result-header">
                <div class="platform-badge">
                    <i class="fas fa-globe"></i>
                    <span>Web Analysis</span>
                </div>
                <div class="content-type">${data.domain || 'Article'}</div>
            </div>
            <div class="result-score">
                <div class="score-circle score-${getScoreClass(data.credibilityScore)}">
                    <span class="score-number">${data.credibilityScore}</span>
                    <span class="score-label">%</span>
                </div>
                <div class="score-description">
                    <h3>Credibility Score (${data.credibilityLabel || ''})</h3>
                    <p>${getScoreSummary(data.credibilityScore)}</p>
                </div>
            </div>
            <div class="result-details">
                <div class="result-item">
                    <span class="result-label">Platform:</span>
                    <span class="result-value">Web</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Sources Found:</span>
                    <span class="result-value">${data.sources ?? 0}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Fact Checks:</span>
                    <span class="result-value">${data.factChecks ?? 0}</span>
                </div>
                ${type === 'url' && articleUrl && articleUrl.value ? `
                <div class="result-item">
                    <span class="result-label">URL:</span>
                    <span class="result-value url-value">${articleUrl.value}</span>
                </div>
                ` : ''}
            </div>
            <div class="analysis-features">
                <h4>Analysis Features Used:</h4>
                <div class="feature-list">
                    <div class="feature-item enabled">
                        <i class="fas fa-link"></i>
                        <span>Link Verification</span>
                        <i class="fas fa-check"></i>
                    </div>
                    <div class="feature-item enabled">
                        <i class="fas fa-shield-alt"></i>
                        <span>Source Credibility</span>
                        <i class="fas fa-check"></i>
                    </div>
                </div>
            </div>
            <div class="result-summary">
                <p>${getScoreSummary(data.credibilityScore)}</p>
            </div>
            ${explanationSection}
            ${realClaimsSection}
            ${fakeClaimsSection}
        </div>
    `;
    
    // Create and show modal
    showModal('Credibility Analysis Complete', resultHtml);
}

// Get score class for styling
function getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
}

// Get score summary text
function getScoreSummary(score) {
    if (score >= 80) {
        return 'This content appears to be highly credible based on our analysis.';
    } else if (score >= 60) {
        return 'This content shows moderate credibility. Consider cross-referencing with additional sources.';
    } else {
        return 'This content shows low credibility. We recommend verifying with multiple reliable sources.';
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Show modal
function showModal(title, content) {
    // Create modal HTML
    const modalHtml = `
        <div class="modal-overlay" id="verificationModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="closeModal()">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    document.getElementById('verificationModal').style.display = 'flex';
}

// Close modal
function closeModal() {
    const modal = document.getElementById('verificationModal');
    if (modal) {
        modal.remove();
    }
}

// Facebook character counter
function updateFacebookCharacterCount() {
    if (facebookContent && facebookCharCount) {
        const currentLength = facebookContent.value.length;
        facebookCharCount.textContent = currentLength;
        
        // Change color based on character count
        if (currentLength > 2800) {
            facebookCharCount.style.color = '#ef4444';
        } else if (currentLength > 2500) {
            facebookCharCount.style.color = '#f59e0b';
        } else {
            facebookCharCount.style.color = '#6b7280';
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checking elements...');
    console.log('facebookVerifyBtn:', facebookVerifyBtn);
    console.log('facebookUrl:', facebookUrl);
    console.log('facebookContent:', facebookContent);
    console.log('facebookCharCount:', facebookCharCount);
    
    // Text verification
    if (textVerifyBtn) {
        textVerifyBtn.addEventListener('click', handleTextVerification);
    }
    
    // URL verification
    if (urlVerifyBtn) {
        urlVerifyBtn.addEventListener('click', handleUrlVerification);
    }
    
    // Facebook verification
    if (facebookVerifyBtn) {
        facebookVerifyBtn.addEventListener('click', handleFacebookVerification);
        console.log('Facebook verification event listener added');
    } else {
        console.error('Facebook verify button not found!');
    }
    
    // Character counter for textarea
    if (articleContent) {
        articleContent.addEventListener('input', updateCharacterCount);
    }
    
    // Character counter for Facebook content
    if (facebookContent) {
        facebookContent.addEventListener('input', updateFacebookCharacterCount);
    }
    
    // Toggle between URL and Facebook sections
    if (showUrlVerifyBtn) {
        showUrlVerifyBtn.addEventListener('click', function() {
            switchVerifySection('url');
        });
    }
    if (showFacebookVerifyBtn) {
        showFacebookVerifyBtn.addEventListener('click', function() {
            switchVerifySection('facebook');
        });
    }
    // Default to URL section visible on load
    switchVerifySection('url');
    
    // Close modal when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });
    
    // Handle escape key for modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});

// Toggle controls
const showUrlVerifyBtn = document.getElementById('show-url-verify');
const showFacebookVerifyBtn = document.getElementById('show-facebook-verify');
const urlVerifySection = document.getElementById('url-verify-section');
const facebookVerifySection = document.getElementById('facebook-verify-section');

function switchVerifySection(section) {
    if (!urlVerifySection || !facebookVerifySection) return;
    const showUrl = section === 'url';
    urlVerifySection.style.display = showUrl ? 'block' : 'none';
    facebookVerifySection.style.display = showUrl ? 'none' : 'block';
    if (showUrlVerifyBtn && showFacebookVerifyBtn) {
        showUrlVerifyBtn.classList.toggle('active', showUrl);
        showFacebookVerifyBtn.classList.toggle('active', !showUrl);
    }
}

// Default to URL section visible
switchVerifySection('url');

// Add CSS for notifications and modal
const additionalStyles = `
<style>
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease;
}

.notification-error {
    background: #ef4444;
}

.notification-success {
    background: #22c55e;
}

.notification-info {
    background: #3b82f6;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.modal-content {
    background: white;
    border-radius: 12px;
    max-width: 550px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    border-left: 4px solid #1877f2;
}

.modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-header h2 {
    margin: 0;
    color: #1f2937;
}

.modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
}

.modal-body {
    padding: 1.5rem;
}

.modal-footer {
    display: flex;
    margin: 0 auto;
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
    text-align: center;
}

.verification-result {
    text-align: left;
    color: #1f2937;
}

.result-grid {
    display: grid;
    gap: 1rem;
    margin: 1rem 0;
}


.result-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f3f4f6;
}

.result-label {
    font-weight: 600;
    color: #374151;
}

.result-value {
    font-weight: 500;
    color: #1f2937;
}

.score-high {
    color: #22c55e;
}

.score-medium {
    color: #f59e0b;
}

.score-low {
    color: #ef4444;
}

.result-summary {
    margin-top: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    border-left: 4px solid #3b82f6;
    color: #374151;    
}

.toggle-buttons {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
}
.toggle-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    color: #374151;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
}
.toggle-btn.active {
    background: #3b82f6;
    color: #fff;
    border-color: #2563eb;
}
.btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
}

.btn-primary {
    background: #3b82f6;
    color: white;
}

.btn-primary:hover {
    background: #2563eb;
}


.result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
}

.platform-badge {
    display: flex;
    align-items: center;
    background: linear-gradient(135deg, #1877f2 0%, #166fe5 100%);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.875rem;
}

.platform-badge i {
    margin-right: 0.5rem;
}

.content-type {
    background: #f3f4f6;
    color: #374151;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
}

.result-score {
    display: flex;
    align-items: center;
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 12px;
    border: 1px solid #e2e8f0;
}

.score-circle {
    width: 110px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-right: 1.5rem;
    font-weight: bold;
    border: 4px solid;
}

.score-circle.score-high {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    border-color: #22c55e;
    color: #15803d;
}

.score-circle.score-medium {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border-color: #f59e0b;
    color: #d97706;
}

.score-circle.score-low {
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    border-color: #ef4444;
    color: #dc2626;
}

.score-number {
    font-size: 1.5rem;
    line-height: 1;
}

.score-label {
    font-size: 0.875rem;
    opacity: 0.8;
    line-height: 1;
}

.score-description h3 {
    margin: 0 0 0.5rem 0;
    color: #1f2937;
    font-size: 1.125rem;
}

.score-description p {
    margin: 0;
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.5;
}

.analysis-features {
    margin: 1.5rem 0;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
}

.analysis-features h4 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.feature-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    color: #1f2937;
}

.feature-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: white;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    font-size: 0.875rem;
    color: #1f2937;
}

.feature-item.enabled {
    border-color: #22c55e;
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
}

.feature-item.disabled {
    border-color: #e5e7eb;
    background: #f9fafb;
    opacity: 0.6;
}

.feature-item i:first-child {
    margin-right: 0.5rem;
    color: #6b7280;
}

.feature-item.enabled i:first-child {
    color: #22c55e;
}

.feature-item i:last-child {
    color: #22c55e;
}

.feature-item.disabled i:last-child {
    color: #ef4444;
}

.facebook-summary {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border: 1px solid #3b82f6;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1.5rem;
}

.facebook-summary p {
    margin: 0;
    color: #1e40af;
    font-size: 0.875rem;
    line-height: 1.6;
}

.url-value {
    word-break: break-all;
    font-family: monospace;
    font-size: 0.75rem;
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
}
</style>
`;

// Add styles to head
document.head.insertAdjacentHTML('beforeend', additionalStyles);