const db = (window.db) || (firebase.firestore && firebase.firestore());

// --- Helper: Format Dates ---
function fmt(ts) {
  if (!ts) return '';
  const date = (ts.seconds) ? new Date(ts.seconds * 1000) : new Date(ts);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// --- Helper: Choose Icons ---
function iconFor(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('verified') || t.includes('approve') || t.includes('success')) {
    return { cls: 'success', i: 'fa-check-circle' };
  }
  if (t.includes('reject') || t.includes('warn') || t.includes('alert')) {
    return { cls: 'warn', i: 'fa-times-circle' };
  }
  return { cls: 'info', i: 'fa-bell' };
}

// --- Helper: Empty State HTML ---
function renderEmptyState() {
  return `
    <li class="empty-state">
      <i class="fas fa-wind"></i>
      <h3>All caught up!</h3>
      <p>No new notifications at the moment.</p>
    </li>`;
}

// --- Helper: Render List Item ---
function renderItem(doc) {
  const data = doc.data();
  const isRead = !!data.readAt;
  const icon = iconFor(data.type || data.action);
  
  const li = document.createElement('li');
  li.className = `activity-item ${icon.cls} ${isRead ? 'read' : 'unread'}`;
  
  // Link logic: If DB has a link, click goes there. If not, click marks read.
  const hasLink = !!data.link;
  
  li.innerHTML = `
    <div class="icon"><i class="fas ${icon.i}"></i></div>
    <div class="content" ${hasLink ? 'style="cursor:pointer;"' : ''}>
      <strong>${data.title || 'Notification'}</strong>
      <div class="meta">${data.message || ''}</div>
      <div class="meta" style="margin-top:4px; font-size:0.75rem; opacity:0.7;">
        ${fmt(data.timestamp)}
      </div>
    </div>
    ${!isRead ? `<button class="btn" style="padding:4px 10px; font-size:0.75rem;" onclick="markOneRead(event, '${doc.id}')">Mark Read</button>` : ''}
  `;

  // Add click listener for navigation if link exists
  if (hasLink) {
    li.querySelector('.content').addEventListener('click', async () => {
       if(!isRead) await markAsRead(doc.id);
       window.location.href = data.link;
    });
  }

  return li;
}

// --- Action: Mark Single Read ---
async function markOneRead(e, id) {
    e.stopPropagation(); // Prevent bubbling
    await markAsRead(id);
}

async function markAsRead(id) {
    await db.collection('notifications').doc(id).set({ 
        readAt: firebase.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });
}

// --- MAIN LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged(async user => {
    if (!user) { window.location.href = 'login.html'; return; }

    const list = document.getElementById('activityList');
    const markAllBtn = document.getElementById('markAllBtn');
    
    // 1. SETUP TOGGLES (Load & Save)
    const userDocRef = db.collection('users').doc(user.uid);
    let prefVerification = true;
    let prefAnnouncements = true;
    
    // Load existing prefs
    try {
        const docSnap = await userDocRef.get();
        if(docSnap.exists) {
            const d = docSnap.data();
            prefVerification = d.notify_verification !== false;
            prefAnnouncements = d.notify_announcements !== false;
            document.getElementById('pref_verification').checked = prefVerification;
            document.getElementById('pref_announcements').checked = prefAnnouncements;
        }
    } catch(e) { console.log('Error loading prefs', e); }

    // Save prefs on click
    const handleToggle = async (key, checked) => {
        await userDocRef.set({ [key]: checked }, { merge: true });
        if (key === 'notify_verification') prefVerification = checked;
        if (key === 'notify_announcements') prefAnnouncements = checked;
    };

    document.getElementById('pref_verification').addEventListener('change', (e) => handleToggle('notify_verification', e.target.checked));
    document.getElementById('pref_announcements').addEventListener('change', (e) => handleToggle('notify_announcements', e.target.checked));


    // 2. SETUP NOTIFICATION FEED (Real-time)
    db.collection('notifications')
      .where('userId', '==', user.uid)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .onSnapshot(snapshot => {
        list.innerHTML = ''; // Clear list
        
        if (snapshot.empty) {
          list.innerHTML = renderEmptyState();
          markAllBtn.style.display = 'none';
          return;
        }

        markAllBtn.style.display = 'inline-flex';
        let unreadCount = 0;

        snapshot.docs.forEach(doc => {
            list.appendChild(renderItem(doc));
            if(!doc.data().readAt) unreadCount++;
        });

        // Update Mark All Button
        markAllBtn.textContent = unreadCount > 0 ? `Mark all read (${unreadCount})` : 'Mark all read';
        markAllBtn.style.opacity = unreadCount === 0 ? '0.5' : '1';
        markAllBtn.disabled = unreadCount === 0;
      });

    // 3. MARK ALL READ ACTION
    markAllBtn.addEventListener('click', async () => {
        const batch = db.batch();
        const unread = await db.collection('notifications')
            .where('userId', '==', user.uid)
            .where('readAt', '==', null)
            .get();
            
        if(unread.empty) return;
        
        unread.docs.forEach(doc => {
            batch.update(doc.ref, { readAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        
        await batch.commit();
    });

    const processedKey = `processed_verifications_${user.uid}`;
    let processed = {};
    try { processed = JSON.parse(localStorage.getItem(processedKey) || '{}'); } catch(_){ processed = {}; }

    db.collection('pending_verifications')
      .where('userId', '==', user.uid)
      .onSnapshot(async snap => {
        const current = new Set();
        snap.docs.forEach(d => { if (d.data().url) current.add(String(d.data().url).trim()); });
        const prev = new Set(Object.keys(processed));
        for (const url of prev) {
          if (!current.has(url)) {
            if (prefVerification) {
              try {
                const regSnap = await db.collection('verified_registry').where('url','==', url).get();
                const isApproved = !regSnap.empty;
                const type = isApproved ? 'verified' : 'reject';
                const title = isApproved ? 'Verification approved' : 'Verification closed';
                const message = isApproved ? 'Your request was approved.' : 'Your request was closed.';
                await db.collection('notifications').add({
                  userId: user.uid,
                  type,
                  title,
                  message,
                  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                  link: url,
                  readAt: null
                });
              } catch(_){ }
            }
            delete processed[url];
          }
        }
        snap.docs.forEach(d => { if (d.data().url) processed[String(d.data().url).trim()] = true; });
        try { localStorage.setItem(processedKey, JSON.stringify(processed)); } catch(_){}
      });

  });
});
