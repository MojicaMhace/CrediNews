const container = document.getElementById('trends-feed-container');
const searchInput = document.getElementById('trends-search');
const sortSelect = document.getElementById('trends-sort');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const prevBtnTop = document.getElementById('prev-page-top');
const nextBtnTop = document.getElementById('next-page-top');
const pageInfoTop = document.getElementById('page-info-top');
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
    const score = Number(item.credibilityScore || 0);
    const labelText = String(item.label || (score >= 75 ? 'CREDIBLE' : (score >= 50 ? 'MIXED' : 'UNVERIFIED'))).toUpperCase();
    
    var labelClass = 'hl-neutral';
    if (labelText.includes('CREDIBLE') || labelText.includes('HIGH')) labelClass = 'hl-good';
    else if (labelText.includes('MIXED')) labelClass = 'hl-mixed';
    else if (labelText.includes('LOW')) labelClass = 'hl-bad';
    else if (labelText.includes('UNVERIFIED') || labelText.includes('NEUTRAL')) labelClass = 'hl-neutral';

    const fb = item.feedback || {};
    const agreeCount = fb.agreeCount || 0;
    const disagreeCount = fb.disagreeCount || 0;
    
    // Check votes
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

    // Show Image with robust field fallback
    const imgSrc = item.imageUrl || item.image_url || item.image || item.postImage || '';
    const imageHtml = imgSrc
      ? '<div class="trend-image-container"><img src="'+safeText(imgSrc)+'" alt="Trend Image" loading="lazy" style="width:100%; height:180px; object-fit:cover;"></div>'
      : '';

    card.innerHTML = (
      imageHtml +
      '<div class="trend-content">'
        +'<div>'
            +'<div class="trend-label '+labelClass+'">'+safeText(labelText)+'</div>'
            +'<p class="trend-text">"'+safeText(shorten(decodeEntities(item.analyzedText || item.claim || ''), 150))+'"</p>'
        +'</div>'
        +'<div class="trend-footer">'
          // FIX: Removed inline JSON.parse (which breaks modals). Added data-action="open".
          +'<button class="footer-view-link" data-action="open">View details</button>'
          +'<div class="trend-actions">'
            +'<button class="'+agreeClass+'" data-action="vote-agree" '+disabledAttr+'><i class="fas fa-thumbs-up"></i><span>'+agreeCount+'</span></button>'
            +'<button class="'+disagreeClass+'" data-action="vote-disagree" '+disabledAttr+'><i class="fas fa-thumbs-down"></i><span>'+disagreeCount+'</span></button>'
          +'</div>'
        +'</div>'
      +'</div>'
    );
    container.appendChild(card);
  });

  // Re-attach listeners/updates if needed (Async vote check logic remains same)
  if (window.firebase && firebase.firestore) {
    const db = firebase.firestore();
    const cards = Array.from(container.querySelectorAll('.trend-card'));
    cards.forEach(async (c) => {
      const id = c.getAttribute('data-id');
      if (!id) return;
      try {
        const vSnap = await db.collection('facebook_verification_results').doc(id).collection('votes').doc(uid).get();
        if (vSnap.exists) {
          const t = (vSnap.data() || {}).type;
          const agreeBtn = c.querySelector('.vote-btn.agree');
          const disagreeBtn = c.querySelector('.vote-btn.disagree');
          if (t === 'agree') agreeBtn && agreeBtn.classList.add('selected');
          if (t === 'disagree') disagreeBtn && disagreeBtn.classList.add('selected');
          if (agreeBtn) agreeBtn.disabled = true;
          if (disagreeBtn) disagreeBtn.disabled = true;
        }
      } catch(_e) {}
    });
  }
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
  
  let textPanelClass = 'neutral';
  if (ps === 'high' || ps === 'good') textPanelClass = 'trust';
  else if (ps === 'low' || ps === 'bad') textPanelClass = 'risk';
  else if (ps === 'medium' || ps === 'mixed') textPanelClass = 'mixed';

  const hl = (function(l){
    const t = String(l||'').toLowerCase();
    if (t.includes('credible') || t.includes('high')) return 'hl-good';
    if (t.includes('mixed')) return 'hl-mixed';
    if (t.includes('unverified') || t.includes('neutral')) return 'hl-neutral';
    if (t.includes('low')) return 'hl-bad';
    return 'hl-neutral';
  })(label);

  const summary = (function(s){ 
      if (s>=75) return 'The content aligns with verified information.'; 
      if (s>=55) return 'Contains both reliable and questionable information.'; 
      if (s>=46) return 'Insufficient evidence to verify. Proceed with caution.'; 
      return 'May contain misleading information.'; 
  })(score);

  const slangList = Array.isArray(data.slang_detected) ? data.slang_detected : [];
  const sarcasmScore = (typeof data.sarcasmPercent === 'number') ? data.sarcasmPercent : 
                       (typeof data.sarcasmScore === 'number') ? data.sarcasmScore : 0;
  const riskLabel = data.sarcasmRisk || (sarcasmScore > 0 ? 'Potential sarcasm detected' : 'Low – Not enough slang to indicate sarcasm.');

  const slangPanelHtml = 
    '<div class="panel metrics">'
      +'<div class="panel-title"><span class="label">Slang Detection</span></div>'
      +'<ul>'
        +'<li>'+(slangList.length > 0 ? '<strong>Slang Words Detected:</strong> '+safeText(slangList.join(', ')) : '<em>No slang words detected.</em>')+'</li>'
        +'<li><strong>Sarcasm Score:</strong> '+sarcasmScore+'%</li>'
        +'<li><strong>Risk:</strong> '+safeText(riskLabel)+'</li>'
      +'</ul>'
    +'</div>';

  const explainText = data.explanation || data.aiExplanation || '';
  const explanationPanelHtml = explainText 
    ? '<div class="panel trust"><div class="panel-title"><span class="label">Explanation</span></div><p>'+safeText(decodeEntities(explainText))+'</p></div>' 
    : '';

  let poserHtml = '';
  if (data.poserDetection) {
      poserHtml = buildPoserHtmlFromSaved(data.poserDetection);
  } else if (data.poserHtml) {
      poserHtml = data.poserHtml;
  }

  // --- CLAIMS LOGIC FIX ---
  // Combine all claims, ensuring Zyla claims are included
  const rawClaims = data.reviewedClaims || [];
  let displayClaims = [];
  
  if (rawClaims.length > 0) {
      // Prioritize: Google first, then Zyla/ML
      const googleClaims = rawClaims.filter(c => String(c.source||'').toLowerCase() === 'google');
      const otherClaims = rawClaims.filter(c => String(c.source||'').toLowerCase() !== 'google');
      // Show Google claims + Zyla claims (up to 6 total)
      displayClaims = [...googleClaims, ...otherClaims].slice(0, 6);
  }

  const claimsHtml = displayClaims.length > 0
    ? ('<div class="panel trust"><div class="panel-title"><span class="label">Reviewed Claims</span></div><ul>' +
        displayClaims.map(function(c){ 
            return '<li><div><strong>Claim:</strong> '+safeText(c.claim || c.text || '')+'</div>'
                 + '<div><strong>Reviewer:</strong> '+safeText(c.reviewer || (c.publisher && c.publisher.name) || 'Unknown')+'</div>'
                 + '<div><strong>Rating:</strong> '+safeText(c.rating || c.textualRating || 'Unrated')+'</div>' 
                 + (c.url ? '<div><a href="'+safeText(c.url)+'" target="_blank" rel="noopener">View fact check</a></div>' : '') + '</li>'; 
        }).join('') 
      + '</ul></div>') 
    : '';

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
      +'<div class="panel '+textPanelClass+'"><div class="panel-title"><span class="label">Analyzed Text</span></div>'
      +(data.analyzedText ? '<div style="max-height: 200px; overflow-y: auto; white-space: pre-wrap;"><p>'+safeText(decodeEntities(data.analyzedText))+'</p></div>' : '<p>No text provided.</p>')+'</div>'
      
      +'<div class="panel metrics"><div class="panel-title"><span class="label">Metrics</span></div>'
        +'<ul>'
          +'<li><strong>Source:</strong> '+safeText(data.pageName || data.sourceName || getSourceName(data.url) || '')+'</li>'
          +'<li><strong>Sources Found:</strong> '+Number(data.sourcesFound || data.sources || 0)+'</li>'
          +'<li><strong>Fact Checks:</strong> '+Number(data.factChecks || 0)+'</li>'
          +'<li><strong>Analyzed At:</strong> '+safeText(formatTimestamp(data.analyzed_at || data.analyzedAt))+'</li>'
          +(data.url ? '<li><strong>URL:</strong> <span class="url-value">'+safeText(data.url)+'</span></li>' : '')
        +'</ul>'
      +'</div>'
    +'</div>'

    + explanationPanelHtml
    + slangPanelHtml
    + claimsHtml
    + poserHtml
    
  +'</div>';

  ensureModal('Verification Result', resultHtml);
  
  if (!poserHtml && window.appendPoserDetectionIfAvailable) {
      appendPoserDetectionIfAvailable(data);
  }
}

