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

function getPoserStyleClass(score) {
  const s = Number(score || 0);
  if (s >= 75) return 'high';
  if (s >= 50) return 'medium';
  return 'low';
}

function styleClassByLabel(label){
  const t = String(label || '').trim().toLowerCase();
  if (!t) return 'neutral';
  if (t.includes('credible') || t.includes('high')) return 'high';
  if (t.includes('mixed') || t.includes('medium')) return 'medium';
  if (t.includes('unverified') || t.includes('neutral')) return 'neutral';
  if (t.includes('low')) return 'low';
  return 'neutral';
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
  renderCards(docs);
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

function renderCards(data) {
  const container = document.getElementById('trends-feed-container');
  if (!container) return;
  container.innerHTML = '';

  if (data.length === 0) {
    container.innerHTML = '<p class="no-results" style="color:#cbd5e1; text-align:center; padding:20px;">No verified trends found.</p>';
    return;
  }

  const uid = getUserId();

  data.forEach(function(item){
    const dataStr = encodeURIComponent(JSON.stringify(item));
    const score = Number(item.credibilityScore || 0);

    const labelText = String(item.label || (score >= 75 ? 'CREDIBLE' : (score >= 50 ? 'MIXED' : 'UNVERIFIED'))).toUpperCase();
    var labelClass = 'hl-neutral';
    if (score >= 75) labelClass = 'hl-good';
    else if (score >= 50) labelClass = 'hl-neutral';
    else if (score > 0) labelClass = 'hl-bad';
    if (labelText === 'UNVERIFIED') labelClass = 'hl-neutral';

    const fb = item.feedback || {};
    const agreeCount = fb.agreeCount || 0;
    const disagreeCount = fb.disagreeCount || 0;
    var userVote = null;
    if (fb.voters && typeof fb.voters === 'object' && !Array.isArray(fb.voters)) {
      userVote = fb.voters[uid];
    } else if (Array.isArray(fb.voters) && fb.voters.includes(uid)) {
      userVote = 'legacy';
    }
    const isVoted = !!userVote;
    const agreeClass = (userVote === 'agree') ? 'vote-btn agree selected' : 'vote-btn agree';
    const disagreeClass = (userVote === 'disagree') ? 'vote-btn disagree selected' : 'vote-btn disagree';
    const disabledAttr = isVoted ? 'disabled' : '';

    const card = document.createElement('div');
    card.className = 'trend-card';
    if (item.id) card.setAttribute('data-id', item.id);

    const imageHtml = item.imageUrl ? '<div class="trend-image-container"><img src="'+safeText(item.imageUrl)+'" alt="Trend Image" loading="lazy"></div>' : '';

    card.innerHTML = (
      imageHtml+
      '<div class="trend-content">'
        +'<div>'
            +'<div class="trend-label '+labelClass+'">'+safeText(labelText)+'</div>'
            +'<p class="trend-text">"'+safeText(decodeEntities(item.analyzedText || item.claim || ''))+'"</p>'
        +'</div>'
        +'<div class="trend-footer">'
          +'<button class="footer-view-link" onclick="openResultModal(JSON.parse(decodeURIComponent(\''+dataStr+'\')))">View details</button>'
          +'<div class="trend-actions">'
            +'<button class="'+agreeClass+'" data-action="vote-agree" '+disabledAttr+'><i class="fas fa-thumbs-up"></i><span>'+agreeCount+'</span></button>'
            +'<button class="'+disagreeClass+'" data-action="vote-disagree" '+disabledAttr+'><i class="fas fa-thumbs-down"></i><span>'+disagreeCount+'</span></button>'
          +'</div>'
        +'</div>'
      +'</div>'
    );
    container.appendChild(card);
  });

  if (typeof attachVoteListeners === 'function') attachVoteListeners();
}

function attachVoteListeners(){}

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
  const ps = styleClassByLabel(label);
  const hl = (function(l){
    const t = String(l||'').toLowerCase();
    if (t.includes('credible') || t.includes('high')) return 'hl-good';
    if (t.includes('mixed') || t.includes('unverified') || t.includes('neutral')) return 'hl-neutral';
    if (t.includes('low')) return 'hl-bad';
    return 'hl-neutral';
  })(label);
  const summary = (function(s){ if (s>=75) return 'The content aligns with verified information.'; if (s>=55) return 'Contains both reliable and questionable information.'; if (s>=46) return 'Insufficient evidence to verify. Proceed with caution.'; return 'May contain misleading information.'; })(score);
  const resultHtml = '<div class="verification-result">'
    +'<div class="result-header">'
      +'<div class="platform-badge"><i class="fab fa-facebook"></i><span>Facebook Analysis</span></div>'
      +'<div class="content-type">Post</div>'
    +'</div>'
    +'<div class="summary-band '+ps+'">'
      +'<div class="score-donut '+ps+'" style="--pct:'+score+'">'
        +'<div class="inner"><div class="num">'+score+'</div><div class="pct">%</div></div>'
      +'</div>'
      +'<div class="summary-text">'
        +'<div class="classification-row"><span class="risk-icon '+ps+'"><i class="fas fa-shield-alt"></i></span><h3 class="'+hl+'">'+safeText(label || '')+'</h3></div>'
        +'<div class="accent-bar '+ps+'"></div>'
        +'<p>'+summary+'</p>'
      +'</div>'
    +'</div>'
    +'<div class="panels-row">'
      +'<div class="panel trust"><div class="panel-title"><span class="label">Analyzed Content</span></div>'+(data.analyzedText ? '<p>'+safeText(decodeEntities(data.analyzedText))+'</p>' : '<p>No text provided.</p>')+'</div>'
      +'<div class="panel metrics"><div class="panel-title"><span class="label">Metrics</span></div>'
        +'<ul>'
          +'<li><strong>Source:</strong> '+safeText(data.pageName || data.sourceName || getSourceName(data.url) || '')+'</li>'
          +'<li><strong>Fact Checks:</strong> '+Number(data.factChecks || 0)+'</li>'
          +(data.analyzed_at ? '<li><strong>Analyzed Date:</strong> '+formatTimestamp(data.analyzed_at)+'</li>' : '')
          +(data.url ? '<li><strong>URL:</strong> <span class="url-value">'+safeText(data.url)+'</span></li>' : '')
        +'</ul>'
      +'</div>'
    +'</div>'
    +(data.explanation ? '<div class="panel trust"><div class="panel-title"><span class="label">AI Analysis Explanation</span></div><p>'+safeText(decodeEntities(data.explanation))+'</p></div>' : '')
    +(Array.isArray(data.reviewedClaims) && data.reviewedClaims.length ? ('<div class="panel trust"><div class="panel-title"><span class="label">Reviewed Claims</span></div><ul>'+data.reviewedClaims.slice(0,6).map(function(c){ return '<li><div><strong>Claim:</strong> '+safeText(c.claim || c.text || '')+'</div><div><strong>Reviewer:</strong> '+safeText(c.reviewer || (c.publisher && c.publisher.name) || 'Unknown')+'</div><div><strong>Rating:</strong> '+safeText(c.rating || c.textualRating || 'Unrated')+'</div>' + (c.url ? '<div><a href="'+safeText(c.url)+'" target="_blank" rel="noopener">View fact check</a></div>' : '') + '</li>'; }).join('') + '</ul></div>') : '')
  +'</div>';
  ensureModal('Verification Result', resultHtml);
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
    
    // Use a transaction to safely handle the Array-to-Map migration
    try {
        await firebase.firestore().runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            if (!snap.exists) return; // Document doesn't exist

            const data = snap.data();
            // Get existing feedback or initialize defaults
            const fb = data.feedback || { agreeCount: 0, disagreeCount: 0, voters: {} };
            
            // MIGRATION FIX: If voters is an Array (old data) or missing, reset it to an empty Object
            if (Array.isArray(fb.voters) || !fb.voters) {
                fb.voters = {};
            }

            // Check if this user already voted in the new Map
            if (fb.voters[uid]) return;

            // Update the counts
            if (voteType === 'agree') {
                fb.agreeCount = Number(fb.agreeCount || 0) + 1;
            } else {
                fb.disagreeCount = Number(fb.disagreeCount || 0) + 1;
            }

            // Save the vote in the Map
            fb.voters[uid] = voteType;

            // Write back to Firestore
            tx.update(docRef, { feedback: fb });
        });

        // --- Update UI Immediately (Optimistic Update) ---
        const agreeBtn = card.querySelector('.vote-btn.agree');
        const disagreeBtn = card.querySelector('.vote-btn.disagree');
        
        const agreeSpan = agreeBtn.querySelector('span');
        const disagreeSpan = disagreeBtn.querySelector('span');

        const currentAgree = Number(agreeSpan.textContent || 0);
        const currentDisagree = Number(disagreeSpan.textContent || 0);

        if (voteType === 'agree') {
            agreeSpan.textContent = String(currentAgree + 1);
            agreeBtn.classList.add('selected');
        } else {
            disagreeSpan.textContent = String(currentDisagree + 1);
            disagreeBtn.classList.add('selected');
        }

        // Disable buttons to prevent spam
        agreeBtn.disabled = true;
        disagreeBtn.disabled = true;

    } catch (e) {
        console.error("Vote failed:", e);
    }
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
