const auth = (window.auth) || (firebase.auth && firebase.auth());
const db = (window.db) || (firebase.firestore && firebase.firestore());
let passwordFailCount = 0;
const PASSWORD_FAIL_THRESHOLD = 3;

function setActiveTab(name){
  document.querySelectorAll('.tab').forEach(el=>el.classList.remove('active'));
  const el = document.getElementById(`tab-${name}`);
  if (el) el.classList.add('active');
}

function toast(msg){
  const t = document.getElementById('ps_toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(()=>{ t.style.display='none'; }, 2500);
}

function setFieldError(id, msg){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('input-error');
  let m = el.nextElementSibling;
  if (!m || !m.classList || !m.classList.contains('error-text')){
    m = document.createElement('div');
    m.className = 'error-text';
    el.parentNode.insertBefore(m, el.nextSibling);
  }
  m.textContent = msg;
}

function clearFieldError(id){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('input-error');
  let sib = el.nextElementSibling;
  if (sib && sib.classList && sib.classList.contains('error-text')){
    const link = sib.nextElementSibling;
    if (link && link.classList && link.classList.contains('error-link')){
      link.parentNode.removeChild(link);
    }
    sib.parentNode.removeChild(sib);
  }
}

function addFieldErrorLink(id, text, href){
  const el = document.getElementById(id);
  if (!el) return;
  const m = el.nextElementSibling;
  if (!m || !m.classList || !m.classList.contains('error-text')) return;
  let link = m.nextElementSibling;
  if (!link || !link.classList || !link.classList.contains('error-link')){
    link = document.createElement('a');
    link.className = 'error-link';
    link.target = '_self';
    m.parentNode.insertBefore(link, m.nextSibling);
  }
  link.textContent = text;
  link.href = href;
}

async function logActivity(userId, action, details){
  try {
    await db.collection('account_activity').add({ userId, action, details, timestamp: new Date().toISOString() });
  } catch(_) {}
}

function prefillUserData(uid){
  db.collection('users').doc(uid).get().then(doc=>{
    const data = doc.exists ? doc.data() : {};
    (document.getElementById('ps_displayName')||{}).value = data.fullName || data.displayName || '';
    (document.getElementById('ps_username')||{}).value = data.username || '';
    (document.getElementById('ps_bio')||{}).value = data.bio || '';
    
    const emailView = document.getElementById('ps_email_view');
    if (emailView) emailView.value = data.email || (firebase.auth().currentUser ? firebase.auth().currentUser.email : '') || '';
  });
}

async function saveProfile(uid){
  const fullName = (document.getElementById('ps_displayName')||{}).value || '';
  const username = (document.getElementById('ps_username')||{}).value || '';
  const bio = (document.getElementById('ps_bio')||{}).value || '';
  if (!fullName || fullName.trim().length < 2) return toast('Please enter your name');
  await db.collection('users').doc(uid).set({ fullName, displayName: fullName, username, bio }, { merge:true });
  await logActivity(uid, 'Updated Profile', { fullName, username });
  const user = firebase.auth().currentUser;
  if (user) await user.updateProfile({ displayName: fullName }).catch(()=>{});
  toast('Profile saved');
}

async function changeEmail(uid){
  const newEmail = (document.getElementById('ps_email')||{}).value || '';
  const user = firebase.auth().currentUser;
  if (!user){ toast('Not authenticated'); setFieldError('ps_email','Sign in again'); return; }
  if (!newEmail){ setFieldError('ps_email','Enter new email'); toast('Provide a new email'); return; }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
  if (!valid){ setFieldError('ps_email','Enter a valid email'); toast('Invalid email address'); return; }
  try {
    await user.updateEmail(newEmail);
    await db.collection('users').doc(uid).set({ email:newEmail }, { merge:true });
    await logActivity(uid, 'Changed Email', { email:newEmail });
    toast('Email updated');
    clearFieldError('ps_email');
  } catch(err){
    await logActivity(uid, 'Email Update Failed', { code: err.code });
    const code = err && err.code;
    if (code === 'auth/invalid-email'){ setFieldError('ps_email','Invalid email address'); return toast('Invalid email address'); }
    if (code === 'auth/email-already-in-use'){ setFieldError('ps_email','Email already in use'); return toast('Email already in use'); }
    if (code === 'auth/requires-recent-login'){ setFieldError('ps_email','Please sign in again'); addFieldErrorLink('ps_email','Sign in again','login.html?clearAuth=1'); return toast('Please sign in again to change email'); }
    if (code === 'auth/network-request-failed'){ return toast('Network error, check connection'); }
    if (code === 'auth/invalid-api-key'){ return toast('Auth configuration error (API key)'); }
    toast(err.message || 'Failed to update email');
  }
}

async function changePassword(uid){
  const current = (document.getElementById('ps_current_password')||{}).value || '';
  const next = (document.getElementById('ps_new_password')||{}).value || '';
  const user = firebase.auth().currentUser;
  if (!user){ toast('Not authenticated'); setFieldError('ps_current_password','Sign in again'); return; }
  if (!next){ setFieldError('ps_new_password','Enter new password'); toast('Provide a new password'); return; }
  if (next.length < 8){ setFieldError('ps_new_password','At least 8 characters'); toast('Password must be at least 8 characters'); return; }
  if (current && current === next){ setFieldError('ps_new_password','New password must be different'); toast('New password must be different'); return; }
  try {
    await user.updatePassword(next);
    await logActivity(uid, 'Changed Password', {});
    toast('Password updated');
    clearFieldError('ps_current_password');
    clearFieldError('ps_new_password');
  } catch(err){
    if (err && err.code === 'auth/requires-recent-login'){
      if (!current){ setFieldError('ps_current_password','Enter current password'); addFieldErrorLink('ps_current_password','Sign in again','login.html?clearAuth=1'); toast('Enter current password to re-auth'); return; }
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
      try {
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(next);
        await logActivity(uid, 'Changed Password', { reauth:true });
        toast('Password updated');
        clearFieldError('ps_current_password');
        clearFieldError('ps_new_password');
      } catch(e){
        await logActivity(uid, 'Password Update Failed', { code:e.code });
        const code = e && e.code;
        if (code === 'auth/wrong-password'){
          passwordFailCount++;
          setFieldError('ps_current_password','Incorrect current password');
          if (passwordFailCount >= PASSWORD_FAIL_THRESHOLD){
            addFieldErrorLink('ps_current_password','Sign in again','login.html?clearAuth=1');
          }
          toast('Incorrect current password');
          return;
        }
        if (code === 'auth/requires-recent-login'){ setFieldError('ps_current_password','Please sign in again'); addFieldErrorLink('ps_current_password','Sign in again','login.html?clearAuth=1'); toast('Please sign in again'); return; }
        if (code === 'auth/weak-password'){ setFieldError('ps_new_password','Password too weak'); toast('Password too weak'); return; }
        if (code === 'auth/too-many-requests'){ toast('Too many attempts, try later'); return; }
        if (code === 'auth/network-request-failed'){ toast('Network error, check connection'); return; }
        if (code === 'auth/invalid-api-key'){ toast('Auth configuration error (API key)'); return; }
        toast(e.message || 'Failed to update password');
      }
    } else {
      await logActivity(uid, 'Password Update Failed', { code:err.code });
      const code = err && err.code;
      if (code === 'auth/weak-password'){ setFieldError('ps_new_password','Password too weak'); toast('Password too weak'); return; }
      if (code === 'auth/too-many-requests') return toast('Too many attempts, try later');
      if (code === 'auth/network-request-failed') return toast('Network error, check connection');
      if (code === 'auth/invalid-api-key') return toast('Auth configuration error (API key)');
      toast(err.message || 'Failed to update password');
    }
  }
}

// Preferences removed

async function deactivateAccount(uid){
  await logActivity(uid, 'Deactivated Account', {});
  toast('Account deactivated');
}

async function deleteAccount(uid){
  const ok = confirm('Delete your account permanently?');
  if (!ok) return;
  const user = firebase.auth().currentUser;
  try {
    await db.collection('users').doc(uid).delete();
  } catch(_){}
  try {
    if (user) await user.delete();
  } catch(err){ toast(err.message || 'Failed to delete'); return; }
  await logActivity(uid, 'Deleted Account', {});
  window.location.href = 'login.html';
}

function bindSidebar(){
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>setActiveTab(btn.dataset.tab));
  });
}