// [ADD THIS HELPER FUNCTION to trends.js]
function buildPoserHtmlFromSaved(pd) {
    if (!pd) return '';
    try {
        // Handle structure saved in verify-news.js
        const score = Number(pd.trustScore || pd.score || 0);
        const verdict = pd.verdict || 'Unknown';
        const name = pd.name || 'Unknown Page';
        
        // Determine Color based on score/risk logic
        const color = (score >= 80 ? '#22c55e' : (score >= 55 ? '#f59e0b' : '#ef4444'));
        
        // Extract AI Explanation if available in raw data
        let aiText = '';
        if (pd.raw && pd.raw.analysis) {
            const an = pd.raw.analysis;
            // Prefer short AI explanation
            aiText = an.ai_explanation || (an.breakdown && an.breakdown.ai_explanation) || '';
        }
        
        // Extract Badge/Registry info if available
        let subtext = name;
        if (pd.raw && pd.raw.metadata) {
            const m = pd.raw.metadata;
            if (m.verification_source === 'verified_registry' || m.is_verified) {
                subtext += ' | Verified Source';
            } else if (m.followers_count) {
                subtext += ` | ${Number(m.followers_count).toLocaleString()} followers`;
            }
        }

        // Return HTML matching the CSS structure defined in trends.css
        return `
            <div class="source-risk-card" style="border-left-color: ${color};">
                <h4>Source Risk (Poser Detection)</h4>
                <div class="source-risk-body">
                    <div class="risk-score-circle" style="background: ${color}20; color: ${color};">
                        ${Math.round(score)}%
                    </div>
                    <div class="risk-details">
                        <div class="risk-verdict">${safeText(verdict)}</div>
                        <div class="risk-subtext">${safeText(subtext)}</div>
                        ${aiText ? `<div class="risk-explanation">${safeText(aiText)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error("Error building poser HTML:", e);
        return '';
    }
}

function formatTimestamp(ts) {
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (ts && ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts).toLocaleString();
  } catch (e) {}
  return '';
}

