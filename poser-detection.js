document.addEventListener('DOMContentLoaded', () => {
  // Navigation buttons in the toggle bar
  const goFacebookBtn = document.getElementById('show-facebook-verify');
  const goUrlBtn = document.getElementById('show-url-verify');
  if (goFacebookBtn) {
    goFacebookBtn.addEventListener('click', () => {
      window.location.href = 'verify-news.html?section=facebook';
    });
  }
  if (goUrlBtn) {
    goUrlBtn.addEventListener('click', () => {
      window.location.href = 'verify-news.html?section=url';
    });
  }

  const runBtn = document.getElementById('run-poser-btn');
  const urlInput = document.getElementById('poser-url');
  const notesInput = document.getElementById('poser-notes');
  const resultSection = document.getElementById('poser-result');
  const resultDetails = document.getElementById('poser-analysis-details');

  // Helpers copied to match Verify Facebook News UI
  function getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  function showModal(title, content) {
    const modalHtml = `
        <div class="modal-overlay" id="verificationModal">
            <div class="modal-content" style="border-left-color:#7e22ce;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="(function(){const m=document.getElementById('verificationModal'); if(m) m.remove();})()">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="(function(){const m=document.getElementById('verificationModal'); if(m) m.remove();})()">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const m = document.getElementById('verificationModal');
    if (m) m.style.display = 'flex';
  }

  function showLoadingModal(title = 'Analyzing...') {
    const loader = `
      <div class="loading-wrap">
        <div class="loading-spinner"></div>
        <p class="loading-text">Analyzing poster...</p>
      </div>`;
    showModal(title, loader);
  }

  function updateModal(title, content) {
    const m = document.getElementById('verificationModal');
    if (!m) return showModal(title, content);
    const h = m.querySelector('.modal-header h2');
    const b = m.querySelector('.modal-body');
    if (h) h.textContent = title;
    if (b) b.innerHTML = content;
  }

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

  function applyResultStatusToButton(btn, classification) {
    if (!btn) return;
    const c = (classification || '').toLowerCase();
    btn.classList.remove('status-good','status-neutral','status-bad');
    let label = 'Result';
    if (c.includes('poser') || c.includes('low credibility')) {
      btn.classList.add('status-bad');
      label = 'POSER';
    } else if (c.includes('neutral')) {
      btn.classList.add('status-neutral');
      label = 'Needs Verification';
    } else {
      btn.classList.add('status-good');
      label = 'Genuine Poster';
    }
    btn.innerHTML = `<span class="btn-text">${label}</span>`;
  }

  // Inject minimal modal/score styles to mirror verify-news



  function showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
  }

  async function analyzePosterViaGraph(idOrUrl) {
    try {
      let endpoint = 'http://127.0.0.1:5001/api/poser/analyze_poster';
      let payload = { id_or_url: idOrUrl };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error(`Facebook analyze error: ${resp.status}`);
      const data = await resp.json();

      const posterId = (data.poster_id || (data.inputs && data.inputs.resolved_id) || extractPosterId(idOrUrl));
      const ps = (data.poster_signals || (data.signals && data.signals.poster_level) || {});
      const classification = data.classification || 'Unknown';
      const verdict = data.verdict || '';
      const recentPostsCount = (data.recent_posts_count || 0);
      const explanation = (() => {
        const cls = (classification || '').toLowerCase();
        if (cls.includes('poser') || cls.includes('low credibility')) {
          return 'Caution: Signals suggest this source may be unreliable. Verify with trusted outlets before sharing.';
        }
        if (cls.includes('neutral')) {
          return 'Mixed signals detected. Please check official sources to confirm.';
        }
        return 'No strong poser signs detected. Continue to verify key details.';
      })();
      const postingFrequency = ps.signals ? (ps.signals.posting_frequency_last_30 || 0) : 0;
      const suspiciousHits = ps.signals ? (ps.signals.suspicious_hits || 0) : 0;
      const signals = {
            profile_completeness: (ps.signals && ps.signals.has_bio ? 'Complete' : 'Partial'),
            posting_behavior:
                'Frequency: ' +
                (ps.signals
                    ? (ps.signals.posting_frequency_last_30 || 0).toFixed(2) + '/day'
                    : 'n/a'),

          // FIX: consider BOTH backend suspicious_behavior AND suspicious_hits
          suspicious_activity:
                (ps.suspicious_behavior || 0) < 0 ||
                (ps.signals?.suspicious_hits || 0) > 0
      };

      return {
        posterId,
        classification,
        verdict,
        signals,
        recentPostsCount,
        postingFrequency,
        suspiciousHits,
        scoreBreakdown: {
          profile_completeness: ps.profile_completeness || 0,
          normal_behavior: ps.normal_behavior || 0,
          suspicious_behavior: ps.suspicious_behavior || 0
        },
        suspiciousSignals: (ps.signals && ps.signals.suspicious_hits ? ['suspicious_hits:' + ps.signals.suspicious_hits] : []),
        explanation
      };
    } catch (e) {
      console.warn('Graph analysis failed, falling back to heuristic:', e);
      try { showNotification('Cannot connect to Poser API. Using local heuristic.', 'error'); } catch(_) {}
      return null;
    }
  }

  function isFacebookUrl(urlOrId) {
    // Accept either a complete URL or an ID-like string
    try {
      const u = new URL(urlOrId);
      return /facebook\.com$/.test(u.hostname) || u.hostname.includes('fb.com');
    } catch (_) {
      // Not a URL; treat as ID input if reasonably alphanumeric
      return /^[A-Za-z0-9_.-]+$/.test(urlOrId);
    }
  }

  function isPostUrl(url) {
    try {
      const u = new URL(url);
      const p = (u.pathname || '').toLowerCase();
      const q = (u.search || '').toLowerCase();
      return /\/posts\//.test(p) ||
             /\/photos\//.test(p) ||
             /\/videos\//.test(p) ||
             /\/reel\//.test(p) ||
             /\/story\.php/.test(p) ||
             /\/permalink\//.test(p) ||
             /(\?|&)story_fbid=/.test(q) ||
             /(\?|&)fbid=/.test(q);
    } catch(_) {
      return false;
    }
  }

  function extractPosterId(input) {
    try {
      const u = new URL(input);
      // Heuristics: profile.php?id=123, or first path segment
      const idParam = u.searchParams.get('id');
      if (u.pathname.includes('/profile.php') && idParam) return idParam;
      const parts = u.pathname.split('/').filter(Boolean);
      // e.g., /SomePageName or /pages/Page-Name/123456789
      if (parts.length >= 1) {
        const last = parts[parts.length - 1];
        // Prefer numeric id if present
        const numeric = parts.find(p => /^\d{5,}$/.test(p));
        return numeric || last;
      }
      return u.hostname;
    } catch (_) {
      // Treat as raw ID
      return input.trim();
    }
  }

  function analyzePosterSignals(input, notes) {
    const lowerNotes = (notes || '').toLowerCase();
    const posterId = extractPosterId(input);

    // Profile completeness: simple heuristic based on URL shape and notes
    let profileCompletenessScore = 6; // baseline
    let profileCompletenessLabel = 'Partially Complete';
    try {
      const u = new URL(input);
      const path = u.pathname.toLowerCase();
      if (path.includes('/profile.php')) {
        profileCompletenessScore = 4;
        profileCompletenessLabel = 'Incomplete';
      } else if (path.split('/').filter(Boolean).length >= 2) {
        profileCompletenessScore = 8;
        profileCompletenessLabel = 'Mostly Complete';
      }
    } catch (_) {
      // If ID-like and reasonably long, assume moderate completeness
      if (posterId.length >= 6) {
        profileCompletenessScore = 7;
        profileCompletenessLabel = 'Mostly Complete';
      }
    }
    if (/(no\s+profile\s+pic|no\s+about|no\s+bio)/.test(lowerNotes)) {
      profileCompletenessScore = Math.max(3, profileCompletenessScore - 3);
      profileCompletenessLabel = 'Incomplete';
    }

    // Normal behavior: presence of typical content endpoints suggests normal usage
    let normalBehaviorScore = 6;
    let normalBehaviorLabel = 'Typical';
    try {
      const u = new URL(input);
      const p = u.pathname.toLowerCase();
      if (/(posts|videos|photos)/.test(p)) {
        normalBehaviorScore = 8;
        normalBehaviorLabel = 'Active & Typical';
      } else if (/groups\//.test(p)) {
        normalBehaviorScore = 5;
        normalBehaviorLabel = 'Group-Focused';
      }
    } catch (_) { /* keep defaults */ }
    if (/(regular|consistent|normal)/.test(lowerNotes)) {
      normalBehaviorScore = Math.min(9, normalBehaviorScore + 1);
    }

    // Suspicious behavior signals (count multiple)
    const suspiciousKeywords = [
      'copy', 'copy-paste', 'copypaste', 'repetitive', 'spam', 'share-only', 'clickbait', 'engagement-bait'
    ];
    let suspiciousSignals = [];
    suspiciousKeywords.forEach(k => { if (lowerNotes.includes(k)) suspiciousSignals.push(k); });
    try {
      const u = new URL(input);
      const p = u.pathname.toLowerCase();
      if (/groups\//.test(p)) suspiciousSignals.push('groups-spam');
      if (/share\//.test(p)) suspiciousSignals.push('share-only');
    } catch (_) { /* ignore */ }
    const suspiciousActivity = suspiciousSignals.length >= 1; // flag on any suspicious signal
    const suspiciousBehaviorScore = suspiciousActivity ? -10 : 0;

    // Classification rule
    const classification = suspiciousActivity ? 'POSER' : 'Genuine Poster';
    const verdict = suspiciousActivity
      ? 'This poster shows multiple poser-like behaviors.'
      : 'No strong poser signals detected based on provided input.';

    // Compose signals object (labels)
    const signals = {
      profile_completeness: profileCompletenessLabel,
      posting_behavior: suspiciousActivity ? 'Repetitive/Spam' : normalBehaviorLabel,
      suspicious_activity: suspiciousActivity
    };

    // Scores (0–10 and negative for suspicious)
    const scoreBreakdown = {
      profile_completeness: profileCompletenessScore,
      normal_behavior: normalBehaviorScore,
      suspicious_behavior: suspiciousBehaviorScore
    };

    // Human-readable explanation
    const explanation = [
      `Profile completeness: ${profileCompletenessLabel} (${profileCompletenessScore}/10)`,
      `Normal behavior: ${normalBehaviorLabel} (${normalBehaviorScore}/10)`,
      suspiciousActivity ? 'Suspicious behavior: multiple flags detected (-10)' : 'Suspicious behavior: none detected (0)'
    ].join(' | ');

    return {
      posterId,
      classification,
      verdict,
      signals,
      scoreBreakdown,
      suspiciousSignals,
      postingFrequency: 0,
      suspiciousHits: suspiciousSignals.length,
      explanation
    };
  }

  async function persistResults(detection, urlOrId) {
    const hasFirebase = typeof firebase !== 'undefined' && firebase.firestore;
    if (!hasFirebase) {
      showNotification('Firebase not available. Skipping save.', 'info');
      return { saved: false };
    }
    const db = firebase.firestore();
    const serverTs = firebase.firestore.FieldValue.serverTimestamp();

    const fullResult = {
      poster_id: detection.posterId,
      classification: detection.classification,
      signals: detection.signals,
      verdict: detection.verdict,
      analyzed_at: serverTs,
      input: urlOrId,
      score_breakdown: detection.scoreBreakdown,
      suspicious_signals: detection.suspiciousSignals
    };

    const summaryResult = {
      poster_id: detection.posterId,
      classification: detection.classification,
      verified_by: 'system',
      timestamp: serverTs
    };

    const detRef = await db.collection('poser_detections').add(fullResult);
    const verRef = await db.collection('verification_results').add(summaryResult);
    return { saved: true, detId: detRef.id, verId: verRef.id };
  }

  runBtn.addEventListener('click', async () => {
    const input = (urlInput.value || '').trim();
    const notes = (notesInput.value || '').trim();

    if (!input) {
      showNotification('Please enter a Facebook poster/page URL or ID.', 'error');
      urlInput.focus();
      return;
    }
    if (!isFacebookUrl(input)) {
      showNotification('Please enter a valid Facebook URL or ID.', 'error');
      return;
    }
    if (isPostUrl(input)) {
      showNotification('Please enter a Facebook page/profile URL (not a post).', 'error');
      return;
    }

    setButtonLoading(runBtn, true, 'ANALYZING POSER DETECTION...');
    try {
      let analysis = await analyzePosterViaGraph(input);
      if (!analysis) {
        analysis = {
          posterId: extractPosterId(input),
          classification: 'POSER',
          verdict: 'Content-level verification unavailable. Possible unverified content.',
          signals: { profile_completeness: 'Unknown', posting_behavior: 'Unknown', suspicious_activity: true },
          suspiciousSignals: ['backend_failure'],
          suspiciousHits: 1,
          postingFrequency: 0,
          scoreBreakdown: { profile_completeness: 0, normal_behavior: 0, suspicious_behavior: -10 },
          explanation: 'Content appears unverified. Please confirm with trusted sources.'
        };
      }

      try { await persistResults(analysis, input); } catch (e) {
        console.error('Save error:', e);
        showNotification('Could not save results. Displaying local analysis.', 'error');
      }

      const pc = analysis.scoreBreakdown.profile_completeness || 0;
      const nb = analysis.scoreBreakdown.normal_behavior || 0;
      const sb = analysis.scoreBreakdown.suspicious_behavior || 0;
      const safeSb = Math.max(0, 10 + sb);
      const posterScore = Math.round(((pc + nb + safeSb) / 30) * 100);

      const conciseSuspicious = analysis.suspiciousHits ?? (analysis.suspiciousSignals ? analysis.suspiciousSignals.length : 0);
      const pfDay = (analysis.postingFrequency || 0).toFixed(2);
      const classificationClass = analysis.classification === 'POSER' ? 'classification-bad' : 'classification-good';

      const resultHtml = `
      <div class="verification-result poser-result">
        <div class="result-header">
          <div class="platform-badge">
            <i class="fas fa-user-secret"></i>
            <span>Poster Analysis</span>
          </div>
          <div class="classification-badge ${classificationClass}">${analysis.classification}</div>
        </div>
        <div class="result-score">
          <div class="score-circle score-${getScoreClass(posterScore)}">
            <span class="score-number">${posterScore}</span>
            <span class="score-label">%</span>
          </div>
          <div class="score-description">
            <h3>Poster Score</h3>
            <p>${analysis.verdict}</p>
          </div>
        </div>
        <div class="key-metrics">
          <div class="metric"><span class="metric-label">Poster ID</span><span class="metric-value mono">${analysis.posterId}</span></div>
          <div class="metric"><span class="metric-label">Profile</span><span class="metric-value">${pc}/10</span></div>
          <div class="metric"><span class="metric-label">Normal</span><span class="metric-value">${nb}/10</span></div>
          <div class="metric"><span class="metric-label">Posts/day</span><span class="metric-value">${pfDay}</span></div>
          <div class="metric"><span class="metric-label">Suspicious flags</span><span class="metric-value">${conciseSuspicious}</span></div>
        </div>
        <div class="result-summary">
          <p>${analysis.explanation}</p>
        </div>
      </div>`;

    // Show modal matching Verify Facebook News style
    updateModal('Poser Detection Complete', resultHtml);
    } finally {
      setButtonLoading(runBtn, false);
      runBtn.classList.remove('status-good','status-neutral','status-bad');
    }
  });
});