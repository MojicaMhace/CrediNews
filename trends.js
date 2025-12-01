const container = document.getElementById('trends-feed-container');
const searchInput = document.getElementById('trends-search');
const sortSelect = document.getElementById('trends-sort');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
let allDocs = [];
let currentQuery = '';
let currentSort = 'date_desc';
const pageSize = 12;
let currentPage = 1;
let pageLastDocs = [];
let hasMore = true;

function safeText(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]; });
}

function decodeEntities(s) {
  if (!s) return '';
  let str = String(s);
  str = str.replace(/&#x([0-9a-fA-F]+);/g, function(_, hex){ try { return String.fromCharCode(parseInt(hex, 16)); } catch(e){ return _; } });
  str = str.replace(/&#(\d+);/g, function(_, dec){ try { return String.fromCharCode(parseInt(dec, 10)); } catch(e){ return _; } });
  const map = { '&quot;':'"', '&apos;':'\'', '&#39;':'\'', '&amp;':'&', '&lt;':'<', '&gt;':'>', '&nbsp;':' ' };
  str = str.replace(/&(quot|apos|amp|lt|gt|nbsp|#39);/g, function(m){ return map[m] || m; });
  return str;
}

function scoreClass(label) {
  const v = String(label || '').toLowerCase();
  if (v.includes('unverified')) return 'score-neutral';
  if (v.includes('credible') || v.includes('high')) return 'score-high';
  if (v.includes('mixed') || v.includes('medium')) return 'score-medium';
  if (v.includes('low')) return 'score-low';
  return 'score-neutral';
}

function statusClass(label) {
  const v = String(label || '').toLowerCase();
  if (v.includes('high')) return 'status-high';
  if (v.includes('medium')) return 'status-medium';
  if (v.includes('low')) return 'status-low';
  return 'status-medium';
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

function shorten(text, n) {
  const s = String(text || '').trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function ensureModal(title, html) {
  if (typeof window.showModal === 'function') {
    window.showModal(title, html);
    return;
  }
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

function renderCards(docs, userId) {
  if (!container) return;
  const html = docs.map(d => {
    const score = Number(d.credibilityScore || 0);
    const label = d.label || '';
    const agree = Number((d.feedback && d.feedback.agreeCount) || 0);
    const disagree = Number((d.feedback && d.feedback.disagreeCount) || 0);
    const votersMap = (d.voters && typeof d.voters === 'object') ? d.voters : ((d.feedback && typeof d.feedback.voters === 'object') ? d.feedback.voters : null);
    const votersArr = (d.feedback && Array.isArray(d.feedback.voters)) ? d.feedback.voters : [];
    const myVote = (userId && votersMap && votersMap[userId]) ? String(votersMap[userId]) : null;
    const analyzed = decodeEntities(d.analyzedText || '');
    const badge = '<span class="score-badge '+scoreClass(label)+'">'+score+'% • '+safeText(label)+'</span>';
    const bodyText = shorten(analyzed, 100);
    const sourceText = d.pageName || '';
    const status = statusClass(label);
    const labelBadge = (function(){
      const l = String(label || '').toLowerCase();
      if (l.includes('low credibility') || l === 'low') return '<span class="badge badge-danger">'+safeText(label || 'Low Credibility')+'</span>';
      if (l.includes('credible')) return '<span class="badge badge-verified">'+safeText(label || 'Credible')+'</span>';
      if (l.includes('mixed')) return '<span class="badge badge-warning">'+safeText(label || 'Mixed')+'</span>';
      if (l.includes('unverified')) return '<span class="badge badge-neutral">'+safeText(label || 'Unverified')+'</span>';
      return '<span class="badge badge-neutral">'+safeText(label || 'Unverified')+'</span>';
    })();
    const imageTag = d.imageUrl ? '<img class="card-image" src="'+safeText(d.imageUrl)+'" alt="Preview">' : '';
    return (
      '<div class="trend-card" data-id="'+d.id+'">'
      +(imageTag || '<div class="card-media"><div class="fb-logo"><i class="fab fa-facebook-f"></i></div></div>')
      +'<div class="card-body" data-action="open">'
        +'<div class="card-text">'+safeText(bodyText)+'</div>'
      +'</div>'
      +'<div class="card-footer">'
        +'<div class="source-row"><i class="fab fa-facebook"></i><span>'+safeText(sourceText)+'</span></div>'
        +labelBadge
      +'</div>'
      +'<div class="card-actions">'
        +'<button class="vote-btn agree'+(myVote==='agree'?' selected':'')+'" data-action="vote-agree" aria-label="Agree"><i class="fas fa-thumbs-up"></i><span>'+agree+'</span></button>'
        +'<button class="vote-btn disagree'+(myVote==='disagree'?' selected':'')+'" data-action="vote-disagree" aria-label="Disagree"><i class="fas fa-thumbs-down"></i><span>'+disagree+'</span></button>'
      +'</div>'
      +'<div class="card-header" style="display:flex;justify-content:flex-end;border:none;padding:0.5rem 1rem 1rem 1rem">'
        +'<a href="#" class="open-modal" data-action="open">View Details</a>'
      +'</div>'
      +'</div>'
    );
  }).join('');
  container.innerHTML = html;
}

function getUserId() {
  const u = firebase.auth().currentUser;
  if (u && u.uid) return u.uid;
  try {
    const key = 'credinews_guest_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'guest_' + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return 'guest_' + Math.random().toString(36).slice(2) + Date.now();
  }
}

function openResultModal(data) {
  const score = Number(data.credibilityScore || 0);
  const label = data.label || '';
  const level = (function(){
    const l = String(label || '').toLowerCase();
    if (l.includes('low')) return 'low';
    if (l.includes('high') || l.includes('credible')) return 'high';
    if (l.includes('mixed')) return 'medium';
    if (l.includes('unverified')) return 'neutral';
    return 'medium';
  })();
  const credibilityTop = '<div class="card-score"><span class="score-badge '+scoreClass(label)+'">'+score+'% • '+safeText(label)+'</span></div>';
  const pageRow = '<div style="margin-bottom:8px"><strong>'+(String(data.url||'').toLowerCase().includes('facebook.com')?'FB Page':'Web Page')+':</strong> '+safeText(data.pageName || data.sourceName || getSourceName(data.url) || '')+'</div>';
  const explanationBlock = (data.explanation ? ('<div class="analyzed-block"><div class="block-title">Explanation</div><div>'+safeText(decodeEntities(data.explanation))+'</div></div>') : '');
  const slangBlock = (Array.isArray(data.slang_detected) && data.slang_detected.length ? ('<div style="margin-bottom:8px"><strong>Slang Detected:</strong><div class="slang-list">'+data.slang_detected.map(function(s){ return '<span class="slang-chip">'+safeText(s)+'</span>'; }).join('')+'</div></div>') : '');
  const sourcesRow = '<div style="margin-bottom:8px"><strong>Sources:</strong> '+Number(data.sourcesFound || 0)+'</div>';
  const factsRow = '<div style="margin-bottom:8px"><strong>Fact Checks:</strong> '+Number(data.factChecks || 0)+'</div>';
  const urlRow = (data.url ? '<div style="margin-bottom:8px"><strong>URL:</strong> <a href="'+safeText(data.url)+'" target="_blank" rel="noopener">'+safeText(data.url)+'</a></div>' : '');
  const analyzedBlock = (data.analyzedText ? ('<div class="analyzed-block '+level+'"><div class="block-title">Analyzed Text</div><div>'+safeText(decodeEntities(data.analyzedText))+'</div></div>') : '');
  const reviewedBlock = (Array.isArray(data.reviewedClaims) && data.reviewedClaims.length ? ('<div class="reviewed-claims"><h4 class="reviewed-title">Reviewed Claims</h4><ul class="reviewed-claims-list">'+data.reviewedClaims.slice(0,6).map(function(c){ return '<li class="reviewed-claim-item">' + '<div><strong>Claim:</strong> '+safeText(c.claim || c.text || '')+'</div>' + '<div><strong>Reviewer:</strong> '+safeText(c.reviewer || (c.publisher && c.publisher.name) || 'Unknown')+'</div>' + '<div><strong>Rating:</strong> '+safeText(c.rating || c.textualRating || 'Unrated')+'</div>' + (c.url ? '<div><a href="'+safeText(c.url)+'" target="_blank" rel="noopener">View fact check</a></div>' : '') + '</li>'; }).join('') + '</ul></div>') : '');
  const analyzedTime = (data.analyzed_at ? ('<div style="margin-top:8px"><strong>Analyzed Time:</strong> '+formatTimestamp(data.analyzed_at)+'</div>') : '');
  const html = '<div>'+credibilityTop+pageRow+slangBlock+sourcesRow+factsRow+urlRow+analyzedBlock+explanationBlock+analyzedTime+reviewedBlock+'</div>';
  ensureModal('Verification Result', html);
}

function formatTimestamp(ts) {
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (ts && ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts).toLocaleString();
  } catch (e) {}
  return '';
}

function updatePaginationUI(){
  if (pageInfo) pageInfo.textContent = 'Page ' + currentPage;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = !hasMore;
}

async function fetchPage(page){
  if (!container) return;
  const db = firebase.firestore();
  let q = db.collection('facebook_verification_results').orderBy('analyzed_at', 'desc').limit(pageSize);
  if (page > 1) {
    const cursor = pageLastDocs[page - 1];
    if (cursor) q = q.startAfter(cursor);
  }
  const snap = await q.get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allDocs = docs;
  const uid = getUserId();
  applyFiltersAndRender(uid);
  pageLastDocs[page] = snap.docs.length ? snap.docs[snap.docs.length - 1] : (pageLastDocs[page] || null);
  currentPage = page;
  hasMore = snap.docs.length === pageSize;
  updatePaginationUI();
}

async function start() {
  if (!container) return;
  await fetchPage(1);
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
  if (prevBtn) {
    prevBtn.addEventListener('click', function(){
      if (currentPage > 1) fetchPage(currentPage - 1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function(){
      if (hasMore) fetchPage(currentPage + 1);
    });
  }
}

document.addEventListener('click', async function(e){
  const card = e.target.closest('.trend-card');
  if (!card) return;
  const id = card.dataset.id;
  const actionEl = e.target.closest('[data-action]');
  const action = actionEl ? actionEl.dataset.action : '';
  if (!id || !action) return;
  const db = firebase.firestore();
  const docRef = db.collection('facebook_verification_results').doc(id);
  if (action === 'open') {
    const snap = await docRef.get();
    if (snap.exists) openResultModal(snap.data());
    e.preventDefault();
    return;
  }
  if (action === 'vote-agree' || action === 'vote-disagree') {
    const uid = getUserId();
    const voteType = action === 'vote-agree' ? 'agree' : 'disagree';
    const snap = await docRef.get();
    const data = snap.exists ? snap.data() : {};
    const fb = data.feedback || {};
    const voters = Array.isArray(fb.voters) ? fb.voters : [];
    if (voters.includes(uid)) return;
    const inc = firebase.firestore.FieldValue.increment(1);
    const add = firebase.firestore.FieldValue.arrayUnion(uid);
    if (voteType === 'agree') {
      await docRef.update({ 'feedback.voters': add, 'feedback.agreeCount': inc });
    } else {
      await docRef.update({ 'feedback.voters': add, 'feedback.disagreeCount': inc });
    }
    const agreeEl = card.querySelector('.vote-count[data-count="agree"]');
    const disagreeEl = card.querySelector('.vote-count[data-count="disagree"]');
    const agreeBtn = card.querySelector('.btn-agree');
    const disagreeBtn = card.querySelector('.btn-disagree');
    const a = Number(agreeEl.textContent || 0);
    const d = Number(disagreeEl.textContent || 0);
    if (voteType === 'agree') {
      agreeEl.textContent = String(a + 1);
    } else {
      disagreeEl.textContent = String(d + 1);
    }
    agreeBtn.classList.add('voted');
    disagreeBtn.classList.add('voted');
    agreeBtn.setAttribute('disabled', 'true');
    disagreeBtn.setAttribute('disabled', 'true');
  }
});

if (window.firebase && firebase.firestore) {
  if (firebase.auth().currentUser) {
    start();
  } else {
    firebase.auth().onAuthStateChanged(function(){ start(); });
  }
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
    const m = (url || '').match(/facebook\.com\/([A-Za-z0-9._-]+)/i);
    if (m && m[1]) return m[1].replace(/[-_]+/g, ' ');
    return 'Unknown Source';
  }
}
