console.log('🔧 auth.js is loading...');

// --- 2. Authentication Manager Class ---
class AuthManager {
    constructor() {
        console.log('🔧 AuthManager constructor called');
        this.googleProvider = new firebase.auth.GoogleAuthProvider();
        try { this.googleProvider.setCustomParameters({ prompt: 'select_account' }); } catch (_) {}
        this.db = firebase.firestore();
        this.init();
    }

    init() {
        this.bindEvents();
        this.initTheme();
        
        // Ensure the login form is shown by default if not redirected
        const urlParams = new URLSearchParams(window.location.search);
        const isRedirecting = urlParams.get('google_signup') === '1' || urlParams.get('verified') === 'true';
        if (!isRedirecting) {
            this.showLoginForm();
        }
    }
    
    initTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                
                icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            });
        }
    }

    bindEvents() {
        console.log('🔗 Binding events...');
        
          const fullNameInput = document.getElementById('fullName');
          if (fullNameInput) {
              fullNameInput.addEventListener('input', (e) => {
                  let value = e.target.value;
                  value = value.replace(/[^a-zA-Z\s]/g, '');
                  value = value.replace(/\s+/g, ' ');
                  value = value.replace(/\b\w/g, (char) => char.toUpperCase());
                  e.target.value = value;
              });
          }
        
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
            try {
                const savedEmail = localStorage.getItem('remember_email');
                if (savedEmail) {
                    const emailInput = document.getElementById('email');
                    if (emailInput) emailInput.value = savedEmail;
                    const rememberCb = loginForm.querySelector('input[name="remember"]');
                    if (rememberCb) rememberCb.checked = true;
                }
            } catch(_e) {}
        }

        const googleSignIn = document.getElementById('googleSignIn');
        if (googleSignIn) {
            googleSignIn.addEventListener('click', () => this.handleGoogleAuth('signin'));
        }

        const googleSignUp = document.getElementById('googleSignUp');
        if (googleSignUp) {
            googleSignUp.addEventListener('click', () => this.handleGoogleAuth('signup'));
        }

        const backToLoginBtn = document.getElementById('backToLoginBtn');
        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', () => this.showLoginForm());
        }
    }
    
    // Login flow
    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const email = formData.get('email');
        const password = formData.get('password');
        const remember = formData.get('remember');
        
        if (!this.validateEmail(email) || !password) {
            this.showError('Please enter valid email and password.');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true);

        try {
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            const idToken = await user.getIdToken(); 
            
            if (!user.emailVerified) {
                this.showError('Your email is not verified. Please check your inbox or resend the verification email.');
                const verificationMessageEl = document.getElementById('verificationMessage');
                if (verificationMessageEl) verificationMessageEl.style.display = 'block';
                this.showResendVerificationOption(user.email);
                return;
            }
            
            // --- CRITICAL FIX: Profile Repair Check on Successful Login ---
            try {
                const userRef = this.db.collection('users').doc(user.uid);
                const snap = await userRef.get();
                
                const updateData = {
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                    emailVerified: user.emailVerified 
                };
                
                // Check if document is missing OR is missing the 'name' field (indicating an incomplete profile)
                if (!snap.exists || !snap.data().name) {
                    // PROFILE REPAIR / INITIAL CREATION
                    
                    const existingData = snap.exists ? snap.data() : {};
                    
                    await userRef.set({
                        name: user.displayName || existingData.name || 'User', // Use display name, or existing name, or default
                        email: user.email,
                        profilePictureUrl: user.photoURL || existingData.profilePictureUrl || null,
                        providerId: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || existingData.providerId || 'password',
                        role: existingData.role || 'user', // Preserve existing role or default
                        createdAt: existingData.createdAt || firebase.firestore.FieldValue.serverTimestamp(), // Preserve existing timestamp or set new
                        preferences: existingData.preferences || { theme: 'dark', notifications: true }, // Preserve existing preferences
                        ...updateData
                    });
                    console.log('✅ Firestore profile re-created/repaired and updated.');
                } else {
                    // Standard Login: Only update the dynamic fields
                    await userRef.update(updateData);
                    console.log('✅ Firestore profile updated with latest login time and verification status.');
                }
                
            } catch (profileErr) {
                console.warn('Firestore profile update warning:', profileErr && profileErr.message);
            }
            
            // Store auth state
            const authData = {
                uid: user.uid, email: user.email, isAuthenticated: true, 
                emailVerified: user.emailVerified, loginTime: new Date().toISOString(), idToken: idToken
            };
            
            (remember ? localStorage : sessionStorage).setItem('authData', JSON.stringify(authData));
            try { 
                if (remember) localStorage.setItem('remember_email', email);
                else localStorage.removeItem('remember_email');
            } catch(_e) {}

            // Store session log (non-critical)
            try {
                const sessionRef = await this.db.collection('login_sessions').add({
                    user_id: user.uid, login_time: new Date().toISOString(), logout_time: null, session_status: 'active'
                });
                sessionStorage.setItem('current_session_id', sessionRef.id);
            } catch (_e) {}

            this.showSuccess('Login successful! Redirecting to homepage...');
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);

        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'Login failed. Please try again.';
            
            switch (error.code) {
                case 'auth/user-not-found': errorMessage = 'No account found for this email. Please sign up to create one.'; break;
                case 'auth/wrong-password': errorMessage = 'Incorrect password. Please try again.'; break;
                case 'auth/invalid-email': errorMessage = 'Invalid email address format.'; break;
                case 'auth/too-many-requests': errorMessage = 'Too many failed attempts. Please try again later.'; break;
                case 'auth/user-disabled': errorMessage = 'This account has been disabled. Please contact support.'; break;
                default: errorMessage = 'Login failed. Please try again.';
            }
            this.showError(errorMessage);
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    // Google OAuth (Sign-In/Sign-Up) 
    async handleGoogleAuth(type) {
        const actionText = type === 'signin' ? 'Signing in' : 'Signing up';
        
        try {
            this.showInfo(`${actionText} with Google...`);
            
            const protocolOk = ['http:', 'https:', 'chrome-extension:'].includes(window.location.protocol);
            if (!protocolOk) {
                // Environment check logic...
                return;
            }
            
            let result;
            try {
                result = await firebase.auth().signInWithPopup(this.googleProvider);
            } catch (popupErr) {
                if (popupErr && (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/operation-not-supported-in-this-environment')) {
                    await firebase.auth().signInWithRedirect(this.googleProvider);
                    return;
                }
                throw popupErr;
            }
            const user = result.user;
            const idToken = await user.getIdToken(); 
            
            const userRef = this.db.collection('users').doc(user.uid);
            const userDoc = await userRef.get();
            
            // --- FIX: IMMEDIATE FULL PROFILE CREATION FOR NEW GOOGLE USERS ---
            if (!userDoc.exists) {
                console.log('✅ NEW Google user detected. Creating full profile immediately.');
                
                // 1. Create the full profile document instantly
                await userRef.set({
                    name: user.displayName || 'Google User', // Use Google's name immediately
                    email: user.email,
                    profilePictureUrl: user.photoURL || null,
                    providerId: user.providerData[0].providerId,
                    role: 'user', 
                    emailVerified: true, 
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                    preferences: { theme: 'dark', notifications: true }
                });
                
                // 2. Store minimal data and proceed to registration gate for finalization
                sessionStorage.setItem('googleAuthPending', JSON.stringify({
                    uid: user.uid, email: user.email, name: user.displayName, 
                    photoURL: user.photoURL, providerId: user.providerData[0].providerId, idToken: idToken 
                }));
                
                // 3. Sign out to enforce completing registration (Terms, Custom Name)
                await firebase.auth().signOut();
                
                this.showInfo(`Profile created. Redirecting for final setup...`);
                setTimeout(() => { window.location.href = 'register.html?google_signup=1'; }, 500);
                
                return;
            } else {
                // --- Existing User: Update dynamic fields only ---
                await userRef.update({
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                    emailVerified: user.emailVerified 
                });
                console.log('✅ Existing Google user login time and verification status updated.');
            }
            
            // Store auth state (Existing user)
            const authData = {
                uid: user.uid, email: user.email, fullName: user.displayName || 'Google User',
                isAuthenticated: true, provider: 'google', loginTime: new Date().toISOString(), idToken: idToken
            };
            
            sessionStorage.setItem('authData', JSON.stringify(authData));
            this.showSuccess(`${actionText} with Google successful! Redirecting to homepage...`);
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);

        } catch (error) {
            console.error('Google auth error:', error);
            this.showError(`${actionText} with Google failed. Please try again.`);
        }
    }

    // --- Registration Flow: E/P Sign-up (Full Profile Creation) ---
    async handleEmailPasswordRegister({ fullName, email, password }) {
        let createdUser = null;
        
        try {
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = createdUser = userCredential.user;

            await user.updateProfile({ displayName: fullName });
            
            // Send email verification link
            const safeOrigin = (window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : `${window.location.protocol}//${window.location.host}`;
            const actionCodeSettings = { url: `${safeOrigin}/login.html`, handleCodeInApp: true };
            try {
                await user.sendEmailVerification(actionCodeSettings);
            } catch (err) {
                await user.sendEmailVerification();
            }

            // --- CRITICAL: Create the Full Firestore Profile (emailVerified: false) ---
            const userRef = this.db.collection('users').doc(createdUser.uid);
            await userRef.set({
                name: fullName, 
                email: email,
                profilePictureUrl: createdUser.photoURL || null, 
                providerId: 'password', 
                role: 'user', 
                emailVerified: false, // User must click the link to become true
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(), 
                preferences: { theme: 'dark', notifications: true }
            }, { merge: true });
            
            return { success: true };
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, code: error.code, message: error.message };
        }
    }
    
    // --- Google Signup Submission (Finalizing Registration/Custom Name) ---
    async handleGoogleSignupSubmit(e, pendingData) {
        e.preventDefault();
        const fullName = document.getElementById("fullName").value.trim();
        const submitBtn = document.querySelector('#registerForm button[type="submit"]');
        
        if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(fullName)) {
             this.showError("Please enter a valid full name using letters only.");
             return;
        }

        const blockUntil = parseInt(localStorage.getItem('register_block_until') || '0', 10);
        if (blockUntil > Date.now()) {
            this.showError('We have blocked requests from this device due to unusual activity. Please wait and try again later.');
            return;
        }
        
        this.setButtonLoading(submitBtn, true);

        try {
            let user = firebase.auth().currentUser;
            // The user may or may not be signed in here, depending on browser state.
            // We use the ID Token from pendingData to ensure we get the correct user.
            if (!user || user.uid !== pendingData.uid) {
                 const cred = firebase.auth.GoogleAuthProvider.credential(pendingData.idToken);
                 const userCredential = await firebase.auth().signInWithCredential(cred);
                 user = userCredential.user;
            }
            
            // Since the full profile was already created in handleGoogleAuth, 
            // we only need to update the custom name field and finalize login.
            
            const userRef = this.db.collection('users').doc(user.uid);
            
            // 1. Update the name in Firebase Auth profile
            await user.updateProfile({ displayName: fullName });
            
            // 2. Update the name in Firestore profile
            await userRef.update({ 
                name: fullName, 
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() // Final login update
            });
            
            // 3. Clean up session and redirect
            sessionStorage.removeItem('googleAuthPending');
            
            this.showSuccess(`Welcome, ${fullName}! Registration complete. Redirecting to homepage.`);
            setTimeout(() => { window.location.href = 'index.html'; }, 1000);

        } catch (error) {
            console.error('Google Signup Submission error:', error);
            this.showError(`Registration failed: ${error.message}. Please try logging in again.`);
            await firebase.auth().signOut();
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }
    
    // --- Resend Verification Option (for Login page) ---
    showResendVerificationOption(email) {
        const COOLDOWN_MS = 60 * 1000; // 60 seconds
        const cooldownKey = `resend_verif_cooldown_${email}`;
        
        const resendBtn = document.createElement('button');
        resendBtn.textContent = 'Resend Verification Email';
        resendBtn.className = 'auth-btn secondary';
        resendBtn.style.marginTop = '10px';
        resendBtn.style.width = '100%';

        let countdownTimer = null;

        const startCountdown = (untilTs) => {
            const update = () => {
                const remaining = Math.max(0, untilTs - Date.now());
                const secs = Math.ceil(remaining / 1000);
                if (remaining <= 0) {
                    clearInterval(countdownTimer);
                    countdownTimer = null;
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend Verification Email';
                    return;
                }
                resendBtn.disabled = true;
                resendBtn.textContent = `Resend Verification Email (wait ${secs}s)`;
            };
            update();
            countdownTimer = setInterval(update, 1000);
        };

        const existingUntil = parseInt(localStorage.getItem(cooldownKey) || '0', 10);
        if (existingUntil > Date.now()) {
            startCountdown(existingUntil);
        }

        resendBtn.addEventListener('click', async () => {
            try {
                const now = Date.now();
                const until = parseInt(localStorage.getItem(cooldownKey) || '0', 10);
                if (until > now) {
                    this.showInfo('Please wait before resending the verification email.');
                    return;
                }

                resendBtn.disabled = true;
                resendBtn.textContent = 'Sending...';
                
                const user = firebase.auth().currentUser;
                if (user) {
                    const safeOrigin = (window.location.origin && window.location.origin.startsWith('http'))
                        ? window.location.origin
                        : `${window.location.protocol}//${window.location.host}`;
                    const actionCodeSettings = {
                        url: `${safeOrigin}/login.html`,
                        handleCodeInApp: true
                    };
                    try {
                        await user.sendEmailVerification(actionCodeSettings);
                    } catch (err) {
                        await user.sendEmailVerification();
                    }
                    this.showSuccess('Verification email sent! Please check your inbox.');
                    const cooldownUntil = Date.now() + COOLDOWN_MS;
                    localStorage.setItem(cooldownKey, String(cooldownUntil));
                    startCountdown(cooldownUntil);
                } else {
                    this.showError('Please try logging in again to resend verification email.');
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend Verification Email';
                }
            } catch (error) {
                this.showError('Unable to resend verification email. Please try again.');
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend Verification Email';
            }
        });
        
        const form = document.querySelector('.auth-form');
        if (form) {
            form.appendChild(resendBtn);
        }
    }
    
    // --- UI Helpers (remain the same) ---
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    setButtonLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            const originalContent = button.innerHTML;
            button.dataset.originalContent = originalContent;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait...';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalContent || button.innerHTML;
        }
    }
    
    showNotification(message, type = 'info') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-times-circle';
            case 'warning': return 'fa-exclamation-triangle';
            default: return 'fa-info-circle';
        }
    }

    showSuccess(message) { this.showNotification(message, 'success'); }
    showError(message) { this.showNotification(message, 'error'); }
    showInfo(message) { this.showNotification(message, 'info'); }

    showLoginForm() {
        const otpContainer = document.getElementById('otpVerificationContainer');
        const loginForm = document.getElementById('loginForm');
        
        if (otpContainer) otpContainer.style.display = 'none';
        if (loginForm) loginForm.style.display = 'block';
        
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// --- 3. Global Initialization and Auth State Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOMContentLoaded event fired!');
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('message') === 'verify-email') {
        const verificationMessage = document.getElementById('verificationMessage');
        if (verificationMessage) verificationMessage.style.display = 'block';
    }
    
    if (urlParams.get('verified') === 'true') {
        sessionStorage.setItem('verification_just_completed','1');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    async function checkEmailVerificationStatus() {
        try {
            const justVerified = sessionStorage.getItem('verification_just_completed');
            if (justVerified === '1') {
                const verificationSuccessMessage = document.getElementById('verificationSuccessMessage');
                if (verificationSuccessMessage) {
                    verificationSuccessMessage.style.display = 'block';
                    setTimeout(() => { verificationSuccessMessage.style.display = 'none'; }, 5000);
                }
                const user = firebase.auth().currentUser;
                if (user) {
                    await firebase.firestore().collection('users').doc(user.uid).set({ emailVerified: true }, { merge: true });
                }
                sessionStorage.removeItem('verification_just_completed');
            }
        } catch (error) {
            console.log('ℹ️ Verification status check failed:', error.message);
        }
    }
    checkEmailVerificationStatus();
    
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            await user.reload();
            try {
                if (user.emailVerified) {
                    await firebase.firestore().collection('users').doc(user.uid).set({ emailVerified: true }, { merge: true });
                }
            } catch (e) {
                console.error('Failed to sync emailVerified on auth state:', e && e.message);
            }
            if (user.emailVerified && sessionStorage.getItem('verification_just_completed') === '1') {
                checkEmailVerificationStatus();
            }
        }
    });
    
    window.authManager = new AuthManager();
    
    // Check for Google Redirect Result (with Profile Repair Check)
    if (firebase && firebase.auth) {
        firebase.auth().getRedirectResult().then(async (result) => {
            if (result && result.user) {
                const user = result.user;
                const db = firebase.firestore();
                const userRef = db.collection('users').doc(user.uid);
                const userDoc = await userRef.get();
                const idToken = await user.getIdToken(); 
                
                if (!userDoc.exists) {
                    // --- New User detected via Redirect Result: GO TO REGISTRATION GATE ---
                    
                    // 1. Create full profile immediately (Fixes the missing document problem)
                    await userRef.set({
                        name: user.displayName || 'Google User', 
                        email: user.email,
                        profilePictureUrl: user.photoURL || null,
                        providerId: user.providerData[0].providerId,
                        role: 'user', 
                        emailVerified: true, 
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                        preferences: { theme: 'dark', notifications: true }
                    });
                    
                    // 2. Store minimal data and proceed to registration gate for finalization
                    sessionStorage.setItem('googleAuthPending', JSON.stringify({
                        uid: user.uid, email: user.email, name: user.displayName,
                        photoURL: user.photoURL, providerId: user.providerData[0].providerId, idToken: idToken 
                    }));
                    
                    // 3. Sign out to enforce completing registration (Terms, Custom Name)
                    await firebase.auth().signOut();
                    window.location.href = 'register.html?google_signup=1';
                    return;
                } 
                
                // --- Existing User / Profile Repair Check ---
                const updateData = {
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                    emailVerified: user.emailVerified 
                };
                
                // Check if profile exists but is incomplete (missing 'name' field is the proxy for completion)
                if (!userDoc.data().name) {
                    // PROFILE REPAIR: Document exists but is incomplete (e.g., only {emailVerified, lastLoginAt})
                    const existingData = userDoc.data();
                    
                    await userRef.set({
                        name: user.displayName || existingData.name || 'Google User', // Use display name, or existing name, or default
                        email: user.email,
                        profilePictureUrl: user.photoURL || existingData.profilePictureUrl || null,
                        providerId: user.providerData[0].providerId,
                        role: existingData.role || 'user', // Preserve existing role or default
                        createdAt: existingData.createdAt || firebase.firestore.FieldValue.serverTimestamp(), // Preserve existing timestamp
                        preferences: existingData.preferences || { theme: 'dark', notifications: true }, // Preserve existing preferences
                        ...updateData
                    });
                    console.log('✅ Existing Google user profile repaired and updated.');
                } else {
                    // --- Complete User: Update dynamic fields only ---
                    await userRef.update(updateData);
                    console.log('✅ Existing Google user login time and verification status updated.');
                }

                const authData = {
                    uid: user.uid, email: user.email, fullName: user.displayName || 'Google User',
                    isAuthenticated: true, provider: 'google', loginTime: new Date().toISOString(), idToken: idToken 
                };
                sessionStorage.setItem('authData', JSON.stringify(authData));
                
                setTimeout(() => { window.location.href = 'index.html'; }, 500);
            }
        }).catch((err) => {
            console.warn('Redirect result error:', err);
        });
    } 
    
    function checkAuthStatus() {
        const isGoogleSignupPending = urlParams.get('google_signup') === '1' || sessionStorage.getItem('googleAuthPending');
        if (isGoogleSignupPending) return; 

        if (urlParams.get('clearAuth') === '1') {
            localStorage.removeItem('authData');
            sessionStorage.removeItem('authData');
            urlParams.delete('clearAuth');
            window.history.replaceState({}, document.title, window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : ''));
            return;
        }

        const authData = localStorage.getItem('authData') || sessionStorage.getItem('authData');
        if (authData) {
            try {
                if (JSON.parse(authData).isAuthenticated) {
                    window.location.href = 'index.html';
                    return;
                }
            } catch (error) {
                localStorage.removeItem('authData');
                sessionStorage.removeItem('authData');
            }
        }
    }
    checkAuthStatus();
    
    console.log('✅ Authentication system initialized!');
});