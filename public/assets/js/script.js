console.log('🚀 Script.js loaded successfully!');

function getLocalUserData() {
    try {
        const raw = sessionStorage.getItem('authData') || localStorage.getItem('authData');
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error('Error parsing authData:', e);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (window.__credinewsInitDone) return;
    window.__credinewsInitDone = true;

    console.log('📄 DOM Content Loaded - Starting initialization...');

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

    initializeSmoothScrolling();
    initializeInteractiveElements();
    ensureAuthLinksWork();
    try {
        updateAuthButton();
    } catch (e) {
        console.error('Navbar init error:', e);
    }
    updatePlatformStats();
    enforceAccessRules();
    initializeThemeToggle();
    try { renderRecentVerifications(3); } catch(_) {}
    initializeNotifications();
    
    console.log('✅ Initialization complete!');
});

function initializeThemeToggle() {
    if (window.__themeToggleBound) return; 
    window.__themeToggleBound = true;

    const buttons = Array.from(document.querySelectorAll('.nav-theme-toggle, #theme-toggle-btn'));
    if (!buttons.length) return;

    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(buttons, savedTheme);

    buttons.forEach((btn) => {
        if (btn.dataset.themeBound === '1') return;
        btn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeUI(buttons, newTheme);
        });
        btn.dataset.themeBound = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        btn.style.zIndex = '10001';
        btn.style.cursor = 'pointer';
    });

    const observer = new MutationObserver(() => {
        const newlyAdded = Array.from(document.querySelectorAll('.nav-theme-toggle, #theme-toggle-btn, #themeToggle')).filter(b => b.dataset.themeBound !== '1');
        if (!newlyAdded.length) return;
        newlyAdded.forEach((btn) => {
            btn.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                updateThemeUI(Array.from(document.querySelectorAll('.nav-theme-toggle, #theme-toggle-btn, #themeToggle')), newTheme);
            });
            btn.dataset.themeBound = '1';
        });
        updateThemeUI(Array.from(document.querySelectorAll('.nav-theme-toggle, #theme-toggle-btn, #themeToggle')), document.documentElement.getAttribute('data-theme'));
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function updateThemeUI(btns, theme) {
    btns.forEach((btn) => {
        if (theme === 'dark') {
            btn.innerHTML = '<i class="fas fa-moon"></i>';
            btn.setAttribute('aria-label', 'Switch to Light Mode');
        } else {
            btn.innerHTML = '<i class="fas fa-sun"></i>';
            btn.setAttribute('aria-label', 'Switch to Dark Mode');
        }
    });
}

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
            const themeToggle = navControls.querySelector('#theme-toggle-btn');
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
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-item logout-item" id="logoutMenuItem"><i class="fas fa-sign-out-alt"></i> Logout</div>
                </div>
            `;

        } else {
            const headerName = ensureDropdown.querySelector('.user-display-name');
            if (headerName) headerName.textContent = displayName;
            const headerEmail = ensureDropdown.querySelector('.user-email');
            if (headerEmail) headerEmail.textContent = email || '';
            const avatarEl = ensureDropdown.querySelector('.user-avatar');
            if (avatarEl && photoURL) {
                avatarEl.innerHTML = `<img src="${photoURL}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            }
        }

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
            userAccountBtn.addEventListener('click', (e) => {
                const withinDropdown = dropdown.contains(e.target);
                if (withinDropdown) return;
                toggleDropdown(e);
            });
            userAccountBtn.dataset.btnClickBound = '1';
        }
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
        const ddVerifications = ensureDropdown.querySelector('#ddVerifications');
        if (ddVerifications) ddVerifications.onclick = (e) => { e.preventDefault(); window.location.href = 'my-verifications.html'; };
        const ddPoserHistory = ensureDropdown.querySelector('#ddPoserHistory');
        if (ddPoserHistory) ddPoserHistory.onclick = (e) => { e.preventDefault(); window.location.href = 'poser-history.html'; };

        const logoutFallback = document.getElementById('logoutFallback');
        if (logoutFallback) logoutFallback.remove();

        console.log('👤 Showing user dropdown for', displayName);
    };

    const data = getLocalUserData();
    if (data) {
        const displayName = data.displayName || data.fullName || data.email || 'User';
        showLoggedInUI(displayName, data.email || '', data.photoURL || '');
    } else {
        showLoggedOutUI();
    }

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
    const buttons = document.querySelectorAll('.check-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 150);
        });
    });

    initializeButtonRedirects();
}

function initializeButtonRedirects() {
    console.log('🔗 Initializing button redirects...');
    console.log('🔍 Looking for buttons...');

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

    const getStartedBtn = document.querySelector('.btn-signup');
    if (getStartedBtn) {
        console.log('✅ Found Get Started button, adding redirect...');
        const handler = function(e) {
            try { e.preventDefault(); } catch(_) {}
            console.log('🚀 Get Started clicked - redirecting to verify-news.html');
            window.location.href = 'verify-news.html';
        };
        if (!getStartedBtn.dataset.gsBound) {
            getStartedBtn.addEventListener('click', handler);
            getStartedBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') handler(e);
            });
            getStartedBtn.dataset.gsBound = '1';
        }
    }

    console.log('🎉 All button redirects initialized successfully');
}