// --- Poser Detection Integration ---
function derivePosterIdFromUrl(u) {
  try {
    const url = new URL(u);
    const id = url.searchParams.get('id');
    if (url.pathname.includes('/profile.php') && id) return id;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 1) {
      const numeric = parts.find(p => /^\d{5,}$/.test(p));
      return numeric || parts[parts.length - 1];
    }
    return url.hostname;
  } catch (_) {
    return (u || '').trim();
  }
}

function extractFacebookPageUrl(u) {
  try {
    if (!u) return '';
    const url = new URL(u);
    if (!url.hostname.includes('facebook.com')) return '';
    const path = url.pathname;
    if (path.includes('/story.php') || path.includes('/permalink.php')) {
      const id = url.searchParams.get('id');
      if (id) return `https://www.facebook.com/${id}`;
    }
    const stopWords = ['/posts/', '/videos/', '/photos/', '/reel/'];
    for (const stop of stopWords) {
      const idx = path.indexOf(stop);
      if (idx > 1) {
        const base = path.substring(0, idx);
        return `${url.protocol}//${url.hostname}${base}`;
      }
    }
    return `${url.protocol}//${url.hostname}${path}`;
  } catch (_) {
    return (u || '').split('?')[0];
  }
}

async function appendPoserDetectionIfAvailable(data) {
  if (!(window.firebase && firebase.firestore)) return;
  const db = firebase.firestore();
  const baseUrl = data.url ? extractFacebookPageUrl(data.url) : '';
  const posterId = baseUrl ? derivePosterIdFromUrl(baseUrl) : '';
  if (!posterId && !baseUrl) return;

  try {
    let snap;
    if (posterId) {
      snap = await db.collection('poser_detections').where('poster_id', '==', posterId).limit(1).get();
    }
    if ((!snap || snap.empty) && baseUrl) {
      snap = await db.collection('poser_detections').where('input', '==', baseUrl).limit(1).get();
    }
    if (!snap || snap.empty) return;
    const doc = snap.docs[0];
    const det = doc.data() || {};
    const analysis = det.analysis || det || {};
    const breakdown = analysis.breakdown || {};
    const aiScore = typeof breakdown.ai_score === 'number' ? breakdown.ai_score : (
      typeof analysis.ai_score === 'number' ? analysis.ai_score : null
    );
    const aiVerdict = breakdown.ai_verdict || (typeof aiScore === 'number' ? (aiScore >= 70 ? 'Likely Poser' : (aiScore <= 30 ? 'Likely Authentic' : 'Mixed Signals')) : '');
    const aiExplanation = breakdown.ai_explanation || analysis.ai_explanation || analysis.human_explanation || '';
    const finalTrust = typeof analysis.final_trust_score === 'number' ? analysis.final_trust_score : null;
    const panelType = (aiVerdict || '').toLowerCase().includes('poser') ? 'risk' : 'trust';

    const html = (
      '<div class="panel '+panelType+'">'
        +'<div class="panel-title"><span class="label">Poser Detection (AI Agent)</span></div>'
        +'<ul>'
          +(typeof aiScore === 'number' ? ('<li><strong>AI Risk:</strong> '+aiScore+'/100</li>') : '')
          +(aiVerdict ? ('<li><strong>AI Verdict:</strong> '+safeText(aiVerdict)+'</li>') : '')
          +(finalTrust !== null ? ('<li><strong>Final Trust Score:</strong> '+finalTrust+'/100</li>') : '')
        +'</ul>'
        +(aiExplanation ? ('<p>'+safeText(decodeEntities(aiExplanation))+'</p>') : '')
      +'</div>'
    );

    const body = document.querySelector('.modal-body.dark');
    if (body) {
      body.insertAdjacentHTML('beforeend', html);
    }
  } catch (_) {}
}

