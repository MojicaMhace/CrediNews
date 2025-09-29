// Firebase will be available globally after firebase-config.js loads

console.log('🔧 auth.js is loading...');

// Authentication Manager
class AuthManager {
    constructor() {
        console.log('🔧 AuthManager constructor called');
        this.googleProvider = new firebase.auth.GoogleAuthProvider();
        this.init();
    }

    init() {
        this.bindEvents();
        this.initTheme();
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
        
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            console.log('✅ Login form found, binding event');
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        } else {
            console.log('ℹ️ Login form not found (this is normal on register page)');
        }

        // Register form
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            console.log('✅ Register form found, binding event');
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        } else {
            console.log('❌ Register form NOT found!');
        }

        // Google Sign In
        const googleSignIn = document.getElementById('googleSignIn');
        if (googleSignIn) {
            googleSignIn.addEventListener('click', () => this.handleGoogleAuth('signin'));
        }

        // Google Sign Up
        const googleSignUp = document.getElementById('googleSignUp');
        if (googleSignUp) {
            googleSignUp.addEventListener('click', () => this.handleGoogleAuth('signup'));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const email = formData.get('email');
        const password = formData.get('password');
        const remember = formData.get('remember');

        // Validate form
        if (!this.validateEmail(email)) {
            this.showError('Please enter a valid email address.');
            return;
        }

        if (!password || password.length < 6) {
            this.showError('Password must be at least 6 characters long.');
            return;
        }

        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true);

        try {
            // Firebase authentication
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Store auth state
            const authData = {
                uid: user.uid,
                email: user.email,
                isAuthenticated: true,
                loginTime: new Date().toISOString()
            };
            
            if (remember) {
                localStorage.setItem('authData', JSON.stringify(authData));
            } else {
                sessionStorage.setItem('authData', JSON.stringify(authData));
            }

            this.showSuccess('Login successful! Redirecting...');
            
            // Redirect after success
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);

        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'Login failed. Please try again.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email address.';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password. Please try again.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address format.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many failed attempts. Please try again later.';
                    break;
            }
            
            this.showError(errorMessage);
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        console.log('🚀 Registration form submitted');
        
        const formData = new FormData(e.target);
        const fullName = formData.get('fullName');
        const email = formData.get('email');
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');
        const terms = formData.get('terms');

        console.log('📝 Form data:', { fullName, email, password: '***', confirmPassword: '***', terms });

        // Validate form
        if (!fullName || fullName.trim().length < 2) {
            console.log('❌ Validation failed: Full name');
            this.showError('Please enter your full name.');
            return;
        }

        if (!this.validateEmail(email)) {
            console.log('❌ Validation failed: Email');
            this.showError('Please enter a valid email address.');
            return;
        }

        if (!password || password.length < 6) {
            console.log('❌ Validation failed: Password length');
            this.showError('Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            console.log('❌ Validation failed: Password mismatch');
            this.showError('Passwords do not match.');
            return;
        }

        if (!terms) {
            console.log('❌ Validation failed: Terms not accepted');
            this.showError('Please accept the Terms of Service and Privacy Policy.');
            return;
        }

        console.log('✅ All validations passed');

        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true);

        try {
            console.log('🔥 Starting Firebase registration...');
            
            // Check if Firebase is available
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase is not loaded');
            }
            
            console.log('🔥 Firebase is available, creating user...');
            
            // Firebase authentication - create user
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            console.log('✅ User created successfully:', user.uid);
            
            // Update user profile with display name
            console.log('👤 Setting user display name...');
            await user.updateProfile({
                displayName: fullName
            });
            console.log('✅ User display name set to:', fullName);
            
            // Wait for auth state to be established
            await new Promise(resolve => {
                const unsubscribe = firebase.auth().onAuthStateChanged(authUser => {
                    if (authUser && authUser.uid === user.uid) {
                        unsubscribe();
                        resolve();
                    }
                });
            });
            
            console.log('✅ Auth state confirmed');
            
            // Try to store comprehensive user profile in Firestore
            console.log('💾 Creating complete user account profile...');
            const userProfile = {
                fullName: fullName,
                email: email,
                displayName: fullName,
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
                role: 'user',
                status: 'active',
                emailVerified: user.emailVerified,
                accountType: 'standard',
                preferences: {
                    notifications: true,
                    newsletter: true,
                    theme: 'light'
                },
                profile: {
                    bio: '',
                    location: '',
                    website: '',
                    avatar: ''
                },
                stats: {
                    articlesSubmitted: 0,
                    articlesVerified: 0,
                    reputationScore: 0
                }
            };
            
            try {
                await firebase.firestore().collection('users').doc(user.uid).set(userProfile);
                console.log('✅ Complete user account profile created in Firestore');
                console.log('📊 Account includes: profile, preferences, and stats tracking');
            } catch (firestoreError) {
                console.warn('⚠️ Could not store user profile in Firestore:', firestoreError.message);
                console.log('📝 This might be due to Firestore security rules, but registration still succeeded');
            }
            
            // Store auth state
            const authData = {
                uid: user.uid,
                email: user.email,
                fullName: fullName,
                isAuthenticated: true,
                registrationTime: new Date().toISOString()
            };
            
            sessionStorage.setItem('authData', JSON.stringify(authData));
            console.log('✅ Auth data stored in session storage');

            console.log('🎉 Registration completed successfully!');
            this.showSuccess('Registration successful! Redirecting...');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);

        } catch (error) {
            console.error('❌ Registration error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            let errorMessage = 'Registration failed. Please try again.';
            
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'An account with this email already exists.';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak. Please choose a stronger password.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address format.';
                    break;
                case 'auth/configuration-not-found':
                    errorMessage = 'Firebase configuration error. Please contact support.';
                    break;
            }
            
            console.log('📢 Showing error message:', errorMessage);
            this.showError(errorMessage);
        } finally {
            this.setButtonLoading(submitBtn, false);
            console.log('🔄 Button loading state reset');
        }
    }

    async handleGoogleAuth(type) {
        const actionText = type === 'signin' ? 'Signing in' : 'Signing up';
        
        try {
            this.showInfo(`${actionText} with Google...`);
            
            // Firebase Google OAuth
            const result = await firebase.auth().signInWithPopup(this.googleProvider);
            const user = result.user;
            
            // Check if user exists in Firestore
            const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
            
            if (!userDoc.exists && type === 'signup') {
                // Create user profile for new users
                await firebase.firestore().collection('users').doc(user.uid).set({
                    fullName: user.displayName || 'Google User',
                    email: user.email,
                    createdAt: new Date().toISOString(),
                    role: 'user',
                    provider: 'google'
                });
            }
            
            // Store auth state
            const authData = {
                uid: user.uid,
                email: user.email,
                fullName: user.displayName || 'Google User',
                isAuthenticated: true,
                provider: 'google',
                loginTime: new Date().toISOString()
            };
            
            sessionStorage.setItem('authData', JSON.stringify(authData));
            
            this.showSuccess(`${actionText} with Google successful! Redirecting...`);
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);

        } catch (error) {
            console.error('Google auth error:', error);
            let errorMessage = `${actionText} with Google failed. Please try again.`;
            
            if (error.code === 'auth/popup-closed-by-user') {
                errorMessage = 'Sign-in was cancelled. Please try again.';
            } else if (error.code === 'auth/popup-blocked') {
                errorMessage = 'Popup was blocked. Please allow popups and try again.';
            }
            
            this.showError(errorMessage);
        }
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    setButtonLoading(button, isLoading) {
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

    simulateApiCall(delay = 1500) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate 90% success rate
                if (Math.random() > 0.1) {
                    resolve();
                } else {
                    reject(new Error('API Error'));
                }
            }, delay);
        });
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;

        // Style notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'});
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideIn 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;

        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
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
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 300);
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

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    showWarning(message) {
        this.showNotification(message, 'warning');
    }
}

