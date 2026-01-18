// Global variables
const container = document.getElementById('myv-feed');
const searchInput = document.getElementById('myv-search');
const sortSelect = document.getElementById('myv-sort');
let allDocs = [];
let currentQuery = '';
let currentSort = 'date_desc';
let currentUserID = null; // Store globally for access in event listeners

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

function formatTimestamp(ts) {
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (ts && ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    if (typeof ts === 'string') return new Date(ts).toLocaleString();
  } catch (e) {}
  return '';
}

function tsMillis(ts) {
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts && ts.seconds) return ts.seconds * 1000;
    if (typeof ts === 'number') return ts;
  } catch (e) {}
  return 0;
}

function getSourceName(url, pageName) {
    if (pageName) return pageName;
    try {
      if (!url) return 'Unknown Source';
      const u = String(url);
      const lower = u.toLowerCase();
      const parsed = new URL(u);
      const host = parsed.hostname.replace(/^www\./, '');
      if (lower.includes('facebook.com')) {
        const seg = parsed.pathname.split('/').filter(Boolean)[0] || '';
        if (seg && !['watch', 'share', 'groups', 'events'].includes(seg)) {
             return seg.replace(/[-_]+/g, ' ');
        }
        return 'Facebook';
      }
      return host;
    } catch (e) {
      return 'Unknown Source';
    }
}

// --- LOGIC: Label & Badge Handling ---
function labelBadge(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('low credibility') || l === 'low') return '<span class="badge badge-danger">'+safeText(label || 'Low Credibility')+'</span>';
  if (l.includes('credible')) return '<span class="badge badge-verified">'+safeText(label || 'Credible')+'</span>';
  if (l.includes('mixed')) return '<span class="badge badge-warning">'+safeText(label || 'Mixed')+'</span>';
  return '<span class="badge badge-neutral">'+safeText(label || 'Unverified')+'</span>';
}

function getLabelFromScore(score) {
    const s = Number(score);
    if (isNaN(s)) return 'Unverified';
    if (s >= 80) return 'Credible';
    if (s >= 60) return 'Likely Credible';
    if (s >= 40) return 'Mixed / Unverified';
    return 'Low Credibility';
}

// --- DATABASE: VOTING LOGIC (STRICT ONE VOTE PER USER) ---
async function handleVote(docId, voteType) {
    if (!currentUserID) return;
    const db = firebase.firestore();
    const docRef = db.collection('facebook_verification_results').doc(docId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (!doc.exists) return;

            const data = doc.data();
            const feedback = data.feedback || { agreeCount: 0, disagreeCount: 0, voters: {} };
            const voters = feedback.voters || {};
            
            // Check previous vote
            const previousVote = voters[currentUserID];

            // 1. Remove previous vote counts (Clean slate logic)
            if (previousVote === 'agree') {
                feedback.agreeCount = Math.max(0, (feedback.agreeCount || 0) - 1);
            } else if (previousVote === 'disagree') {
                feedback.disagreeCount = Math.max(0, (feedback.disagreeCount || 0) - 1);
            }

            // 2. Determine new state
            if (previousVote === voteType) {
                // Scenario: Clicked same button -> Toggle OFF (remove vote)
                delete voters[currentUserID];
            } else {
                // Scenario: New vote OR Switch vote -> ADD NEW COUNT
                if (voteType === 'agree') {
                    feedback.agreeCount = (feedback.agreeCount || 0) + 1;
                } else if (voteType === 'disagree') {
                    feedback.disagreeCount = (feedback.disagreeCount || 0) + 1;
                }
                voters[currentUserID] = voteType;
            }

            feedback.voters = voters;

            transaction.update(docRef, { feedback: feedback });
        });
    } catch (e) {
        console.error("Vote failed:", e);
    }
}

// --- MODAL (View Details) ---
function ensureModal(title, html) {
  const existing = document.querySelector('.modal-overlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box dark';
  box.innerHTML = `
    <div class="modal-header dark">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close">×</button>
    </div>
    <div class="modal-body dark">${html}</div>
    <div class="modal-footer dark">
        <button class="modal-button">Close</button>
    </div>`;
  
  overlay.appendChild(box);
  function close(){ overlay.remove(); }
  box.querySelector('.modal-close').addEventListener('click', close);
  box.querySelector('.modal-button').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}

// --- HELPER FUNCTIONS FOR MODAL ---
function styleClassByLabel(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('low') || l.includes('fake')) return 'low';
  if (l.includes('credible') || l.includes('high')) return 'high';
  if (l.includes('mixed')) return 'medium';
  return 'neutral';
}

