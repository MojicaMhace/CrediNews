// Global variables
const container = document.getElementById('trends-feed-container');
const searchInput = document.getElementById('trends-search');
const sortSelect = document.getElementById('trends-sort');
let allDocs = [];
let currentQuery = '';
let currentSort = 'date_desc';

// GLOBAL USER ID LOCK (Prevents ID changing on every click)
let globalSessionUserId = null;

// --- HELPER FUNCTIONS ---
function safeText(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]; });
}

function decodeEntities(s) {
  if (!s) return '';
  let str = String(s);
  str = str.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  str = str.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  const map = { '&quot;':'"', '&apos;':'\'', '&#39;':'\'', '&amp;':'&', '&lt;':'<', '&gt;':'>', '&nbsp;':' ' };
  str = str.replace(/&(quot|apos|amp|lt|gt|nbsp|#39);/g, m => map[m] || m);
  return str;
}

function shorten(text, n) {
  const s = String(text || '').trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function scoreClass(label) {
  const v = String(label || '').toLowerCase();
  if (v.includes('unverified')) return 'score-neutral';
  if (v.includes('credible') || v.includes('high')) return 'score-high';
  if (v.includes('mixed') || v.includes('medium')) return 'score-medium';
  if (v.includes('low')) return 'score-low';
  return 'score-neutral';
}

function labelScore(label) {
  const t = String(label || '').toLowerCase();
  if (t.includes('credible')) return 3;
  if (t.includes('mixed')) return 2;
  if (t.includes('unverified')) return 1;
  if (t.includes('low credibility') || t === 'low') return 0;
  return 1;
}

function tsMillis(ts) {
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts && ts.seconds) return ts.seconds * 1000;
    if (typeof ts === 'number') return ts;
  } catch (e) {}
  return 0;
}

function getSourceName(url) {
  try {
    if (!url) return 'Unknown Source';
    const u = String(url);
    const lower = u.toLowerCase();
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, '');
    if (lower.includes('facebook.com')) {
      const seg = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (seg) return seg.replace(/[-_]+/g, ' ');
      return 'Facebook';
    }
    return host;
  } catch (e) {
    return 'Unknown Source';
  }
}

// --- STABLE USER ID LOGIC ---
function getUserId() {
  // 1. If we already found an ID this session, reuse it.
  if (globalSessionUserId) return globalSessionUserId;

  // 2. Check Firebase Auth
  const u = firebase.auth().currentUser;
  if (u && u.uid) {
      globalSessionUserId = u.uid;
      return u.uid;
  }

  // 3. Check LocalStorage (Guest ID)
  try {
    const key = 'credinews_guest_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'guest_' + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(key, id);
    }
    globalSessionUserId = id;
    return id;
  } catch (e) {
    // 4. Fallback (Memory only)
    globalSessionUserId = 'guest_' + Math.random().toString(36).slice(2) + Date.now();
    return globalSessionUserId;
  }
}

// --- VOTING LOGIC ---
async function handleVote(docId, voteType) {
    const uid = getUserId(); // Uses the stable ID
    const db = firebase.firestore();
    const docRef = db.collection('facebook_verification_results').doc(docId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (!doc.exists) return;

            const data = doc.data();
            // Initialize structure if missing
            const feedback = data.feedback || { agreeCount: 0, disagreeCount: 0, voters: {} };
            const voters = feedback.voters || {};
            
            // Check previous vote
            const previousVote = voters[uid];

            // 1. Remove previous vote counts
            if (previousVote === 'agree') {
                feedback.agreeCount = Math.max(0, (feedback.agreeCount || 0) - 1);
            } else if (previousVote === 'disagree') {
                feedback.disagreeCount = Math.max(0, (feedback.disagreeCount || 0) - 1);
            }

            // 2. Determine new state
            if (previousVote === voteType) {
                // Clicked same button -> Remove vote (Toggle Off)
                delete voters[uid];
            } else {
                // New vote or Switch -> Add count
                if (voteType === 'agree') {
                    feedback.agreeCount = (feedback.agreeCount || 0) + 1;
                } else if (voteType === 'disagree') {
                    feedback.disagreeCount = (feedback.disagreeCount || 0) + 1;
                }
                voters[uid] = voteType;
            }

            feedback.voters = voters;

            // Commit update
            transaction.update(docRef, { feedback: feedback });
        });
    } catch (e) {
        console.error("Vote failed:", e);
    }
}

// --- FILTERING & RENDERING ---

