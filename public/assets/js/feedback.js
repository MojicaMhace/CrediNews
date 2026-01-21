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

  function showToast(message, type){
    const kind = type === 'error' ? 'error' : (type || 'success');
    const toast = createEl(`<div class="notification notification-${kind}">${message}</div>`);
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
        <div class="feedback-header"><h3 class="feedback-title">Feedback</h3><button class="feedback-close" id="fbClose1" aria-label="Close">&times;</button></div>
        <div class="feedback-body">
          <div style="text-align:center;">
            <p style="margin:0; font-weight:600;">How would you rate your website experience?</p>
            <div class="rating-row">${buildStars()}</div>
          </div>
        </div>
        <div class="feedback-actions">
          <button class="fb-btn primary" id="fbContinue" disabled>Continue</button>
        </div>
      </div>
    `);

    // Step 2
    const step2 = createEl(`
      <div class="feedback-step step-2 hidden">
        <div class="feedback-header"><h3 class="feedback-title">Share Your Feedback</h3><button class="feedback-close" id="fbClose2" aria-label="Close">&times;</button></div>
        <div class="feedback-body">
          <div class="feedback-row">
            <label class="feedback-label" for="fbCategory">Feedback Category</label>
            <select class="feedback-select" id="fbCategory">
              <option value="Compliment">Compliment</option>
              <option value="Suggestion">Suggestion</option>
              <option value="Issue">Issue</option>             
            </select>
          </div>
          <div class="feedback-row">
            <label class="feedback-label" for="fbMessage">Please share in detail what we can improve your website experience.</label>
            <textarea id="fbMessage" class="feedback-textarea" placeholder="Please enter your feedback here (at least 6 valid words)"></textarea>
            <div class="feedback-count" id="fbWordCount">Valid words: 0/6</div>
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

    function closeOverlayPending(){
      try {
        localStorage.setItem(KEY_PENDING_NEXT, '1');
        sessionStorage.removeItem(S_SUBMITTED_THIS_SESSION);
      } catch(_){ }
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 220);
    }

    let rating = 0;
    // Star interactions
    const continueBtn = step1.querySelector('#fbContinue');
    step1.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', () => {
        rating = Number(star.dataset.value || 0);
        step1.querySelectorAll('.rating-star').forEach(s => {
          const value = Number(s.dataset.value);
          s.classList.toggle('active', value <= rating);
        });
        // Enable continue when a rating is chosen; allow changing freely
        if (continueBtn) continueBtn.disabled = rating <= 0;
      });
    });

    // Continue to next form only after a rating is selected
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        if (rating > 0) {
          step1.classList.add('fade-out');
          setTimeout(() => { step1.classList.add('hidden'); step2.classList.remove('hidden'); }, 220);
        }
      });
    }

    step2.querySelector('#fbCancel').addEventListener('click', () => {
      closeOverlayPending();
    });

    const close1 = step1.querySelector('#fbClose1');
    const close2 = step2.querySelector('#fbClose2');
    if (close1) close1.addEventListener('click', closeOverlayPending);
    if (close2) close2.addEventListener('click', closeOverlayPending);

    const submitBtn = step2.querySelector('#fbSubmit');
    const msgEl = step2.querySelector('#fbMessage');
    
    if (submitBtn) submitBtn.disabled = true;

    const gibberishSet = new Set(['asdf','qwerty','qwe','zxc','zxcv','lorem','ipsum','test','xxx','aaaa','bbbb','cccc']);
    
    const profanitySet = new Set([
        'fuck','shit','bitch','asshole','damn','crap','bastard','dick','pussy','cock','cunt',
        'tangina','gago','tarantado','bobo','baliw','tanga','ulol','pukingina','kantot','hindot','punyeta', 'inutil', 'demonyo', 'pisti', 'leche'
    ]);

    function containsProfanity(text) {
        if (!text) return false;
        const words = text.toLowerCase().split(/[\s.,!?]+/);
        for (const w of words) {
            const cleanW = w.replace(/[^a-z]/g, '');
            if (profanitySet.has(cleanW)) return true;
        }
        return false;
    }

    function isValidWord(w){
      if (!w) return false;
      const s = w.toLowerCase();
      if (/[^a-z]/i.test(s)) return false;
      if (s.length < 3) return false;
      if (gibberishSet.has(s)) return false;
      if (/^([a-z])\1{2,}$/i.test(s)) return false;
      if (!/[aeiou]/i.test(s)) return false;
      return true;
    }
    function countValidWords(text){
      const words = (text || '').trim().split(/\s+/).filter(Boolean);
      let valid = 0;
      const seen = new Map();
      for (const raw of words){
        const w = raw.replace(/[^a-z]/gi,'');
        if (!isValidWord(w)) continue;
        const key = w.toLowerCase();
        const cnt = (seen.get(key) || 0) + 1;
        seen.set(key, cnt);
        if (cnt <= 2) valid++;
      }
      return valid;
    }

    function updateSubmitDisabled(){
      const val = (msgEl || {}).value || '';
      const hasProfanity = containsProfanity(val);
      const validWordCount = countValidWords(val);
      const isMeaningful = isMeaningfulFeedbackContent(val);
      
      const valid = validWordCount >= 6 && isMeaningful && !hasProfanity;
      
      const wcEl = document.getElementById('fbWordCount');
      if (wcEl) {
        if (hasProfanity) {
             wcEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please be mindful of your language. Profanity is not allowed to maintain a respectful community.';
             wcEl.style.color = '#EF4444';
        } else {
             wcEl.textContent = `Valid words: ${validWordCount}/6`;
             wcEl.style.color = valid ? '#10B981' : '#9CA3AF';
        }
      }
      if (submitBtn) submitBtn.disabled = !valid;
    }

    if (msgEl) {
      msgEl.addEventListener('input', updateSubmitDisabled);
      updateSubmitDisabled();
    }

    submitBtn.addEventListener('click', async () => {
      const msg = (document.getElementById('fbMessage') || {}).value || '';
      
      if (containsProfanity(msg)) {
          showToast('Please remove inappropriate language before submitting.', 'error');
          return;
      }

      if (!isMeaningfulFeedbackContent(msg)){
        showToast('Please enter a meaningful message (no random letters/numbers).');
        return;
      }
      const category = (document.getElementById('fbCategory') || {}).value || 'Suggestion';

      let userId = null;
      let userEmail = null;
      try {
        if (window.firebase && firebase.auth && firebase.auth().currentUser) {
          userId = firebase.auth().currentUser.uid || null;
          userEmail = firebase.auth().currentUser.email || null;
        }
      } catch(_) { /* ignore */ }

      const payload = {
        rating: rating || null,
        category,
        message: msg.trim(),
        submitted_at: new Date().toISOString(),
        userId,
        userEmail,
      };
      try {
        if (!(window.firebase && firebase.firestore && firebase.auth)) {
          showToast('Feedback service unavailable. Please try again later.');
          return;
        }
        const user = firebase.auth().currentUser;
        if (!user) {
          showToast('Please sign in to submit feedback.');
          return;
        }

        const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
        const userData = userDoc.data() || {};
        
        if (user.emailVerified !== true) {
          showToast('Please verify your email address to submit feedback.');
          return;
        }

        await firebase.firestore().collection('user_feedback').add(payload);
        showToast('Your Feedback has been submitted.');
        
        try {
          sessionStorage.setItem(S_SUBMITTED_THIS_SESSION, '1');
          localStorage.setItem(KEY_SUBMITTED_EVER, '1');
          localStorage.removeItem(KEY_PENDING_NEXT);
        } catch(_){}
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 260);
      } catch (e){
        console.warn('Feedback save failed:', e && e.message ? e.message : e);
        showToast('Failed to submit feedback. Check your account verification and try again.', 'error');
      }
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
