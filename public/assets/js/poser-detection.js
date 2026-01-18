// Poser Detection Script

const POSER_BASE = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_POSER_API_URL)
  ? process.env.REACT_APP_POSER_API_URL
  : ((typeof window !== 'undefined' && window.POSER_BASE_URL) ? window.POSER_BASE_URL : 'http://127.0.0.1:5001');

document.addEventListener('DOMContentLoaded', () => {
  const goFacebookBtn = document.getElementById('show-facebook-verify');
  if (goFacebookBtn) goFacebookBtn.addEventListener('click', () => window.location.href = 'verify-news.html?section=facebook');

  const runBtn = document.getElementById('run-poser-btn');
  const urlInput = document.getElementById('poser-url');
  const urlError = document.getElementById('poser-url-error');

  function setFieldError(message) {
    if (urlError) urlError.textContent = message;
    const fg = urlInput ? urlInput.closest('.form-group') : null;
    if (fg) fg.classList.add('has-error');
    if (urlInput) urlInput.classList.add('error');
  }

  function clearFieldError() {
    if (urlError) urlError.textContent = '';
    const fg = urlInput ? urlInput.closest('.form-group') : null;
    if (fg) fg.classList.remove('has-error');
    if (urlInput) urlInput.classList.remove('error');
  }

  function getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  function isFacebookUrl(urlOrId) {
    try {
      const u = new URL(urlOrId);
      return /facebook\.com$/.test(u.hostname) || u.hostname.includes('fb.com');
    } catch (_) {
      return false;
    }
  }

  function isPostUrl(url) {
    try {
      const u = new URL(url);
      const p = (u.pathname || '').toLowerCase();
      const q = (u.search || '').toLowerCase();

      if (/\/posts\//.test(p) || /\/photos\//.test(p) || /\/videos\//.test(p) || /\/reel\//.test(p) ||
        /\/story\.php/.test(p) || /\/permalink\//.test(p) || /\/sharer\.php/.test(p) ||
        /(\?|&)story_fbid=/.test(q) || /(\?|&)fbid=/.test(q)) {
        return true;
      }

      const parts = p.split('/').filter(Boolean);
      const first = parts[0] || '';
      const reserved = ['groups', 'events', 'marketplace', 'watch', 'gaming', 'help', 'settings', 'privacy', 'login', 'search'];
      if (reserved.includes(first)) return true;

      return false;
    } catch (_) {
      return false;
    }
  }

  function isAllowedPageOrProfileUrl(url) {
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
    } catch (_) {
      return input.trim();
    }
  }

  function validateInputState() {
    const val = (urlInput.value || '').trim();
    if (!val) {
      runBtn.disabled = false;
      runBtn.title = "";
      clearFieldError();
      return;
    }
    if (!isFacebookUrl(val)) {
      runBtn.disabled = true;
      runBtn.title = "Please enter a valid Facebook URL.";
      return;
    }
    if (isPostUrl(val)) {
      runBtn.disabled = true;
      runBtn.title = "Please enter a Page or Profile URL, not a specific post.";
      setFieldError("Please provide a Page or Profile URL, not a post.");
      return;
    }
    runBtn.disabled = false;
    runBtn.title = "";
    clearFieldError();
  }

  if (urlInput) {
    urlInput.addEventListener('input', validateInputState);
    validateInputState();
  }

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
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }
  }

  function closeModal() {
    const modal = document.getElementById('verificationModal');
    if (modal) modal.remove();
  }
  window.closeModal = closeModal;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

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

  const LOADING_MESSAGES = [
    "Verifying page authenticity...",
    "Reality checking this page...",
    "Sniffing out the bots...",
    "Validating activity levels...",
    "Scanning for poser indicators...",
    "Checking for follower count...",
    "Detecting anomaly patterns...",
    "Analyzing credibility signals...",
    "Running AI Semantic Analysis...",
    "AI AGENT ANALYZING"
  ];

  function showPoserLoading() {
    const existing = document.getElementById('poserLoading');
    if (existing) existing.remove();
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

    const barInterval = setInterval(() => {
      const fill = document.querySelector('#poserLoading .loading-fill');
      if (!fill) return;
      const w = parseFloat(fill.style.getPropertyValue('--w') || '10');
      const next = w >= 95 ? 10 : w + 15;
      fill.style.setProperty('--w', String(next));
      fill.style.width = next + '%';
    }, 600);

    let msgIndex = 0;
    const textInterval = setInterval(() => {
      const subtitle = document.getElementById('loadingSubtitle');
      if (subtitle) {
        msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
        subtitle.textContent = LOADING_MESSAGES[msgIndex];
      }
    }, 1500);

    if (overlayEl) {
      overlayEl.dataset.barInterval = String(barInterval);
      overlayEl.dataset.textInterval = String(textInterval);
    }
    document.documentElement.style.overflow = 'hidden';
  }

  function hidePoserLoading() {
    const el = document.getElementById('poserLoading');
    if (el) {
      const barId = Number(el.dataset.barInterval || 0);
      if (barId) clearInterval(barId);
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

  // API Call - Updated to use POSER_BASE
  async function analyzePosterViaGraph(idOrUrl) {
    try {
      // 2. UPDATED: Use the dynamic POSER_BASE variable
      let endpoint = `${POSER_BASE}/api/poser/analyze_full`;
      let payload = { id_or_url: idOrUrl };
      let headers = { 'Content-Type': 'application/json' };
      try {
        if (typeof firebase !== 'undefined' && firebase.auth) {
          const u = firebase.auth().currentUser;
          if (u) {
            const token = await u.getIdToken(true);
            if (token) headers['Authorization'] = `Bearer ${token}`;
          }
        }
      } catch (_) {}
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      let data = null;
      try { data = await resp.json(); } catch (_) { data = null; }
      
      if (!resp.ok || (data && data.status === 'error')) {
        const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${resp.status}`;
        return {
          classification: 'Unknown',
          verdict: 'Backend Error',
          analysis: { final_trust_score: 0, verdict: 'Error' },
          metadata: {},
          note: `API error: ${msg}`
        };
      }
      return data;
    } catch (e) {
      console.error(e);
      if (String(e).includes('Failed to fetch')) {
         console.warn("CORS ERROR LIKELY: If you are running locally, the server might be rejecting your origin. Check backend CORS settings or Redeploy the backend.");
      }
      return {
        classification: 'Unknown',
        verdict: 'Client Error',
        analysis: { final_trust_score: 0 },
        metadata: {},
        note: `Client exception: ${String(e && e.message || e)}`
      };
    }
  }

  // Firebase Persistence
  async function persistResults(apiResponse, urlOrId) {
    const hasFirebase = typeof firebase !== 'undefined' && firebase.firestore;
    if (!hasFirebase) return;
    const db = firebase.firestore();
    const serverTs = firebase.firestore.FieldValue.serverTimestamp();
    const user = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser : null;
    
    const scoreVal = apiResponse.analysis?.final_trust_score || 0;
    const verdictVal = apiResponse.analysis?.verdict || "Unknown";

    const posterId = apiResponse.request?.resolved_id || extractPosterId(urlOrId);

    const fullResult = {
      input: urlOrId,
      poster_id: posterId,
      verdict: verdictVal,
      score: scoreVal,
      metadata: apiResponse.metadata || {},
      analysis: apiResponse.analysis || {},
      analyzedAt: serverTs, // Always update analyzedAt
      userId: user ? user.uid : 'anonymous'
    };

    try {
      // Check for existing record to prevent duplicates
      let existingDoc = null;
      if (posterId) {
        // [FIX] Ensure we only check for duplicates within the SAME user's history
        const snapshot = await db.collection('poser_detections')
          .where('poster_id', '==', posterId)
          .where('userId', '==', fullResult.userId)
          .limit(1)
          .get();
        
        if (!snapshot.empty) {
          existingDoc = snapshot.docs[0];
        }
      }

      if (existingDoc) {
        await existingDoc.ref.update(fullResult);
        showNotification('Analysis updated.', 'success');
      } else {
        // Only add createdAt for new records
        fullResult.createdAt = serverTs;
        await db.collection('poser_detections').add(fullResult);
        showNotification('Analysis saved.', 'success');
      }
    } catch (e) {
      if (!(typeof handleFirestoreWriteError === 'function' && handleFirestoreWriteError(e))) {
        console.error(e);
      }
    }
  }

  window.submitVerificationRequest = async function(urlToCheck) {
    if (!urlToCheck) return;
    const btn = document.getElementById('req-ver-btn');
    if (btn) { btn.innerText = "Sending..."; btn.disabled = true; }

    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) {
        showNotification('Database connection not ready.', 'error');
        return;
      }
      const db = firebase.firestore();
      const user = firebase.auth().currentUser;

      const docRef = await db.collection('pending_verifications').add({
        url: urlToCheck,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        source: "user_report",
        userId: user ? user.uid : null
      });

      // Create Notification
      if (typeof window.createVerificationNotification === 'function') {
          await window.createVerificationNotification(docRef.id);
      }

      if (btn) btn.innerText = "Request Sent ✓";
      showNotification('Request submitted! A manual review is now in progress (Estimated: 1–2 days).', 'success');
    } catch (e) {
      if (!(typeof handleFirestoreWriteError === 'function' && handleFirestoreWriteError(e))) {
        console.error("Verification Request Error:", e);
        showNotification('Error sending request.', 'error');
      }
      if (btn) { btn.innerText = "Try Again"; btn.disabled = false; }
    }
  };

  // Refactored Rendering Logic
  function renderPoserResult(apiData, input) {
      const meta = apiData.metadata || {};
      const analysis = apiData.analysis || {};
      const breakdown = analysis.breakdown || {}; 
      
      const aiExplanation = breakdown.ai_explanation || analysis.ai_explanation || "No AI insight available.";
      const aiRiskScore = (
          (typeof breakdown.ai_score === 'number') ? breakdown.ai_score :
          (typeof analysis.ai_score === 'number') ? analysis.ai_score :
          (typeof meta.ai_score === 'number') ? meta.ai_score :
          (analysis && analysis.trust && analysis.trust.layers && typeof analysis.trust.layers.ai_risk === 'number') ? analysis.trust.layers.ai_risk :
          (typeof breakdown.ai_risk_assessment === 'number') ? breakdown.ai_risk_assessment : null
      );
      const aiVerdictText = (breakdown && breakdown.ai_verdict) ? breakdown.ai_verdict : (
          (typeof aiRiskScore === 'number') ? (aiRiskScore >= 70 ? 'Likely Poser' : (aiRiskScore <= 30 ? 'Likely Authentic' : 'Mixed Signals')) : ''
      );

      const posterScore = analysis.final_trust_score || 0;
      const scoreClass = getScoreClass(posterScore);
      const displayClassification = analysis.verdict || 'Unknown Risk';
      const explanationText = analysis.human_explanation || "Analysis completed.";
      const availability = analysis.data_availability || null;
      const availabilityNote = analysis.availability_note || '';
      const analyzedId = meta.name || meta.username || "Unknown ID";
      const hasBadge = (meta.is_verified === true || meta.verification_status === 'blue_verified');
      const fromRegistry = String(meta.verification_source || '').toLowerCase() === 'verified_registry' || !!meta.is_verified_source;
      const audience = Math.max(Number(meta.followers_count || 0), Number(meta.fan_count || 0));
      const postCount = meta.recent_posts_count || 0;
      const hasPic = meta.picture?.data?.url && !meta.picture.data.is_silhouette;
      const hasBio = !!(meta.about || meta.description);
      const rawUrl = String(meta.page_url || meta.link || meta.url || input || '').trim();
      const displayUrl = rawUrl;
      let hrefUrl = '';
      if (displayUrl) {
        hrefUrl = displayUrl.startsWith('http://') || displayUrl.startsWith('https://')
          ? displayUrl
          : `https://${displayUrl}`;
      }
      const safeHref = hrefUrl ? encodeURI(hrefUrl) : '';
      const safeDisplayUrl = displayUrl
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const metaRowHtml = `
        <div class="meta-row">
          <div>
             <span class="meta-label">ID:</span>
             <span class="mono">${analyzedId}</span>
          </div>
          ${safeHref ? `
          <div>
             <span class="meta-label">URL:</span>
             <a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="mono url-link">${safeDisplayUrl}</a>
          </div>
          ` : ''}
        </div>`;

      const trustSignals = [];
      const riskFactors = [];
      const boostTags = [];
      const riskTags = [];

      // 1. Verification
      if (fromRegistry) {
        trustSignals.unshift("<strong>Verification:</strong> Verified Registry confirmed.");
        boostTags.push("Verified Status");
      } else if (hasBadge) {
        trustSignals.unshift("<strong>Verification:</strong> Blue Badge detected (not registry).");
      } else {
        riskFactors.unshift("<strong>Verification:</strong> No verified badge found.");
        riskTags.unshift("No Verified Badge");
      }

      // 2. Audience
      if (audience > 100000) {
        trustSignals.push(`<strong>Audience:</strong> Massive reach (${audience.toLocaleString()} followers).`);
        boostTags.push("High Follower Count");
      } else if (audience > 1000) {
        trustSignals.push(`<strong>Audience:</strong> Established (${audience.toLocaleString()} followers).`);
      } else if (audience < 50) {
        riskFactors.push(`<strong>Audience:</strong> Very low reach (${audience} followers).`);
        riskTags.push("Low Followers");
      }

      // 3. Activity
      if (postCount > 0) {
         const durationStr = meta.post_time_span || '';
         const activityDetails = durationStr ? `${postCount} recent posts scanned, ${durationStr}` : `${postCount} recent posts scanned`;
         trustSignals.push(`<strong>Activity:</strong> Active (${activityDetails}).`);
         boostTags.push("Recent Activity");
      } else {
         riskFactors.push("<strong>Activity:</strong> No recent posts found.");
         riskTags.push("Lack of Posts");
      }

      // 4. Visuals
      if (hasPic) {
         trustSignals.push("<strong>Profile Picture:</strong> Custom image found.");
      } else {
         riskFactors.push("<strong>Profile Picture:</strong> Missing or default.");
         riskTags.push("No Profile Pic");
      }
      if (hasBio) {
         trustSignals.push("<strong>Bio:</strong> Details provided.");
         boostTags.push("Detailed Bio");
      }

      if (breakdown.ai_risk_assessment && breakdown.ai_risk_assessment > 70) riskTags.push('Suspicious Content Content');

      const trustListHtml = trustSignals.length ? trustSignals.map(t => `
        <li class="signal-item">
            <div class="signal-icon">
                <i class="fas fa-check"></i>
            </div>
            <div>${t}</div>
        </li>
      `).join('') : '<li class="no-signals">No specific positive signals detected.</li>';

      const riskListHtml = riskFactors.length ? riskFactors.map(t => `
        <li class="signal-item">
            <div class="signal-icon">
                <i class="fas fa-exclamation"></i>
            </div>
            <div>${t}</div>
        </li>
      `).join('') : '<li class="no-signals">No critical risks detected.</li>';

      // Explanation Logic
      let detailText = "";
      const boostsStr = boostTags.length ? boostTags.join(", ") : "no major signals";
      const risksStr = riskTags.length ? riskTags.join(", ") : "no major flags";

      if (posterScore >= 80) {
        detailText = `This page is rated <b>High Credibility</b>. It demonstrates authenticity through <b>${boostsStr}</b>. The data suggests this is an established entity.`;
      } else if (posterScore >= 50) {
        detailText = `This page has a <b>Moderate Risk</b> rating. While it has ${boostTags.length ? `some positive signs like <b>${boostsStr}</b>` : "some activity"}, it lacks stronger verification signals or has minor flags like <b>${risksStr}</b>.`;
      } else {
        detailText = `This page is rated <b>High Risk</b>. It failed multiple credibility checks, specifically: <b>${risksStr}</b>. Exercise extreme caution.`;
      }

      const verifiedBanner = fromRegistry ? `
        <div class="verified-banner">
          <i class="fas fa-check"></i>
          <div class="verified-text">
            <strong>Verified</strong>
            <span>Verified Registry: Official page confirmed.</span>
          </div>
        </div>` : '';

      const escapedInput = input.replace(/'/g, "\\'");
      const scoreColor = scoreClass === 'high' ? '#22c55e' : (scoreClass === 'medium' ? '#f59e0b' : '#ef4444');

      // Result UI
       const availabilityBadgeHtml = availability === 'sparse' 
           ? '<span class="availability-badge sparse">Data Unavailable</span>' 
           : (availability === 'partial' 
               ? '<span class="availability-badge partial">Some Data Missing</span>' 
               : '');

       const resultHtml = `
       <div class="poser-result-card">
         <div class="poser-result-header">
           <h2 class="poser-result-title">Poser Detection Result</h2>
         </div>
         ${verifiedBanner}
         
         <div class="score-section">
             <div class="score-circle" style="--score-color:${scoreColor}; --score-pct:${posterScore}%;">
               <div class="score-value">
                  ${posterScore}<span>%</span>
               </div>
             </div>
            <div class="verdict-container" style="--score-color:${scoreColor}">
              <div class="verdict-label">
                <span class="verdict-dot" style="--score-color:${scoreColor}"></span>
                <span style="color:#f8fafc;font-weight:700;">${displayClassification}</span>
              </div>
              <div class="verdict-separator"></div>
              <div class="why-quote">"${explanationText}"</div>
           </div>
         </div>

         ${metaRowHtml}

         <div class="analysis-columns">
           <div class="analysis-col trust">
            <div class="col-header">
                <span>TRUST SIGNALS</span>
                <i class="fas fa-check-circle"></i>
            </div>
            <ul class="signal-list">${trustListHtml}</ul>
          </div>
          <div class="analysis-col risk">
            <div class="col-header">
                <span>RISK FACTORS</span>
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <ul class="signal-list">${riskListHtml}</ul>
          </div>
         </div>

         <div class="ai-insight-card">
           <div class="ai-insight-title">
             <i class="fas fa-robot"></i>
           <span>AI Agent Insight</span>
           </div>
           <div class="ai-insight-text">${
              (() => {
                const parts = [];
                if (hasBio) parts.push("a professional bio");
                if (hasPic) parts.push("a custom profile image");
                if (audience >= 100000) parts.push(`massive reach (${audience.toLocaleString()} followers)`);
                else if (audience >= 1000) parts.push(`an established audience (${audience.toLocaleString()} followers)`);
                if (postCount > 0) parts.push(`recent activity (${postCount} posts scanned${meta.post_time_span ? `, ${meta.post_time_span}` : ''})`);
                const verification = fromRegistry ? "verified registry status" : (hasBadge ? "a blue badge" : "no verified badge");
                const verdictWord = posterScore >= 80 ? "likely authentic" : (posterScore >= 50 ? "mixed in credibility" : "at higher risk");
                const s1 = `The page is ${verdictWord}, with ${parts.join(", ")} and ${verification}.`;
                const boostsStr = (typeof boostTags !== 'undefined' && boostTags.length) ? boostTags.join(", ") : "no major signals";
                const risksStr = (typeof riskTags !== 'undefined' && riskTags.length) ? riskTags.join(", ") : "no major flags";
                const s2 = (typeof riskTags !== 'undefined' && riskTags.length) ? `Flags detected: ${risksStr}.` : `Positive signals: ${boostsStr}.`;
                return s1 + " " + s2;
              })()
           }</div>
           <div class="ai-insight-meta">${
              typeof aiRiskScore === 'number' 
                ? `AI Risk: ${aiRiskScore}/100 • AI Verdict: ${aiVerdictText || 'N/A'}` 
                : `AI Verdict: ${aiVerdictText || 'N/A'}`
           }</div>
         </div>

         <div class="why-score-card">
           <div class="why-header">WHY THIS SCORE</div>
           <div class="why-detail">${detailText}</div>
           <div class="why-divider"></div>
           <div class="manual-verify-question">Is this actually a legitimate official news source?</div>
           <button class="manual-verify-btn" id="req-ver-btn" onclick="window.submitVerificationRequest('${escapedInput}')">Request Manual Verification</button>
         </div>

         <div class="disclaimer-card">
           <div class="disclaimer-title">Disclaimer:</div>
           <div class="disclaimer-body">This tool uses automated analysis of public signals to estimate credibility. Always verify independently. The results are for awareness and guidance purposes only.</div>
         </div>

       </div>`;

      hidePoserLoading();
      showModal('', resultHtml);
  }



  runBtn.addEventListener('click', async () => {
    const input = (urlInput.value || '').trim();
    
    if (!input) {
      setFieldError('Please enter a URL.');
      showNotification('Please enter a Facebook Page or Profile URL.', 'error');
      return;
    }
    if (!isFacebookUrl(input) || !isAllowedPageOrProfileUrl(input)) {
      setFieldError('Invalid or Unsupported URL.');
      showNotification('Unsupported URL. Please enter a valid Facebook Page or Profile URL (not posts or groups).', 'error');
      return;
    }

    setButtonLoading(runBtn, true, 'ANALYZING...');
    showPoserLoading();

    // Check if user is authenticated and has linked Facebook account
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.firestore) {
        const user = firebase.auth().currentUser;
        if (!user) {
             showNotification('Please sign in to use Poser Detection.', 'error');
             setButtonLoading(runBtn, false);
             hidePoserLoading();
             return;
        }
        if (!user.emailVerified) {
             showNotification('Please verify your email before using Poser Detection.', 'error');
             setButtonLoading(runBtn, false);
             hidePoserLoading();
             return;
        }
        
        try {
            const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
            const userData = userDoc.data() || {};
            // Facebook linking removed - no longer required
        } catch (error) {
            console.error('Error checking user status:', error);
            showNotification('Error checking account status. Please try again.', 'error');
            setButtonLoading(runBtn, false);
            hidePoserLoading();
            return;
        }
    }

    try {
      let apiData = await analyzePosterViaGraph(input);
      
      if (!apiData || !apiData.metadata) {
         apiData = { metadata: {}, analysis: { final_trust_score: 0, verdict: "Analysis Failed", human_explanation: "The server could not analyze this URL." } };
         showNotification('Analysis incomplete.', 'error');
      }

      try { await persistResults(apiData, input); } catch (e) { console.error(e); }

      renderPoserResult(apiData, input);

    } catch (err) {
      console.error(err);
      showNotification('An error occurred.', 'error');
      hidePoserLoading();
    } finally {
      setButtonLoading(runBtn, false);
      validateInputState();
    }
  });
});