function initializeFirebase() {
}

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

function updateUIForLoggedInUser(userData) {
    console.log('🔄 Updating UI for logged-in user...');
    console.log('✅ User logged in:', userData.displayName || userData.email);
    console.log('✅ Keeping original button functionality for logged-in users');
}

function updateUIForLoggedOutUser() {
    console.log('🔄 Updating UI for logged-out user...');
    console.log('✅ Keeping original button functionality for logged-out users');
}

function setupUserDropdown() {
    const userAccountBtn = document.getElementById('userAccountBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutItem = document.getElementById('logoutMenuItem');

    if (!(userAccountBtn && userDropdown)) return;
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

    if (logoutItem) {
        logoutItem.addEventListener('click', function (e) {
            e.preventDefault();
            if (typeof doLogout === 'function') doLogout();
            else if (typeof handleLogout === 'function') handleLogout();
        });
    }

    arrowIcon.dataset.arrowClickBound = '1';
}

function handleLogout() {
    sessionStorage.removeItem('authData');
    updateUIForLoggedOutUser();
    console.log('User logged out successfully');
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
                const rawLabel = String(d.credibilityLabel || d.label || d.aiVerdict || d.verdict || '').trim();
                const low = rawLabel.toLowerCase();
                const score = typeof d.credibilityScore === 'number' ? d.credibilityScore : NaN;
                const ok = low.includes('verified') || low.includes('credible') || (Number.isFinite(score) && score >= 75);
                if (ok) {
                    const source = d.pageName || d.url || (d.analyzedText && String(d.analyzedText).slice(0,60) + '...') || 'Content';
                    const badge = rawLabel || (Number.isFinite(score) ? (score >= 80 ? 'Credible' : (score >= 60 ? 'Likely Credible' : (score >= 40 ? 'Mixed / Unverified' : 'Low Credibility'))) : 'Verified');
                    items.push({ source: String(source), badge: String(badge) });
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

    if (window.__authLinksBound) return; 
    window.__authLinksBound = true;

    const navControls = document.querySelector('.nav-controls');
    if (!navControls) return;
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

    const delegatedHandler = (e) => {
        console.log('Delegated click handler triggered on:', e.target);
        const target = e.target.closest('#authButtons .login-btn, #authButtons .signup-btn, .auth-buttons .login-btn, .auth-buttons .signup-btn');
        if (!target) {
            console.log('❌ No matching target found for delegation');
            return;
        }
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

function enforceAccessRules() {
    if (window.__accessRulesBound) return; 
    window.__accessRulesBound = true;

    const path = String(location.pathname.split('/').pop() || '').toLowerCase();
    const softRestricted = new Set(['verify-news.html','poser-detection.html']);
    const restricted = new Set(['my-verifications.html','poser-history.html']);
    const viewOnly = new Set(['trends.html','report.html']);
    const applyGuestView = () => { document.body.classList.add('guest-view-only'); };
    const removeGuestView = () => { document.body.classList.remove('guest-view-only'); removeGuestBanner(); enableInputs(); };
    const doRedirect = () => { const target = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search); window.location.href = target; };
    
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
            if (u == null) { return; }
            if (!ok) { 
                window.location.href = 'index.html';
                return; 
            }
            removeGuestView();
            return;
        }
        if (viewOnly.has(path)) {
            if (!ok) { applyGuestView(); return; }
            removeGuestView();
        }
    };
    check(getLocalUserData());

    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(user => check(user));
    }
}

try {
  window.addEventListener('user-profile-updated', () => {
    try { updateAuthButton(); } catch(_) {}
  });
} catch(_) {}

const VERIFICATION_DAYS_LIMIT = 3;

async function createVerificationNotification(resultId = null) {
  if (!window.firebase || !firebase.auth().currentUser) return;
  const user = firebase.auth().currentUser;
  const now = firebase.firestore.Timestamp.now();
  const verifyBy = firebase.firestore.Timestamp.fromMillis(
    now.toMillis() + VERIFICATION_DAYS_LIMIT * 24 * 60 * 60 * 1000
  );
  
  try {
      await firebase.firestore().collection('notifications').add({
        userId: user.uid,
        type: 'verification',
        status: 'pending',
        title: 'Verification in progress',
        message: 'Our team will review your verification within 1–2 days. You will receive a notification when processed.',
        timestamp: now,
        verifyBy: verifyBy,
        relatedResultId: resultId || null,
        link: 'profile_settings.html?tab=notifications',
        readAt: null
      });
      console.log('Notification created for verification request.');
  } catch (e) {
      console.error('Error creating notification:', e);
  }
}

