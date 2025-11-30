const db = (window.db) || (firebase.firestore && firebase.firestore());

function fmt(ts){
  try { return new Date(ts).toLocaleString(); } catch(_) { return String(ts); }
}

function iconFor(action){
  const a = (action||'').toLowerCase();
  if (a.includes('update') || a.includes('save')) return { cls:'success', i:'fa-check' };
  if (a.includes('delete') || a.includes('deactivate')) return { cls:'warn', i:'fa-exclamation' };
  return { cls:'success', i:'fa-info' };
}

function renderItem(doc){
  const data = doc.data();
  const li = document.createElement('li');
  const icon = iconFor(data.action);
  li.className = `activity-item ${icon.cls}`;
  li.innerHTML = `<div class="icon"><i class="fas ${icon.i}"></i></div>
    <div>
      <div><strong>${data.action || 'Activity'}</strong></div>
      <div class="meta">${fmt(data.timestamp)} • ${data.details ? JSON.stringify(data.details) : ''}</div>
    </div>`;
  return li;
}

document.addEventListener('DOMContentLoaded',()=>{
  firebase.auth().onAuthStateChanged(async user=>{
    if (!user){ window.location.href = 'login.html'; return; }
    const list = document.getElementById('activityList');
    const q = await db.collection('account_activity').where('userId','==',user.uid).orderBy('timestamp','desc').get();
    q.docs.forEach(d=> list.appendChild(renderItem(d)));
  });
});
