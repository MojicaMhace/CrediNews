// CrediNews Submit News Page JavaScript

// Firebase will be available globally after firebase-config.js loads

// DOM Elements
const form = document.getElementById('submitForm');
const articleTitle = document.getElementById('articleTitle');
const articleContent = document.getElementById('articleContent');
const source = document.getElementById('source');
const publicationDate = document.getElementById('publicationDate');
const encryptCheckbox = document.getElementById('encrypt');
const submitBtn = document.querySelector('.submit-btn');
const characterCount = document.getElementById('characterCount');
const allInputs = document.querySelectorAll('.form-input, .form-textarea');

// Character limit for article content
const MAX_CHARACTERS = 5000;

// Initialize page functionality
document.addEventListener('DOMContentLoaded', function() {
    initializeCharacterCounter();
    initializeFormValidation();
    initializeInteractiveElements();
    initializeFormSubmission();
    fixSourcePlaceholderColor();
});

// Fix source input placeholder color
function fixSourcePlaceholderColor() {
    const sourceInput = document.getElementById('source');
    if (sourceInput) {
        const placeholderText = sourceInput.getAttribute('data-placeholder') || 'Website, newspaper, or original source';
        
        // Create custom placeholder functionality
        function updatePlaceholder() {
            if (sourceInput.value === '' || sourceInput.getAttribute('data-is-placeholder') === 'true') {
                sourceInput.style.color = '#6b7280';
                sourceInput.style.fontStyle = 'italic';
                sourceInput.value = placeholderText;
                sourceInput.setAttribute('data-is-placeholder', 'true');
            }
        }
        
        function clearPlaceholder() {
            if (sourceInput.getAttribute('data-is-placeholder') === 'true') {
                sourceInput.value = '';
                sourceInput.style.color = '#000000';
                sourceInput.style.fontStyle = 'normal';
                sourceInput.removeAttribute('data-is-placeholder');
            }
        }
        
        // Force clear any existing value first
        sourceInput.value = '';
        sourceInput.removeAttribute('data-is-placeholder');
        
        // Initialize placeholder immediately
        updatePlaceholder();
        
        // Also set with timeout as backup
        setTimeout(() => {
            if (sourceInput.value === '') {
                updatePlaceholder();
            }
        }, 50);
        
        // Handle focus and blur events
        sourceInput.addEventListener('focus', clearPlaceholder);
        sourceInput.addEventListener('blur', updatePlaceholder);
        
        // Handle form submission to clear placeholder
        const form = sourceInput.closest('form');
        if (form) {
            form.addEventListener('submit', function(e) {
                if (sourceInput.getAttribute('data-is-placeholder') === 'true') {
                    sourceInput.value = '';
                }
            });
        }
    }
}

// Character counter functionality
function initializeCharacterCounter() {
    if (articleContent && characterCount) {
        // Update character count on input
        articleContent.addEventListener('input', updateCharacterCount);
        
        // Initial count
        updateCharacterCount();
    }
}

function updateCharacterCount() {
    const currentLength = articleContent.value.length;
    const remaining = MAX_CHARACTERS - currentLength;
    
    // Update counter text
    characterCount.textContent = `${currentLength}/${MAX_CHARACTERS} characters`;
    
    // Update counter styling based on usage
    characterCount.classList.remove('warning', 'danger');
    
    if (currentLength > MAX_CHARACTERS * 0.9) {
        characterCount.classList.add('danger');
    } else if (currentLength > MAX_CHARACTERS * 0.8) {
        characterCount.classList.add('warning');
    }
    
    // Prevent further input if limit exceeded
    if (currentLength > MAX_CHARACTERS) {
        articleContent.value = articleContent.value.substring(0, MAX_CHARACTERS);
        characterCount.textContent = `${MAX_CHARACTERS}/${MAX_CHARACTERS} characters (limit reached)`;
    }
}

// Form validation functionality
function initializeFormValidation() {
    // Real-time validation for all inputs
    allInputs.forEach(input => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => clearFieldError(input));
    });
}

