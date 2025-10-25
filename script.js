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
    
    // Immediately change the button to Sign Indropdown
    updateAuthButton();
    
    console.log('✅ Initialization complete!');
});

// Function to update the auth buttons
function updateAuthButton() {
    const navControls = document.querySelector('.nav-controls');
    console.log('🔍 Looking for nav controls...', navControls);

    if (!navControls) {
        console.error('❌ Nav controls not found!');
        return;
    }

    const authButtons = navControls.querySelector('#authButtons') || navControls.querySelector('.auth-buttons');
    let userAccountBtn = document.getElementById('userAccountBtn') || navControls.querySelector('.user-account-btn');

    const showLoggedOutUI = () => {
        // Hide any user UI and show login/signup
        if (userAccountBtn) userAccountBtn.style.display = 'none';
        const logoutFallback = document.getElementById('logoutFallback');
        if (logoutFallback) logoutFallback.remove();
        if (authButtons) authButtons.style.display = 'flex';
        console.log('🚫 Showing Login/Sign Up');
    };

    const showLoggedInUI = (displayName, email, photoURL) => {
        // Ensure user account dropdown exists with consistent markup
        if (!userAccountBtn) {
            userAccountBtn = document.createElement('div');
            userAccountBtn.className = 'user-account-btn';
            userAccountBtn.id = 'userAccountBtn';
            userAccountBtn.innerHTML = `
                <i class="fas fa-user"></i>
                <span class="user-name">${displayName}</span>
                <i class="fas fa-chevron-down"></i>
                <div class="user-dropdown" id="userDropdown"></div>
            `;
            const themeToggle = navControls.querySelector('.theme-toggle');
            // Insert before theme toggle if present, otherwise append to nav controls
            if (themeToggle && themeToggle.parentElement === navControls) {
                navControls.insertBefore(userAccountBtn, themeToggle);
            } else {
                navControls.appendChild(userAccountBtn);
            }
        } else {
            const nameSpan = userAccountBtn.querySelector('.user-name');
            if (nameSpan) nameSpan.textContent = displayName;
        }

        userAccountBtn.style.display = 'flex';
        if (authButtons) authButtons.style.display = 'none';

        // Ensure dropdown element exists
        let ensureDropdown = userAccountBtn.querySelector('#userDropdown');
        if (!ensureDropdown) {
            ensureDropdown = document.createElement('div');
            ensureDropdown.className = 'user-dropdown';
            ensureDropdown.id = 'userDropdown';
            userAccountBtn.appendChild(ensureDropdown);
        }
        ensureDropdown.style.zIndex = '9999';
        ensureDropdown.style.minWidth = ensureDropdown.style.minWidth || '140px';
        // If the header/menu hasn't been rendered yet, inject the full dropdown.
        // What this block does:
        // - Defines the user account dropdown HTML.
        // - Adds a profile header (avatar, display name, email) and the menu list.
        // - Each `.dropdown-item` is a clickable action you can wire to pages.
        // Menu items explained:
        // * Verify a Post — go to the verification page.
        // * My Verifications — show the user's verification history.
        // * Saved Posts — open the saved posts list.
        // * Credibility Score — show score/overview related to content.
        // * Profile Settings — open user profile/settings.
        // * Notifications — open alerts/updates.
        // * FAQ — open help/guide.
        // * About CrediNews — app information page.
        if (!ensureDropdown.querySelector('.dropdown-header')) {
            const avatarContent = photoURL
                ? `<img src="${photoURL}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                : `${(displayName || 'U').charAt(0).toUpperCase()}`;
            // BEGIN: Dropdown menu markup
            ensureDropdown.innerHTML = `
                <div class="dropdown-header">
                    <div class="user-info">
                        <div class="user-avatar">${avatarContent}</div>
                        <div class="user-details">
                            <div class="user-display-name">${displayName}</div>
                            ${email ? `<div class="user-email">${email}</div>` : ''}
                        </div>
                    </div>
                </div>
                <div class="dropdown-menu">
                    <button class="dropdown-item"><i class="fas fa-user-cog"></i> Profile Settings</button>
                    <button class="dropdown-item"><i class="fas fa-shield-alt"></i> My Verifications</button>
                    <button class="dropdown-item"><i class="fas fa-chart-line"></i> Credibility Score</button>
                    <button class="dropdown-item"><i class="fas fa-bell"></i> Notifications</button>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-item logout-item" id="logoutMenuItem"><i class="fas fa-sign-out-alt"></i> Logout</div>
                </div>
            `;
            // END: Dropdown menu markup
        } else {
            // Update header texts if already rendered
            const headerName = ensureDropdown.querySelector('.user-display-name');
            if (headerName) headerName.textContent = displayName;
            const headerEmail = ensureDropdown.querySelector('.user-email');
            if (headerEmail) headerEmail.textContent = email || '';
            const avatarEl = ensureDropdown.querySelector('.user-avatar');
            if (avatarEl && photoURL) {
                avatarEl.innerHTML = `<img src="${photoURL}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            }
        }

        // Dropdown toggle logic:
        // - Opens/closes the dropdown panel.
        // - Appends the dropdown to `document.body` and uses `position: fixed` to avoid clipping.
        // - Calculates `top`/`left` and aligns the notch with the chevron icon.
        const dropdown = ensureDropdown;
        const arrowIcon = userAccountBtn.querySelector('.fa-chevron-down');

        const toggleDropdown = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            if (!dropdown) return;
            const isOpen = dropdown.classList.contains('show');
            if (isOpen) {
                dropdown.classList.remove('show');
                dropdown.style.visibility = 'hidden';
                dropdown.style.opacity = '0';
                dropdown.style.transform = 'translateY(-10px)';
                dropdown.style.pointerEvents = 'none';
                const arrow = userAccountBtn.querySelector('.fa-chevron-down');
                if (arrow) arrow.classList.remove('rotated');
                userAccountBtn.classList.remove('open');
            } else {
                // Open below button; render dropdown directly under body to avoid clipping
                if (dropdown.parentElement !== document.body) {
                    document.body.appendChild(dropdown);
                }
                const btnRect = userAccountBtn.getBoundingClientRect();
                const arrowRect = arrowIcon ? arrowIcon.getBoundingClientRect() : btnRect;

                dropdown.style.position = 'fixed';
                dropdown.style.top = `${Math.round(btnRect.bottom + 8)}px`;
                dropdown.style.left = `${Math.round(btnRect.left)}px`;
                dropdown.style.right = 'auto';
                dropdown.style.visibility = 'visible';
                dropdown.style.opacity = '1';
                dropdown.style.transform = 'translateY(0)';
                dropdown.style.pointerEvents = 'auto';
                dropdown.style.display = 'block';
                dropdown.style.zIndex = '10000';

                // Compute notch position relative to dropdown's left, targeting arrow center
                const ddRect = dropdown.getBoundingClientRect();
                const ddWidth = Math.max(dropdown.scrollWidth || 0, ddRect.width || 0);
                const arrowCenter = arrowRect.left - ddRect.left + (arrowRect.width / 2);
                const notchLeft = Math.max(12, Math.min(ddWidth - 28, Math.round(arrowCenter - 6)));
                dropdown.style.setProperty('--notch-left', `${notchLeft}px`);

                dropdown.classList.add('show');
                if (arrowIcon) arrowIcon.classList.add('rotated');
                userAccountBtn.classList.add('open');
            }
        };

        if (arrowIcon && !arrowIcon.dataset.arrowClickBound) {
            arrowIcon.addEventListener('click', toggleDropdown);
            arrowIcon.dataset.arrowClickBound = '1';
        }
        if (!userAccountBtn.dataset.btnClickBound) {
            // Clicking the entire green user button toggles the dropdown
            userAccountBtn.addEventListener('click', (e) => {
                // Ignore clicks originating from inside the dropdown panel
                const withinDropdown = dropdown.contains(e.target);
                if (withinDropdown) return;
                toggleDropdown(e);
            });
            userAccountBtn.dataset.btnClickBound = '1';
        }
        // Close when clicking outside
        if (!window.__userDropdownOutsideBound) {
            document.addEventListener('click', (e) => {
                if (dropdown && !userAccountBtn.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.remove('show');
                    dropdown.style.visibility = 'hidden';
                    dropdown.style.opacity = '0';
                    dropdown.style.transform = 'translateY(-10px)';
                    dropdown.style.pointerEvents = 'none';
                    const arrow = userAccountBtn.querySelector('.fa-chevron-down');
                    if (arrow) arrow.classList.remove('rotated');
                    userAccountBtn.classList.remove('open');
                }
            });
            window.__userDropdownOutsideBound = true;
        }

        // Logout binding
        const doLogout = () => {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                firebase.auth().signOut()
                    .then(() => { window.location.href = 'login.html'; })
                    .catch(() => { window.location.href = 'login.html'; });
            } else if (typeof handleLogout === 'function') {
                handleLogout();
            } else {
                sessionStorage.removeItem('authData');
                localStorage.removeItem('authData');
                window.location.href = 'login.html';
            }
        };
        const logoutItem = ensureDropdown.querySelector('#logoutMenuItem');
        if (logoutItem) logoutItem.onclick = (e) => { e.preventDefault(); doLogout(); };

        // Remove any visible Logout fallback if present
        const logoutFallback = document.getElementById('logoutFallback');
        if (logoutFallback) logoutFallback.remove();

        console.log('👤 Showing user dropdown for', displayName);
    };

    // Prefer Firebase auth state if available
    if (typeof firebase !== 'undefined' && firebase.auth) {
        console.log('🔥 Using Firebase auth state for navbar');
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                const displayName = user.displayName || user.email || 'User';
                showLoggedInUI(displayName, user.email || '', user.photoURL || '');
            } else {
                showLoggedOutUI();
            }
        });
        return;
    }

    // Fallback: session/local storage
    const raw = sessionStorage.getItem('authData') || localStorage.getItem('authData');
    if (raw) {
        try {
            const data = JSON.parse(raw);
            const displayName = data.displayName || data.fullName || data.email || 'User';
            showLoggedInUI(displayName, data.email || '', data.photoURL || '');
        } catch (e) {
            console.error('Error parsing authData:', e);
            showLoggedOutUI();
        }
    } else {
        showLoggedOutUI();
    }
}

