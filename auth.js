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
        this.checkForOTPVerification();
    }

    checkForOTPVerification() {
        const urlParams = new URLSearchParams(window.location.search);
        const verifyOTP = urlParams.get('verify-otp');
        
        if (verifyOTP === 'true') {
            console.log('🔐 OTP verification mode detected');
            
            // Check if we have pending verification data
            const pendingData = JSON.parse(sessionStorage.getItem('pendingVerification') || '{}');
            
            if (pendingData.email) {
                console.log('✅ Pending verification data found, showing OTP form');
                this.showOTPForm();
            } else {
                console.log('❌ No pending verification data found');
                this.showError('No pending verification found. Please register again.');
                // Clear the URL parameter and show login form
                window.history.replaceState({}, document.title, window.location.pathname);
                this.showLoginForm();
            }
        } else {
            // Ensure login form is visible by default
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
        
         // Full Name input handling
          const fullNameInput = document.getElementById('fullName');
          if (fullNameInput) {
              fullNameInput.addEventListener('input', (e) => {
                  let value = e.target.value;

                  // Prevent numbers and special characters (allow only letters and spaces)
                  value = value.replace(/[^a-zA-Z\s]/g, '');

                  // Remove multiple consecutive spaces
                  value = value.replace(/\s+/g, ' ');

                  // Capitalize the first letter of each word
                  value = value.replace(/\b\w/g, (char) => char.toUpperCase());

                  // Update the input value
                  e.target.value = value;
              });
          }
        
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
            console.log('ℹ️ Register form detected; registration handled in register.html, skipping auth.js handler.');
        } else {
            console.log('ℹ️ Register form not found on this page.');
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

        // OTP Form
        const otpForm = document.getElementById('otpForm');
        if (otpForm) {
            console.log('✅ OTP form found, binding event');
            otpForm.addEventListener('submit', (e) => this.handleOTPVerification(e));
        }

        // OTP Input handling
        const otpInputs = document.querySelectorAll('.otp-input');
        if (otpInputs.length > 0) {
            this.setupOTPInputs(otpInputs);
        }

        // Resend OTP button
        const resendOtpBtn = document.getElementById('resendOtpBtn');
        if (resendOtpBtn) {
            resendOtpBtn.addEventListener('click', () => this.handleResendOTP());
        }

        // Back to login button
        const backToLoginBtn = document.getElementById('backToLoginBtn');
        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', () => this.showLoginForm());
        }
    }

    // Login flow: i-validate email/password, i-check email verification, at mag-redirect (validations))
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

        if (!this.validatePasswordComplexity(password)) {
            this.showError('Password must be at least 6 characters and include one uppercase letter and one special character.');
            return;
        }

        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true);

        try {
            // Firebase authentication
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Check if email is verified
            if (!user.emailVerified) {
                this.showError('Your email is not verified. Please check your inbox or resend the verification email.');
                
                // Also show the inline verification message block on the page
                const verificationMessageEl = document.getElementById('verificationMessage');
                if (verificationMessageEl) {
                    verificationMessageEl.style.display = 'block';
                }
                
                // Show option to resend verification email (keep user signed in for this)
                this.showResendVerificationOption(user.email);
                return;
            }
            
            // Store auth state
            const authData = {
                uid: user.uid,
                email: user.email,
                isAuthenticated: true,
                emailVerified: user.emailVerified,
                loginTime: new Date().toISOString()
            };
            
            if (remember) {
                localStorage.setItem('authData', JSON.stringify(authData));
            } else {
                sessionStorage.setItem('authData', JSON.stringify(authData));
            }

            this.showSuccess('Login successful! Redirecting to homepage...');
            // Redirect after success
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);

        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'Login failed. Please try again.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found for this email. Please sign up to create one.';
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
                case 'auth/user-disabled':
                    errorMessage = 'This account has been disabled. Please contact support.';
                    break;
            }
            
            this.showError(errorMessage);
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    // Registration flow: nasa register.html ang full validation at OTP; placeholder lang dito
    async handleRegister(e) {
        e.preventDefault();
        console.log('Registration handled by register.html. OTP flow removed.');
        return;
    }

    // Google OAuth (Sign-In/Sign-Up): auth + Firestore profile (kung bagong user)
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
            
            this.showSuccess(`${actionText} with Google successful! Redirecting to homepage...`);
            
            // Redirect to homepage
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

    // Email validation helper (basic format check)
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Password validation helper para sa LOGIN (mas simple kaysa register.html)
    validatePasswordComplexity(password) {
        const hasUppercase = /[A-Z]/.test(password || '');
        const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]/.test(password || '');
        const hasMinLength = (password || '').length >= 6;
        return hasUppercase && hasSpecial && hasMinLength;
    }

    // Password reset helper using Firebase
    async handlePasswordReset(email) {
        try {
            if (!email || !this.validateEmail(email)) {
                throw new Error('Please enter a valid email address');
            }

            await firebase.auth().sendPasswordResetEmail(email);
            this.showSuccess(`Password reset link sent to ${email}`);
            return true;
        } catch (error) {
            console.error('Password reset error:', error);
            
            let errorMessage = 'Failed to send reset email. Please try again.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email address.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Please enter a valid email address.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many requests. Please try again later.';
                    break;
            }
            
            this.showError(errorMessage);
            return false;
        }
    }

    // Button loading state helper (disable + spinner)
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

    // Demo-only API call simulator
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

    // UI notification helper (ephemeral toast messages)
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

    // Button para mag-resend ng email verification kapag hindi pa verified ang user
    showResendVerificationOption(email) {
        // Create a resend verification button
        const resendBtn = document.createElement('button');
        resendBtn.textContent = 'Resend Verification Email';
        resendBtn.className = 'auth-btn secondary';
        resendBtn.style.marginTop = '10px';
        resendBtn.style.width = '100%';
        
        resendBtn.addEventListener('click', async () => {
            try {
                resendBtn.disabled = true;
                resendBtn.textContent = 'Sending...';
                
                // Get the current user (should still be signed in but not verified)
                const user = firebase.auth().currentUser;
                if (user) {
                    const safeOrigin = (window.location.origin && window.location.origin.startsWith('http'))
                      ? window.location.origin
                      : `${window.location.protocol}//${window.location.host}`;
                    const actionCodeSettings = {
                        url: `${safeOrigin}/login.html`,
                        handleCodeInApp: true
                    };
                    console.log('📧 Resend verification with continue URL:', actionCodeSettings.url);
                    try {
                        await user.sendEmailVerification(actionCodeSettings);
                    } catch (err) {
                        console.warn('⚠️ Resend failed with actionCodeSettings, retrying without settings:', err && err.message);
                        await user.sendEmailVerification();
                    }
                    this.showSuccess('Verification email sent! Please check your inbox.');
                    resendBtn.remove();
                } else {
                    this.showError('Please try logging in again to resend verification email.');
                }
            } catch (error) {
                console.error('Resend verification error:', error);
                this.showError('Unable to resend verification email. Please try again.');
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend Verification Email';
            }
        });
        
        // Add button to the form
        const form = document.querySelector('.auth-form');
        if (form) {
            form.appendChild(resendBtn);
        }
    }

    // OTP input UX helpers (auto-advance, paste handling, visual state)
    setupOTPInputs(inputs) {
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                
                // Only allow numbers
                if (!/^\d*$/.test(value)) {
                    e.target.value = '';
                    return;
                }

                // Move to next input if current is filled
                if (value && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }

                // Update visual state
                this.updateOTPInputState(inputs);
            });

            input.addEventListener('keydown', (e) => {
                // Handle backspace
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const paste = e.clipboardData.getData('text');
                const digits = paste.replace(/\D/g, '').slice(0, 6);
                
                digits.split('').forEach((digit, i) => {
                    if (inputs[i]) {
                        inputs[i].value = digit;
                    }
                });
                
                this.updateOTPInputState(inputs);
                
                // Focus on the next empty input or last input
                const nextEmpty = inputs.find(inp => !inp.value);
                if (nextEmpty) {
                    nextEmpty.focus();
                } else {
                    inputs[inputs.length - 1].focus();
                }
            });
        });
    }

    // Markahan ang filled/error state ng OTP inputs
    updateOTPInputState(inputs) {
        inputs.forEach(input => {
            input.classList.remove('filled', 'error');
            if (input.value) {
                input.classList.add('filled');
            }
        });
    }

    // OTP verification flow: kolektahin ang 6-digit code, i-verify, at mag-redirect
    async handleOTPVerification(e) {
        e.preventDefault();
        console.log('🔐 OTP verification submitted');

        const otpInputs = document.querySelectorAll('.otp-input');
        const otp = Array.from(otpInputs).map(input => input.value).join('');
        
        if (otp.length !== 6) {
            this.showError('Please enter the complete 6-digit verification code.');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true);

        try {
            // Get pending verification data
            const pendingData = JSON.parse(sessionStorage.getItem('pendingVerification') || '{}');
            
            if (!pendingData.email) {
                throw new Error('No pending verification found');
            }

            // Verify OTP
            const result = window.otpManager.verifyOTP(pendingData.email, otp);
            
            if (result.success) {
                console.log('✅ OTP verified successfully');
                
                // Sign in the user
                const user = firebase.auth().currentUser;
                if (user && user.uid === pendingData.uid) {
                    // User is already signed in, just mark as verified
                    console.log('✅ User verification completed');
                } else {
                    // Need to sign in the user (shouldn't happen in normal flow)
                    console.log('⚠️ User not signed in, this is unexpected');
                }

                // Clear pending verification data
                sessionStorage.removeItem('pendingVerification');
                
                // Show success message
                this.showSuccess(result.message);
                
                // Redirect to main app
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);

            } else {
                console.log('❌ OTP verification failed:', result.message);
                this.showError(result.message);
                
                // Mark inputs as error
                otpInputs.forEach(input => {
                    input.classList.add('error');
                    input.value = '';
                });
                
                // Focus first input
                otpInputs[0].focus();
            }

        } catch (error) {
            console.error('❌ OTP verification error:', error);
            this.showError('Verification failed. Please try again.');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    // Resend OTP flow: gumawa ng bagong code at magpadala via EmailJS (o demo fallback)
    async handleResendOTP() {
        console.log('🔄 Resending OTP...');
        
        const pendingData = JSON.parse(sessionStorage.getItem('pendingVerification') || '{}');
        
        if (!pendingData.email) {
            this.showError('No pending verification found. Please register again.');
            return;
        }

        const resendBtn = document.getElementById('resendOtpBtn');
        this.setButtonLoading(resendBtn, true);

        try {
            // Generate new OTP
            const otp = window.otpManager.generateOTP();
            window.otpManager.storeOTP(pendingData.email, otp);
            
            // Send new OTP
            await window.otpManager.sendOTPEmail(pendingData.email, otp);
            
            this.showSuccess('New verification code sent to your email.');
            
            // Clear current inputs
            const otpInputs = document.querySelectorAll('.otp-input');
            otpInputs.forEach(input => {
                input.value = '';
                input.classList.remove('filled', 'error');
            });
            
            // Focus first input
            otpInputs[0].focus();

        } catch (error) {
            console.error('❌ Resend OTP error:', error);
            this.showError('Failed to resend verification code. Please try again.');
        } finally {
            this.setButtonLoading(resendBtn, false);
        }
    }

    // Ipakita ang login form at i-clear ang pending OTP state
    showLoginForm() {
        // Hide OTP container and show login form
        const otpContainer = document.getElementById('otpVerificationContainer');
        const loginForm = document.getElementById('loginForm');
        
        if (otpContainer) otpContainer.style.display = 'none';
        if (loginForm) loginForm.style.display = 'block';
        
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Clear pending verification data
        sessionStorage.removeItem('pendingVerification');
    }

    // Ipakita ang OTP form at itago ang login form
    showOTPForm() {
        // Show OTP container and hide login form
        const otpContainer = document.getElementById('otpVerificationContainer');
        const loginForm = document.getElementById('loginForm');
        
        if (otpContainer) otpContainer.style.display = 'block';
        if (loginForm) loginForm.style.display = 'none';
        
        // Set email in OTP form
        const pendingData = JSON.parse(sessionStorage.getItem('pendingVerification') || '{}');
        const otpEmailElement = document.getElementById('otpEmail');
        if (otpEmailElement && pendingData.email) {
            otpEmailElement.textContent = pendingData.email;
        }
        
        // Focus first OTP input
        const firstInput = document.querySelector('.otp-input');
        if (firstInput) {
            firstInput.focus();
        }
    }
}