function buildExplanationItems(explanation, details) {
  const items = [];
  try {
    const s = String(explanation || '').trim();
    const parts = s.split(/Details:\s*/i);
    const main = (parts[0] || '').trim();
    if (main) items.push(main);
    let extra = Array.isArray(details) ? details.slice() : [];
    if (extra.length === 0 && parts.length > 1) {
      extra = parts[1].split(/\s*\.\s+|\s*[\n\-•]\s*/).map(function(x){ return x.trim(); }).filter(Boolean);
    }
    for (var i = 0; i < extra.length; i++) {
      var t = String(extra[i] || '').trim();
      if (!t) continue;
      if (!/(^|\b)Verified source\b/i.test(t)) items.push(t);
    }
  } catch (_) {}
  return items;
}

function buildPoserHtmlFromSaved(pd) {
    if (!pd) return '';
    try {
        const score = Number(pd.trustScore || pd.score || 0);
        const verdict = pd.verdict || 'Unknown';
        const name = pd.name || 'Unknown Page';
        const color = (score >= 80 ? '#22c55e' : (score >= 55 ? '#f59e0b' : '#ef4444'));
        
        let aiText = '';
        if (pd.raw && pd.raw.analysis) {
            const an = pd.raw.analysis;
            aiText = an.ai_explanation || (an.breakdown && an.breakdown.ai_explanation) || '';
        }
        
        let subtext = name;
        if (pd.raw && pd.raw.metadata) {
            const m = pd.raw.metadata;
            if (m.verification_source === 'verified_registry' || m.is_verified) {
                subtext += ' | Verified Source';
            } else if (m.followers_count) {
                subtext += ` | ${Number(m.followers_count).toLocaleString()} followers`;
            }
        }

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

function openResultModal(data) {
  const score = Number(data.credibilityScore || 0);
  const label = data.label || getLabelFromScore(score);
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
  const explanationItems = buildExplanationItems(explainText, data && data.details);
  const explanationPanelHtml = explanationItems.length
    ? '<div class="panel metrics"><div class="panel-title"><span class="label">Explanation</span></div><ul>' + explanationItems.map(function(i){ return '<li>'+safeText(decodeEntities(i))+'</li>'; }).join('') + '</ul></div>'
    : '';

  let poserHtml = '';
  if (data.poserDetection) {
      poserHtml = buildPoserHtmlFromSaved(data.poserDetection);
  } else if (data.poserHtml) {
      poserHtml = data.poserHtml;
  }

  const rawClaims = data.reviewedClaims || [];
  let displayClaims = [];
  if (rawClaims.length > 0) {
      const googleClaims = rawClaims.filter(c => String(c.source||'').toLowerCase() === 'google');
      const otherClaims = rawClaims.filter(c => String(c.source||'').toLowerCase() !== 'google');
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

  // Match the card logic: fallback to URL if analyzedText is missing
  const analyzedText = decodeEntities(data.analyzedText || data.url || '');

  const resultHtml = '<div class="verification-result">'
    +'<div class="result-header">'
      +'<div style="display:flex; align-items:center; gap:8px;">'
        +'<div class="platform-badge"><i class="fab fa-facebook"></i><span>Facebook Analysis</span></div>'
        +((data.aiVerdict === 'Verified by Admin') ? '<div class="platform-badge" style="background:#16a34a; color:#fff;"><i class="fas fa-check-circle"></i><span>Verified by Admin</span></div>' : '')
      +'</div>'
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
      +(analyzedText ? '<div style="max-height: 200px; overflow-y: auto; white-space: pre-wrap;"><p>'+safeText(analyzedText)+'</p></div>' : '<p>No text provided.</p>')+'</div>'
      
      +'<div class="panel metrics"><div class="panel-title"><span class="label">Metrics</span></div>'
        +'<ul>'
          +'<li><strong>Source:</strong> '+safeText(data.pageName || data.sourceName || getSourceName(data.url) || '')+'</li>'
          +'<li><strong>Sources Found:</strong> '+Number(data.sourcesFound || data.sources || 0)+'</li>'
          +'<li><strong>Fact Checks:</strong> '+Number(data.factChecks || 0)+'</li>'
          +'<li><strong>Times Verified:</strong> '+Number(data.verificationCount || 1)+'</li>'
          +'<li><strong>Analyzed At:</strong> '+safeText(formatTimestamp(data.analyzed_at || data.analyzedAt))+'</li>'
          +(data.url ? '<li><strong>URL:</strong> <a href="'+safeText(data.url)+'" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:underline; word-break:break-all;">'+safeText(data.url)+'</a></li>' : '')
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

// --- RENDERING ---

function renderCards(docs) {
  if (!container) return;

  if (docs.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: #9ca3af; padding: 3rem;">
            <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p>No verifications found for this account.</p>
            <a href="verify-news.html" style="color: #3b82f6; text-decoration: underline;">Verify your first link</a>
        </div>`;
      return;
  }

  const html = docs.map(d => {
    // 1. Prepare Data
    const score = Number(d.credibilityScore || 0);
    const label = d.label || getLabelFromScore(score);
    const analyzedText = decodeEntities(d.analyzedText || d.url || '');
    const bodyText = shorten(analyzedText, 100);
    const sourceText = getSourceName(d.url, d.pageName);
    const isFb = String(d.url || '').toLowerCase().includes('facebook.com');
    const sourceIcon = isFb ? 'fab fa-facebook' : 'fas fa-link';

    // 2. Prepare Vote Data
    const feedback = d.feedback || {};
    const agreeCount = feedback.agreeCount || 0;
    const disagreeCount = feedback.disagreeCount || 0;
    const myVote = (feedback.voters && currentUserID) ? feedback.voters[currentUserID] : null;
    
    const agreeClass = myVote === 'agree' ? 'selected' : '';
    const disagreeClass = myVote === 'disagree' ? 'selected' : '';

    // 3. Generate HTML elements
    const labelBadgeHtml = labelBadge(label);
    
    // Refactored Image Logic (Matches trends.js with container wrapper)
    const docId = d.id || '';
    // Use originalId if available (for cloned records), otherwise use current ID
    const imageId = d.originalId || docId;
    const localImg = 'assets/images/old_trends/' + imageId + '.jpg';
    const defaultLogo = 'assets/images/logo.png';
    const imgSrc = d.imageUrl || d.image_url || d.image || d.postImage || '';

    // Container style matches trends.js .trend-image-container
    const containerStyle = "height: 180px; width: 100%; flex-shrink: 0; background: #1e293b; display: flex; align-items: center; justify-content: center; overflow: hidden; border-bottom: 1px solid #1f2937;";
    const imgStyle = "width: 100%; height: 100%; object-fit: cover;";
    
    // Fallback: Show logo centered, contained size
    const logoFallback = "this.src='" + defaultLogo + "'; this.style.width='100px'; this.style.height='100px'; this.style.objectFit='contain'; this.style.margin='auto'; this.style.display='block'; this.style.opacity='0.8';";

    const imageTag = imgSrc 
        ? `<div style="${containerStyle}">
             <img src="${safeText(imgSrc)}" alt="Preview" referrerpolicy="no-referrer" 
                  style="${imgStyle}"
                  onerror="this.onerror=null; this.src='${localImg}'; this.onerror=function(){ ${logoFallback} };">
           </div>` 
        : `<div style="${containerStyle}">
             <img src="${localImg}" alt="Preview" style="${imgStyle}"
                  onerror="${logoFallback}">
           </div>`;

    // 4. Construct the Card HTML
    return `
      <div class="my-verification-card" data-id="${d.id}">
        ${imageTag}
        
        <div class="card-body" data-action="open" style="cursor: pointer;">
          <div class="card-text">${safeText(bodyText)}</div>
          
          <div class="card-meta">
            <div class="source-row">
              <i class="${sourceIcon}"></i>
              <span>${safeText(sourceText)}</span>
            </div>
            ${labelBadgeHtml}
          </div>
        </div>
        
        <div class="card-actions">
          <button class="vote-btn agree ${agreeClass}" data-action="vote-agree">
            <i class="fas fa-thumbs-up"></i><span>${agreeCount}</span>
          </button>
          <button class="vote-btn disagree ${disagreeClass}" data-action="vote-disagree">
            <i class="fas fa-thumbs-down"></i><span>${disagreeCount}</span>
          </button>
          <button class="vote-btn delete" data-action="delete" style="margin-left: auto; color: #ef4444;" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function applyFilters() {
  const q = String(currentQuery || '').trim().toLowerCase();
  let docs = allDocs.slice();

  if (q) {
    docs = docs.filter(d => {
      const text = String(d.analyzedText || '').toLowerCase();
      const labelStr = String(d.label || getLabelFromScore(d.credibilityScore)).toLowerCase();
      const source = String(d.pageName || getSourceName(d.url)).toLowerCase();
      return text.includes(q) || labelStr.includes(q) || source.includes(q);
    });
  }

  // 1. Sort FIRST so that deduplication keeps the most relevant/newest item
  if (currentSort === 'date_desc') {
    docs.sort((a,b) => tsMillis(b.analyzed_at) - tsMillis(a.analyzed_at));
  } 
  else if (currentSort === 'date_asc') {
    docs.sort((a,b) => tsMillis(a.analyzed_at) - tsMillis(b.analyzed_at));
  }
  else if (currentSort === 'score_desc') {
    docs.sort((a,b) => (b.credibilityScore || 0) - (a.credibilityScore || 0));
  }
  else if (currentSort === 'score_asc') {
    docs.sort((a,b) => (a.credibilityScore || 0) - (b.credibilityScore || 0));
  }

  // 2. Deduplicate logic: Remove duplicates based on analyzedText or URL
  // We keep the first occurrence (which is now the correct one based on sort)
  const seenContent = new Set();
  docs = docs.filter(d => {
      // Use analyzedText as primary key, fallback to URL, fallback to ID
      const key = (d.analyzedText || d.url || d.id).trim();
      if (!key || seenContent.has(key)) return false;
      seenContent.add(key);
      return true;
  });

  renderCards(docs);
}

// --- INITIALIZATION ---

function start(user) {
  if (!container) return;
  currentUserID = user.uid; // Store ID for voting
  const db = firebase.firestore();
  
  const q = db.collection('facebook_verification_results')
              .where('userID', '==', user.uid)
              .limit(100);

  const unsubscribe = q.onSnapshot(snapshot => {
    const rawDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter by User ID (Redundant check but safe to keep)
    allDocs = rawDocs;

    applyFilters();
  }, error => {
    console.error("Error fetching data:", error);
    container.innerHTML = '<div style="color:#ef4444; padding:2rem; text-align:center;">Error loading history. Please try again later.</div>';
  });

  try {
    window.addEventListener('beforeunload', () => { try { unsubscribe && unsubscribe(); } catch(_){} });
    window.addEventListener('pagehide', () => { try { unsubscribe && unsubscribe(); } catch(_){} });
  } catch(_){}

  if (searchInput) searchInput.addEventListener('input', (e) => { currentQuery = e.target.value; applyFilters(); });
  if (sortSelect) sortSelect.addEventListener('change', (e) => { currentSort = e.target.value; applyFilters(); });
}

// --- EVENT LISTENERS ---

document.addEventListener('click', (e) => {
    const card = e.target.closest('.my-verification-card');
    if (!card) return;
    
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const id = card.dataset.id;
    
    if (action === 'open') {
        const item = allDocs.find(d => d.id === id);
        if (item) openResultModal(item);
        e.preventDefault();
    } else if (action === 'vote-agree') {
        handleVote(id, 'agree');
    } else if (action === 'vote-disagree') {
        handleVote(id, 'disagree');
    } else if (action === 'delete') {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this verification from your history?')) {
            const db = firebase.firestore();
            db.collection('facebook_verification_results').doc(id).delete()
            .then(async () => {
                try {
                    const user = firebase.auth().currentUser;
                    if (user) {
                        await db.collection('account_activity').add({
                            userId: user.uid,
                            action: 'delete_myverifications_soft',
                            details: { id },
                            timestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                } catch(_){}
                try { if (typeof toast === 'function') toast('Verification removed from history.', 'success'); } catch(_){}
            })
            .catch(err => {
                console.error('Error deleting:', err);
                alert('Failed to delete verification.');
            });
        }
    }
});

if (window.firebase && firebase.auth) {
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            if(document.getElementById('userAccountBtn')) {
                document.getElementById('userAccountBtn').style.display = 'flex';
                document.querySelector('.user-name').textContent = user.displayName || 'My Account';
            }
            start(user);
        } else {
            window.location.href = 'login.html'; 
        }
    });
}
