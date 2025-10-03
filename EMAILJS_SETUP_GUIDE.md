# EmailJS Setup Guide for Real Gmail Sending

Follow these steps to configure EmailJS to send real OTP emails to Gmail addresses:

## Step 1: Create EmailJS Account
1. Go to [https://www.emailjs.com/](https://www.emailjs.com/)
2. Click "Sign Up" and create a free account
3. Verify your email address

## Step 2: Add Gmail Service
1. In your EmailJS dashboard, go to "Email Services"
2. Click "Add New Service"
3. Select "Gmail" from the list
4. Click "Connect Account" and authorize with your Gmail
5. Give your service a name (e.g., "CrediUI Gmail")
6. Copy the **Service ID** (you'll need this later)

## Step 3: Create Email Template
1. Go to "Email Templates" in your dashboard
2. Click "Create New Template"
3. Use this template content:

### Template Subject:
```
{{app_name}} - Your Verification Code
```

### Template Body:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
    <div style="background-color: #1a1a1a; color: #ffffff; padding: 30px; border-radius: 10px; text-align: center;">
        <h1 style="color: #00d4ff; margin-bottom: 20px;">{{app_name}}</h1>
        <h2 style="margin-bottom: 30px;">Email Verification</h2>
        
        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="font-size: 18px; margin-bottom: 15px;">Hello {{to_name}},</p>
            <p style="margin-bottom: 20px;">Your verification code is:</p>
            
            <div style="font-size: 32px; font-weight: bold; color: #00d4ff; letter-spacing: 8px; margin: 20px 0; padding: 15px; background-color: #1a1a1a; border-radius: 5px;">
                {{otp_code}}
            </div>
            
            <p style="color: #cccccc; font-size: 14px; margin-top: 20px;">
                This code will expire in {{expiry_minutes}} minutes.
            </p>
        </div>
        
        <p style="color: #888888; font-size: 12px; margin-top: 30px;">
            If you didn't request this verification, please ignore this email.
        </p>
    </div>
</div>
```

4. Save the template and copy the **Template ID**

## Step 4: Get Your Public Key
1. Go to "Account" > "API Keys"
2. Copy your **Public Key**

## Step 5: Update Configuration
1. Open `emailjs-config.js` in your project
2. Replace the placeholder values:

```javascript
const EMAILJS_CONFIG = {
    PUBLIC_KEY: 'your_actual_public_key_here',
    SERVICE_ID: 'your_gmail_service_id_here', 
    TEMPLATE_ID: 'your_template_id_here'
};
```

## Step 6: Test the System
1. Save your changes
2. Open your application
3. Try registering with a real Gmail address
4. Check your Gmail inbox for the OTP email

## Troubleshooting

### Common Issues:
- **"EmailJS not configured"**: Make sure you've updated all three values in `emailjs-config.js`
- **"Failed to send email"**: Check your EmailJS service is active and Gmail is properly connected
- **Template not found**: Verify your Template ID is correct
- **Service not found**: Verify your Service ID is correct

### Free Tier Limits:
- EmailJS free tier allows 200 emails per month
- For production use, consider upgrading to a paid plan

### Security Notes:
- Your EmailJS Public Key is safe to expose in client-side code
- Never expose your Private Key in client-side code
- EmailJS handles all authentication securely

## Demo Mode Fallback
If EmailJS is not configured or fails, the system will automatically fall back to demo mode where the OTP is displayed in the browser console and as a notification. This ensures your application continues to work during development.

---

**Need Help?**
- EmailJS Documentation: [https://www.emailjs.com/docs/](https://www.emailjs.com/docs/)
- EmailJS Support: [https://www.emailjs.com/support/](https://www.emailjs.com/support/)