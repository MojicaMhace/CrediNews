window.isAccountDeleting = false;
firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        if (!window.isAccountDeleting) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        }
    } else {
        const emailInput = document.getElementById('ps_email');
        if (emailInput) emailInput.value = user.email;
        
        const nameInput = document.getElementById('ps_display_name');
        if (nameInput) nameInput.value = user.displayName || '';
        
    }
});


const themeBtn = document.getElementById('theme-toggle-btn');
if (themeBtn) {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(themeBtn, savedTheme);

    themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeUI(themeBtn, newTheme);
    });
}

function updateThemeUI(btn, theme) {
    const icon = btn.querySelector('i');
    if (theme === 'dark') {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    } else {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }
}

function setActiveTab(name){
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  
  const btn = document.querySelector(`.nav-btn[data-tab="${name}"]`);
  if(btn) btn.classList.add('active');

  const content = document.getElementById(`tab-${name}`);
  if (content) content.classList.add('active');
}

function toast(msg, type = 'normal'){
  try {
    if (typeof showToast === 'function') {
      showToast(String(msg || ''), type === 'error' ? 'error' : undefined);
      return;
    }
  } catch(_){}
  try {
    const el = document.createElement('div');
    el.className = (type === 'error') ? 'feedback-toast error' : 'feedback-toast';
    el.textContent = String(msg || '');
    document.body.appendChild(el);
    setTimeout(()=>{ el.classList.add('fade-out'); }, 2200);
    setTimeout(()=>{ el.remove(); }, 2600);
  } catch(_){}
}

async function logAccountActivity(action, id) {
  try {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const db = firebase.firestore();
    const activityData = {
      userId: user.uid,
      userEmail: user.email || 'unknown',
      userName: user.displayName || 'No Name',
      action: String(action),
      details: { id: String(id || user.uid) }
    };

    if (String(action).includes('delete')) {
      activityData.deletedAt = firebase.firestore.FieldValue.serverTimestamp();
    } else {
      activityData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection('account_activity').add(activityData);
  } catch (e) { 
    try { console.error('Account activity log failed:', e); } catch(_) {}
    try { toast('Failed to record activity. Please retry.', 'error'); } catch(_) {}
  }
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = btn.querySelector('i');
    
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        btn.setAttribute('aria-label', 'Hide password');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        btn.setAttribute('aria-label', 'Show password');
    }
}

