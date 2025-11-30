const auth = (window.auth) || (firebase.auth && firebase.auth());
const db = (window.db) || (firebase.firestore && firebase.firestore());

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

async function logActivity(userId, action, details){
  try {
    await db.collection('account_activity').add({ userId, action, details, timestamp: new Date().toISOString() });
  } catch(_) {}
}

function prefillUserData(uid){
  db.collection('users').doc(uid).get().then(doc=>{
    const data = doc.exists ? doc.data() : {};
    (document.getElementById('ps_displayName')||{}).value = data.fullName || '';
    (document.getElementById('ps_username')||{}).value = data.username || '';
    (document.getElementById('ps_bio')||{}).value = data.bio || '';
    (document.getElementById('ps_location')||{}).value = data.location || '';
    (document.getElementById('ps_theme')||{}).value = data.theme || (localStorage.getItem('theme') || 'default');
    (document.getElementById('ps_language')||{}).value = data.language || (localStorage.getItem('language') || 'en');
  });
}

async function saveProfile(uid){
  const fullName = (document.getElementById('ps_displayName')||{}).value || '';
  const username = (document.getElementById('ps_username')||{}).value || '';
  const bio = (document.getElementById('ps_bio')||{}).value || '';
  const location = (document.getElementById('ps_location')||{}).value || '';
  await db.collection('users').doc(uid).set({ fullName, username, bio, location }, { merge:true });
  await logActivity(uid, 'Updated Profile', { fullName, username });
  const user = firebase.auth().currentUser;
  if (user) await user.updateProfile({ displayName: fullName }).catch(()=>{});
  toast('Profile saved');
}

async function changeEmail(uid){
  const newEmail = (document.getElementById('ps_email')||{}).value || '';
  const user = firebase.auth().currentUser;
  if (!user || !newEmail) return toast('Provide a new email');
  try {
    await user.updateEmail(newEmail);
    await db.collection('users').doc(uid).set({ email:newEmail }, { merge:true });
    await logActivity(uid, 'Changed Email', { email:newEmail });
    toast('Email updated');
  } catch(err){
    await logActivity(uid, 'Email Update Failed', { code: err.code });
    toast(err.message || 'Failed to update email');
  }
}

async function changePassword(uid){
  const current = (document.getElementById('ps_current_password')||{}).value || '';
  const next = (document.getElementById('ps_new_password')||{}).value || '';
  const user = firebase.auth().currentUser;
  if (!user || !next) return toast('Provide new password');
  try {
    await user.updatePassword(next);
    await logActivity(uid, 'Changed Password', {});
    toast('Password updated');
  } catch(err){
    if (err && err.code === 'auth/requires-recent-login'){
      if (!current) return toast('Enter current password to re-auth');
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
      try {
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(next);
        await logActivity(uid, 'Changed Password', { reauth:true });
        toast('Password updated');
      } catch(e){
        await logActivity(uid, 'Password Update Failed', { code:e.code });
        toast(e.message || 'Failed to update password');
      }
    } else {
      await logActivity(uid, 'Password Update Failed', { code:err.code });
      toast(err.message || 'Failed to update password');
    }
  }
}

async function savePreferences(uid){
  const theme = (document.getElementById('ps_theme')||{}).value || 'default';
  const language = (document.getElementById('ps_language')||{}).value || 'en';
  localStorage.setItem('theme', theme);
  localStorage.setItem('language', language);
  await db.collection('users').doc(uid).set({ theme, language }, { merge:true });
  await logActivity(uid, 'Updated Preferences', { theme, language });
  toast('Preferences saved');
}

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
  const pref = document.getElementById('savePreferencesBtn');
  const del = document.getElementById('deleteAccountBtn');
  const deact = document.getElementById('deactivateBtn');
  if (sp) sp.addEventListener('click', ()=>saveProfile(uid));
  if (ce) ce.addEventListener('click', ()=>changeEmail(uid));
  if (cp) cp.addEventListener('click', ()=>changePassword(uid));
  if (pref) pref.addEventListener('click', ()=>savePreferences(uid));
  if (del) del.addEventListener('click', ()=>deleteAccount(uid));
  if (deact) deact.addEventListener('click', ()=>deactivateAccount(uid));
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