function showLoginSignupButtons() {
    const navControls = document.querySelector('.nav-controls');
    if (!navControls) return;
    const loginBtn = navControls.querySelector('.login-btn');
    const signupBtn = navControls.querySelector('.signup-btn');
    const userBtn = document.getElementById('userAccountBtn') || navControls.querySelector('.user-account-btn');
    const logoutFallback = document.getElementById('logoutFallback');
    if (loginBtn) loginBtn.style.display = 'flex';
    if (signupBtn) signupBtn.style.display = 'flex';
    if (userBtn) userBtn.style.display = 'none';
    if (logoutFallback) logoutFallback.style.display = 'none';
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
    const logoutItem = document.getElementById('logoutMenuItem');

    if (!(userAccountBtn && userDropdown)) return;

    // Bind to arrow-only; skip if already bound
    const arrowIcon = userAccountBtn.querySelector('.fa-chevron-down');
    if (!(arrowIcon && userDropdown)) return;
    if (arrowIcon.dataset.arrowClickBound === '1') return;

    arrowIcon.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = userDropdown.classList.contains('show');
        if (isOpen) {
            userDropdown.classList.remove('show');
            userDropdown.style.visibility = 'hidden';
            userDropdown.style.opacity = '0';
            userDropdown.style.transform = 'translateY(-10px)';
            userDropdown.style.pointerEvents = 'none';
            arrowIcon.classList.remove('rotated');
            userAccountBtn.classList.remove('open');
        } else {
            // Left-align to button and align notch
            userDropdown.style.position = 'absolute';
            userDropdown.style.top = '';
            userDropdown.style.left = '0';
            userDropdown.style.right = 'auto';
            userDropdown.style.visibility = 'visible';
            userDropdown.style.opacity = '1';
            userDropdown.style.transform = 'translateY(0)';
            userDropdown.style.pointerEvents = 'auto';
            userDropdown.style.display = 'block';
            const ddWidth = Math.max(userDropdown.scrollWidth || 0, userDropdown.getBoundingClientRect().width || 0);
            const btnRect = userAccountBtn.getBoundingClientRect();
            const arrowRect = arrowIcon.getBoundingClientRect();
            const notchLeft = Math.max(12, Math.min(ddWidth - 28, Math.round(arrowRect.left - btnRect.left - 8)));
            userDropdown.style.setProperty('--notch-left', `${notchLeft}px`);
            userDropdown.classList.add('show');
            arrowIcon.classList.add('rotated');
            userAccountBtn.classList.add('open');
        }
    });

    // Outside click closer: bind only if not already bound globally
    if (!window.__userDropdownOutsideBound) {
        document.addEventListener('click', function (e) {
            if (userDropdown && !userAccountBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
                userDropdown.style.visibility = 'hidden';
                userDropdown.style.opacity = '0';
                userDropdown.style.transform = 'translateY(-10px)';
                userDropdown.style.pointerEvents = 'none';
                arrowIcon.classList.remove('rotated');
                userAccountBtn.classList.remove('open');
            }
        });
        window.__userDropdownOutsideBound = true;
    }

    // Handle logout (use the correct id)
    if (logoutItem) {
        logoutItem.addEventListener('click', function (e) {
            e.preventDefault();
            if (typeof doLogout === 'function') doLogout();
            else if (typeof handleLogout === 'function') handleLogout();
        });
    }

    arrowIcon.dataset.arrowClickBound = '1';
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

