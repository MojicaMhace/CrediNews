// Feedback module: two-step popup with rating + category/message
// Exposes window.Feedback.promptIfFirstTime() to trigger after results close

(function(){
  // Persistent flags
  const KEY_SUBMITTED_EVER = 'fb_submitted_ever_v1';
  const KEY_PENDING_NEXT = 'fb_pending_next_session_v1';
  // Session flags (cleared on browser/tab close)
  const S_PROMPTED_THIS_SESSION = 'fb_prompted_this_session_v1';
  const S_OVERLAY_SHOWN = 'fb_overlay_shown_v1';
  const S_SUBMITTED_THIS_SESSION = 'fb_submitted_this_session_v1';

  function createEl(html){
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }

  function showToast(message){
    const toast = createEl(`<div class="feedback-toast">${message}</div>`);
    document.body.appendChild(toast);
    setTimeout(()=>{ toast.classList.add('fade-out'); }, 2200);
    setTimeout(()=>{ toast.remove(); }, 2600);
  }

  // Minimal meaningful content validation (aligned with Facebook content rules)
  function isMeaningfulFeedbackContent(text){
    if (!text) return false;
    const t = text.trim();
    if (t.length < 20) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 6) return false; // at least 6 words containing letters
    const repeatedCharPattern = /^([a-z])\1{2,}$/i;
    let letterWords = 0;
    for (const w of words){
      if (/\d/.test(w)) return false; // block numbers mixed-in words
      if (repeatedCharPattern.test(w)) return false; // gibberish
      if (/[a-zA-Z]{2,}/.test(w)) letterWords++;
    }
    return letterWords >= 4; // require several proper letter words
  }

  function buildStars(){
    const stars = [];
    for (let i=1; i<=5; i++){
      stars.push(`<i class="fas fa-star rating-star" data-value="${i}"></i>`);
    }
    return stars.join('');
  }

  function showFeedback(){
    // Overlay and container
    const overlay = createEl('<div class="feedback-overlay" id="feedbackOverlay"></div>');
    const container = createEl('<div class="feedback-container" role="dialog" aria-modal="true"></div>');
    overlay.appendChild(container);

    // Step 1
    const step1 = createEl(`
      <div class="feedback-step step-1">
        <div class="feedback-header"><h3 class="feedback-title">Feedback</h3></div>
        <div class="feedback-body">
          <div style="text-align:center;">
            <p style="margin:0; font-weight:600;">How would you rate your website experience?</p>
            <div class="rating-row">${buildStars()}</div>
            <p class="feedback-muted">Tap a star to continue</p>
          </div>
        </div>
        <div class="feedback-actions">
          <button class="fb-btn" id="fbSkip1">Skip</button>
        </div>
      </div>
    `);

    // Step 2
    const step2 = createEl(`
      <div class="feedback-step step-2 hidden">
        <div class="feedback-header"><h3 class="feedback-title">Share Your Feedback</h3></div>
        <div class="feedback-body">
          <div class="feedback-row">
            <label class="feedback-label" for="fbCategory">Feedback Category</label>
            <select class="feedback-select" id="fbCategory">
              <option value="Suggestion">Suggestion</option>
              <option value="Issue">Issue</option>
              <option value="Compliment">Compliment</option>
            </select>
          </div>
          <div class="feedback-row">
            <label class="feedback-label" for="fbMessage">Please share in detail what we can improve your website experience.</label>
            <textarea id="fbMessage" class="feedback-textarea" placeholder="Enter Here"></textarea>
          </div>
        </div>
        <div class="feedback-actions">
          <button class="fb-btn" id="fbCancel">Cancel</button>
          <button class="fb-btn primary" id="fbSubmit">Send Feedback</button>
        </div>
      </div>
    `);

    container.appendChild(step1);
    container.appendChild(step2);
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';

    try { sessionStorage.setItem(S_OVERLAY_SHOWN, '1'); } catch(_){}

    let rating = 0;
    // Star interactions
    step1.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', () => {
        rating = Number(star.dataset.value || 0);
        step1.querySelectorAll('.rating-star').forEach(s => {
          const value = Number(s.dataset.value);
          s.classList.toggle('active', value <= rating);
        });
        // dissolve step1 → show step2
        step1.classList.add('fade-out');
        setTimeout(() => { step1.classList.add('hidden'); step2.classList.remove('hidden'); }, 220);
      });
    });

    // Skip first step
    step1.querySelector('#fbSkip1').addEventListener('click', () => {
      step1.classList.add('fade-out');
      setTimeout(() => { step1.classList.add('hidden'); step2.classList.remove('hidden'); }, 220);
    });

    // Cancel → close overlay
    step2.querySelector('#fbCancel').addEventListener('click', () => {
      // Mark to remind on next session if not submitted this one
      try {
        localStorage.setItem(KEY_PENDING_NEXT, '1');
        sessionStorage.removeItem(S_SUBMITTED_THIS_SESSION);
      } catch(_){ }
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 220);
    });

    // Submit
    step2.querySelector('#fbSubmit').addEventListener('click', async () => {
      const msg = (document.getElementById('fbMessage') || {}).value || '';
      if (!isMeaningfulFeedbackContent(msg)){
        showToast('Please enter a meaningful message (no random letters/numbers).');
        return;
      }
      const category = (document.getElementById('fbCategory') || {}).value || 'Suggestion';
      const payload = {
        rating: rating || null,
        category,
        message: msg.trim(),
        created_at: new Date().toISOString(),
      };
      try {
        if (window.firebase && firebase.firestore){
          await firebase.firestore().collection('user_feedback').add(payload);
        }
      } catch (e){ console.warn('Feedback save failed (non-blocking):', e.message); }
      showToast('Your Feedback has been submitted.');
      // Mark submitted so we don't re-prompt next session
      try {
        sessionStorage.setItem(S_SUBMITTED_THIS_SESSION, '1');
        localStorage.setItem(KEY_SUBMITTED_EVER, '1');
        localStorage.removeItem(KEY_PENDING_NEXT);
      } catch(_){}
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 260);
    });
  }

  function promptIfFirstTime(){
    try {
      // If user has already submitted feedback at any time, never auto-prompt.
      if (localStorage.getItem(KEY_SUBMITTED_EVER) === '1') return;

      // Only show once per session, even if multiple verifications occur.
      if (sessionStorage.getItem(S_PROMPTED_THIS_SESSION) === '1') return;

      // If a previous session ended without submission and asked to remind,
      // show the prompt on the first verification of this session.
      if (localStorage.getItem(KEY_PENDING_NEXT) === '1') {
        sessionStorage.setItem(S_PROMPTED_THIS_SESSION, '1');
        // Clear pending now; if user cancels again, it will be re-set.
        localStorage.removeItem(KEY_PENDING_NEXT);
        showFeedback();
        return;
      }

      // Otherwise, this may be the user's first-ever prompt attempt.
      sessionStorage.setItem(S_PROMPTED_THIS_SESSION, '1');
      showFeedback();
    } catch(err){
      // Storage may be blocked; still attempt to show once.
      showFeedback();
    }
  }

  // On session end, if the prompt was shown but not submitted, set pending for next session.
  try {
    window.addEventListener('beforeunload', () => {
      try {
        const shown = sessionStorage.getItem(S_OVERLAY_SHOWN) === '1';
        const submitted = sessionStorage.getItem(S_SUBMITTED_THIS_SESSION) === '1';
        const alreadySubmittedEver = localStorage.getItem(KEY_SUBMITTED_EVER) === '1';
        if (shown && !submitted && !alreadySubmittedEver) {
          localStorage.setItem(KEY_PENDING_NEXT, '1');
        }
      } catch(_){ /* ignore */ }
    });
  } catch(_){ }

  // Expose manual opener to bypass gating/validations when user clicks footer link
  window.Feedback = { 
    promptIfFirstTime,
    openNow: function(){
      try { showFeedback(); } catch(_){ /* ignore */ }
    }
  };
})();