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
  const isNew = !data.readAt;
  const icon = iconFor(data.type || data.action);
  li.className = `activity-item ${icon.cls}`;
  if (isNew) li.style.boxShadow = '0 0 0 2px rgba(34,197,94,0.3) inset';
  li.innerHTML = `<div class="icon"><i class="fas ${icon.i}"></i></div>
    <div>
      <div><strong>${data.title || data.action || 'Notification'}</strong></div>
      <div class="meta">${fmt((data.timestamp && data.timestamp.seconds)? new Date(data.timestamp.seconds*1000): data.timestamp)} • ${data.message || ''}</div>
    </div>
    <button class="btn" data-action="mark" data-id="${doc.id}">Mark as Read</button>`;
  return li;
}

document.addEventListener('DOMContentLoaded',()=>{
  firebase.auth().onAuthStateChanged(async user=>{
    if (!user){ window.location.href = 'login.html'; return; }
    const list = document.getElementById('activityList');
    const q = await db.collection('notifications').where('userId','==',user.uid).orderBy('timestamp','desc').get();
    q.docs.forEach(d=> list.appendChild(renderItem(d)));
    list.querySelectorAll('[data-action="mark"]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-id');
        await db.collection('notifications').doc(id).set({ readAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        e.currentTarget.textContent = 'Read';
        e.currentTarget.disabled = true;
        e.currentTarget.closest('.activity-item').style.boxShadow = 'none';
      });
    });
  });
});
