// CrediNews Main JavaScript
console.log('🚀 Script.js loaded successfully!');

// Basic functionality for the main page
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM Content Loaded - Starting initialization...');
    alert('JavaScript loaded! DOM ready.');
    
    // Initialize smooth scrolling for navigation links
    initializeSmoothScrolling();
    
    // Initialize any interactive elements
    initializeInteractiveElements();
    
    // Immediately change the button to Sign In
    updateAuthButton();
    
    console.log('✅ Initialization complete!');
});

// Function to update the auth buttons
function updateAuthButton() {
    const navControls = document.querySelector('.nav-controls');
    console.log('🔍 Looking for nav controls...', navControls);
    
    if (navControls) {
        console.log('✅ Found nav controls, checking auth state...');
        
        // Check if user is logged in
        const authData = sessionStorage.getItem('authData');
        
        if (authData) {
            try {
                const userData = JSON.parse(authData);
                console.log('👤 User is logged in:', userData);
                
                // Hide login/signup buttons and show user account
                const loginBtn = navControls.querySelector('.login-btn');
                const signupBtn = navControls.querySelector('.signup-btn');
                
                if (loginBtn) loginBtn.style.display = 'none';
                if (signupBtn) signupBtn.style.display = 'none';
                
                // Create or update user account button
                let userBtn = navControls.querySelector('.user-account-btn');
                if (!userBtn) {
                    userBtn = document.createElement('div');
                    userBtn.className = 'user-account-btn';
                    navControls.insertBefore(userBtn, navControls.querySelector('.theme-toggle'));
                }
                
                userBtn.innerHTML = `
                    <i class="fas fa-user-circle"></i>
                    ${userData.displayName || userData.email}
                    <i class="fas fa-chevron-down"></i>
                `;
                userBtn.style.display = 'flex';
                
            } catch (error) {
                console.error('Error parsing auth data:', error);
                showLoginSignupButtons();
            }
        } else {
            console.log('🔓 User is not logged in, showing login/signup buttons');
            showLoginSignupButtons();
        }
    } else {
        console.error('❌ Nav controls not found!');
    }
}

function showLoginSignupButtons() {
    const navControls = document.querySelector('.nav-controls');
    if (navControls) {
        // Show login/signup buttons
        const loginBtn = navControls.querySelector('.login-btn');
        const signupBtn = navControls.querySelector('.signup-btn');
        const userBtn = navControls.querySelector('.user-account-btn');
        
        if (loginBtn) loginBtn.style.display = 'flex';
        if (signupBtn) signupBtn.style.display = 'flex';
        if (userBtn) userBtn.style.display = 'none';
    }
}



function initializeSmoothScrolling() {
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

function initializeInteractiveElements() {
    console.log('🔧 Initializing interactive elements...');
    alert('initializeInteractiveElements called!');
    
    // Add any interactive functionality for buttons, forms, etc.
    const buttons = document.querySelectorAll('.check-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Add button click animations or functionality
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 150);
        });
    });
    
    // Add redirect functionality for navigation buttons
    initializeButtonRedirects();
}

