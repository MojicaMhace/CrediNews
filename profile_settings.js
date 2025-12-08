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
    if (!input) return;

    const icon = btn.querySelector('i');
    
    if (input.type === "password") { 
        input.type = "text";
        icon.classList.remove('fa-eye-slash'); 
        icon.classList.add('fa-eye');      
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye');        
        icon.classList.add('fa-eye-slash');    
    }
}

// Password Strength Logic
function checkPasswordStrength(password) {
    const bar = document.getElementById('strength-bar');
    const reqLen = document.getElementById('req-len');
    const reqNum = document.getElementById('req-num');
    const reqSym = document.getElementById('req-sym');
    
    if(!bar) return;

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
        bar.style.backgroundColor = '#ef4444';
    } else if (strength === 1) {
        bar.style.width = '33%';
        bar.style.backgroundColor = '#ef4444';
    } else if (strength === 2) {
        bar.style.width = '66%';
        bar.style.backgroundColor = '#f59e0b';
    } else if (strength === 3) {
        bar.style.width = '100%';
        bar.style.backgroundColor = '#10b981';
    }
}

// --- FIREBASE ACTIONS ---

async function handleChangePassword() {
    const currentPassEl = document.getElementById('ps_current_password');
    const newPassEl = document.getElementById('ps_new_password');
    const confirmPassEl = document.getElementById('ps_confirm_password'); // CRITICAL: Get confirmation field
    const btn = document.getElementById('changePasswordBtn');
    
    const currentPass = currentPassEl.value;
    const newPass = newPassEl.value;
    const confirmPass = confirmPassEl ? confirmPassEl.value : newPass; // Use confirmPassEl if available

    // 1. Basic Validation
    if (!currentPass) return toast('Please enter your current password.', 'error');
    if (!newPass) return toast('Please enter a new password.', 'error');
    if (newPass.length < 8) return toast('New password must be at least 8 chars.', 'error');
    
    // 2. NEW VALIDATION: Check if new password matches confirmation
    if (newPass !== confirmPass) {
         return toast('New password and confirmation do not match.', 'error');
    }
    
    const user = firebase.auth().currentUser;
    if (!user) return toast('You are not signed in.', 'error');

    // 3. UI Loading State
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    btn.disabled = true;

    try {
        // 4. Re-authenticate User (Required for security)
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPass);
        await user.reauthenticateWithCredential(credential);
        
        // 5. Update Password
        await user.updatePassword(newPass);
        
        toast('Password updated successfully!', 'success');
        
        // Clear fields
        currentPassEl.value = '';
        newPassEl.value = '';
        if (confirmPassEl) confirmPassEl.value = ''; // Clear confirmation field
        checkPasswordStrength(''); // Reset strength meter

    } catch (error) {
        console.error("Error updating password:", error);
        
        // --- UPDATED ERROR HANDLING ---
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
            toast('Incorrect current password.', 'error');
        } else if (error.code === 'auth/weak-password') {
            toast('Password is too weak.', 'error');
        } else if (error.code === 'auth/requires-recent-login') {
            toast('Please log in again before changing password.', 'error');
        } else {
            toast(error.message || 'Failed to update password.', 'error');
        }
    } finally {
        // 6. Reset UI
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}

async function handleDeleteAccount() {
    const user = firebase.auth().currentUser;
    
    if (!user) {
        return toast('System not ready. Please refresh.', 'error');
    }

    // 1. Confirm Intent
    if(!confirm('CRITICAL: This will permanently delete your account and all data. You will have to register again. Are you sure?')) return;

    // 2. Force Re-authentication via Prompt (Fixes "Requires Recent Login")
    const password = prompt("To confirm deletion, please type your password:");
    if (!password) {
        return toast("Deletion cancelled (Password required).", "normal");
    }

    const btn = document.getElementById('deleteAccountBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    btn.disabled = true;

    try {
        // 3. Re-authenticate User
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
        await user.reauthenticateWithCredential(credential);

        // 4. Delete Firestore Data 
        try {
            const db = firebase.firestore();
            await db.collection('users').doc(user.uid).delete();
            console.log("Firestore data deleted.");
        } catch (dbErr) {
            console.warn("Firestore delete skipped or failed:", dbErr);
        }

        // 5. Delete Auth Account
        await user.delete();
        
        // 6. Redirect to Register
        alert("Your account has been successfully deleted.");
        window.location.href = 'register.html'; 

    } catch (error) {
        console.error(error);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
            alert("Incorrect password. Account was NOT deleted.");
        } else {
            alert("Error deleting account: " + error.message);
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Bind Click Events
document.addEventListener('DOMContentLoaded', () => {
  // Check auth state
  firebase.auth().onAuthStateChanged(user => {
      if (user) {
          const emailField = document.getElementById('ps_email');
          if(emailField) emailField.value = user.email;
          
          // Pre-fill display name if available
          const nameField = document.getElementById('ps_displayName');
          if(nameField && user.displayName) nameField.value = user.displayName;
      } else {
          // You may want to redirect users who access this page while logged out:
          // window.location.href = 'login.html'; 
      }
  });

  setActiveTab('security');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  const saveBtn = document.getElementById('saveProfileBtn');
  if(saveBtn) saveBtn.addEventListener('click', () => toast('Profile details saved (Simulated).', 'success'));

  const changePassBtn = document.getElementById('changePasswordBtn');
  if(changePassBtn) changePassBtn.addEventListener('click', handleChangePassword);

  const dangerBtn = document.getElementById('deleteAccountBtn');
  if(dangerBtn) dangerBtn.addEventListener('click', handleDeleteAccount);

  // Bind Password Toggles
  document.querySelectorAll('.toggle-visibility').forEach((btn) => {
    const targetId = btn.dataset.target;
    btn.addEventListener('click', (e) => {
        e.preventDefault(); 
        togglePassword(targetId, btn);
    });
  });
  
  // Bind Strength Meter
  const newPassEl = document.getElementById('ps_new_password');
  if (newPassEl) {
    newPassEl.addEventListener('input', () => checkPasswordStrength(newPassEl.value));
    checkPasswordStrength(newPassEl.value || '');
  }
});