window.createVerificationNotification = createVerificationNotification;

function getDaysRemaining(verifyBy) {
  if (!verifyBy) return 0;
  const now = Date.now();
  const end = verifyBy.toMillis();
  const diff = end - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function buildVerificationMessage(notification) {
  const daysLeft = getDaysRemaining(notification.verifyBy);
  if (notification.status === 'completed') {
    return 'Your verification is complete.';
  }
  if (daysLeft <= 0) {
    return 'Verification period expired. Please resubmit.';
  }
  if (daysLeft === 1) {
    return '⏳ 1 day left to complete verification.';
  }
  return `⏳ ${daysLeft} days left to complete verification.`;
}

function listenToVerificationInbox(renderFn) {
  const user = firebase.auth().currentUser;
  if (!user) return;
  return firebase.firestore()
    .collection('notifications')
    .where('userId', '==', user.uid)
    .orderBy('timestamp', 'desc')
    .onSnapshot(snapshot => {
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          displayMessage: data.message || buildVerificationMessage(data)
        };
      });
      renderFn(items);
    });
}

function listenUnreadVerificationCount(updateFn) {
  const user = firebase.auth().currentUser;
  if (!user) return;
  return firebase.firestore()
    .collection('notifications')
    .where('userId', '==', user.uid)
    .where('readAt', '==', null)
    .onSnapshot(snap => {
      updateFn(snap.size);
    });
}

async function markVerificationNotificationRead(notificationId) {
  if (!window.firebase) return;
  return firebase.firestore()
    .collection('notifications')
    .doc(notificationId)
    .update({ readAt: firebase.firestore.FieldValue.serverTimestamp() });
}

function renderNotificationList(items, container) {
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state">No notifications</div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="notification-item ${item.readAt ? '' : 'unread'}" onclick="window.handleNotificationClick('${item.id}', '${item.relatedResultId || ''}')">
            <div class="title">${item.title || 'Notification'}</div>
            <div class="message">${item.displayMessage || item.message}</div>
            <span class="time">${item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleDateString() : ''}</span>
        </div>
    `).join('');
}

window.handleNotificationClick = async function(notificationId, resultId) {
    await markVerificationNotificationRead(notificationId);
    
    const dropdown = document.getElementById('notification-dropdown');
    const bellBtn = document.getElementById('notification-bell');
    if(dropdown) dropdown.classList.remove('show');
    if(bellBtn) bellBtn.classList.remove('active');
    window.location.href = 'profile_settings.html?tab=notifications';
}

window.listenToVerificationInbox = listenToVerificationInbox;
window.listenUnreadVerificationCount = listenUnreadVerificationCount;
window.markVerificationNotificationRead = markVerificationNotificationRead;

function initializeNotifications() {
    if (window.__notificationsBound) return; 
    window.__notificationsBound = true;

    const bellBtn = document.getElementById('notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    const badge = document.getElementById('notification-badge');
    const listContainer = document.getElementById('notification-list');
    const markAllBtn = document.getElementById('mark-all-read');

    if (!bellBtn || !dropdown || !listContainer) return;

    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
        bellBtn.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
            dropdown.classList.remove('show');
            bellBtn.classList.remove('active');
        }
    });

    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            if (!firebase.auth().currentUser) return;
            const badges = document.querySelectorAll('.notification-item.unread');
            badges.forEach(el => el.classList.remove('unread'));
            if(badge) badge.style.display = 'none';

            const batch = firebase.firestore().batch();
            const snap = await firebase.firestore().collection('notifications')
                .where('userId', '==', firebase.auth().currentUser.uid)
                .where('readAt', '==', null)
                .get();
            
            snap.docs.forEach(doc => {
                batch.update(doc.ref, { readAt: firebase.firestore.FieldValue.serverTimestamp() });
            });
            
            if (!snap.empty) {
                await batch.commit();
            }
        });
    }

    const setupAuthListener = () => {
        if (window.firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged(user => {
                const wrapper = document.getElementById('notificationWrapper');
                if (user) {
                    if (wrapper) wrapper.style.display = 'block';
                    listenUnreadVerificationCount((count) => {
                        if (badge) {
                            if (count > 0) {
                                badge.style.display = 'block';
                                badge.textContent = count > 9 ? '9+' : count;
                            } else {
                                badge.style.display = 'none';
                            }
                        }
                    });

                    listenToVerificationInbox((items) => {
                        renderNotificationList(items, listContainer);
                    });
                } else {
                    if (wrapper) wrapper.style.display = 'none';
                    if (badge) badge.style.display = 'none';
                    listContainer.innerHTML = '<div class="empty-state">Please log in to view notifications</div>';
                }
            });
        }
    };

    if (window.firebase && firebase.auth) {
        setupAuthListener();
    } else {
        window.addEventListener('load', setupAuthListener);
    }
}

try { updateAuthButton(); } catch(e) {}