function checkPasswordStrength(password) {
    const bar = document.getElementById('strength-bar');
    if(!bar) return;

    const requirements = [
        { id: 'req-len', valid: password.length >= 8 },
        { id: 'req-lower', valid: /[a-z]/.test(password) },
        { id: 'req-upper', valid: /[A-Z]/.test(password) },
        { id: 'req-num', valid: /\d/.test(password) },
        { id: 'req-sym', valid: /[!@#$%^&*(),.?":{}|<>]/.test(password) }
    ];

    let strength = 0;

    requirements.forEach(req => {
        const el = document.getElementById(req.id);
        if (el) {
            if (req.valid) {
                el.classList.add('valid');
                strength++;
            } else {
                el.classList.remove('valid');
            }
        }
    });

    if (password.length === 0) {
        bar.style.width = '0%';
        bar.style.backgroundColor = '#ef4444'; // Red
    } else {
        const percentage = (strength / 5) * 100;
        bar.style.width = `${percentage}%`;
        
        if (strength <= 2) {
            bar.style.backgroundColor = '#ef4444'; // Red
        } else if (strength <= 4) {
            bar.style.backgroundColor = '#f59e0b'; // Orange
        } else {
            bar.style.backgroundColor = '#10b981'; // Green
        }
    }
}

async function handleChangePassword() {
    const currentPassEl = document.getElementById('ps_current_password');
    const newPassEl = document.getElementById('ps_new_password');
    const confirmPassEl = document.getElementById('ps_confirm_password');
    const btn = document.getElementById('changePasswordBtn');
    
    const currentPass = currentPassEl.value;
    const newPass = newPassEl.value;
    const confirmPass = confirmPassEl ? confirmPassEl.value : '';

    if (!currentPass) return toast('Please enter your current password.', 'error');
    if (!newPass) return toast('Please enter a new password.', 'error');
    if (newPass.length < 8) return toast('New password must be at least 8 chars.', 'error');
    if (!confirmPass) return toast('Please confirm your new password.', 'error');
    if (newPass !== confirmPass) return toast('New and confirm password do not match.', 'error');
    
    const user = firebase.auth().currentUser;
    if (!user) return toast('You are not signed in.', 'error');

    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    btn.disabled = true;

    try {
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPass);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPass);
        try {
            const db = firebase.firestore();
            await db.collection('users').doc(user.uid).set({ lastPasswordChangeAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } catch (_) {}
        toast('Password updated successfully!', 'success');
        try { await logAccountActivity('update_password', user.uid); } catch(_){}
        currentPassEl.value = '';
        newPassEl.value = '';
        checkPasswordStrength(''); 
    } catch (error) {
        console.error("Error updating password:", error);
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
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}

function validateDisplayName(name) {
    const n = (name || '').trim();
    if (!n) return { ok: true, value: '' };
    if (n.length < 3) return { ok: false, msg: 'Display name must be at least 3 characters.' };
    if (n.length > 30) return { ok: false, msg: 'Display name must be at most 30 characters.' };
    if (!/^[A-Za-z0-9_\-\. ]+$/.test(n)) return { ok: false, msg: 'Only letters, numbers, spaces, _ - . allowed.' };
    return { ok: true, value: n };
}

async function handleSaveProfile() {
    const user = firebase.auth().currentUser;
    if (!user) { toast('You are not signed in.', 'error'); return; }
    const nameEl = document.getElementById('ps_display_name');
    const nameToggle = document.getElementById('ps_enable_display_name');
    const btn = document.getElementById('saveProfileBtn');
    const nameVal = nameEl ? nameEl.value : '';
    const shouldUpdateName = !!(nameToggle && nameToggle.checked);
    const v = shouldUpdateName ? validateDisplayName(nameVal) : { ok: true, value: '' };
    if (!v.ok) { toast(v.msg, 'error'); return; }
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
    let photoURL = user.photoURL || '';
    try {
        if (!shouldUpdateName) { throw new Error('No changes to save.'); }
        await user.updateProfile({ displayName: v.value });
        const db = firebase.firestore();
        await db.collection('users').doc(user.uid).set({ name: v.value || user.displayName || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        try { await user.reload(); } catch(_){ }
        try {
          const detail = { displayName: v.value || user.displayName || '', photoURL: user.photoURL || '', email: user.email || '' };
          window.dispatchEvent(new CustomEvent('user-profile-updated', { detail }));
        } catch(_){ }
        toast('Profile saved.', 'success');
        try { await logAccountActivity('update_display_name', user.uid); } catch(_){}
    } catch (e) {
        toast(e.message || 'Failed to save profile.', 'error');
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
}

async function deleteUserDocsFor(uid) {
    const db = firebase.firestore();
    async function wipe(col, field) {
        try {
            while (true) {
                const snap = await db.collection(col).where(field, '==', uid).limit(300).get();
                if (snap.empty) break;
                const batch = db.batch();
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        } catch (_) {}
    }
    await wipe('poser_detections', 'userId');
    await wipe('pending_verifications', 'userId');
    await wipe('pending_news_verification', 'userId');
    try { await db.collection('users').doc(uid).delete(); } catch (_) {}
}

function openDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    const passwordInput = document.getElementById('deleteAccountPassword');
    const inputContainer = document.getElementById('deleteModalInputContainer');
    
    if (modal) {
        modal.classList.add('open');
        if (passwordInput) passwordInput.value = '';
        if (inputContainer) inputContainer.style.display = 'block';
        if (passwordInput) passwordInput.focus();
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) modal.classList.remove('open');
}

async function performAccountDeletion() {
    const user = firebase.auth().currentUser;
    const passwordEl = document.getElementById('deleteAccountPassword');
    const password = passwordEl ? passwordEl.value : '';
    const btn = document.getElementById('confirmDeleteBtn');

    if (!user) return toast('System not ready.', 'error');
    if (!password) return toast('Please enter your password to confirm.', 'error');

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
        await user.reauthenticateWithCredential(credential);

        try {
            await logAccountActivity('delete_account', user.uid);
        } catch (logErr) {
            console.warn('Failed to log account deletion:', logErr);
        }

        await deleteUserDocsFor(user.uid);
        
        window.isAccountDeleting = true;
        try {
            localStorage.removeItem('authData');
            sessionStorage.removeItem('authData');
            localStorage.removeItem('remember_email');
        } catch(e) {}

        await user.delete();
        
        closeDeleteModal();
        
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.classList.add('open');
            const okBtn = document.getElementById('successOkBtn');
            if(okBtn) {
                okBtn.onclick = () => {
                    window.location.href = 'index.html';
                };
            } else {
                // Fallback if button missing
                setTimeout(() => window.location.href = 'index.html', 2000);
            }
        } else {
             // Fallback if modal missing
             alert("Your account has been successfully deleted.");
             window.location.href = 'index.html';
        }

    } catch (error) {
        console.error(error);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
            toast('Incorrect password.', 'error');
        } else {
            toast(error.message || 'Deletion failed.', 'error');
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function handleDeleteAccount() {
    openDeleteModal();
}
document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
          const emailField = document.getElementById('ps_email');
          if(emailField) emailField.value = user.email;
          const nameField = document.getElementById('ps_display_name');
          if (nameField) { nameField.value = user.displayName || ''; nameField.disabled = true; }
          
      }
  });

  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace('#', '');
  const initialTab = params.get('tab') || hash || 'security';
  setActiveTab(initialTab);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  const navMenu = document.querySelector('.nav-menu');
  if (navMenu) {
    navMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      setActiveTab(btn.dataset.tab);
    });
  }

  const changePassBtn = document.getElementById('changePasswordBtn');
  if(changePassBtn) changePassBtn.addEventListener('click', handleChangePassword);
  
  
  const confirmEl = document.getElementById('ps_confirm_password');
  if (confirmEl) confirmEl.addEventListener('input', () => {});
  const saveBtn = document.getElementById('saveProfileBtn');
  if (saveBtn) saveBtn.addEventListener('click', handleSaveProfile);
  const enableName = document.getElementById('ps_enable_display_name');
  if (enableName) enableName.addEventListener('change', () => {
    const nameEl = document.getElementById('ps_display_name');
    if (!nameEl) return;
    const enabled = enableName.checked;
    nameEl.disabled = !enabled;
  });
  

  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', handleDeleteAccount);
  }

  const cancelBtn = document.getElementById('cancelDeleteBtn');
  if(cancelBtn) cancelBtn.addEventListener('click', closeDeleteModal);
  
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if(confirmBtn) confirmBtn.addEventListener('click', performAccountDeletion);
  
  const modal = document.getElementById('deleteAccountModal');
  if(modal) {
      modal.addEventListener('click', (e) => {
          if(e.target === modal) closeDeleteModal();
      });
  }

  document.querySelectorAll('.toggle-visibility').forEach((btn) => {
    const targetId = btn.dataset.target;
    btn.addEventListener('click', (e) => {
        e.preventDefault(); 
        togglePassword(targetId, btn);
    });
  });

  const newPassEl = document.getElementById('ps_new_password');
  if (newPassEl) {
    newPassEl.addEventListener('input', () => checkPasswordStrength(newPassEl.value));
    checkPasswordStrength(newPassEl.value || '');
  }
});
