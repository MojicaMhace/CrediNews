// CrediNews Main JavaScript
console.log('🚀 Script.js loaded successfully!');

// Basic functionality for the main page
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM Content Loaded - Starting initialization...');
    initializeSmoothScrolling();
    initializeInteractiveElements();
    updateAuthButton();
    updatePlatformStats();
    enforceAccessRules();
    
    console.log('✅ Initialization complete!');
});

function updateAuthButton() {
    const navControls = document.querySelector('.nav-controls');
    console.log('🔍 Looking for nav controls...', navControls);

    if (!navControls) {
        console.error('❌ Nav controls not found!');
        return;
    }

    const authButtons = navControls.querySelector('#authButtons') || navControls.querySelector('.auth-buttons');
    let userAccountBtn = document.getElementById('userAccountBtn') || navControls.querySelector('.user-account-btn');

    const path = String(location.pathname.split('/').pop() || '').toLowerCase();

    const showLoggedOutUI = () => {
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
                    <button class="dropdown-item" id="ddProfile"><i class="fas fa-user-cog"></i> Profile Settings</button>
                    <button class="dropdown-item" id="ddVerifications"><i class="fas fa-shield-alt"></i> My Verifications</button>
                    <button class="dropdown-item" id="ddPoserHistory"><i class="fas fa-chart-line"></i> Poser Detection History</button>
                    <button class="dropdown-item" id="ddNotifications"><i class="fas fa-bell"></i> Notifications</button>
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
                dropdown.style.left = `${Math.round(btnRect.left + -75)}px`;
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

        const ddProfile = ensureDropdown.querySelector('#ddProfile');
        if (ddProfile) ddProfile.onclick = (e) => { e.preventDefault(); window.location.href = 'profile_settings.html'; };
        const ddNotifications = ensureDropdown.querySelector('#ddNotifications');
        if (ddNotifications) ddNotifications.onclick = (e) => { e.preventDefault(); window.location.href = 'notifications.html'; };
        const ddVerifications = ensureDropdown.querySelector('#ddVerifications');
        if (ddVerifications) ddVerifications.onclick = (e) => { e.preventDefault(); window.location.href = 'my-verifications.html'; };
        const ddPoserHistory = ensureDropdown.querySelector('#ddPoserHistory');
        if (ddPoserHistory) ddPoserHistory.onclick = (e) => { e.preventDefault(); window.location.href = 'poser-history.html'; };

        // Remove any visible Logout fallback if present
        const logoutFallback = document.getElementById('logoutFallback');
        if (logoutFallback) logoutFallback.remove();

        console.log('👤 Showing user dropdown for', displayName);
    };

    // Prefer Firebase auth state if available
    if (typeof firebase !== 'undefined' && firebase.auth) {
        console.log('🔥 Using Firebase auth state for navbar');
        firebase.auth().onAuthStateChanged((user) => {
            if (user && (user.emailVerified || user.providerData.some(p=>p.providerId!== 'password'))) {
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
    console.log('🔍 Looking for buttons...');
    
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
    }
    
    // Analyze button - redirect to verify-news.html (submit-news removed)
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        console.log('✅ Found analyzeBtn, adding event listener...');
        analyzeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Analyze button clicked! Redirecting to verify-news.html');
            console.log('📊 Analyze button clicked - redirecting to verify-news.html');
            window.location.href = 'verify-news.html';
        });
        console.log('✅ Analyze button redirect initialized');
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
    }

    // Get Started Today button (green pill in Ready section) - redirect to verify-news.html
    const getStartedBtn = document.querySelector('.btn-signup');
    if (getStartedBtn) {
        console.log('✅ Found Get Started button, adding redirect...');
        const handler = function(e) {
            try { e.preventDefault(); } catch(_) {}
            console.log('🚀 Get Started clicked - redirecting to verify-news.html');
            window.location.href = 'verify-news.html';
        };
        // Ensure robust binding without duplicates
        if (!getStartedBtn.dataset.gsBound) {
            getStartedBtn.addEventListener('click', handler);
            getStartedBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') handler(e);
            });
            getStartedBtn.dataset.gsBound = '1';
        }
    }

    
    console.log('🎉 All button redirects initialized successfully');
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
            console.log('📊 FALLBACK: Analyze button clicked via onclick');
            window.location.href = 'verify-news.html';
        };
        console.log('✅ Fallback onclick handler added to analyzeBtn');
    }
}

// Firebase initialization
function initializeFirebase() {
}

