// Verify News Page JavaScript

// DOM Elements
const textVerifyBtn = document.getElementById('textVerifyBtn');
const urlVerifyBtn = document.getElementById('urlVerifyBtn');
const articleContent = document.getElementById('articleContent');
const articleUrl = document.getElementById('articleUrl');

// Character counter for text area
function updateCharacterCount() {
    const maxLength = 5000;
    const currentLength = articleContent.value.length;
    const remaining = maxLength - currentLength;
    
    // You can add a character counter display here if needed
    console.log(`Characters remaining: ${remaining}`);
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
    
    // Simulate verification process
    setTimeout(() => {
        showVerificationResult('text', {
            credibilityScore: Math.floor(Math.random() * 40) + 60, // Random score between 60-100
            sources: Math.floor(Math.random() * 5) + 3, // Random sources between 3-8
            factChecks: Math.floor(Math.random() * 3) + 1 // Random fact checks between 1-4
        });
        
        // Reset button
        textVerifyBtn.disabled = false;
        textVerifyBtn.textContent = 'Verify Content';
    }, 2000);
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
    
    // Simulate verification process
    setTimeout(() => {
        showVerificationResult('url', {
            credibilityScore: Math.floor(Math.random() * 40) + 60,
            sources: Math.floor(Math.random() * 5) + 3,
            factChecks: Math.floor(Math.random() * 3) + 1,
            domain: extractDomain(url)
        });
        
        // Reset button
        urlVerifyBtn.disabled = false;
        urlVerifyBtn.textContent = 'Verify URL';
    }, 2000);
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

// Show verification results
function showVerificationResult(type, data) {
    const resultHtml = `
        <div class="verification-result">
            <h3>Verification Results</h3>
            <div class="result-grid">
                <div class="result-item">
                    <span class="result-label">Credibility Score:</span>
                    <span class="result-value score-${getScoreClass(data.credibilityScore)}">${data.credibilityScore}%</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Sources Found:</span>
                    <span class="result-value">${data.sources}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Fact Checks:</span>
                    <span class="result-value">${data.factChecks}</span>
                </div>
                ${data.domain ? `
                <div class="result-item">
                    <span class="result-label">Domain:</span>
                    <span class="result-value">${data.domain}</span>
                </div>
                ` : ''}
            </div>
            <div class="result-summary">
                <p>${getScoreSummary(data.credibilityScore)}</p>
            </div>
        </div>
    `;
    
    // Create and show modal or insert result into page
    showModal('Verification Complete', resultHtml);
}

// Get score class for styling
function getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
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

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Text verification
    if (textVerifyBtn) {
        textVerifyBtn.addEventListener('click', handleTextVerification);
    }
    
    // URL verification
    if (urlVerifyBtn) {
        urlVerifyBtn.addEventListener('click', handleUrlVerification);
    }
    
    // Character counter for textarea
    if (articleContent) {
        articleContent.addEventListener('input', updateCharacterCount);
    }
    
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
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
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
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
    text-align: right;
}

.verification-result {
    text-align: left;
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
</style>
`;

// Add styles to head
document.head.insertAdjacentHTML('beforeend', additionalStyles);