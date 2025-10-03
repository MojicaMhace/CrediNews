// EmailJS Configuration
// To set up EmailJS:
// 1. Go to https://www.emailjs.com/
// 2. Create a free account
// 3. Add an email service (Gmail recommended)
// 4. Create an email template
// 5. Get your Public Key, Service ID, and Template ID
// 6. Replace the values below

const EMAILJS_CONFIG = {
    // Your EmailJS Public Key (found in Account > API Keys)
    PUBLIC_KEY: 'YOUR_EMAILJS_PUBLIC_KEY',
    
    // Your EmailJS Service ID (found in Email Services)
    SERVICE_ID: 'YOUR_GMAIL_SERVICE_ID',
    
    // Your EmailJS Template ID (found in Email Templates)
    TEMPLATE_ID: 'YOUR_OTP_TEMPLATE_ID'
};

// Initialize EmailJS when the script loads
(function() {
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
        console.log('📧 EmailJS initialized successfully');
    } else {
        console.error('❌ EmailJS library not loaded');
    }
})();

// Export configuration for use in other files
window.EMAILJS_CONFIG = EMAILJS_CONFIG;