function bindActions(uid){
  const sp = document.getElementById('saveProfileBtn');
  const ce = document.getElementById('changeEmailBtn');
  const cp = document.getElementById('changePasswordBtn');
  const del = document.getElementById('deleteAccountBtn');
  const deact = document.getElementById('deactivateBtn');
  if (sp) sp.addEventListener('click', ()=>saveProfile(uid));
  if (ce) ce.addEventListener('click', ()=>changeEmail(uid));
  if (cp) cp.addEventListener('click', ()=>changePassword(uid));
  if (del) del.addEventListener('click', ()=>deleteAccount(uid));
  if (deact) deact.addEventListener('click', ()=>deactivateAccount(uid));
  const cur = document.getElementById('ps_current_password');
  const nxt = document.getElementById('ps_new_password');
  const em = document.getElementById('ps_email');
  if (cur) cur.addEventListener('input', ()=>{ passwordFailCount = 0; clearFieldError('ps_current_password'); });
  if (nxt) nxt.addEventListener('input', ()=>clearFieldError('ps_new_password'));
  if (em) em.addEventListener('input', ()=>clearFieldError('ps_email'));
}

document.addEventListener('DOMContentLoaded',()=>{
  bindSidebar();
  setActiveTab('profile');
  firebase.auth().onAuthStateChanged(user=>{
    if (!user){ window.location.href = 'login.html'; return; }
    prefillUserData(user.uid);
    bindActions(user.uid);
  });
});