// Check authentication state and update UI
function checkAuthenticationState() {
    console.log('🔍 Checking authentication state...');
    const raw = sessionStorage.getItem('authData') || localStorage.getItem('authData');
    console.log('📦 Auth data from storage:', raw);
    if (raw) {
        try {
            const userData = JSON.parse(raw);
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
        document.addEventListener('click', (e) => {
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

async function updatePlatformStats() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.warn('⚠️ Firebase not ready yet - skipping Platform Stats update.');
        return;
    }

    const db = firebase.firestore();
    const animateValue = (id, start, end, duration, suffix = "") => {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const val = Math.floor(progress * (end - start) + start);
            obj.innerHTML = val.toLocaleString() + suffix;
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    };

    try {
        const verifySnap = await db.collection('facebook_verification_results').get();
        const totalVerified = verifySnap.size;

        const avgAccuracy = 98;

        let totalUsers = 0;
        try {
            const usersSnap = await db.collection('users').get();
            totalUsers = usersSnap.size;
        } catch (_e) {
            const uniqueUsers = new Set();
            verifySnap.docs.forEach(doc => {
                const d = doc.data();
                const uid = d.userID || d.userId || d.user_id || d.uid;
                if (uid && uid !== 'anonymous') uniqueUsers.add(uid);
            });
            totalUsers = uniqueUsers.size;
        }

        animateValue("stat-verified", 0, totalVerified, 2000);
        animateValue("stat-accuracy", 0, avgAccuracy, 2000, "%");
        animateValue("stat-users", 0, totalUsers, 2000);

    } catch (e) {
        console.error('Error fetching stats:', e);
        const vEl = document.getElementById("stat-verified");
        if (vEl) vEl.innerText = "0";
    }
}

async function renderRecentVerifications(limit = 3) {
    try {
        if (typeof firebase === 'undefined' || !firebase.firestore) return;
        const db = firebase.firestore();
        const container = document.querySelector('.ready-demo');
        if (!container) return;
        const titleEl = container.querySelector('.ready-demo-title');
        container.querySelectorAll('.ready-demo-item').forEach(el => { try { el.remove(); } catch(_) {} });
        let snap = null;
        try {
            snap = await db.collection('facebook_verification_results').orderBy('analyzed_at','desc').limit(20).get();
        } catch(_){
            snap = await db.collection('facebook_verification_results').limit(20).get();
        }
        const items = [];
        if (snap && !snap.empty) {
            snap.docs.forEach(doc => {
                const d = doc.data();
                const label = String(d.credibilityLabel || d.label || '').toLowerCase();
                const ok = label.includes('verified') || label.includes('credible') || (typeof d.credibilityScore === 'number' && d.credibilityScore >= 75);
                if (ok) {
                    const source = d.pageName || d.url || (d.analyzedText && String(d.analyzedText).slice(0,60) + '...') || 'Content';
                    items.push({ source: String(source), badge: label.includes('credible') || label.includes('verified') ? 'Verified' : 'Likely Verified' });
                }
            });
        }
        const list = items.slice(0, limit);
        if (list.length === 0) {
            const fallback = [
                { source: 'Reuters', badge: 'Verified' },
                { source: 'AP News', badge: 'Verified' },
                { source: 'BBC News', badge: 'Verified' }
            ].slice(0, limit);
            fallback.forEach(it => {
                const row = document.createElement('div');
                row.className = 'ready-demo-item';
                row.innerHTML = `<span class="ready-demo-source">${it.source}</span><span class="ready-demo-badge">${it.badge}</span>`;
                container.appendChild(row);
            });
            return;
        }
        list.forEach(it => {
            const row = document.createElement('div');
            row.className = 'ready-demo-item';
            row.innerHTML = `<span class="ready-demo-source">${it.source}</span><span class="ready-demo-badge">${it.badge}</span>`;
            container.appendChild(row);
        });
    } catch(_) {}
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

function handleFirestoreWriteError(err, featureName) {
    const c = err && err.code ? String(err.code) : '';
    const m = err && err.message ? String(err.message) : '';
    const d = (c && c.indexOf('permission-denied') !== -1) || (m && m.toLowerCase().indexOf('permission-denied') !== -1);
    if (d) {
        const t = 'Please verify your email to use this feature.';
        try {
            if (typeof showNotification === 'function') { showNotification(t, 'error'); }
            else if (window.alert) { alert(t); }
        } catch(_){ }
        return true;
    }
    return false;
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
            console.log('User is authenticated, signing out before navigating to', url);
            try {
                const sid = sessionStorage.getItem('current_session_id');
                if (sid && firebase.firestore) {
                    firebase.firestore().collection('login_sessions').doc(sid).set({
                        logout_time: new Date().toISOString(),
                        session_status: 'completed'
                    }, { merge: true });
                    sessionStorage.removeItem('current_session_id');
                }
            } catch (_e) {}
            firebase.auth().signOut()
                .then(() => {
                    console.log('✅ Firebase Sign Out complete');
                    clearAuthStorage();
                    // Add URL parameter to signal auth clearing to prevent redirect race condition
                    const targetUrl = url.includes('?') ? `${url}&clearAuth=1` : `${url}?clearAuth=1`;
                    console.log('Navigating to:', targetUrl);
                    navigateTo(targetUrl);
                })
                .catch((err) => {
                    console.error('❌ Firebase signOut error, proceeding anyway:', err);
                    clearAuthStorage();
                    const targetUrl = url.includes('?') ? `${url}&clearAuth=1` : `${url}?clearAuth=1`;
                    console.log(' Navigating to (after error):', targetUrl);
                    navigateTo(targetUrl);
                });
        } else {
            console.log('No authentication needed, navigating directly to:', url);
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
        console.log('Delegated click handler triggered on:', e.target);
        const target = e.target.closest('#authButtons .login-btn, #authButtons .signup-btn, .auth-buttons .login-btn, .auth-buttons .signup-btn');
        if (!target) {
            console.log('❌ No matching target found for delegation');
            return;
        }
        // Ignore clicks on logout fallback if any; ensure it does not use login-btn class
        if (target.id === 'logoutFallback' || target.classList.contains('logout-fallback')) {
            console.log('Ignoring click on logout fallback');
            return;
        }
        console.log('✅ Valid auth button clicked:', target.className);
        e.preventDefault();
        e.stopPropagation();
        const url = target.classList.contains('signup-btn') ? 'register.html' : 'login.html';
        console.log('Target URL determined:', url);
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

document.addEventListener('DOMContentLoaded', () => {
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
            return; 
        }
    } catch (e) { }

    showLoginSignupButtons();
    ensureAuthLinksWork();
    try {
        updateAuthButton();
    } catch (e) {
        console.error('Navbar init error:', e);
    }
    try { renderRecentVerifications(3); } catch(_) {}
    
    enforceAccessRules();
});
function enforceAccessRules() {
    const path = String(location.pathname.split('/').pop() || '').toLowerCase();
    const softRestricted = new Set(['verify-news.html','poser-detection.html']);
    const restricted = new Set(['my-verifications.html','poser-history.html','profile_settings.html','notifications.html']);
    const viewOnly = new Set(['trends.html','report.html']);
    const applyGuestView = () => { document.body.classList.add('guest-view-only'); };
    const removeGuestView = () => { document.body.classList.remove('guest-view-only'); removeGuestBanner(); enableInputs(); };
    const doRedirect = () => { const target = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search); window.location.href = target; };
    const isVerified = (u) => !!(u && (u.emailVerified || (Array.isArray(u.providerData) && u.providerData.some(p => p && p.providerId && p.providerId !== 'password'))));
    const insertGuestBanner = () => {
        if (document.querySelector('.guest-warning')) return;
        const el = document.createElement('div');
        el.className = 'guest-warning';
        el.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span> You need a verified account to use this feature.</span> <a href="login.html">Login</a>';
        if (path === 'poser-detection.html') {
            const toggles = document.querySelector('.toggle-buttons');
            if (toggles && toggles.parentNode) { toggles.parentNode.insertBefore(el, toggles); return; }
            const runBtn = document.getElementById('run-poser-btn');
            const parent = runBtn ? runBtn.parentNode : null;
            if (parent && runBtn) { parent.insertBefore(el, runBtn); return; }
            const card = document.querySelector('.verify-card.poser-card');
            const header = card ? card.querySelector('.card-header') : null;
            if (header && card) { card.insertBefore(el, header.nextSibling); return; }
        }
        const container = document.querySelector('.verify-news-container') || document.querySelector('.container') || document.body;
        container.insertBefore(el, container.firstChild);
    };
    const removeGuestBanner = () => { const x = document.querySelector('.guest-warning'); if (x) x.remove(); };
    const disableInputs = () => {
        let selectors = [];
        if (path === 'verify-news.html') selectors = ['#article-url','#verify-url-btn','#facebook-url','#facebook-content','#verify-facebook-btn'];
        else if (path === 'poser-detection.html') selectors = ['#poser-url','#run-poser-btn'];
        selectors.forEach(sel => { document.querySelectorAll(sel).forEach(el => { try { el.setAttribute('disabled','disabled'); el.setAttribute('aria-disabled','true'); el.setAttribute('readonly','readonly'); el.disabled = true; if ('readOnly' in el) el.readOnly = true; el.tabIndex = -1; el.classList.add('is-disabled'); el.title = 'Requires verified account'; } catch(_){} }); });
    };
    const enableInputs = () => {
        ['#article-url','#verify-url-btn','#facebook-url','#facebook-content','#verify-facebook-btn','#poser-url','#run-poser-btn'].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                try {
                    el.removeAttribute('disabled');
                    el.removeAttribute('aria-disabled');
                    el.removeAttribute('readonly');
                    if ('readOnly' in el) el.readOnly = false;
                    if (el.tabIndex === -1) el.tabIndex = 0;
                    el.classList.remove('is-disabled');
                    el.title = '';
                } catch(_){}
            });
        });
    };
    const check = (u) => {
        const ok = isVerified(u);
        if (softRestricted.has(path)) {
            if (!ok) { applyGuestView(); insertGuestBanner(); disableInputs(); return; }
            removeGuestView();
            return;
        }
        if (restricted.has(path)) {
            if (!ok) { doRedirect(); return; }
            removeGuestView();
            return;
        }
        if (viewOnly.has(path)) {
            if (!ok) { applyGuestView(); return; }
            removeGuestView();
        }
    };
    // Apply guest rules immediately while waiting for auth state
    check(null);
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(user => check(user));
    }
}
// Refresh dropdown when profile is updated elsewhere
try {
  window.addEventListener('user-profile-updated', () => {
    try { updateAuthButton(); } catch(_) {}
  });
} catch(_) {}

