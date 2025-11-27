document.addEventListener('DOMContentLoaded', () => {
  // --- Navigation Logic ---
  const goFacebookBtn = document.getElementById('show-facebook-verify');
  const goUrlBtn = document.getElementById('show-url-verify');
  if (goFacebookBtn) goFacebookBtn.addEventListener('click', () => window.location.href = 'verify-news.html?section=facebook');
  if (goUrlBtn) goUrlBtn.addEventListener('click', () => window.location.href = 'verify-news.html?section=url');

  // --- Elements ---
  const runBtn = document.getElementById('run-poser-btn');
  const urlInput = document.getElementById('poser-url');
  const urlError = document.getElementById('poser-url-error');
  const notesInput = document.getElementById('poser-notes'); 

  // --- Validation Helpers ---
  function setFieldError(message){
    if(urlError){ urlError.textContent = message; }
    const fg = urlInput ? urlInput.closest('.form-group') : null;
    if(fg) fg.classList.add('has-error');
    if(urlInput) urlInput.classList.add('error');
  }
  
  function clearFieldError(){
    if(urlError){ urlError.textContent = ''; }
    const fg = urlInput ? urlInput.closest('.form-group') : null;
    if(fg) fg.classList.remove('has-error');
    if(urlInput) urlInput.classList.remove('error');
  }

  function getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  // --- URL Helpers ---
  function isFacebookUrl(urlOrId) {
    try {
      const u = new URL(urlOrId);
      return /facebook\.com$/.test(u.hostname) || u.hostname.includes('fb.com');
    } catch (_) {
      return /^\d{5,}$/.test(urlOrId); // Allow raw numeric IDs
    }
  }

  function isPostUrl(url) {
    try {
      const u = new URL(url);
      const p = (u.pathname || '').toLowerCase();
      const q = (u.search || '').toLowerCase();
      
      // 1. Check for Post/Photo/Video patterns
      if (/\/posts\//.test(p) || /\/photos\//.test(p) || /\/videos\//.test(p) || /\/reel\//.test(p) || 
          /\/story\.php/.test(p) || /\/permalink\//.test(p) || /\/sharer\.php/.test(p) ||
          /(\?|&)story_fbid=/.test(q) || /(\?|&)fbid=/.test(q)) {
          return true;
      }

      // 2. Check for Non-Profile Pages (Groups, Marketplace, Watch, Gaming, etc.)
      const parts = p.split('/').filter(Boolean);
      const first = parts[0] || '';
      const reserved = ['groups', 'events', 'marketplace', 'watch', 'gaming', 'help', 'settings', 'privacy', 'login', 'search'];
      
      if (reserved.includes(first)) {
          return true; 
      }

      return false;
    } catch(_) { 
      return false; 
    }
  }

  function isAllowedPageOrProfileUrl(url) {
    // Simple strict check combining the above
    if (!isFacebookUrl(url)) return false;
    if (isPostUrl(url)) return false;
    return true;
  }

  function extractPosterId(input) {
    try {
      const u = new URL(input);
      const idParam = u.searchParams.get('id');
      if (u.pathname.includes('/profile.php') && idParam) return idParam;
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 1) {
        const last = parts[parts.length - 1];
        const numeric = parts.find(p => /^\d{5,}$/.test(p));
        return numeric || last;
      }
      return u.hostname;
    } catch (_) { return input.trim(); }
  }

  // --- REAL-TIME VALIDATION ---
  function validateInputState() {
    const val = (urlInput.value || '').trim();
    
    if (!val) {
        runBtn.disabled = false;
        runBtn.title = "";
        clearFieldError();
        return;
    }

    // 2. Valid Facebook URL Check
    if (!isFacebookUrl(val)) {
        runBtn.disabled = true;
        runBtn.title = "Please enter a valid Facebook URL.";
        return;
    }

    // 3. Page/Profile Check (Not a Post)
    if (isPostUrl(val)) {
        runBtn.disabled = true;
        runBtn.title = "Please enter a Page or Profile URL, not a specific post.";
        setFieldError("Please provide a Page or Profile URL, not a post.");
        return;
    }

    // 4. If all good
    runBtn.disabled = false;
    runBtn.title = "";
    clearFieldError();
  }

  if(urlInput){ 
      // Run validation on every keystroke
      urlInput.addEventListener('input', validateInputState);
      // Run once on load to set initial state
      validateInputState();
  }


  // --- Modal Logic ---
  function showModal(title, content) {
    const existingModal = document.getElementById('verificationModal');
    if (existingModal) existingModal.remove();

    const modalHtml = `
      <div class="modal-overlay poser-modal" id="verificationModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>${title}</h2>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">${content}</div>
          <div class="modal-footer">
            <button class="verify-btn poser-run-btn" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const overlay = document.getElementById('verificationModal');
    if (overlay) {
      const btn = overlay.querySelector('.modal-close');
      if (btn) btn.addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    }
  }

  function updateModal(title, content) {
    const m = document.getElementById('verificationModal');
    if (!m) return showModal(title, content);
    const h = m.querySelector('.modal-header h2');
    const b = m.querySelector('.modal-body');
    if (h) h.textContent = title;
    if (b) b.innerHTML = content;
  }

  function closeModal(){
    const modal = document.getElementById('verificationModal');
    if (modal) modal.remove();
  }
  window.closeModal = closeModal;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function setButtonLoading(btn, loading, labelWhile = 'Analyzing...') {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = `<span class="btn-spinner"></span><span class="btn-text">${labelWhile}</span>`;
    } else {
      btn.disabled = false;
      btn.classList.remove('loading');
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    }
  }

  // --- LOADING LOGIC (Cycling Text) ---
  const LOADING_MESSAGES = [
    "Verifying page authenticity...",
    "Reality checking this page...", 
    "Sniffing out the bots...", 
    "Validating activity levels...", 
    "Scanning for poser indicators...", 
    "Checking for follower count...", 
    "Detecting anomaly patterns...", 
    "Analyzing credibility signals..."
  ];

  function showPoserLoading() {
    const existing = document.getElementById('poserLoading');
    if (existing) existing.remove();
    
    // Initial message
    const initialMsg = LOADING_MESSAGES[0];

    const html = `
      <div id="poserLoading" class="poser-loading-overlay">
        <div class="loading-panel">
          <div class="ring">
            <div class="ring-core"></div>
          </div>
          <h3 class="loading-title">Poser Detection</h3>
          <p class="loading-subtitle" id="loadingSubtitle">${initialMsg}</p>
          <div class="loading-bar"><div class="loading-fill"></div></div>
        </div>
      </div>`;
    
    document.body.insertAdjacentHTML('beforeend', html);
    const overlayEl = document.getElementById('poserLoading');

    // 1. Progress Bar Animation Interval
    const barInterval = setInterval(() => {
      const fill = document.querySelector('#poserLoading .loading-fill');
      if (!fill) return;
      const w = parseFloat(fill.style.getPropertyValue('--w') || '10');
      const next = w >= 95 ? 10 : w + 15;
      fill.style.setProperty('--w', String(next));
      fill.style.width = next + '%';
    }, 600);

    // 2. Text Cycling Interval
    let msgIndex = 0;
    const textInterval = setInterval(() => {
        const subtitle = document.getElementById('loadingSubtitle');
        if (subtitle) {
            msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
            subtitle.textContent = LOADING_MESSAGES[msgIndex];
        }
    }, 1500); // Change text every 1.5 seconds

    // Store IDs so we can clear them later
    if (overlayEl) {
        overlayEl.dataset.barInterval = String(barInterval);
        overlayEl.dataset.textInterval = String(textInterval);
    }
    
    document.documentElement.style.overflow = 'hidden';
  }

  function hidePoserLoading() {
    const el = document.getElementById('poserLoading');
    if (el) { 
        // Clear Bar Interval
        const barId = Number(el.dataset.barInterval || 0);
        if (barId) clearInterval(barId);
        
        // Clear Text Interval
        const textId = Number(el.dataset.textInterval || 0);
        if (textId) clearInterval(textId);

        el.remove(); 
    }
    document.documentElement.style.overflow = '';
  }

  function showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
  }

  // --- API Call ---
  async function analyzePosterViaGraph(idOrUrl) {
    try {
      let endpoint = 'http://127.0.0.1:5001/api/poser/analyze_full'; 
      let payload = { id_or_url: idOrUrl };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (resp.status === 502) throw new Error('API returned 502 error.'); 
      if (!resp.ok) throw new Error(`Facebook analyze error: ${resp.status}`);
      
      const data = await resp.json();
      if (data.status === 'error') throw new Error('API processing failed.');

      return data;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  // --- Database Persistence ---
  async function persistResults(analysis, urlOrId) {
    const hasFirebase = typeof firebase !== 'undefined' && firebase.firestore;
    if (!hasFirebase) return;
    
    const db = firebase.firestore();
    const serverTs = firebase.firestore.FieldValue.serverTimestamp();
    const user = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser : null;

    const fullResult = {
      input: urlOrId,
      poster_id: analysis.inputs?.resolved_id || extractPosterId(urlOrId),
      verdict: analysis.verdict,
      score: analysis.credi_score,
      metadata: analysis.metadata,
      createdAt: serverTs,
      userId: user ? user.uid : 'anonymous'
    };

    await db.collection('poser_detections').add(fullResult);
    showNotification('Analysis saved.', 'success');
  }

  // --- Main Event Listener ---
  runBtn.addEventListener('click', async () => {
    const input = (urlInput.value || '').trim();
    
    // Final Safety Check
    if (!input) {
        setFieldError('Please enter a URL.');
        const content = `
          <div style="background:linear-gradient(135deg,#7e22ce 0%,#9333ea 60%,#a855f7 100%);color:#fff;padding:1rem;border-radius:12px;display:flex;align-items:center;gap:12px;">
            <i class="fas fa-ban" style="font-size:2rem;color:#ef4444;"></i>
            <div>
              <div style="font-weight:700;">No URL Provided</div>
              <div style="opacity:.95;">Please paste a Facebook Page or Profile URL to run Poser Detection.</div>
            </div>
          </div>`;
        showModal('Invalid URL', content);
        return;
    }

    if (!isFacebookUrl(input)) {
        setFieldError('Only Facebook URLs are supported.');
        const content = `
          <div style="background:linear-gradient(135deg,#7e22ce 0%,#9333ea 60%,#a855f7 100%);color:#fff;padding:1rem;border-radius:12px;display:flex;align-items:center;gap:12px;">
            <i class="fas fa-ban" style="font-size:2rem;color:#ef4444;"></i>
            <div>
              <div style="font-weight:700;">Unsupported URL</div>
              <div style="opacity:.95;">Poser Detection accepts Facebook Page or Profile URLs only.</div>
            </div>
          </div>`;
        showModal('Invalid URL', content);
        return;
    }

    if (!isAllowedPageOrProfileUrl(input)) {
        setFieldError('Please enter a Page or Profile URL, not a post/group/link.');
        const content = `
          <div style="background:linear-gradient(135deg,#7e22ce 0%,#9333ea 60%,#a855f7 100%);color:#fff;padding:1rem;border-radius:12px;display:flex;align-items:center;gap:12px;">
            <i class="fas fa-ban" style="font-size:2rem;color:#ef4444;"></i>
            <div>
              <div style="font-weight:700;">Not a Page/Profile URL</div>
              <div style="opacity:.95;">Posts, groups, marketplace, or share links are not supported.</div>
              <ul style="margin:.5rem 0 0 1rem;font-size:.9rem;line-height:1.5;">
                <li>Allowed: <span style="font-family:monospace;">/profile.php?id=...</span>, vanity pages like <span style="font-family:monospace;">/OneNewsPH</span></li>
                <li>Blocked: <span style="font-family:monospace;">/posts/...</span>, <span style="font-family:monospace;">/groups/...</span>, <span style="font-family:monospace;">/story.php?fbid=...</span></li>
              </ul>
            </div>
          </div>`;
        showModal('Invalid URL', content);
        return;
    }

    setButtonLoading(runBtn, true, 'ANALYZING...');
    showPoserLoading();
    
    try {
      let apiData = await analyzePosterViaGraph(input);
      
      if (!apiData) {
        apiData = {
             inputs: { resolved_id: extractPosterId(input) },
             classification: 'Unknown',
             verdict: 'Backend API Connection Failed',
             credi_score: 0,
             metadata: {},
             trust: { layers: {}, raw_score: 0 },
             note: 'API Error'
        };
        showNotification('API Error. Showing empty result.', 'error');
      }
      
      try { await persistResults(apiData, input); } catch (e) { console.error(e); }

      // --- 1. PREPARE DATA VARIABLES ---
      const score = apiData.credi_score || 0;
      const meta = apiData.metadata || {};
      const analysis = apiData; 
      
      const posterScore = score;
      const classification = analysis.classification;
      
      const originalScoreClass = getScoreClass(posterScore);
      const headlineClass = originalScoreClass === 'high' ? 'hl-good' : (originalScoreClass === 'medium' ? 'hl-neutral' : 'hl-bad');
      
      let displayClassification = 'High Credibility - Most likely VERIFIED/TRUSTABLE';
      if (classification.toLowerCase().includes('low')) displayClassification = 'Low Credibility - Most Likely POSER';
      else if (classification.toLowerCase().includes('suspicious')) displayClassification = 'Moderate Credibility - Most Likely SUSPICIOUS';
      
      const audience = Math.max(Number(meta.followers_count || 0), Number(meta.fan_count || 0));
      const hasBadge = !!(
        meta.is_verified ||
        (meta.verification_status || '').toLowerCase().includes('verified') ||
        (posterSigs.verified === true) ||
        (meta.badge || '').toLowerCase().includes('blue')
      );
      
      // AGE CHECK LOGIC (UPDATED)
      const createdYear = meta.created_time ? new Date(meta.created_time).getFullYear() : null;
      const accountAgeYears = Number(pageLevel.account_age_years || meta.account_age_years || (createdYear ? (new Date().getFullYear() - createdYear) : 0));
      const isOld = accountAgeYears >= 1;
      const isYoung = accountAgeYears > 0 && accountAgeYears < 1;
      
      const missingProfile = !(meta.bio || meta.about || meta.description || meta.website || meta.link);
      const signals = analysis.signals || {};
      const pageLevel = signals.page_level || {};
      const posterLevel = signals.poster_level || {};
      const posterSigs = posterLevel.signals || {};
      const suspiciousCount = typeof posterSigs.suspicious_hits === 'number' ? posterSigs.suspicious_hits : (posterLevel.suspicious_behavior && posterLevel.suspicious_behavior < 0 ? 1 : 0);
      const activePosting = (posterSigs.posting_frequency_last_30 || pageLevel.posting_frequency_last_30 || analysis.postingFrequency || 0) > 0;
      const smallAudience = audience > 0 && audience < 300;
      
      // --- LOGIC UPDATED ---
      
      let trustSignals = [
        audience && audience > 0 ? `Large Audience: ${audience} followers indicates established reach.` : '',
        isOld ? 'Established History: Account is older than 1 year.' : '',
        hasBadge ? 'Verified Identity: Holds an official Blue Badge.' : '',
        activePosting ? 'Active Posting: Consistent posting activity detected.' : ''
      ].filter(Boolean);

      const profileScore = Number((analysis.scoreBreakdown && analysis.scoreBreakdown.profile_completeness) || 0);
      const inactive = !activePosting;
      let riskFactors = [
        suspiciousCount > 0 ? `Suspicious Activity: ${suspiciousCount} spam-like behaviors detected.` : '',
        (missingProfile || profileScore < 5) ? 'Incomplete Profile: Missing basic details like Bio or Website.' : '',
        smallAudience ? 'Limited Audience: Fewer than 300 followers; low reach.' : '',
        isYoung ? 'New Account: Less than 1 year old.' : '',
        inactive ? 'Inactive: No recent posting activity.' : '',
        (!hasBadge && audience > 10000 && isYoung) ? 'Unverified and confirmed new for large audience.' : ''
      ].filter(Boolean);

      // --- Tags for "Why This Score" ---
      const boostTags = [];
      if (audience && audience > 0) boostTags.push(`Large audience (${audience} followers)`);
      if (hasBadge) boostTags.push('Verified badge');
      if (isOld) boostTags.push('Account age over 1 year');
      if (activePosting) boostTags.push('Active posting');
      
      const riskTags = [];
      if (suspiciousCount > 0) riskTags.push(`${suspiciousCount} suspicious signals`);
      if (missingProfile || profileScore < 5) riskTags.push('Incomplete profile');
      if (smallAudience) riskTags.push('Limited audience');
      if (isYoung) riskTags.push('New account');
      if (inactive) riskTags.push('Inactive posting');
      if (!hasBadge && audience > 10000 && isYoung) riskTags.push('New account, high followers');

      const boostSummary = boostTags.join(', ') || 'None';
      const riskSummary = riskTags.join(', ') || 'None';

      const trustList = trustSignals.length ? trustSignals.map(t => `<li><strong>${t.split(':')[0]}:</strong> ${t.split(':').slice(1).join(':').trim()}</li>`).join('') : '<li>No strong trust signals detected.</li>';
      const riskList = riskFactors.length ? riskFactors.map(t => `<li><strong>${t.split(':')[0]}:</strong> ${t.split(':').slice(1).join(':').trim()}</li>`).join('') : '<li>No immediate risk factors detected.</li>';

      const pct = Math.max(0, Math.min(100, Math.round(posterScore)));
      
      const resultHtml = `
      <div class="poser-result-card">
        <div class="poser-result-header">
          <h2 class="poser-result-title">Poser Detection Result</h2>
        </div>

        <div class="summary-band">
          <div class="score-donut ${originalScoreClass}" style="--pct:${pct}">
            <div class="inner">
              <div class="num">${pct}</div>
              <div class="pct">%</div>
            </div>
          </div>
          <div class="summary-text">
            <h3 class="${headlineClass}">${displayClassification}</h3>
            <p>${analysis.verdict || 'Trustworthy - Credible'}</p>
          </div>
        </div>

        <div class="panels-row">
          <div class="panel trust">
            <div class="panel-title"><span class="label">TRUST SIGNALS</span></div>
            <ul>${trustList}</ul>
          </div>
          <div class="panel risk">
            <div class="panel-title"><span class="label">RISK FACTORS</span></div>
            <ul>${riskList}</ul>
          </div>
        </div>

        <div class="why-card">
          <h5>WHY THIS SCORE</h5>
          <p><span class="chip boost">Boosts</span> ${boostSummary}</p>
          <p><span class="chip risk">Risks</span> ${riskSummary}</p>
          <p>We combine these signals to estimate credibility. More boosts and fewer risks increase the percentage.</p>
        </div>

        <div class="meta-row">
          <span class="meta-label">Analyzed ID:</span>
          <span class="mono">${analysis.inputs?.resolved_id || analysis.posterId || 'Unknown'}</span>
          <span class="dot">•</span>
          <span class="meta-label">Source:</span>
          <span class="meta-value">${analysis.metadata?.sourceNote || analysis.sourceNote || 'Hybrid Scan'}</span>
        </div>
      </div>`;

      hidePoserLoading();
      showModal('', resultHtml);

    } catch (err) {
      console.error(err);
      showNotification('An error occurred.', 'error');
      hidePoserLoading();
    } finally {
      setButtonLoading(runBtn, false);
      // Re-run validation to reset state if needed
      validateInputState();
    }
  });
});
