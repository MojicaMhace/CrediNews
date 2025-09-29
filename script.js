// CrediNews Main JavaScript
console.log('🚀 Script.js loaded successfully!');

// Basic functionality for the main page
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM Content Loaded - Starting initialization...');
    
    // Initialize smooth scrolling for navigation links
    initializeSmoothScrolling();
    
    // Initialize any interactive elements
    initializeInteractiveElements();
    
    // Immediately change the button to Sign In
    updateAuthButton();
    
    console.log('✅ Initialization complete!');
});

// Function to update the auth button
function updateAuthButton() {
    const btn = document.querySelector('.verify-btn');
    console.log('🔍 Looking for verify button...', btn);
    
    if (btn) {
        console.log('✅ Found button, updating...');
        
        // Check if user is logged in
        const authData = sessionStorage.getItem('authData');
        
        if (authData) {
            try {
                const userData = JSON.parse(authData);
                // User is logged in - show user account button
                btn.innerHTML = `
                    <i class="fas fa-user-circle"></i>
                    ${userData.displayName || userData.email}
                    <i class="fas fa-chevron-down"></i>
                `;
                btn.style.background = 'linear-gradient(135deg, #22C55E, #16A34A)';
                btn.style.color = 'white';
                console.log('👤 Showing user account button');
            } catch (error) {
                console.error('Error parsing auth data:', error);
                showSignInButton(btn);
            }
        } else {
            // User is not logged in - show sign in button
            showSignInButton(btn);
        }
    } else {
        console.error('❌ Button not found!');
    }
}

function showSignInButton(btn) {
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    btn.style.background = 'linear-gradient(135deg, #3B82F6, #2563EB)';
    btn.style.color = 'white';
    btn.onclick = function() { 
        window.location.href = 'login.html'; 
    };
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
    const verifyBtn = document.querySelector('.verify-btn');
    if (verifyBtn) {
        // Create user account button with dropdown
        verifyBtn.innerHTML = `
            <div class="user-account-container">
                <button class="user-account-btn" id="userAccountBtn">
                    <i class="fas fa-user-circle"></i>
                    <span class="user-name">${userData.displayName || userData.email}</span>
                    <i class="fas fa-chevron-down dropdown-arrow"></i>
                </button>
                <div class="user-dropdown" id="userDropdown">
                    <div class="dropdown-header">
                        <div class="user-info">
                            <div class="user-avatar">
                                <i class="fas fa-user-circle"></i>
                            </div>
                            <div class="user-details">
                                <div class="user-display-name">${userData.displayName || 'User'}</div>
                                <div class="user-email">${userData.email}</div>
                            </div>
                        </div>
                    </div>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-menu">
                        <a href="#" class="dropdown-item" id="profileBtn">
                            <i class="fas fa-user"></i>
                            <span>My Profile</span>
                        </a>
                        <a href="#" class="dropdown-item" id="settingsBtn">
                            <i class="fas fa-cog"></i>
                            <span>Settings</span>
                        </a>
                        <a href="#" class="dropdown-item" id="myNewsBtn">
                            <i class="fas fa-newspaper"></i>
                            <span>My News</span>
                        </a>
                        <div class="dropdown-divider"></div>
                        <a href="#" class="dropdown-item logout-item" id="logoutBtn">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Sign Out</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners for dropdown functionality
        setupUserDropdown();
    }
}

// Update UI for logged-out user
function updateUIForLoggedOutUser() {
    console.log('🔄 Updating UI for logged-out user...');
    const verifyBtn = document.querySelector('.verify-btn');
    console.log('🎯 Found verify button:', verifyBtn);
    
    if (verifyBtn) {
        console.log('✅ Replacing verify button with sign-in link');
        
        // Clear the button and replace with sign-in link
        verifyBtn.style.background = 'linear-gradient(135deg, #3B82F6, #2563EB)';
        verifyBtn.style.color = 'white';
        verifyBtn.innerHTML = `
            <i class="fas fa-sign-in-alt"></i>
            Sign In
        `;
        
        // Make it clickable to go to login page
        verifyBtn.onclick = function() {
            window.location.href = 'login.html';
        };
        
        console.log('🎉 Sign-in button should now be visible');
    } else {
        console.error('❌ Could not find .verify-btn element');
    }
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