function ensureAuthLinksWork() {
  const navControls = document.querySelector('.nav-controls');
  if (!navControls) return;

  // Target only the auth buttons container to avoid collisions with other elements
  const authContainer = navControls.querySelector('#authButtons') || navControls.querySelector('.auth-buttons') || navControls;
  const loginLink = authContainer.querySelector('#authButtons .login-btn, .auth-buttons .login-btn, .login-btn');
  const signupLink = authContainer.querySelector('#authButtons .signup-btn, .auth-buttons .signup-btn, .signup-btn');

  const navigateTo = (url) => { window.location.href = url; };

  const clearAuthStorage = () => {
    try {
      sessionStorage.removeItem('authData');
      localStorage.removeItem('authData');
      console.log('🧹 Cleared authData from storage');
    } catch (e) {
      console.warn('⚠️ Failed to clear auth storage:', e);
    }
  };

  const signOutIfNeededThenNavigate = (url) => {
    console.log('🔄 signOutIfNeededThenNavigate called for:', url);
    const hasFirebase = typeof firebase !== 'undefined' && firebase.auth;
    const currentUser = hasFirebase ? firebase.auth().currentUser : null;

    clearAuthStorage();

    if (hasFirebase && currentUser) {
      console.log('🔐 User is authenticated, signing out before navigating to', url);
      firebase.auth().signOut()
        .then(() => {
          console.log('✅ Firebase signOut complete');
          clearAuthStorage();
          // Add URL parameter to signal auth clearing to prevent redirect race condition
          const targetUrl = url.includes('?') ? `${url}&clearAuth=1` : `${url}?clearAuth=1`;
          console.log('🚀 Navigating to:', targetUrl);
          navigateTo(targetUrl);
        })
        .catch((err) => {
          console.error('❌ Firebase signOut error, proceeding anyway:', err);
          clearAuthStorage();
          const targetUrl = url.includes('?') ? `${url}&clearAuth=1` : `${url}?clearAuth=1`;
          console.log('🚀 Navigating to (after error):', targetUrl);
          navigateTo(targetUrl);
        });
    } else {
      console.log('🚀 No authentication needed, navigating directly to:', url);
      // Add URL parameter to signal auth clearing even for non-authenticated users
      const targetUrl = url.includes('?') ? `${url}&clearAuth=1` : `${url}?clearAuth=1`;
      navigateTo(targetUrl);
    }
  };

  const bind = (el, url) => {
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    const handler = (e) => { e.preventDefault(); e.stopPropagation(); signOutIfNeededThenNavigate(url); };
    el.addEventListener('click', handler, { capture: true });
    el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { handler(e); }
    });
  };

  bind(loginLink, 'login.html');
  bind(signupLink, 'register.html');

  // Delegated capture-phase handler scoped to auth buttons container
  const delegatedHandler = (e) => {
    console.log('🖱️ Delegated click handler triggered on:', e.target);
    const target = e.target.closest('#authButtons .login-btn, #authButtons .signup-btn, .auth-buttons .login-btn, .auth-buttons .signup-btn');
    if (!target) {
      console.log('❌ No matching target found for delegation');
      return;
    }
    // Ignore clicks on logout fallback if any; ensure it does not use login-btn class
    if (target.id === 'logoutFallback' || target.classList.contains('logout-fallback')) {
      console.log('🚫 Ignoring click on logout fallback');
      return;
    }
    console.log('✅ Valid auth button clicked:', target.className);
    e.preventDefault();
    e.stopPropagation();
    const url = target.classList.contains('signup-btn') ? 'register.html' : 'login.html';
    console.log('🎯 Target URL determined:', url);
    signOutIfNeededThenNavigate(url);
  };
  document.addEventListener('click', delegatedHandler, { capture: true });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const active = document.activeElement;
    if (!active) return;
    const target = active.closest('#authButtons .login-btn, #authButtons .signup-btn, .auth-buttons .login-btn, .auth-buttons .signup-btn');
    if (!target) return;
    if (target.id === 'logoutFallback' || target.classList.contains('logout-fallback')) return;
    e.preventDefault();
    e.stopPropagation();
    const url = target.classList.contains('signup-btn') ? 'register.html' : 'login.html';
    signOutIfNeededThenNavigate(url);
  }, { capture: true });
}

// Initialize navbar auth UI early
document.addEventListener('DOMContentLoaded', () => {
    // Support query param logout trigger for emergency sign-out
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('logout') === '1') {
            console.log('🔐 Forced logout via query param');
            if (typeof firebase !== 'undefined' && firebase.auth) {
                firebase.auth().signOut()
                    .then(() => {
                        console.log('✅ Signed out via query param');
                        window.location.href = 'login.html';
                    })
                    .catch((err) => {
                        console.error('❌ Sign out error via query param:', err);
                        window.location.href = 'login.html';
                    });
            } else if (typeof handleLogout === 'function') {
                handleLogout();
            } else {
                sessionStorage.removeItem('authData');
                localStorage.removeItem('authData');
                window.location.href = 'login.html';
            }
            return; // stop further init on this page load
        }
    } catch (e) { /* ignore */ }

    // Default to showing auth buttons while state loads
    showLoginSignupButtons();
    // Make sure Login/Sign Up anchors always navigate
    ensureAuthLinksWork();
    // Then bind to real auth state
    try {
        updateAuthButton();
    } catch (e) {
        console.error('Navbar init error:', e);
    }
});