function applyFiltersAndRender(uid) {
  const q = String(currentQuery || '').trim().toLowerCase();
  let docs = allDocs.slice();
  
  if (q) {
    docs = docs.filter(d => {
      const a = String(d.analyzedText || '').toLowerCase();
      const l = String(d.label || '').toLowerCase();
      const p = String(d.pageName || '').toLowerCase();
      return a.includes(q) || l.includes(q) || p.includes(q);
    });
  }
  
  if (currentSort === 'date_desc') {
    docs.sort((x,y) => tsMillis(y.analyzed_at) - tsMillis(x.analyzed_at));
  } else if (currentSort === 'date_asc') {
    docs.sort((x,y) => tsMillis(x.analyzed_at) - tsMillis(y.analyzed_at));
  } else if (currentSort === 'label_desc') {
    docs.sort((x,y) => labelScore(y.label) - labelScore(x.label));
  } else if (currentSort === 'label_asc') {
    docs.sort((x,y) => labelScore(x.label) - labelScore(y.label));
  }
  
  // Deduplicate
  const seen = new Map();
  for (const d of docs) {
    const key = (d.canonicalUrl || d.url || d.id || '').toLowerCase();
    if (!key) { seen.set(d.id, d); continue; }
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, d);
    } else {
      const a = tsMillis(d.analyzed_at);
      const b = tsMillis(prev.analyzed_at);
      if (a >= b) seen.set(key, d);
    }
  }
  docs = Array.from(seen.values());
  
  renderCards(docs, uid);
}

function renderCards(docs, userId) {
  if (!container) return;
  
  const html = docs.map(d => {
    const score = Number(d.credibilityScore || 0);
    const label = d.label || 'Unverified';
    
    // VOTE DATA
    const feedback = d.feedback || {};
    const agreeCount = feedback.agreeCount || 0;
    const disagreeCount = feedback.disagreeCount || 0;
    const voters = feedback.voters || {};
    const myVote = voters[userId] || null; 
    
    // Highlight class
    const agreeClass = myVote === 'agree' ? 'selected' : '';
    const disagreeClass = myVote === 'disagree' ? 'selected' : '';

    const analyzed = decodeEntities(d.analyzedText || '');
    const badge = '<span class="score-badge '+scoreClass(label)+'">'+score+'% • '+safeText(label)+'</span>';
    const bodyText = shorten(analyzed, 100);
    const sourceText = d.pageName || getSourceName(d.url);
    
    const labelBadge = (function(){
      const l = String(label || '').toLowerCase();
      if (l.includes('low credibility') || l === 'low') return '<span class="badge badge-danger">'+safeText(label)+'</span>';
      if (l.includes('credible')) return '<span class="badge badge-verified">'+safeText(label)+'</span>';
      if (l.includes('mixed')) return '<span class="badge badge-warning">'+safeText(label)+'</span>';
      return '<span class="badge badge-neutral">'+safeText(label)+'</span>';
    })();
    
    const imageTag = d.imageUrl 
        ? '<img class="card-image" src="'+safeText(d.imageUrl)+'" alt="Preview">' 
        : '<div class="card-media"><div class="fb-logo"><i class="fab fa-facebook-f"></i></div></div>';
    
    return (
      '<div class="trend-card" data-id="'+d.id+'">'
      + imageTag
      +'<div class="card-body" data-action="open">'
        +'<div class="card-text">'+safeText(bodyText)+'</div>'
      +'</div>'
      +'<div class="card-footer">'
        +'<div class="source-row"><i class="fab fa-facebook"></i><span>'+safeText(sourceText)+'</span></div>'
        +labelBadge
      +'</div>'
      +'<div class="card-actions">'
        +'<button class="vote-btn agree '+agreeClass+'" data-action="vote-agree"><i class="fas fa-thumbs-up"></i><span>'+agreeCount+'</span></button>'
        +'<button class="vote-btn disagree '+disagreeClass+'" data-action="vote-disagree"><i class="fas fa-thumbs-down"></i><span>'+disagreeCount+'</span></button>'
      +'</div>'
      +'<div class="card-header" style="display:flex;justify-content:flex-end;border:none;padding:0.5rem 1rem 1rem 1rem">'
        +'<a href="#" class="open-modal" data-action="open">View Details</a>'
      +'</div>'
      +'</div>'
    );
  }).join('');
  
  container.innerHTML = html;
}

// --- MODAL ---