function updatePaginationUI(){
  if (pageInfo) pageInfo.textContent = 'Page ' + currentPage;
  if (pageInfoTop) pageInfoTop.textContent = 'Page ' + currentPage;
  const prevDisabled = currentPage <= 1;
  const nextDisabled = !hasMore;
  if (prevBtn) prevBtn.disabled = prevDisabled;
  if (nextBtn) nextBtn.disabled = nextDisabled;
  if (prevBtnTop) prevBtnTop.disabled = prevDisabled;
  if (nextBtnTop) nextBtnTop.disabled = nextDisabled;
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
  if (prevBtnTop) {
    prevBtnTop.addEventListener('click', function(){
      if (currentPage > 1) fetchPage(currentPage - 1);
    });
  }
  if (nextBtnTop) {
    nextBtnTop.addEventListener('click', function(){
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
            if (!snap.exists) return;

            const voteRef = docRef.collection('votes').doc(uid);
            const vSnap = await tx.get(voteRef);
            if (vSnap.exists) return;

            const data = snap.data();
            const fb = data.feedback || { agreeCount: 0, disagreeCount: 0, voters: {} };
            if (Array.isArray(fb.voters) || !fb.voters) fb.voters = {};
            if (fb.voters[uid]) return;

            if (voteType === 'agree') fb.agreeCount = Number(fb.agreeCount || 0) + 1;
            else fb.disagreeCount = Number(fb.disagreeCount || 0) + 1;

            fb.voters[uid] = voteType;
            tx.update(docRef, { feedback: fb });
            tx.set(voteRef, { type: voteType, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
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
