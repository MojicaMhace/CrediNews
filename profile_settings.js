/* --- JAVASCRIPT LOGIC --- */

// Tabs Logic
function setActiveTab(name){
  // Remove active from buttons
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  // Remove active from content
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  
  // Activate Button
  const btn = document.querySelector(`.nav-btn[data-tab="${name}"]`);
  if(btn) btn.classList.add('active');

  // Activate Content
  const content = document.getElementById(`tab-${name}`);
  if (content) content.classList.add('active');
}

// Toast Logic
function toast(msg, type = 'normal'){
  const t = document.getElementById('ps_toast');
  if (!t) return;
  t.textContent = msg;
  
  // Optional: Add styling based on type
  if(type === 'error') t.style.borderLeft = '4px solid #ef4444';
  else t.style.borderLeft = '4px solid #10b981';

  t.classList.add('show');
  setTimeout(()=>{ 
      t.classList.remove('show'); 
      t.style.borderLeft = ''; // Reset
  }, 3500);
}

// Password Visibility Toggle
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Password Strength Logic
function checkPasswordStrength(password) {
    const bar = document.getElementById('strength-bar');
    const reqLen = document.getElementById('req-len');
    const reqNum = document.getElementById('req-num');
    const reqSym = document.getElementById('req-sym');
    
    if(!bar) return; // Guard clause if UI elements missing

    // Check Requirements
    const hasLength = password.length >= 8;
    const hasNum = /\d/.test(password);
    const hasSym = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    // UI Updates for Requirements
    if(reqLen) hasLength ? reqLen.classList.add('valid') : reqLen.classList.remove('valid');
    if(reqNum) hasNum ? reqNum.classList.add('valid') : reqNum.classList.remove('valid');
    if(reqSym) hasSym ? reqSym.classList.add('valid') : reqSym.classList.remove('valid');

    // Calculate Strength (0-3)
    let strength = 0;
    if (hasLength) strength++;
    if (hasNum) strength++;
    if (hasSym) strength++;

    // Update Bar Color & Width
    if (password.length === 0) {
        bar.style.width = '0%';
        bar.style.backgroundColor = '#ef4444'; // Red
    } else if (strength === 1) {
        bar.style.width = '33%';
        bar.style.backgroundColor = '#ef4444'; // Red
    } else if (strength === 2) {
        bar.style.width = '66%';
        bar.style.backgroundColor = '#f59e0b'; // Orange
    } else if (strength === 3) {
        bar.style.width = '100%';
        bar.style.backgroundColor = '#10b981'; // Green
    }
}

// --- FIREBASE ACTIONS ---

async function handleChangePassword() {
    const currentPassEl = document.getElementById('ps_current_password');
    const newPassEl = document.getElementById('ps_new_password');
    const btn = document.getElementById('changePasswordBtn');
    
    const currentPass = currentPassEl.value;
    const newPass = newPassEl.value;

    // 1. Basic Validation
    if (!currentPass) return toast('Please enter your current password.', 'error');
    if (!newPass) return toast('Please enter a new password.', 'error');
    if (newPass.length < 8) return toast('New password must be at least 8 chars.', 'error');
    
    const user = firebase.auth().currentUser;
    if (!user) return toast('You are not signed in.', 'error');

    // 2. UI Loading State
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    btn.disabled = true;

    try {
        // 3. Re-authenticate User (Required for password changes)
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPass);
        await user.reauthenticateWithCredential(credential);
        
        // 4. Update Password
        await user.updatePassword(newPass);
        
        toast('Password updated successfully!', 'success');
        
        // Clear fields
        currentPassEl.value = '';
        newPassEl.value = '';
        checkPasswordStrength(''); // Reset strength meter

    } catch (error) {
        console.error("Error updating password:", error);
        
        // --- UPDATED ERROR HANDLING HERE ---
        // Checks for both "wrong-password" (old) and "invalid-login-credentials" (new)
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
            toast('Incorrect current password. Please try again.', 'error');
        } else if (error.code === 'auth/weak-password') {
            toast('Password is too weak.', 'error');
        } else if (error.code === 'auth/requires-recent-login') {
            toast('Session timed out. Please sign out and sign in again.', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            toast('Too many failed attempts. Please wait a moment.', 'error');
        } else {
            // Fallback for other errors
            toast(error.message || 'Failed to update password.', 'error');
        }
    } finally {
        // 5. Reset UI
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}

async function handleDeleteAccount() {
    if(!confirm('Are you sure you want to permanently delete your account? This cannot be undone.')) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        await user.delete();
        window.location.href = 'index.html'; // Redirect after deletion
    } catch (error) {
        if (error.code === 'auth/requires-recent-login') {
            toast('For security, please sign out and sign in again to delete your account.', 'error');
        } else {
            toast(error.message, 'error');
        }
    }
}

// Bind Click Events
document.addEventListener('DOMContentLoaded', () => {
  // Check auth state
  firebase.auth().onAuthStateChanged(user => {
      if (user) {
          const emailField = document.getElementById('ps_email_view');
          if(emailField) emailField.value = user.email;
          
          // Pre-fill display name if available
          const nameField = document.getElementById('ps_displayName');
          if(nameField && user.displayName) nameField.value = user.displayName;
      } else {
          // window.location.href = 'login.html'; // Uncomment to force login
      }
  });

  setActiveTab('security');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  // Attach Real Actions
  const saveBtn = document.getElementById('saveProfileBtn');
  if(saveBtn) saveBtn.addEventListener('click', () => toast('Profile details saved (Simulated).', 'success'));

  const changePassBtn = document.getElementById('changePasswordBtn');
  if(changePassBtn) changePassBtn.addEventListener('click', handleChangePassword);

  const dangerBtn = document.getElementById('deleteAccountBtn');
  if(dangerBtn) dangerBtn.addEventListener('click', handleDeleteAccount);

  document.querySelectorAll('.toggle-visibility').forEach((btn) => {
    const targetId = btn.dataset.target;
    btn.addEventListener('click', () => togglePassword(targetId, btn));
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-visibility');
    if (!btn) return;
    const targetId = btn.dataset.target;
    togglePassword(targetId, btn);
  });
  const newPassEl = document.getElementById('ps_new_password');
  if (newPassEl) {
    newPassEl.addEventListener('input', () => checkPasswordStrength(newPassEl.value));
    checkPasswordStrength(newPassEl.value || '');
  }
});