function validateField(field) {
    const value = field.value.trim();
    const fieldName = field.getAttribute('name') || field.id;
    let isValid = true;
    let errorMessage = '';
    
    // Remove existing error styling
    clearFieldError(field);
    
    // Required field validation
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = `${getFieldLabel(field)} is required.`;
    }
    
    // Specific field validations
    switch (fieldName) {
        case 'articleTitle':
            if (value && value.length < 5) {
                isValid = false;
                errorMessage = 'Article title must be at least 5 characters long.';
            } else if (value && value.length > 200) {
                isValid = false;
                errorMessage = 'Article title must be less than 200 characters.';
            }
            break;
            
        case 'articleContent':
            if (value && value.length < 50) {
                isValid = false;
                errorMessage = 'Article content must be at least 50 characters long.';
            }
            break;
            
        case 'source':
            if (value && value.length < 3) {
                isValid = false;
                errorMessage = 'Source must be at least 3 characters long.';
            }
            break;
            
        case 'publicationDate':
            if (value) {
                const selectedDate = new Date(value);
                const today = new Date();
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(today.getFullYear() - 1);
                
                if (selectedDate > today) {
                    isValid = false;
                    errorMessage = 'Publication date cannot be in the future.';
                } else if (selectedDate < oneYearAgo) {
                    isValid = false;
                    errorMessage = 'Publication date cannot be more than one year ago.';
                }
            }
            break;
    }
    
    // Show error if validation failed
    if (!isValid) {
        showFieldError(field, errorMessage);
    }
    
    return isValid;
}

