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

function openResultModal(data) {
  const score = Number(data.credibilityScore || 0);
  const label = data.label || getLabelFromScore(score);
  const sourceName = getSourceName(data.url, data.pageName);
  
  const badgeHtml = labelBadge(label).replace('class="badge', `class="score-badge" style="font-size: 1.3rem; padding: 8px 16px;"`);

  const headerHtml = `
    <div class="card-score" style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
        ${badgeHtml.replace('>', `> ${score}% • `)}
    </div>`;

  let explanationHtml = '';
  if (data.explanation) {
      explanationHtml = `
        <div class="analyzed-block" style="border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.1); margin-bottom: 15px;">
            <div class="block-title" style="color: #60a5fa; margin-bottom: 5px;">
                <i class="fas fa-robot"></i> AI Analysis
            </div>
            <div style="line-height: 1.6; font-size: 0.95rem;">
                ${safeText(decodeEntities(data.explanation))}
            </div>
        </div>`;
  }

  const textHtml = `
    <div class="analyzed-block" style="margin-bottom: 15px;">
        <div class="block-title">Analyzed Content</div>
        <div style="font-style: italic; color: #cbd5e1;">"${safeText(decodeEntities(data.analyzedText))}"</div>
    </div>`;

  const metaHtml = `
    <div style="font-size: 0.9rem; color: #9ca3af; margin-top: 20px; border-top: 1px solid #1f2937; padding-top: 10px;">
        <div><strong>Source:</strong> <a href="${safeText(data.canonicalUrl || data.url)}" target="_blank" style="color:#60a5fa;">${safeText(sourceName)}</a></div>
        <div><strong>Analyzed:</strong> ${formatTimestamp(data.analyzed_at)}</div>
        ${data.contentType ? `<div><strong>Type:</strong> ${safeText(data.contentType)}</div>` : ''}
    </div>`;

  const html = `<div>${headerHtml}${explanationHtml}${textHtml}${metaHtml}</div>`;
  ensureModal('Verification Details', html);
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
    const category = detectCategory(d);
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
    const imageTag = d.imageUrl 
        ? `<img class="card-image" src="${safeText(d.imageUrl)}" alt="Preview">` 
        : `<div class="card-media"><div class="fb-logo"><i class="${sourceIcon}-f"></i></div></div>`;

    // 4. Construct the Card HTML
    return `
      <div class="my-verification-card" data-id="${d.id}">
        ${imageTag}
        
        <div class="card-body" data-action="open">
          <div class="card-text">${safeText(bodyText)}</div>
        </div>
        
        <div class="card-footer">
          <div class="source-row">
            <i class="${sourceIcon}"></i>
            <span>${safeText(sourceText)}</span>
          </div>
          <span class="badge badge-neutral">${safeText(category)}</span>
          ${labelBadgeHtml}
        </div>
        
        <div class="card-actions">
          <button class="vote-btn agree ${agreeClass}" data-action="vote-agree">
            <i class="fas fa-thumbs-up"></i><span>${agreeCount}</span>
          </button>
          <button class="vote-btn disagree ${disagreeClass}" data-action="vote-disagree">
            <i class="fas fa-thumbs-down"></i><span>${disagreeCount}</span>
          </button>
        </div>

        <div class="card-header" style="display:flex;justify-content:flex-end;border:none;padding:0.5rem 1rem 1rem 1rem">
            <a href="#" class="open-modal" data-action="open">View Details</a>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function applyFilters() {
  const q = String(currentQuery || '').trim().toLowerCase();
  const catSel = document.getElementById('myv-category');
  const catVal = (catSel && catSel.value) ? String(catSel.value).toLowerCase() : 'all';
  let docs = allDocs.slice();

  if (catVal !== 'all') {
    docs = docs.filter(d => detectCategory(d).toLowerCase() === catVal);
  }
  if (q) {
    docs = docs.filter(d => {
      const text = String(d.analyzedText || '').toLowerCase();
      const labelStr = String(d.label || getLabelFromScore(d.credibilityScore)).toLowerCase();
      const source = String(d.pageName || getSourceName(d.url)).toLowerCase();
      const cat = detectCategory(d).toLowerCase();
      return text.includes(q) || labelStr.includes(q) || source.includes(q);
    });
  }

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

  renderCards(docs);
}

function detectCategory(d){
  const text = String(d.analyzedText || d.url || '').toLowerCase();
  const page = String(d.pageName || '').toLowerCase();
  const url = String(d.url || '').toLowerCase();
  const politics = ['election','senate','senator','president','government','policy','bill','congress','mayor','politics','campaign'];
  const sports = ['game','match','league','football','soccer','basketball','nba','pba','volleyball','athlete','score','goal','tournament'];
  const music = ['song','album','concert','singer','band','music','track','release','artist','playlist'];
  function hits(words){ let h=0; for(const w of words){ if(text.includes(w)||page.includes(w)||url.includes(w)) h++; } return h; }
  const hp = hits(politics), hs = hits(sports), hm = hits(music);
  const max = Math.max(hp,hs,hm);
  if (max===0) return 'Others';
  if (max===hp) return 'Politics';
  if (max===hs) return 'Sports';
  return 'Music';
}

document.addEventListener('change', function(e){
  if (e.target && e.target.id === 'myv-category') {
    applyFilters();
  }
});

// --- INITIALIZATION (FIXED QUERY) ---

function start(user) {
  if (!container) return;
  
  // Reroute if user is null (safety check, though onAuthStateChanged should handle this)
  if (!user || !user.uid) {
      window.location.href = 'login.html'; 
      return;
  }
  
  currentUserID = user.uid; // Store ID for voting
  const db = firebase.firestore();
  
  // *** CRITICAL FIX: Query ONLY documents where the 'userId' field matches the current user's UID ***
  // Assuming the field storing the user ID in the results collection is named 'userId'.
  const q = db.collection('facebook_verification_results')
              .where('userID', '==', user.uid) 
              .orderBy('analyzed_at', 'desc')
              .limit(50);

  const unsubscribe = q.onSnapshot(snapshot => {
    const rawDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // The filter below is now redundant but kept for robustness against inconsistent data:
    allDocs = rawDocs.filter(d => d.userID === user.uid || d.userId === user.uid || d.user_id === user.uid || d.uid === user.uid);

    applyFilters();
  }, error => {
    console.error("Error fetching data:", error);
    // Note: If the user is unverified, the error will happen here due to security rules.
    container.innerHTML = '<div style="color:#ef4444; padding:2rem; text-align:center;">Error loading history. Please try again later. (Check verification status or contact support.)</div>';
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
    }
});

if (window.firebase && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            try { await user.reload(); } catch(_) {}
            if (user.emailVerified) {
                if(document.getElementById('userAccountBtn')) {
                    document.getElementById('userAccountBtn').style.display = 'flex';
                    document.querySelector('.user-name').textContent = user.displayName || 'My Account';
                }
                start(user);
            } else {
                if (container) {
                    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff9800; padding: 3rem;">' +
                                          '<i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>' +
                                          '<p>Please verify your email address to view your history.</p>' +
                                          '<button id="resendVerifyEmail" class="page-btn" style="margin-top:10px;">Resend Verification Email</button>' +
                                          '</div>';
                    const btn = document.getElementById('resendVerifyEmail');
                    if (btn) btn.onclick = async function(){ try { await user.sendEmailVerification(); } catch(_) {} };
                }
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}