function ensureModal(title, html) {
  const existing = document.querySelector('.modal-overlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box dark';
  box.innerHTML = '<div class="modal-header dark"><h2 class="modal-title">'+title+'</h2><button class="modal-close">×</button></div><div class="modal-body dark">'+html+'</div><div class="modal-footer dark"><button class="modal-button">Close</button></div>';
  overlay.appendChild(box);
  function close(){ overlay.remove(); }
  box.querySelector('.modal-close').addEventListener('click', close);
  box.querySelector('.modal-button').addEventListener('click', close);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}

function openResultModal(data) {
  const score = Number(data.credibilityScore || 0);
  const label = data.label || '';
  const level = (function(){
    const l = String(label || '').toLowerCase();
    if (l.includes('low')) return 'low';
    if (l.includes('high') || l.includes('credible')) return 'high';
    if (l.includes('mixed')) return 'medium';
    return 'medium';
  })();
  
  const credibilityTop = '<div class="card-score"><span class="score-badge '+scoreClass(label)+'">'+score+'% • '+safeText(label)+'</span></div>';
  const pageRow = '<div style="margin-bottom:8px"><strong>Source:</strong> '+safeText(data.pageName || getSourceName(data.url))+'</div>';
  const explanationBlock = (data.explanation ? ('<div class="analyzed-block"><div class="block-title">Explanation</div><div>'+safeText(decodeEntities(data.explanation))+'</div></div>') : '');
  const sourcesRow = '<div style="margin-bottom:8px"><strong>Sources:</strong> '+Number(data.sourcesFound || 0)+'</div>';
  const factsRow = '<div style="margin-bottom:8px"><strong>Fact Checks:</strong> '+Number(data.factChecks || 0)+'</div>';
  const urlRow = (data.url ? '<div style="margin-bottom:8px"><strong>URL:</strong> <a href="'+safeText(data.url)+'" target="_blank" rel="noopener">'+safeText(data.url)+'</a></div>' : '');
  const analyzedBlock = (data.analyzedText ? ('<div class="analyzed-block '+level+'"><div class="block-title">Analyzed Text</div><div>'+safeText(decodeEntities(data.analyzedText))+'</div></div>') : '');
  
  const analyzedTime = (data.analyzed_at ? ('<div style="margin-top:8px"><strong>Analyzed Time:</strong> '+formatTimestamp(data.analyzed_at)+'</div>') : '');
  const pd = data.poserDetection || null;
  const pdScore = pd && typeof pd.trustScore === 'number' ? Math.round(pd.trustScore) : null;
  const pdVerdict = pd && pd.verdict ? String(pd.verdict) : '';
  const pdName = pd && pd.name ? String(pd.name) : '';
  const pdLevel = (pdScore!=null) ? (pdScore>=75 ? 'high' : (pdScore>=45 ? 'medium' : 'low')) : 'neutral';
  const poserBlock = (pd ? ('<div class="analyzed-block '+pdLevel+'"><div class="block-title">Source Trust (Poser Detection)</div><div>'
    + (pdScore!=null ? ('<div><strong>Trust Score:</strong> '+pdScore+'%</div>') : '')
    + (pdVerdict ? ('<div><strong>Verdict:</strong> '+safeText(pdVerdict)+'</div>') : '')
    + (pdName ? ('<div><strong>Page:</strong> '+safeText(pdName)+'</div>') : '')
    + '</div></div>') : '');
  
  const html = '<div>'+credibilityTop+pageRow+sourcesRow+factsRow+urlRow+analyzedBlock+explanationBlock+poserBlock+analyzedTime+'</div>';
  ensureModal('Verification Result', html);
}

function formatTimestamp(ts) {
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (ts && ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch (e) {}
  return '';
}

// --- INITIALIZATION ---

async function start() {
  if (!container) return;
  const db = firebase.firestore();
  
  // Initialize Global ID immediately
  getUserId(); 

  const q = db.collection('facebook_verification_results').orderBy('analyzed_at', 'desc').limit(20);
  
  q.onSnapshot(async function(snap){
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const uid = getUserId(); // Use stable ID
    allDocs = docs;
    applyFiltersAndRender(uid);
  });
  
  if (searchInput) {
    searchInput.addEventListener('input', function(){
      currentQuery = this.value;
      applyFiltersAndRender(getUserId());
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', function(){
      currentSort = this.value || 'date_desc';
      applyFiltersAndRender(getUserId());
    });
  }
}

// --- EVENT LISTENERS ---

document.addEventListener('click', async function(e){
  const card = e.target.closest('.trend-card');
  if (!card) return;
  const id = card.dataset.id;
  const actionEl = e.target.closest('[data-action]');
  const action = actionEl ? actionEl.dataset.action : '';
  if (!id || !action) return;
  
  const db = firebase.firestore();
  
  if (action === 'open') {
    const snap = await db.collection('facebook_verification_results').doc(id).get();
    if (snap.exists) openResultModal(snap.data());
    e.preventDefault();
    return;
  }
  
  // VOTE HANDLERS
  if (action === 'vote-agree') {
    handleVote(id, 'agree');
  } else if (action === 'vote-disagree') {
    handleVote(id, 'disagree');
  }
});

if (window.firebase && firebase.firestore) {
  if (firebase.auth().currentUser) {
    start();
  } else {
    firebase.auth().onAuthStateChanged(function(){ start(); });
  }
}