// OTP Management System (demo): nag-iimbak at nagbe-beripika ng OTP sa memory
class OTPManager {
    constructor() {
        this.otpStorage = new Map(); // In production, use Firebase Firestore
        this.otpExpiry = 10 * 60 * 1000; // 10 minutes in milliseconds
    }

    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    }

    storeOTP(email, otp) {
        const expiryTime = Date.now() + this.otpExpiry;
        this.otpStorage.set(email, {
            code: otp,
            expires: expiryTime,
            attempts: 0,
            maxAttempts: 3
        });
        console.log(`🔐 OTP stored for ${email}: ${otp} (expires in 10 minutes)`);
    }

    verifyOTP(email, inputOTP) {
        const otpData = this.otpStorage.get(email);
        
        if (!otpData) {
            return { success: false, message: 'No OTP found for this email. Please request a new one.' };
        }

        if (Date.now() > otpData.expires) {
            this.otpStorage.delete(email);
            return { success: false, message: 'OTP has expired. Please request a new one.' };
        }

        otpData.attempts++;

        if (otpData.attempts > otpData.maxAttempts) {
            this.otpStorage.delete(email);
            return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
        }

        if (otpData.code === inputOTP) {
            this.otpStorage.delete(email);
            return { success: true, message: 'OTP verified successfully!' };
        }

        this.otpStorage.set(email, otpData);
        const remainingAttempts = otpData.maxAttempts - otpData.attempts;
        return { 
            success: false, 
            message: `Invalid OTP. ${remainingAttempts} attempts remaining.` 
        };
    }

    // Magpadala ng OTP via EmailJS kung naka-config; kung hindi, demo fallback sa console/UI
    async sendOTPEmail(email, otp) {
        console.log(`📧 Sending OTP email to ${email}`);
        
        try {
            // Check if EmailJS is available and configured
            if (typeof emailjs === 'undefined') {
                throw new Error('EmailJS library not loaded');
            }
            
            if (!window.EMAILJS_CONFIG || 
                window.EMAILJS_CONFIG.PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY' ||
                window.EMAILJS_CONFIG.SERVICE_ID === 'YOUR_GMAIL_SERVICE_ID' ||
                window.EMAILJS_CONFIG.TEMPLATE_ID === 'YOUR_OTP_TEMPLATE_ID') {
                
                console.warn('⚠️ EmailJS not configured, falling back to demo mode');
                console.log(`🔐 Demo Mode - Your verification code is: ${otp}`);
                
                // Show demo notification
                if (window.authManager) {
                    window.authManager.showInfo(`Demo Mode: Your OTP is ${otp} (Configure EmailJS for real emails)`);
                }
                
                return { success: true, message: 'OTP sent successfully (Demo Mode)!' };
            }

            // Prepare email template parameters
            const templateParams = {
                to_email: email,
                to_name: email.split('@')[0], // Use email prefix as name
                otp_code: otp,
                app_name: 'CrediUI',
                expiry_minutes: '10'
            };

            console.log('📤 Sending real email via EmailJS...');
            
            // Send email using EmailJS
            const response = await emailjs.send(
                window.EMAILJS_CONFIG.SERVICE_ID,
                window.EMAILJS_CONFIG.TEMPLATE_ID,
                templateParams
            );

            console.log('✅ Email sent successfully:', response);
            return { 
                success: true, 
                message: 'Verification code sent to your email!' 
            };

        } catch (error) {
            console.error('❌ Failed to send email:', error);
            
            // Fallback to demo mode if email sending fails
            console.log(`🔐 Fallback Mode - Your verification code is: ${otp}`);
            
            if (window.authManager) {
                window.authManager.showWarning(`Email sending failed. Demo Mode: Your OTP is ${otp}`);
            }
            
            return { 
                success: true, 
                message: 'Email service unavailable. Check console for OTP.' 
            };
        }
    }

    isOTPPending(email) {
        const otpData = this.otpStorage.get(email);
        return otpData && Date.now() < otpData.expires;
    }
}