// Initialize button redirect functionality
function initializeButtonRedirects() {
    console.log('🔗 Initializing button redirects...');
    alert('initializeButtonRedirects called!');
    
    // Debug: Check if buttons exist
    console.log('🔍 Looking for buttons...');
    console.log('verifyBtn element:', document.getElementById('verifyBtn'));
    console.log('analyzeBtn element:', document.getElementById('analyzeBtn'));
    console.log('verifyNewsBtn element:', document.getElementById('verifyNewsBtn'));
    console.log('demoBtn element:', document.getElementById('demoBtn'));
    
    // Verify button - redirect to verify-news.html
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        console.log('✅ Found verifyBtn, adding event listener...');
        verifyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Verify button clicked via addEventListener! Redirecting to verify-news.html');
            console.log('🔍 Verify button clicked - redirecting to verify-news.html');
            window.location.href = 'verify-news.html';
        });
        console.log('✅ Verify button redirect initialized');
    } else {
        console.error('❌ verifyBtn not found!');
    }
    
    // Analyze button - redirect to submit-news.html
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        console.log('✅ Found analyzeBtn, adding event listener...');
        analyzeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Analyze button clicked via addEventListener! Redirecting to submit-news.html');
            console.log('📊 Analyze button clicked - redirecting to submit-news.html');
            window.location.href = 'submit-news.html';
        });
        console.log('✅ Analyze button redirect initialized');
    } else {
        console.error('❌ analyzeBtn not found!');
    }
    
    // Verify News button (in the verify news section) - redirect to verify-news.html
    const verifyNewsBtn = document.getElementById('verifyNewsBtn');
    if (verifyNewsBtn) {
        console.log('✅ Found verifyNewsBtn, adding event listener...');
        verifyNewsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('📰 Verify News button clicked - redirecting to verify-news.html');
            window.location.href = 'verify-news.html';
        });
        console.log('✅ Verify News button redirect initialized');
    } else {
        console.error('❌ verifyNewsBtn not found!');
    }
    
    // Demo button - scroll to verify news section for demo
    const demoBtn = document.getElementById('demoBtn');
    if (demoBtn) {
        console.log('✅ Found demoBtn, adding event listener...');
        demoBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🎬 Demo button clicked - scrolling to verify news section');
            const verifySection = document.getElementById('verify-news');
            if (verifySection) {
                verifySection.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            } else {
                console.error('❌ verify-news section not found!');
            }
        });
        console.log('✅ Demo button functionality initialized');
    } else {
        console.error('❌ demoBtn not found!');
    }
    
    console.log('🎉 All button redirects initialized successfully');
    
    // Fallback: Add onclick handlers directly to test if buttons are responsive
    const verifyBtnFallback = document.getElementById('verifyBtn');
    const analyzeBtnFallback = document.getElementById('analyzeBtn');
    
    if (verifyBtnFallback) {
        verifyBtnFallback.onclick = function() {
            alert('Verify button clicked! Redirecting to verify-news.html');
            console.log('🔍 FALLBACK: Verify button clicked via onclick');
            window.location.href = 'verify-news.html';
        };
        console.log('✅ Fallback onclick handler added to verifyBtn');
    }
    
    if (analyzeBtnFallback) {
        analyzeBtnFallback.onclick = function() {
            alert('Analyze button clicked! Redirecting to submit-news.html');
            console.log('📊 FALLBACK: Analyze button clicked via onclick');
            window.location.href = 'submit-news.html';
        };
        console.log('✅ Fallback onclick handler added to analyzeBtn');
    }
}

// Firebase initialization
function initializeFirebase() {
    // Firebase is already initialized in firebase-config.js
    // This function can be used for any additional setup if needed
}

// Check authentication state and update UI
function checkAuthenticationState() {
    console.log('🔍 Checking authentication state...');
    
    // Check if user is logged in from session storage
    const authData = sessionStorage.getItem('authData');
    console.log('📦 Auth data from session storage:', authData);
    
    if (authData) {
        try {
            const userData = JSON.parse(authData);
            console.log('👤 User data parsed:', userData);
            updateUIForLoggedInUser(userData);
        } catch (error) {
            console.error('❌ Error parsing auth data:', error);
            updateUIForLoggedOutUser();
        }
    } else {
        console.log('🚫 No auth data found, showing sign-in button');
        updateUIForLoggedOutUser();
    }
}

// Update UI for logged-in user
function updateUIForLoggedInUser(userData) {
    console.log('🔄 Updating UI for logged-in user...');
    // For now, keep the original button functionality
    // In the future, we could add a user dropdown in the navigation area
    console.log('✅ User logged in:', userData.displayName || userData.email);
    console.log('✅ Keeping original button functionality for logged-in users');
}

// Update UI for logged-out user
function updateUIForLoggedOutUser() {
    console.log('🔄 Updating UI for logged-out user...');
    // Don't override the verify button - let the redirect functionality work
    // The button redirects should work regardless of authentication state
    console.log('✅ Keeping original button functionality for logged-out users');
}

// Setup user dropdown functionality
function setupUserDropdown() {
    const userAccountBtn = document.getElementById('userAccountBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (userAccountBtn && userDropdown) {
        // Toggle dropdown on button click
        userAccountBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!userAccountBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
            }
        });
        
        // Handle logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                handleLogout();
            });
        }
    }
}

// Handle user logout
function handleLogout() {
    // Clear session storage
    sessionStorage.removeItem('authData');
    
    // Update UI to logged-out state
    updateUIForLoggedOutUser();
    
    // Optional: Show logout confirmation
    console.log('User logged out successfully');
    
    // Redirect to login page or refresh
    window.location.href = 'login.html';
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}