// Check if user is already authenticated
function checkAuthStatus() {
    console.log('🔍 Checking auth status...');
    const authData = localStorage.getItem('authData') || sessionStorage.getItem('authData');
    
    if (authData) {
        console.log('📄 Found auth data, parsing...');
        try {
            const parsed = JSON.parse(authData);
            if (parsed.isAuthenticated) {
                console.log('✅ User is authenticated, redirecting to dashboard');
                // User is already logged in, redirect to dashboard
                window.location.href = 'index.html';
                return;
            }
        } catch (error) {
            console.log('❌ Invalid auth data, clearing...');
            // Invalid auth data, clear it
            localStorage.removeItem('authData');
            sessionStorage.removeItem('authData');
        }
    } else {
        console.log('ℹ️ No auth data found, user not logged in');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOMContentLoaded event fired!');
    
    // Check if user is already authenticated
    checkAuthStatus();
    
    // Initialize auth manager
    console.log('🔧 Creating AuthManager...');
    window.authManager = new AuthManager();
    
    console.log('✅ Authentication system initialized!');
});

// Add some visual enhancements
document.addEventListener('DOMContentLoaded', () => {
    // Add focus effects to form inputs
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.classList.add('focused');
        });
        
        input.addEventListener('blur', () => {
            input.parentElement.classList.remove('focused');
        });
    });

    // Add custom checkbox styling
    const style = document.createElement('style');
    style.textContent = `
        .form-group.focused label {
            color: var(--primary-color);
        }
        
        .checkbox-label input[type="checkbox"] {
            appearance: none;
            width: 16px;
            height: 16px;
            border: 2px solid var(--border-color);
            border-radius: 3px;
            background: var(--background-color);
            cursor: pointer;
            position: relative;
        }
        
        .checkbox-label input[type="checkbox"]:checked {
            background: var(--primary-color);
            border-color: var(--primary-color);
        }
        
        .checkbox-label input[type="checkbox"]:checked::after {
            content: '✓';
            position: absolute;
            top: -2px;
            left: 1px;
            color: white;
            font-size: 12px;
            font-weight: bold;
        }
    `;
    document.head.appendChild(style);
});