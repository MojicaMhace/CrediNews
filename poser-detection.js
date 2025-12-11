// Poser Detection Script

const POSER_BASE = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_POSER_API_URL)
  ? process.env.REACT_APP_POSER_API_URL
  : ((typeof window !== 'undefined' && window.POSER_BASE_URL) ? window.POSER_BASE_URL : 'https://credinews-poser-api.onrender.com');

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
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    const fullResult = {
      input: urlOrId,
      poster_id: apiResponse.request?.resolved_id || extractPosterId(urlOrId),
      verdict: verdictVal,
      score: scoreVal,
      metadata: apiResponse.metadata || {},
      analysis: apiResponse.analysis || {},
      createdAt: serverTs,
      userId: user ? user.uid : 'anonymous'
    };
    try {
      await db.collection('poser_detections').add(fullResult);
      showNotification('Analysis saved.', 'success');
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
        alert("Database connection not ready.");
        return;
      }
      const db = firebase.firestore();
      await db.collection('pending_verifications').add({
        url: urlToCheck,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: "pending",
        source: "user_report"
      });
      if (btn) btn.innerText = "Request Sent ✓";
      alert("Request submitted! Our team will review this source.");
    } catch (e) {
      if (!(typeof handleFirestoreWriteError === 'function' && handleFirestoreWriteError(e))) {
        console.error("Verification Request Error:", e);
        alert("Error sending request.");
      }
      if (btn) { btn.innerText = "Try Again"; btn.disabled = false; }
    }
  };

  runBtn.addEventListener('click', async () => {
    const input = (urlInput.value || '').trim();
    
    if (!input) {
      setFieldError('Please enter a URL.');
      showModal('Invalid URL', '<p>No URL provided.</p>');
      return;
    }
    if (!isFacebookUrl(input) || !isAllowedPageOrProfileUrl(input)) {
      setFieldError('Invalid or Unsupported URL.');
      const content = `
           <div style="background:linear-gradient(135deg,#7e22ce 0%,#9333ea 60%,#a855f7 100%);color:#fff;padding:1rem;border-radius:12px;display:flex;align-items:center;gap:12px;">
             <i class="fas fa-ban" style="font-size:2rem;color:#ef4444;"></i>
             <div>
               <div style="font-weight:700;">Unsupported URL</div>
               <div style="opacity:.95;">Please enter a valid Facebook Page or Profile URL (not posts or groups).</div>
             </div>
           </div>`;
      showModal('Invalid URL', content);
      return;
    }

    setButtonLoading(runBtn, true, 'ANALYZING...');
    showPoserLoading();

    try {
      let apiData = await analyzePosterViaGraph(input);
      
      if (!apiData || !apiData.metadata) {
         apiData = { metadata: {}, analysis: { final_trust_score: 0, verdict: "Analysis Failed", human_explanation: "The server could not analyze this URL." } };
         showNotification('Analysis incomplete.', 'error');
      }

      try { await persistResults(apiData, input); } catch (e) { console.error(e); }

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
      const dataSourceNote = analysis.data_source_note || "Hybrid Scan";
      
      const hasBadge = (meta.is_verified === true || meta.verification_status === 'blue_verified');
      const fromRegistry = String(meta.verification_source || '').toLowerCase() === 'verified_registry' || !!meta.is_verified_source;
      const audience = Math.max(Number(meta.followers_count || 0), Number(meta.fan_count || 0));
      const postCount = meta.recent_posts_count || 0;
      const hasPic = meta.picture?.data?.url && !meta.picture.data.is_silhouette;
      const hasBio = !!(meta.about || meta.description);

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

      const trustListHtml = trustSignals.length ? trustSignals.map(t => `<li>${t}</li>`).join('') : '<li>No strong trust signals.</li>';
      const riskListHtml = riskFactors.length ? riskFactors.map(t => `<li>${t}</li>`).join('') : '<li>No critical risks detected.</li>';

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
        <div style="background:linear-gradient(135deg,#0ea5e9 0%,#38bdf8 100%);color:#07283b;padding:0.75rem 1rem;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">
          <i class="fas fa-check-circle" style="font-size:1.25rem;"></i>
          <div><strong>Verified</strong><div style="font-size:0.9rem;opacity:.9;">Verified Registry: Official page confirmed.</div></div>
        </div>` : '';

      const escapedInput = input.replace(/'/g, "\\'");

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
         
         <div class="summary-band">
             <div class="score-donut ${scoreClass}" style="--pct:${posterScore}">
               <div class="inner">
                  <div class="num">${posterScore}</div>
                  <div class="pct">%</div>
               </div>
             </div>
            <div class="summary-text">
              <div class="classification-row">
                <span class="risk-icon ${scoreClass}"><i class="fas fa-shield-alt"></i></span>
                <h3 class="${scoreClass === 'high' ? 'hl-good' : (scoreClass === 'medium' ? 'hl-neutral' : 'hl-bad')}">${displayClassification}</h3> ${availabilityBadgeHtml}
              </div>
              <div class="accent-bar ${scoreClass}"></div>
              ${availabilityNote ? `<div style="color:#9fb3c8; font-size:0.9rem; margin:4px 0 6px;">${availabilityNote}</div>` : ''}
              <p class="explanation-text" style="font-size: 0.95rem; opacity: 0.85; font-style: italic;">"${explanationText}"</p>
           </div>
         </div>

         <div class="panels-row">
           <div class="panel trust">
             <div class="panel-title"><span class="label">TRUST SIGNALS</span></div>
             <ul>${trustListHtml}</ul>
           </div>
           <div class="panel risk">
             <div class="panel-title"><span class="label">RISK FACTORS</span></div>
             <ul>${riskListHtml}</ul>
           </div>
         </div>

            <div class="ai-agent-box" style="margin-top: 16px; padding: 12px 16px; background: rgba(15, 23, 42, 0.6); border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.15); color: #e5e7eb;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                <i class="fas fa-robot" style="color:#60a5fa;"></i>
                <div style="font-weight:700;">AI Agent Insight</div>
              </div>
              <div style="font-size:0.95rem; line-height:1.5;">
                ${(function(){
                   let txt = String(aiExplanation || '');
                   const t = txt.toLowerCase();
                   const contradicts = /not verified|unverified|no verified|no verification|lacks official verification|zero followers|no followers|lack of bio|no bio/.test(t);
                   const isHigh = (typeof aiRiskScore === 'number' && aiRiskScore >= 70) || /poser/.test(t);
                   const isLow = (typeof aiRiskScore === 'number' && aiRiskScore <= 30) || (posterScore >= 80 && !isHigh);
                   if (fromRegistry && contradicts) {
                     txt = isHigh ? 'Verified registry source. Risk signals detected.' : 'Verified registry source with official signals.';
                   } else if (hasBadge && contradicts) {
                     txt = isHigh ? 'Risk signals detected.' : '';
                   } else if (hasBadge && isLow && /not verified|unverified|no verified|lacks official verification/.test(t)) {
                     txt = '';
                   }
                   return txt;
                 })()}
                ${(() => { return (typeof aiRiskScore === 'number' || aiVerdictText) ? `<div style=\"margin-top:6px; opacity:.85;\">${typeof aiRiskScore === 'number' ? `AI Risk: ${aiRiskScore}/100` : ''}${aiVerdictText ? `${typeof aiRiskScore === 'number' ? ' • ' : ''}AI Verdict: ${aiVerdictText}` : ''}</div>` : ''; })()}
                ${(() => {
                   const aiTrust = (typeof (breakdown.ai_agent_trust_score) === 'number') ? breakdown.ai_agent_trust_score : (typeof aiRiskScore === 'number' ? (100 - aiRiskScore) : null);
                   const ruleRaw = (typeof (breakdown.rule_based_score) === 'number') ? breakdown.rule_based_score : null;
                   const final = (typeof posterScore === 'number') ? posterScore : null;
                   if (typeof aiTrust === 'number' && typeof ruleRaw === 'number' && typeof final === 'number') {
                     return `<div style=\"margin-top:6px; opacity:.7; font-size:.9rem;\">Final Score uses 70% AI + 30% Rules: AI Trust ${Math.round(aiTrust)}% • Rule Score ${Math.round(ruleRaw)}% → ${Math.round(final)}%</div>`;
                   }
                   return '';
                })()}
              </div>
            </div>

         <div class="why-card">
           <h5>WHY THIS SCORE</h5>
           
           <div style="margin-bottom: 16px; color: #e2e8f0; font-size: 0.95rem; line-height: 1.6; text-align: left;">
             ${detailText}
           </div>
           
           <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
              <p style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 10px;">Is this actually a legitimate official news source?</p>
              <button id="req-ver-btn" onclick="window.submitVerificationRequest('${escapedInput}')" style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Request Manual Verification</button>
           </div>
         </div>
         
         <div class="disclaimer-box" style="margin-top: 20px; padding: 12px 16px; background: rgba(15, 23, 42, 0.6); border-radius: 8px; font-size: 0.8rem; color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.15); line-height: 1.5; text-align: left;">
            <strong style="color: #cbd5e1; display:block; margin-bottom: 4px;">Disclaimer:</strong> 
             This tool uses automated analysis of public signals to estimate credibility. Always verify independently. The results are for awareness and guidance purposes only.
         </div>

        <div class="meta-row" style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:10px; border-top: 1px dashed rgba(148,163,184,0.2); color:#94a3b8; font-size: 0.85rem;">
          <div>
             <span style="color:#64748b; font-weight:700; margin-right: 6px;">ID:</span>
             <span class="mono" style="color: #cbd5e1;">${analyzedId}</span>
          </div>
          <div>
             <span style="color:#64748b; font-weight:700; margin-right: 6px;">Source:</span>
             <span style="color: #cbd5e1;">${dataSourceNote}</span>
             ${(() => {
                const fromApify = !!meta._apify_fallback_used;
                const restricted = !!meta._permissions_restricted;
                const badgeOrigin = fromRegistry ? 'Registry' : (fromApify ? 'Apify' : (restricted ? 'Graph (restricted)' : 'Graph'));
                const badgeLine = fromRegistry ? 'Badge: Verified (Registry)' : (hasBadge ? `Badge: Badged (${badgeOrigin})` : 'Badge: Unverified');
                return `<span style=\"color:#64748b; font-weight:700; margin-left: 12px;\">${badgeLine.split(':')[0]}:</span><span style=\"color:#cbd5e1; margin-left:6px;\">${badgeLine.split(': ')[1]}</span>`;
             })()}
          </div>
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
      validateInputState();
    }
  });
});