function showFieldError(field, message) {
    field.classList.add('error');
    
    // Remove existing error message
    const existingError = field.parentNode.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Create and show error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        color: #ef4444;
        font-size: 14px;
        margin-top: 4px;
        font-weight: 500;
    `;
    
    field.parentNode.appendChild(errorDiv);
}

function clearFieldError(field) {
    field.classList.remove('error');
    const errorMessage = field.parentNode.querySelector('.error-message');
    if (errorMessage) {
        errorMessage.remove();
    }
}

function getFieldLabel(field) {
    const label = field.parentNode.querySelector('.form-label');
    return label ? label.textContent.replace('*', '').trim() : field.name || field.id;
}

// Interactive elements functionality
function initializeInteractiveElements() {
    // Encrypt checkbox interaction
    if (encryptCheckbox) {
        encryptCheckbox.addEventListener('change', function() {
            if (this.checked) {
                showEncryptionNotice();
            }
        });
    }
    
    // Add focus effects to form elements
    allInputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentNode.classList.add('focused');
        });
        
        input.addEventListener('blur', function() {
            this.parentNode.classList.remove('focused');
        });
    });
    
    // Add loading state to submit button
    if (submitBtn) {
        submitBtn.addEventListener('click', function(e) {
            if (form.checkValidity()) {
                addLoadingState(this);
            }
        });
    }
}

function showEncryptionNotice() {
    // Remove existing notice
    const existingNotice = document.querySelector('.encryption-notice');
    if (existingNotice) {
        existingNotice.remove();
    }
    
    // Create encryption notice
    const notice = document.createElement('div');
    notice.className = 'encryption-notice';
    notice.innerHTML = `
        <i class="fas fa-shield-alt"></i>
        <span>Your content will be encrypted for secure transmission.</span>
    `;
    notice.style.cssText = `
        background: #f0f9ff;
        border: 1px solid #0ea5e9;
        border-radius: 8px;
        padding: 12px 16px;
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #0369a1;
        font-size: 14px;
        animation: slideIn 0.3s ease;
    `;
    
    encryptCheckbox.parentNode.parentNode.appendChild(notice);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notice.parentNode) {
            notice.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notice.remove(), 300);
        }
    }, 5000);
}

function addLoadingState(button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    button.disabled = true;
    
    // Reset after 3 seconds (simulated submission)
    setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
    }, 3000);
}

// Form submission functionality
function initializeFormSubmission() {
    if (form) {
        form.addEventListener('submit', handleFormSubmission);
    }
}

function handleFormSubmission(e) {
    e.preventDefault();
    
    // Validate all fields
    let isFormValid = true;
    allInputs.forEach(input => {
        if (!validateField(input)) {
            isFormValid = false;
        }
    });
    
    // Check if required fields are filled
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            validateField(field);
            isFormValid = false;
        }
    });
    
    if (isFormValid) {
        // First check facts with API before submitting
        checkFactsAndSubmit();
    } else {
        showFormError('Please correct the errors above before submitting.');
        // Scroll to first error
        const firstError = form.querySelector('.error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

async function checkFactsAndSubmit() {
    // Show checking facts state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking facts...';
    
    try {
        // Call fact check API
        const factCheckResult = await checkFactsWithAPI(
            articleTitle.value.trim(),
            articleContent.value.trim()
        );
        
        // Update button text to show we're now submitting
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        // Continue with submission including fact check results
        await submitForm(factCheckResult);
    } catch (error) {
        console.error('Error during fact checking:', error);
        showFormError('Failed to check facts. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Article';
    }
}

async function checkFactsWithAPI(title, content) {
    try {
        // Call our Python backend service
        const response = await fetch('http://192.168.18.6:5000/api/fact-check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                content: content
            })
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Show fact check result to user
        displayFactCheckResult(result.credibility);
        
        return result;
    } catch (error) {
        console.error('Fact check API error:', error);
        // Return a neutral result if API fails
        return {
            status: 'error',
            credibility: {
                score: 0.5,
                label: 'Unverified',
                explanation: 'Unable to verify this content.'
            }
        };
    }
}

// Display fact check results to the user
function displayFactCheckResult(credibility) {
    // Create or get the fact check result container
    let factCheckContainer = document.getElementById('factCheckResult');
    if (!factCheckContainer) {
        factCheckContainer = document.createElement('div');
        factCheckContainer.id = 'factCheckResult';
        factCheckContainer.className = 'fact-check-result';
        form.insertBefore(factCheckContainer, submitBtn.parentNode);
    }
    
    // Determine color based on credibility score
    let colorClass = '';
    if (credibility.score >= 0.8) {
        colorClass = 'high-credibility';
    } else if (credibility.score >= 0.5) {
        colorClass = 'medium-credibility';
    } else if (credibility.score >= 0.3) {
        colorClass = 'low-credibility';
    } else {
        colorClass = 'not-credible';
    }
    
    // Update the container with the result
    factCheckContainer.innerHTML = `
        <div class="fact-check-header ${colorClass}">
            <span class="fact-check-label">Fact Check Result: ${credibility.label}</span>
            <div class="credibility-meter">
                <div class="meter-fill" style="width: ${credibility.score * 100}%"></div>
            </div>
        </div>
        <p class="fact-check-explanation">${credibility.explanation}</p>
    `;
    
    // Make sure the container is visible
    factCheckContainer.style.display = 'block';
}

async function submitForm(factCheckResult) {
    try {
        // Check if user is authenticated
        if (!firebase.auth().currentUser) {
            showFormError('You must be logged in to submit news articles.');
            return;
        }

        // Collect form data
        const formData = {
            articleTitle: document.getElementById('articleTitle').value.trim(),
            articleContent: document.getElementById('articleContent').value.trim(),
            source: document.getElementById('source').value.trim(),
            publicationDate: document.getElementById('publicationDate').value,
            encrypt: document.getElementById('encrypt').checked,
            submittedBy: firebase.auth().currentUser.uid,
            submitterEmail: firebase.auth().currentUser.email,
            status: 'pending', // pending, verified, rejected
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            verificationScore: null,
            verifiedBy: null,
            verifiedAt: null,
            factCheck: factCheckResult || {
                status: 'not_checked',
                credibility: {
                    score: 0.5,
                    label: 'Unverified',
                    explanation: 'This content has not been fact-checked.'
                }
            }
        };
        
        // Add to Firestore
        const docRef = await firebase.firestore().collection('news_submissions').add(formData);
        console.log('News article submitted with ID:', docRef.id);
        
        // Show success message
        showSuccessMessage();
        
        // Reset form after successful submission
        setTimeout(() => {
            form.reset();
            updateCharacterCount();
            clearAllErrors();
        }, 2000);
        
    } catch (error) {
        console.error('Error submitting news article:', error);
        showFormError('Failed to submit news article. Please try again.');
    }
}

function showSuccessMessage() {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.success-message, .error-message-form');
    existingMessages.forEach(msg => msg.remove());
    
    // Create success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <div>
            <strong>Article submitted successfully!</strong>
            <p>Your news article has been received and will be analyzed by our AI system for credibility assessment.</p>
        </div>
    `;
    successDiv.style.cssText = `
        background: #f0fdf4;
        border: 1px solid #22c55e;
        border-radius: 12px;
        padding: 16px 20px;
        margin-top: 24px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        color: #15803d;
        animation: slideIn 0.5s ease;
    `;
    
    form.appendChild(successDiv);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.style.animation = 'slideOut 0.5s ease';
            setTimeout(() => successDiv.remove(), 500);
        }
    }, 8000);
}

function showFormError(message) {
    // Remove existing error message
    const existingError = document.querySelector('.error-message-form');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message-form';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <span>${message}</span>
    `;
    errorDiv.style.cssText = `
        background: #fef2f2;
        border: 1px solid #ef4444;
        border-radius: 8px;
        padding: 12px 16px;
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #dc2626;
        font-weight: 500;
        animation: shake 0.5s ease;
    `;
    
    submitBtn.parentNode.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

function clearAllErrors() {
    // Clear all field errors
    allInputs.forEach(clearFieldError);
    
    // Remove form-level error messages
    const formErrors = document.querySelectorAll('.error-message-form');
    formErrors.forEach(error => error.remove());
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-10px);
        }
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
    
    .form-input.error,
    .form-textarea.error {
        border-color: #ef4444 !important;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
    }
    
    .form-group.focused .form-label {
        color: #1e3a8a;
        transform: translateY(-2px);
    }
`;
document.head.appendChild(style);