// Global OTP Manager instance
window.otpManager = new OTPManager();

async function checkEmailVerificationStatus() {    try {
        const user = firebase.auth().currentUser;
        if (user) {
            // Reload user data to get latest verification status
            await user.reload();
            
            if (user.emailVerified) {
                const verificationSuccessMessage = document.getElementById('verificationSuccessMessage');
                if (verificationSuccessMessage) {
                    verificationSuccessMessage.style.display = 'block';
                    console.log('✅ Email verification confirmed for user:', user.email);
                }
            }
        }
    } catch (error) {
        console.log('ℹ️ No current user or verification check failed:', error.message);
    }
}

// Check if user is already authenticated
function checkAuthStatus() {
    console.log('🔍 Checking auth status...');
    
    // Check for clearAuth URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('clearAuth') === '1') {
        console.log('🧹 clearAuth parameter detected, clearing auth data');
        localStorage.removeItem('authData');
        sessionStorage.removeItem('authData');
        // Clear the URL parameter
        urlParams.delete('clearAuth');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, document.title, newUrl);
        console.log('✅ Auth data cleared, allowing login form to show');
        return; // Don't redirect, allow the login form to show
    }
    
    const authData = localStorage.getItem('authData') || sessionStorage.getItem('authData');
    
    if (authData) {
        console.log('📄 Found auth data, parsing...');
        try {
            const parsed = JSON.parse(authData);
            if (parsed.isAuthenticated) {
                console.log('✅ User is authenticated, redirecting to homepage');
                // User is already logged in, redirect to homepage
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
    
    // Check for verification message parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('message') === 'verify-email') {
            const verificationMessage = document.getElementById('verificationMessage');
            if (verificationMessage) {
                verificationMessage.style.display = 'block';
            }
        }
        
        // Check for verification success parameter
        if (urlParams.get('verified') === 'true') {
            const verificationSuccessMessage = document.getElementById('verificationSuccessMessage');
            if (verificationSuccessMessage) {
                verificationSuccessMessage.style.display = 'block';
                // Clear the URL parameter
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
        
        // Check if user just verified their email
        checkEmailVerificationStatus();
    
    // Check if user is already authenticated
    checkAuthStatus();
    
    // Set up auth state listener for email verification
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            // Reload user to get latest verification status
            await user.reload();
            
            if (user.emailVerified) {
                const verificationSuccessMessage = document.getElementById('verificationSuccessMessage');
                if (verificationSuccessMessage && verificationSuccessMessage.style.display === 'none') {
                    verificationSuccessMessage.style.display = 'block';
                    console.log('✅ Email verification detected for:', user.email);
                    
                    // Hide any error messages
                    const errorMessages = document.querySelectorAll('.notification.error');
                    errorMessages.forEach(msg => msg.remove());
                    
                    // Remove resend button if it exists
                    const resendBtn = document.querySelector('.auth-btn.secondary');
                    if (resendBtn && resendBtn.textContent.includes('Resend')) {
                        resendBtn.remove();
                    }
                }
            }
        }
    });
    
    // Initialize auth manager
    console.log('🔧 Creating AuthManager...');
    window.authManager = new AuthManager();
    
    console.log('✅ Authentication system initialized!');
});

// UI polish (hindi kritikal sa auth): maliit na visual enhancements sa inputs at checkbox
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