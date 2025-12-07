// Verify News Page JavaScript
const FACTCHECK_BASE = (typeof window !== 'undefined' && window.FACTCHECK_BASE_URL) ? window.FACTCHECK_BASE_URL : 'https://credinews-factcheck.onrender.com';
const POSER_BASE = (typeof window !== 'undefined' && window.POSER_BASE_URL) ? window.POSER_BASE_URL : 'https://credinews-poser-detection.onrender.com';

// Firebase will be available globally after firebase-config.js loads

// DOM Elements
const urlVerifyBtn = document.getElementById('verify-url-btn');
const facebookVerifyBtn = document.getElementById('verify-facebook-btn');
const articleUrl = document.getElementById('article-url');
const facebookUrl = document.getElementById('facebook-url');
const facebookContent = document.getElementById('facebook-content');
const facebookCharCount = document.getElementById('facebook-char-count');

function updateVerifyButtons() {
  try {
    const hasFiveWords = (() => {
      const txt = String(facebookContent && facebookContent.value || '').trim();
      const words = txt.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w));
      return words.length >= 5;
    })();
    const fbUrlValid = (() => {
      const u = String(facebookUrl && facebookUrl.value || '').trim();
      if (!u) return false;
      if (!isValidUrl(u)) return false;
      if (!isFacebookUrl(u)) return false;
      if (!isSupportedFacebookPostUrl(u)) return false;
      return true;
    })();
    const articleUrlValid = (() => {
      const u = String(articleUrl && articleUrl.value || '').trim();
      if (!u) return false;
      return isValidUrl(u);
    })();
    if (facebookVerifyBtn) {
      const enableFb = hasFiveWords || fbUrlValid;
      facebookVerifyBtn.disabled = !enableFb;
      facebookVerifyBtn.classList.toggle('is-disabled', !enableFb);
    }
    if (urlVerifyBtn) {
      const enableUrl = articleUrlValid;
      urlVerifyBtn.disabled = !enableUrl;
      urlVerifyBtn.classList.toggle('is-disabled', !enableUrl);
    }
  } catch (_) {}
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

const VERIFY_LOADING_MESSAGES = [
  'Preparing verification...',
  'Analyzing content...',
  'Checking claims...',
  'Consulting sources...',
  'Running AI semantic analysis...',
  'Aggregating results...'
];

function showVerifyLoading(title = 'Verify News') {
  const existing = document.getElementById('verifyLoading');
  if (existing) existing.remove();
  const html = `
    <div id="verifyLoading" class="verify-loading-overlay">
      <div class="loading-panel">
        <div class="ring"><div class="ring-core"></div></div>
        <h3 class="loading-title">${title}</h3>
        <p class="loading-subtitle" id="verifyLoadingSubtitle">${VERIFY_LOADING_MESSAGES[0]}</p>
        <div class="loading-bar"><div class="loading-fill"></div></div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const fill = document.querySelector('#verifyLoading .loading-fill');
  let w = 10;
  const barInterval = setInterval(() => {
    w = w >= 95 ? 10 : w + 15;
    if (fill) { fill.style.setProperty('--w', String(w)); fill.style.width = w + '%'; }
  }, 600);
  let i = 0;
  const textInterval = setInterval(() => {
    const el = document.getElementById('verifyLoadingSubtitle');
    if (el) { i = (i + 1) % VERIFY_LOADING_MESSAGES.length; el.textContent = VERIFY_LOADING_MESSAGES[i]; }
  }, 1500);
  const overlayEl = document.getElementById('verifyLoading');
  if (overlayEl) { overlayEl.dataset.barInterval = String(barInterval); overlayEl.dataset.textInterval = String(textInterval); }
  document.documentElement.style.overflow = 'hidden';
}

function hideVerifyLoading() {
  const el = document.getElementById('verifyLoading');
  if (el) {
    const barId = Number(el.dataset.barInterval || 0);
    if (barId) clearInterval(barId);
    const textId = Number(el.dataset.textInterval || 0);
    if (textId) clearInterval(textId);
    el.remove();
  }
  document.documentElement.style.overflow = '';
}

function isValidImageUrl(u) {
    try {
        if (!u || typeof u !== 'string') return false;
        const parsed = new URL(u);
        return /^https?:/.test(parsed.protocol) && !!parsed.hostname;
    } catch (_) {
        return false;
    }
}

function normalizeUrlForCache(u) {
    try {
        if (!u) return '';
        const orig = new URL(u);
        const host = orig.hostname.replace(/^www\./, '').toLowerCase();
        let path = orig.pathname || '/';
        path = path.replace(/\/+/, '/');
        const keepParams = new URLSearchParams();
        const src = new URLSearchParams(orig.search);
        if (/facebook\.com$/i.test(host)) {
            const p = path.toLowerCase();
            if (p.includes('/photo.php')) {
                if (src.has('fbid')) keepParams.set('fbid', src.get('fbid'));
                if (src.has('id')) keepParams.set('id', src.get('id'));
            } else if (p.includes('/story.php')) {
                if (src.has('story_fbid')) keepParams.set('story_fbid', src.get('story_fbid'));
                if (src.has('id')) keepParams.set('id', src.get('id'));
            }
        }
        const qs = keepParams.toString();
        const canon = `https://${host}${path}${qs ? '?' + qs : ''}`.replace(/\/?$/, '');
        return canon;
    } catch (_) {
        return (u || '').trim();
    }
}

function hashString(str) {
    try {
        const s = String(str || '');
        let h = 0;
        for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
        return ('h' + (h >>> 0).toString(16));
    } catch (_) {
        return '';
    }
}

function createCleanDbPayload(result, url, contentText, platformLabel, analysisType) {
  const cred = result && result.credibility ? result.credibility : {};
  const explanation = (cred && cred.explanation) || '';
    const slang = Array.isArray(result && result.slang_detected) ? result.slang_detected : [];
    const claims = Array.isArray(result && result.claim_analysis) ? result.claim_analysis : [];
    const pageName = (result && result.page_name) || null;
    const sourceName = (result && result.source_name) || null;
    const cleanText = String((result && result.scraped_text) ? result.scraped_text : (contentText || ''));
  const score = Math.min(Math.round((cred.score || 0) * 100), 100);
  return {
    platform: platformLabel,
    analysis: analysisType,
    url: url || null,
    canonicalUrl: normalizeUrlForCache(url || ''),
    contentType: url ? 'Post/Article URL' : 'Text Content',
    credibilityScore: score,
    label: cred.label || '',
    aiScore: score,
    aiVerdict: cred.label || '',
    aiExplanation: explanation || ((result && result.zyla && (result.zyla.explanation || result.zyla.analysis)) || ''),
    sourcesFound: cred.sources ?? 0,
    factChecks: cred.factChecks ?? 0,
    analyzedText: cleanText,
    contentHash: hashString(cleanText),
    pageName: pageName,
    sourceName: sourceName,
    reviewedClaims: claims,
    explanation: explanation,
    slang_detected: slang,
    sarcasmScore: (typeof result.sarcasm_score === 'number') ? result.sarcasm_score : 0,
    sarcasmPercent: (typeof result.sarcasm_percent === 'number') ? result.sarcasm_percent : 0,
    sarcasmRisk: result.sarcasm_risk || null,
    imageUrl: isValidImageUrl(result && result.image_url) ? result.image_url : null,
    userID: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous',
    userEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
    analyzed_at: firebase.firestore.FieldValue.serverTimestamp()
  };
}

async function checkExistingVerification(url, contentText) {
    try {
        if (!window.firebase || !firebase.firestore) return null;
        const db = firebase.firestore();
        if (url) {
            const canon = normalizeUrlForCache(url);
            let qs = await db.collection('facebook_verification_results').where('canonicalUrl', '==', canon).limit(1).get();
            if (qs.empty) {
                qs = await db.collection('facebook_verification_results').where('url', '==', url).limit(1).get();
            }
            if (!qs.empty) {
                const d = qs.docs[0];
                return { id: d.id, ...d.data() };
            }
        } else if (contentText && contentText.trim()) {
            const contentHash = hashString(contentText.trim());
            let qs = await db.collection('facebook_verification_results').where('contentHash', '==', contentHash).limit(1).get();
            if (qs.empty) {
                qs = await db.collection('facebook_verification_results').where('analyzedText', '==', contentText.trim()).limit(1).get();
            }
            if (!qs.empty) {
                const d = qs.docs[0];
                return { id: d.id, ...d.data() };
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

// URL verification handler
async function handleUrlVerification() {
    const url = articleUrl.value.trim();
    
    if (!url) {
        showNotification('Please enter a URL to verify.', 'error');
        return;
    }
    
    if (!isValidUrl(url)) {
        showNotification('Please enter a valid URL.', 'error');
        return;
    }
    
    // Disable button and show loading state
    setButtonLoading(urlVerifyBtn, true, 'Analyzing...');
    showVerifyLoading('Verify News');
    
    let effectiveContent = '';
    // Try to extract key claim from URL first
    try {
        const kcResp = await fetch(`${FACTCHECK_BASE}/api/extract-key-claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        if (kcResp.ok) {
            const kcData = await kcResp.json();
            const keyClaim = (kcData && typeof kcData.key_claim === 'string') ? kcData.key_claim.trim() : '';
            if (keyClaim) {
                effectiveContent = keyClaim;
            }
        }
    } catch (e) {
        console.error('Key claim extraction failed:', e);
    }

    // Proceed even if no extracted content; backend will use URL-based fallbacks

    try {
        const existing = await checkExistingVerification(url, '');
        if (existing) {
            showVerificationResult('url', {
                credibilityScore: Number(existing.credibilityScore || 0),
                sources: Number(existing.sourcesFound || 0),
                factChecks: Number(existing.factChecks || 0),
                domain: extractDomain(existing.url || url),
                credibilityExplanation: (existing.zylaFactCheck && (existing.zylaFactCheck.explanation || existing.zylaFactCheck.analysis)) || '',
                credibilityLabel: existing.label || '',
                mlDetails: null,
                slangDetected: [],
                sarcasmPercent: (typeof existing.sarcasmPercent === 'number') ? existing.sarcasmPercent : null,
                sarcasmRisk: existing.sarcasmRisk || null,
                tone: null,
                fakeClaims: [],
                realClaims: [],
                claimAnalysis: Array.isArray(existing.reviewedClaims) ? existing.reviewedClaims : [],
                claimsChecked: [],
                hasGoogleClaims: !!(
                    (Array.isArray(existing.reviewedClaims) && existing.reviewedClaims.some(x => String(x.source||'').toLowerCase()==='google')) ||
                    (Array.isArray(existing.googleFactCheck) && existing.googleFactCheck.some(r => r && r.fact_check_result && Array.isArray(r.fact_check_result.claims) && r.fact_check_result.claims.length>0))
                ),
                pageName: existing.pageName || null,
                resultId: existing.id || ''
            });
            showNotification('Loaded from existing verification.', 'success');
            return;
        }
        const contentForApi = effectiveContent || (url ? buildNonEmptyContentFromUrl(url) : '') || '';
        const fcResp = await fetch(`${FACTCHECK_BASE}/api/fact-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '', content: contentForApi, url })
        });
        if (!fcResp.ok) throw new Error(`API error: ${fcResp.status}`);
        const result = await fcResp.json();

        const adjustedScore = Math.min(Math.round(result.credibility.score * 100), 100);

        if (window.firebase && firebase.firestore) {
            try {
                await firebase.firestore().collection('facebook_verification_results').add({
                  platform: 'Web',
                  analysis: 'web-url',
                  url: url || null,
                  canonicalUrl: normalizeUrlForCache(url || ''),
                  contentType: 'Article URL',
                  credibilityScore: adjustedScore,
                  label: result.credibility && result.credibility.label,
                  aiScore: adjustedScore,
                  aiVerdict: (result.credibility && result.credibility.label) || '',
                  aiExplanation: (result.zyla && (result.zyla.explanation || result.zyla.analysis)) || (result.credibility && result.credibility.explanation) || '',
                  sourcesFound: (result.credibility && result.credibility.sources) ?? 0,
                  factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
                  analyzedText: contentForApi,
                  contentHash: hashString(contentForApi),
                  pageName: (result && result.page_name) || null,
                  reviewedClaims: Array.isArray(result.claim_analysis) ? result.claim_analysis : [],
                  zylaFactCheck: result.zyla || null,
                  googleFactCheck: result.detailed_results || null,
                  imageUrl: isValidImageUrl(result.image_url) ? result.image_url : null,
                  userID: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous',
                  userEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
                  analyzed_at: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) {
                console.error('Error writing web analysis to facebook_verification_results:', e);
            }
        } else {
            console.log('Web analysis payload:', {
                platform: 'Web', analysis: 'web-url', url,
                canonicalUrl: normalizeUrlForCache(url || ''),
                contentType: 'Article URL', credibilityScore: adjustedScore,
                label: result.credibility && result.credibility.label,
                sourcesFound: (result.credibility && result.credibility.sources) ?? 0,
                factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
                analyzedText: contentForApi,
                contentHash: hashString(contentForApi),
                pageName: (result && result.page_name) || null,
                reviewedClaims: Array.isArray(result.claim_analysis) ? result.claim_analysis : [],
                zylaFactCheck: result.zyla || null,
                googleFactCheck: result.detailed_results || null,
                imageUrl: isValidImageUrl(result.image_url) ? result.image_url : null
            });
        }

        showVerificationResult('url', {
            credibilityScore: adjustedScore,
            sources: (result.credibility && result.credibility.sources) ?? 0,
            factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
            domain: extractDomain(url),
            // Prefer Zyla's explanation/reason when available; fallback to overall explanation
            credibilityExplanation: (result.zyla && (result.zyla.explanation || result.zyla.analysis)) || (result.credibility && result.credibility.explanation),
            credibilityLabel: result.credibility && result.credibility.label,
            mlDetails: result.ml_details || null,
            slangDetected: Array.isArray(result.slang_detected) ? result.slang_detected : [],
            sarcasmPercent: (typeof result.sarcasm_percent === 'number') ? result.sarcasm_percent : null,
            sarcasmRisk: result.sarcasm_risk || null,
            tone: result.tone || null,
            fakeClaims: Array.isArray(result.fake_claims) ? result.fake_claims : [],
            realClaims: Array.isArray(result.real_claims) ? result.real_claims : [],
            claimAnalysis: Array.isArray(result.claim_analysis) ? result.claim_analysis : [],
            claimsChecked: Array.isArray(result.claims_checked) ? result.claims_checked : [],
            hasGoogleClaims: !!result.has_google_claims,
            pageName: (result && result.page_name) || null
        });
    } catch (error) {
        console.error('Verification error:', error);
        showNotification('Error connecting to verification services. Please try again later.', 'error');
    } finally {
        setButtonLoading(urlVerifyBtn, false);
        hideVerifyLoading();
    }
}

// URL validation
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Extract domain from URL
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch (_) {
        return 'Unknown';
    }
}

function derivePageName(url) {
    try {
        if (!url) return '';
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host.includes('facebook.com')) {
            const seg = u.pathname.split('/').filter(Boolean)[0] || '';
            if (seg) return decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim();
            return 'Facebook';
        }
        return host;
    } catch (e) {
        const m = (url || '').match(/facebook\.com\/([A-Za-z0-9._-]+)/i);
        if (m && m[1]) return decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim();
        return '';
    }
}
// Build a non-empty, human-readable sentence from a URL
function buildNonEmptyContentFromUrl(url) {
    try {
        const u = new URL(url);
        const domain = (u.hostname || '').replace(/^www\./, '');
        const rawSegs = (u.pathname || '').split('/').filter(Boolean);
        const segs = rawSegs
            .map(s => decodeURIComponent(s))
            .filter(s => s.length >= 3 && !/^amp$|^m$|^en$|^index\b/i.test(s));
        const candidate = (segs[segs.length - 1] || segs[0] || '').replace(/[-_]+/g, ' ').trim();
        const topic = candidate || domain;
        const capped = topic.charAt(0).toUpperCase() + topic.slice(1);
        const trimmed = capped.length > 160 ? capped.slice(0, 160) : capped;
        return trimmed ? `Context from ${domain}: ${trimmed}.` : `Context from ${domain}.`;
    } catch (e) {
        return 'Context from provided link.';
    }
}

// Facebook URL validation
function isFacebookUrl(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return hostname === 'facebook.com' || 
               hostname === 'www.facebook.com' || 
               hostname === 'm.facebook.com' ||
               hostname.endsWith('.facebook.com');
    } catch (_) {
        return false;
    }
}

// Require a direct Facebook post/permalink URL we can extract from
function isSupportedFacebookPostUrl(url) {
    try {
        const u = new URL(url);
        const p = u.pathname.toLowerCase();
        const q = u.search.toLowerCase();
        return (
            /\/share\/p\//.test(p) ||
            /\/share\/r\//.test(p) ||
            /\/share\/v\//.test(p) ||
            /\/share\/[a-z0-9._-]+\/?/.test(p) ||
            /\/reel\//.test(p) ||
            /\/posts\//.test(p) ||
            /\/permalink\//.test(p) ||
            (/\/photo\.php/.test(p) && /fbid=\d+/.test(q))
        );
    } catch (_) {
        return false;
    }
}

// Facebook content quality validation
// Blocks random letters or low-context input from being verified
function isValidFacebookContent(text) {
    const t = (text || '').trim();
    // Require sufficient length
    if (t.length < 20) return false;
    // Require multiple words
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 3) return false;
    // Ensure presence of at least one longer alphabetic word
    const alphaWords = words.map(w => w.replace(/[^A-Za-z]/g, ''));
    const longWords = alphaWords.filter(w => w.length >= 4);
    if (longWords.length === 0) return false;
    // Reject repeated single-character gibberish
    const repeatedChar = /^([A-Za-z])\1{5,}$/;
    if (repeatedChar.test(t.replace(/\s+/g, ''))) return false;
    return true;
}

// Word-based validation and preprocessing utilities
function extractValidWords(text) {
    if (!text) return [];
    const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const tokens = lower.match(/[a-z][a-z'\-]*/g) || [];
    const vowels = /[aeiou]/;
    const repeatedCharPattern = /^([a-z])\1{2,}$/;
    const longConsonantRun = /[bcdfghjklmnpqrstvwxyz]{5,}/;
    return tokens.filter(w => {
        if (w.length < 2) return false;
        if (repeatedCharPattern.test(w)) return false;
        if (longConsonantRun.test(w)) return false;
        if (w.length >= 4 && !vowels.test(w)) return false;
        return true;
    });
}

function countValidWords(text) {
    return extractValidWords(text).length;
}

function preprocessTextForAnalysis(text) {
    const words = extractValidWords(text);
    return words.join(' ');
}

// Facebook verification handler
async function handleFacebookVerification() {
    console.log('Facebook verification started');
    console.log('facebookUrl element:', facebookUrl);
    console.log('facebookContent element:', facebookContent);
    
    const url = facebookUrl ? facebookUrl.value.trim() : '';
    const content = facebookContent ? facebookContent.value.trim() : '';
    
    console.log('URL value:', url);
    console.log('Content value:', content);
    
    // Check if either URL or content is provided
    if (!url && !content) {
        showNotification('Please enter a Facebook URL or paste Facebook content to analyze.', 'error');
        return;
    }
    
    // Validate Facebook URL if provided
    if (url && !isValidUrl(url)) {
        showNotification('Please enter a valid URL.', 'error');
        return;
    }
    
    if (url && !isFacebookUrl(url)) {
        showNotification('Please enter a valid Facebook URL (facebook.com).', 'error');
        return;
    }
    // Enforce supported post/permalink URL formats
    if (url && !isSupportedFacebookPostUrl(url)) {
        showNotification('Unsupported Facebook URL. Please paste a direct post/permalink link (e.g., https://facebook.com/share/p/...).', 'error');
        return;
    }
    
    // Validate content quality whenever content is provided (even when a valid URL exists)
    if (content) {
        const validCount = countValidWords(content);
        const passesQuality = isValidFacebookContent(content);
        if (!passesQuality || validCount < 5) {
            showNotification('Content is invalid or too short. Please enter at least 5 valid words.', 'error');
            return;
        }
    }

    try {
        const existing = await checkExistingVerification(url || null, content || null);
        if (existing) {
            const analysisType = url ? 'facebook-url' : 'facebook-content';

            // --- FIX: Rebuild Poser HTML from cached data ---
            let cachedPoserHtml = '';
            if (existing.poserDetection && existing.poserDetection.raw) {
                // Use the helper function to rebuild the HTML from the raw saved data
                cachedPoserHtml = buildPoserSummaryHtml(existing.poserDetection.raw);
            }
            showFacebookVerificationResult(analysisType, {
                credibilityScore: Number(existing.credibilityScore || 0),
                sources: Number(existing.sourcesFound || 0),
                factChecks: Number(existing.factChecks || 0),
                platform: 'Facebook',
                contentType: url ? 'Post/Article URL' : 'Text Content',
                url: existing.url || url || null,
                pageName: existing.pageName || null,
                credibilityExplanation: existing.explanation || ((existing.zylaFactCheck && (existing.zylaFactCheck.explanation || existing.zylaFactCheck.analysis)) || ''),
                credibilityLabel: existing.label || '',
                analyzedText: existing.analyzedText || content || '',
                mlDetails: null,
                slangDetected: Array.isArray(existing.slang_detected) ? existing.slang_detected : [],
                sarcasmPercent: (typeof existing.sarcasmPercent === 'number') ? existing.sarcasmPercent : null,
                sarcasmRisk: existing.sarcasmRisk || null,
                tone: null,
                fakeClaims: [],
                realClaims: [],
                claimAnalysis: Array.isArray(existing.reviewedClaims) ? existing.reviewedClaims : [],
                claimsChecked: [],
                hasGoogleClaims: !!(
                    (Array.isArray(existing.reviewedClaims) && existing.reviewedClaims.some(x => String(x.source||'').toLowerCase()==='google')) ||
                    (Array.isArray(existing.googleFactCheck) && existing.googleFactCheck.some(r => r && r.fact_check_result && Array.isArray(r.fact_check_result.claims) && r.fact_check_result.claims.length>0))
                ),
                resultId: existing.id || '',
                poserHtml: cachedPoserHtml // Pass the rebuilt HTML here
            });
            // showNotification('Loaded from existing verification.', 'success');
            return;
        }
    } catch (_) {}
    
    // Analysis options removed
    
    // Disable button and show loading state
    setButtonLoading(facebookVerifyBtn, true, 'Analyzing...');
    showVerifyLoading('Verify News');
    
    if (window.firebase && firebase.firestore) {
        try {
            await firebase.firestore().collection('facebook_verification_requests').add({
                url: url || null,
                content: content || null,
                userID: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous',
                userEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
                requestedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error('Error writing facebook_verification request:', e);
            showNotification('Failed to log verification request. Check Firestore rules.', 'error');
        }
    } else {
        console.log('FB verification request payload:', { url: url || null, content: content || null });
    }
    
    // If URL provided but no content, extract key claim from URL (frontend intelligence)
    let effectiveContent = content ? content.trim() : '';
    if (url && !effectiveContent) {
        try {
            const resp = await fetch(`${FACTCHECK_BASE}/api/extract-key-claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (resp.ok) {
                const data = await resp.json();
                const keyClaim = (data && typeof data.key_claim === 'string') ? data.key_claim.trim() : '';
                if (keyClaim) {
                    effectiveContent = keyClaim;
                }
            }
        } catch (e) {
            console.error('Key claim extraction failed:', e);
        }
    }
    // Proceed even if content is empty; backend will attempt URL-based extraction

    // Build the exact content string we will send to the API
    const contentForApi = effectiveContent || (url ? buildNonEmptyContentFromUrl(url) : '') || '';

    // Call the fact check API with the best available content
    try {
        const response = await fetch(`${FACTCHECK_BASE}/api/fact-check`, { // Replace with your actual API endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: 'Facebook Content',
                content: contentForApi,
                url: url || null,
                fast: true
            })
        });
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const result = await response.json();

        const analysisType = url ? 'facebook-url' : 'facebook-content';
        const cleanPayload = createCleanDbPayload(result, url, contentForApi, 'Facebook', analysisType);
        let resultId = null;
        if (window.firebase && firebase.firestore) {
            try {
                const resultDocRef = await firebase.firestore().collection('facebook_verification_results').add(cleanPayload);
                resultId = resultDocRef.id;
            } catch (e) {
                console.error('Error writing facebook_verification_results:', e);
                showNotification('Failed to store analysis result. Check Firestore rules.', 'error');
            }
        } else {
            console.log('FB verification clean payload:', cleanPayload);
        }

        // --- Poser Detection Integration ---
        let poserHtml = '';
        let poserPayload = null;
        try {
            let poserSourceUrl = (url || '').trim();
            if (poserSourceUrl.includes('facebook.com/share/')) {
                try {
                    const r = await fetch(`${FACTCHECK_BASE}/api/resolve-facebook-share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: poserSourceUrl })
                    });
                    if (r.ok) {
                        const j = await r.json();
                        if (j && j.resolved_url) poserSourceUrl = j.resolved_url;
                    }
                } catch (_) {}
            }
            const pageUrl = extractFacebookPageUrl(poserSourceUrl);
            const poserTarget = pageUrl || poserSourceUrl;
            if (poserTarget && poserTarget.includes('facebook.com')) {
                const cacheId = hashString(String(poserTarget || '').toLowerCase());
                let pd = null;
                try {
                    const cacheSnap = await firebase.firestore().collection('analyzed_pages_cache').doc(cacheId).get();
                    if (cacheSnap.exists) {
                        const cd = cacheSnap.data() || {};
                        if (cd && cd.raw) { pd = cd.raw; }
                    }
                } catch (_) {}
                if (!pd) {
                    const pdResp = await fetch(`${POSER_BASE}/api/poser/analyze_full`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: poserTarget })
                    });
                    if (pdResp.ok) { pd = await pdResp.json(); }
                }
                if (pd) {
                    poserHtml = buildPoserSummaryHtml(pd);
                    try {
                        const analysis = pd && pd.analysis ? pd.analysis : {};
                        const meta = pd && pd.metadata ? pd.metadata : {};
                        const trustScore = (typeof analysis.final_trust_score === 'number') ? analysis.final_trust_score : (pd && typeof pd.credi_score === 'number' ? pd.credi_score : ((pd && pd.trust && pd.trust.raw_score) || 0));
                        const verdict = analysis.verdict || (pd && (pd.verdict || pd.classification)) || 'Unknown';
                        poserPayload = {
                            trustScore: Math.max(0, Math.min(100, Math.round(Number(trustScore || 0)))) ,
                            verdict: String(verdict || 'Unknown'),
                            name: meta.name || '',
                            analyzedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            raw: pd
                        };
                        await firebase.firestore().collection('analyzed_pages_cache').doc(cacheId).set({
                          url: poserTarget,
                          name: meta.name || '',
                          raw: pd,
                          trustScore: Math.max(0, Math.min(100, Math.round(Number(trustScore || 0)))) ,
                          verdict: String(verdict || 'Unknown'),
                          savedAt: firebase.firestore.FieldValue.serverTimestamp(),
                          userId: (firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous')
                        }, { merge: true });
                    } catch(_) {}
                }
            }
        } catch (e) {
            console.warn('Poser detection failed:', e);
        }

        showFacebookVerificationResult(analysisType, {
            credibilityScore: cleanPayload.credibilityScore,
            sources: cleanPayload.sourcesFound,
            factChecks: cleanPayload.factChecks,
            platform: 'Facebook',
            contentType: cleanPayload.contentType,
            url: cleanPayload.url,
            pageName: cleanPayload.pageName,
            credibilityExplanation: cleanPayload.explanation,
            credibilityLabel: result.credibility && result.credibility.label,
            analyzedText: cleanPayload.analyzedText,
            mlDetails: null,
            slangDetected: Array.isArray(cleanPayload.slang_detected) ? cleanPayload.slang_detected : [],
            sarcasmPercent: (typeof result.sarcasm_percent === 'number') ? result.sarcasm_percent : null,
            sarcasmRisk: result.sarcasm_risk || null,
            tone: result.tone || null,
            fakeClaims: Array.isArray(result.fake_claims) ? result.fake_claims : [],
            realClaims: Array.isArray(result.real_claims) ? result.real_claims : [],
            claimAnalysis: Array.isArray(cleanPayload.reviewedClaims) ? cleanPayload.reviewedClaims : [],
            claimsChecked: Array.isArray(result.claims_checked) ? result.claims_checked : [],
            hasGoogleClaims: !!result.has_google_claims,
            resultId: resultId,
            poserHtml: poserHtml
        });

        // persist poser detection summary back to the verification result
        try {
            if (resultId && poserPayload) {
                await firebase.firestore().collection('facebook_verification_results').doc(resultId).set({ poserDetection: poserPayload }, { merge: true });
            }
        } catch(e) {
            console.warn('Failed to save poserDetection to facebook_verification_results:', e);
        }
    } catch (error) {
        console.error('Fact check API error:', error);
        showNotification('Error connecting to fact check service. Please try again later.', 'error');
    } finally {
        setButtonLoading(facebookVerifyBtn, false);
        hideVerifyLoading();
    }
}

// Show Facebook verification results
function showFacebookVerificationResult(type, data) {
    const hasGoogle = !!data.hasGoogleClaims;
    const googleFake = (Array.isArray(data.fakeClaims) ? data.fakeClaims : []).filter(c => (c && c.source) === 'google');
    const googleReal = (Array.isArray(data.realClaims) ? data.realClaims : []).filter(c => (c && c.source) === 'google');

    const fakeClaimsSection = (!hasGoogle || googleFake.length === 0) ? '' : `
            <div style="margin-top:0.75rem;">
                <h4 style="margin:0 0 0.5rem 0;">Fake Claims Identified</h4>
                <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                    ${googleFake.slice(0, 2).map(fc => `
                        <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                            <div><strong>Claim:</strong> ${safeTextForHtml(fc.claim || 'N/A')}</div>
                            <div><strong>Reviewer:</strong> ${safeTextForHtml(fc.reviewer || 'Unknown reviewer')}</div>
                            <div><strong>Title:</strong> ${safeTextForHtml(fc.rating || fc.textualRating || 'Unrated')}</div>
                            <div><strong>Explanation:</strong> ${safeTextForHtml(fc.explanation || 'No explanation')}</div>
                            ${fc.url ? `<div><a href="${fc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
                        </li>
                    `).join('')}
                </ul>
            </div>
    `;

    const realClaimsSection = (!hasGoogle || googleReal.length === 0) ? '' : `
            <div style="margin-top:0.75rem;">
                <h4 style="margin:0 0 0.5rem 0;">True Claims Identified</h4>
                <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                    ${googleReal.slice(0, 2).map(rc => `
                        <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                            <div><strong>Claim:</strong> ${safeTextForHtml(rc.claim || 'N/A')}</div>
                            <div><strong>Reviewer:</strong> ${safeTextForHtml(rc.reviewer || 'Unknown reviewer')}</div>
                            <div><strong>Title:</strong> ${safeTextForHtml(rc.rating || rc.textualRating || 'Unrated')}</div>
                            <div><strong>Explanation:</strong> ${safeTextForHtml(rc.explanation || 'No explanation')}</div>
                            ${rc.url ? `<div><a href="${rc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
                        </li>
                    `).join('')}
                </ul>
            </div>
    `;

    const explanationSection = data.credibilityExplanation ? `
        <div class="panel trust">
            <div class="panel-title"><span class="label">Explanation</span></div>
            <p>${safeTextForHtml(data.credibilityExplanation)}</p>
        </div>
    ` : '';

    const mlSection = '';

    const slangSection = (Array.isArray(data.slangDetected) && data.slangDetected.length) ? `
        <div class="panel metrics">
            <div class="panel-title"><span class="label">Slang Detection</span></div>
            <ul>
                <li><strong>Slang Words Detected:</strong> ${data.slangDetected.join(', ')}</li>
                ${(typeof data.sarcasmPercent === 'number') ? `<li><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</li>` : ''}
                ${data.sarcasmRisk ? `<li><strong>Risk:</strong> ${data.sarcasmRisk}</li>` : ''}
            </ul>
        </div>
    ` : (typeof data.sarcasmPercent === 'number' ? `
        <div class="panel metrics">
            <div class="panel-title"><span class="label">Slang Detection</span></div>
            <ul>
                <li><em>No slang words detected.</em></li>
                <li><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</li>
                ${data.sarcasmRisk ? `<li><strong>Risk:</strong> ${data.sarcasmRisk}</li>` : ''}
            </ul>
        </div>
    ` : '');

    // Build a combined fact-check details list as fallback when real/fake lists are empty
    const combinedClaimsRaw = [
        ...(Array.isArray(data.claimsChecked) ? data.claimsChecked : []),
        ...(Array.isArray(data.claimAnalysis) ? data.claimAnalysis : [])
    ];
    const seenClaims = new Set();
    const combinedClaims = combinedClaimsRaw
        .map(c => ({
            claim: (c.claim || c.text || c.statement || '').trim(),
            explanation: c.explanation || '',
            url: c.url || '',
            reviewer: c.reviewer || ((c.publisher && c.publisher.name) ? c.publisher.name : ''),
            rating: c.rating || c.textualRating || '',
            source: c.source || ''
        }))
        .filter(c => c.claim)
        .filter(c => {
            const key = `${c.claim.toLowerCase()}|${c.url}`;
            if (seenClaims.has(key)) return false;
            seenClaims.add(key);
            return true;
        })
        .slice(0, 4);

    const label = (data.credibilityLabel || '').toUpperCase();
    const googleCombined = combinedClaims.filter(c => c.source === 'google' || (c.url && c.reviewer && !/^(ML Model|Zyla Labs)$/i.test(c.reviewer)));
    // Fallback to ML/Zyla when Google has no claims
    const fallbackCombined = googleCombined.length > 0 ? [] : combinedClaims.filter(c => (
        c.source === 'ml' || c.source === 'zyla' || /^(ML Model)$/i.test(c.reviewer) || (c.url && c.reviewer)
    ));
    const activeCombined = googleCombined.length > 0 ? googleCombined : fallbackCombined;
    // Only show Sources when Google claimReview URLs exist
    const hasGoogleUrl = googleCombined.some(c => !!c.url);
    const claimsOrderHtml = hasGoogleUrl ? '' : `${realClaimsSection}${fakeClaimsSection}`;

    const reviewedClaimsPanel = (activeCombined.length > 0) ? `
        <div class="panel">
            <div class="panel-title"><span class="label">Reviewed Claims</span></div>
            <ul>
                ${activeCombined.map(c => `
                    <li>
                        <div><strong>Claim:</strong> ${safeTextForHtml(c.claim || 'N/A')}</div>
                        <div><strong>Reviewer:</strong> ${safeTextForHtml(c.reviewer || 'Unknown reviewer')}</div>
                        <div><strong>Rating:</strong> ${safeTextForHtml(c.rating || 'Unrated')}</div>
                        <div><strong>Explanation:</strong> ${safeTextForHtml(c.explanation || 'No explanation')}</div>
                        ${c.url ? `<div><a href="${c.url}" target="_blank">View fact check</a></div>` : ``}
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : (googleCombined.length === 0 ? `
        <div class="panel"><div class="panel-title"><span class="label">Reviewed Claims</span></div><div style="color:#9ca3af;">No Zyla Fact Check review found.</div></div>
    ` : '');

    const realPanelHtml = (!hasGoogle || googleReal.length === 0) ? '' : `
        <div class="panel trust">
          <div class="panel-title"><span class="label">Verified Claims</span></div>
          <ul>
            ${googleReal.slice(0, 2).map(rc => `
              <li>
                <div><strong>Claim:</strong> ${safeTextForHtml(rc.claim || 'N/A')}</div>
                <div><strong>Reviewer:</strong> ${safeTextForHtml(rc.reviewer || 'Unknown reviewer')}</div>
                <div><strong>Title:</strong> ${safeTextForHtml(rc.rating || rc.textualRating || 'Unrated')}</div>
                <div><strong>Explanation:</strong> ${safeTextForHtml(rc.explanation || 'No explanation')}</div>
                ${rc.url ? `<div><a href="${rc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
              </li>
            `).join('')}
          </ul>
        </div>`;

    const fakePanelHtml = (!hasGoogle || googleFake.length === 0) ? '' : `
        <div class="panel risk">
          <div class="panel-title"><span class="label">Debunked Claims</span></div>
          <ul>
            ${googleFake.slice(0, 2).map(fc => `
              <li>
                <div><strong>Claim:</strong> ${safeTextForHtml(fc.claim || 'N/A')}</div>
                <div><strong>Reviewer:</strong> ${safeTextForHtml(fc.reviewer || 'Unknown reviewer')}</div>
                <div><strong>Title:</strong> ${safeTextForHtml(fc.rating || fc.textualRating || 'Unrated')}</div>
                <div><strong>Explanation:</strong> ${safeTextForHtml(fc.explanation || 'No explanation')}</div>
                ${fc.url ? `<div><a href="${fc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
              </li>
            `).join('')}
          </ul>
        </div>`;

    const factCheckDetailsSection = `
        ${realPanelHtml}
        ${fakePanelHtml}
        ${(!realPanelHtml && !fakePanelHtml) ? reviewedClaimsPanel : ''}
    `;

    let ps = getPoserStyleClass(data.credibilityScore);
    const labelLower = String(data.credibilityLabel || '').toLowerCase();
    if (labelLower.includes('unverified') || labelLower.includes('neutral')) {
      ps = 'neutral';
    }
    const hl = (function(s){ if (s>=75) return 'hl-good'; if (s>=50) return 'hl-mixed'; return 'hl-bad'; })(Number(data.credibilityScore||0));
    const textHL = (function(l, s) {
        const t = String(l || '').toLowerCase();
        if (t.includes('credible') && !t.includes('low')) return 'hl-good';
        if (t.includes('mixed')) return 'hl-mixed';
        if (t.includes('low')) return 'hl-bad';
        if (t.includes('unverified') || t.includes('neutral')) return 'hl-neutral';
        if (s >= 75) return 'hl-good';
        if (s >= 50) return 'hl-mixed';
        return 'hl-bad';
    })(data.credibilityLabel, Number(data.credibilityScore || 0));

    const panelStatus = (function(l, s) {
      const t = String(l || '').toLowerCase();
     // 1. Check for Neutral/Unverified labels FIRST
      if (t.includes('unverified') || t.includes('neutral')) return 'neutral';
      
      // 2. Then check Trust/Risk/Mixed based on labels or score
      if ((t.includes('credible') && !t.includes('low')) || s >= 75) return 'trust';
      if (t.includes('low') || s < 50) return 'risk';
      
      // 3. Fallback for mixed score range (50-74)
      if (t.includes('mixed') || (s >= 50 && s < 75)) return 'mixed';
      return 'neutral';
    })(data.credibilityLabel, Number(data.credibilityScore || 0));

    // --- UPDATED DISCLAIMER: Matches Cached "Panel" Style ---
    const disclaimerHtml = `
        <div class="disclaimer-box">
            <strong>Disclaimer:</strong> 
            This tool uses automated analysis of public signals to estimate credibility. Always verify independently. The results are for awareness and guidance purposes only.
        </div>`;

    const manualRequestHtml = getManualRequestButtonHtml(data, 'facebook');

    const resultHtml = `
        <div class="verify-result-card ${ps} verification-result facebook-result">
            <div class="result-header">
                <div class="platform-badge">
                    <i class="fab fa-facebook"></i>
                    <span>Facebook Analysis</span>
                </div>
                <div class="content-type">${data.contentType || 'Post'}</div>
            </div>
            
            <div class="summary-band ${ps}">
                <div class="score-donut ${ps}" style="--pct:${data.credibilityScore}">
                  <div class="inner">
                    <div class="num">${data.credibilityScore}</div>
                    <div class="pct">%</div>
                  </div>
                </div>
                <div class="summary-text">
                  <div class="classification-row">
                    <span class="risk-icon ${ps}"><i class="fas fa-shield-alt"></i></span>
                    <h3 class="${hl}">${data.credibilityLabel || ''}</h3>
                  </div>
                  <div class="accent-bar ${ps}"></div>
                  <p>${getFacebookScoreSummary(data.credibilityScore)}</p>
                </div>
            </div>

            <div class="panels-row">
              <div class="panel ${panelStatus}">
                <div class="panel-title"><span class="label">Analyzed Text</span></div>
                ${data.analyzedText ? `<div style="max-height: 150px; overflow-y: auto; white-space: pre-wrap;"><p class="${textHL}">${safeTextForHtml(data.analyzedText)}</p></div>` : `<p>No text provided.</p>`}
              </div>
              <div class="panel metrics">
                <div class="panel-title"><span class="label">Metrics</span></div>
                <ul>
                  <li><strong>FB Page:</strong> ${safeTextForHtml(data.pageName || '')}</li>
                  <li><strong>Sources Found:</strong> ${data.sources ?? 0}</li>
                  <li><strong>Fact Checks:</strong> ${data.factChecks ?? 0}</li>
                  ${data.url ? `<li><strong>URL:</strong> <span class="url-value">${data.url}</span></li>` : ''}
                </ul>
              </div>
            </div>

            ${explanationSection}
            ${slangSection}
            ${factCheckDetailsSection}
            
            ${data.poserHtml || ''} 
            ${manualRequestHtml}
            
            ${disclaimerHtml}

            <div class="feedback-section compact" 
                 data-analysis="${type}"
                 data-platform="facebook"
                 data-url="${data.url || ''}"
                 data-content-type="${data.contentType || 'Post'}"
                 data-score="${data.credibilityScore}"
                 data-label="${data.credibilityLabel || ''}"
                 data-result-id="${data.resultId || ''}">
                <div class="feedback-controls">
                    <button class="feedback-btn" type="button" data-feedback="agree">
                        <i class="fas fa-thumbs-up"></i>
                        <span>Agree</span>
                    </button>
                    <button class="feedback-btn" type="button" data-feedback="disagree">
                        <i class="fas fa-thumbs-down"></i>
                        <span>Disagree</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    showModal('Credibility Analysis Complete', resultHtml);
}

// Get Facebook-specific score summary
function getFacebookScoreSummary(score) {
    if (score >= 75) {
        return 'The content aligns with verified information and shows no signs of misinformation.';
    } else if (score >= 55) {
        return 'Contains mixed information. Some claims may be true while others are disputed.';
    } else if (score >= 46) {
        return 'We could not find sufficient evidence to verify this content. Proceed with caution.';
    } else {
        return 'This post may contain false or misleading information. Please verify before sharing.';
    } 
}

// Get detailed Facebook analysis summary
function getFacebookDetailedSummary(data) {
    return `This Facebook content has been analyzed using our AI-powered verification system. The analysis considered content patterns, source reliability, and cross-referencing with known fact-checking databases. ${data.sources ?? 0} sources were consulted and ${data.factChecks ?? 0} fact-checking reports were reviewed.`;
}

// Show verification results
async function showVerificationResult(type, data) {
    // Store verification result in Firebase
    try {
        const pageName = data.pageName || null;
        const verificationData = {
            type: type, // 'text' or 'url'
            content: type === 'text' ? articleContent.value.trim() : null,
            url: type === 'url' ? articleUrl.value.trim() : null,
            domain: data.domain || null,
            credibilityScore: data.credibilityScore,
            sourcesFound: data.sources,
            factChecks: data.factChecks,
            pageName: pageName || null,
            verifiedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous',
            verifierEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
            verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
            summary: getScoreSummary(data.credibilityScore)
        };
        
        if (window.firebase && firebase.firestore) {
            await firebase.firestore().collection('verification_results').add(verificationData);
            console.log('Verification result stored in Firebase');
        } else {
            console.log('Verification result payload:', verificationData);
        }
    } catch (error) {
        console.error('Error storing verification result:', error);
    }
    
    const hasGoogle = !!data.hasGoogleClaims;
    const googleFake = (Array.isArray(data.fakeClaims) ? data.fakeClaims : []).filter(c => (c && c.source) === 'google');
    const googleReal = (Array.isArray(data.realClaims) ? data.realClaims : []).filter(c => (c && c.source) === 'google');

    const fakeClaimsSection = (!hasGoogle || googleFake.length === 0) ? '' : `
            <div style="margin-top:0.75rem;">
                <h4 style="margin:0 0 0.5rem 0;">Fake Claims Identified</h4>
                <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                    ${googleFake.slice(0, 2).map(fc => `
                        <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                            <div><strong>Claim:</strong> ${safeTextForHtml(fc.claim || 'N/A')}</div>
                            <div><strong>Reviewer:</strong> ${safeTextForHtml(fc.reviewer || 'Unknown reviewer')}</div>
                            <div><strong>Title:</strong> ${safeTextForHtml(fc.rating || fc.textualRating || 'Unrated')}</div>
                            <div><strong>Explanation:</strong> ${safeTextForHtml(fc.explanation || 'No explanation')}</div>
                            ${fc.url ? `<div><a href="${fc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
                        </li>
                    `).join('')}
                </ul>
            </div>
    `;

    const realClaimsSection = (!hasGoogle || googleReal.length === 0) ? '' : `
            <div style="margin-top:0.75rem;">
                <h4 style="margin:0 0 0.5rem 0;">True Claims Identified</h4>
                <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                    ${googleReal.slice(0, 2).map(rc => `
                        <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                            <div><strong>Claim:</strong> ${safeTextForHtml(rc.claim || 'N/A')}</div>
                            <div><strong>Reviewer:</strong> ${safeTextForHtml(rc.reviewer || 'Unknown reviewer')}</div>
                            <div><strong>Title:</strong> ${safeTextForHtml(rc.rating || rc.textualRating || 'Unrated')}</div>
                            <div><strong>Explanation:</strong> ${safeTextForHtml(rc.explanation || 'No explanation')}</div>
                            ${rc.url ? `<div><a href="${rc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
                        </li>
                    `).join('')}
                </ul>
            </div>
    `;

    const explanationSection = data.credibilityExplanation ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Explanation</h4>
            <p>${data.credibilityExplanation}</p>
        </div>
    ` : '';

    const mlSection = '';

    const slangSection = (Array.isArray(data.slangDetected) && data.slangDetected.length) ? `
        <div class="panel metrics">
            <div class="panel-title"><span class="label">Slang Detection</span></div>
            <ul class="two-col">
                <li><strong>Slang Words Detected:</strong> ${data.slangDetected.join(', ')}</li>
                ${(typeof data.sarcasmPercent === 'number') ? `<li><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</li>` : ''}
                ${data.sarcasmRisk ? `<li><strong>Risk:</strong> ${data.sarcasmRisk}</li>` : ''}
            </ul>
        </div>
    ` : (typeof data.sarcasmPercent === 'number' ? `
        <div class="panel metrics">
            <div class="panel-title"><span class="label">Slang Detection</span></div>
            <ul class="two-col">
                <li><em>No slang words detected.</em></li>
                <li><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</li>
                ${data.sarcasmRisk ? `<li><strong>Risk:</strong> ${data.sarcasmRisk}</li>` : ''}
            </ul>
        </div>
    ` : '');
    
    // Build sources-only fallback if no claims
    const combinedClaimsRaw = [
        ...(Array.isArray(data.claimsChecked) ? data.claimsChecked : []),
        ...(Array.isArray(data.claimAnalysis) ? data.claimAnalysis : [])
    ];
    const seenClaims = new Set();
    const combinedClaims = combinedClaimsRaw
        .map(c => ({
            claim: (c.claim || c.text || c.statement || '').trim(),
            explanation: c.explanation || '',
            url: c.url || '',
            reviewer: c.reviewer || ((c.publisher && c.publisher.name) ? c.publisher.name : ''),
            rating: c.rating || c.textualRating || '',
            source: c.source || ''
        }))
        .filter(c => c.claim)
        .filter(c => {
            const key = `${c.claim.toLowerCase()}|${c.url}`;
            if (seenClaims.has(key)) return false;
            seenClaims.add(key);
            return true;
        })
        .slice(0, 4);

    const label2 = (data.credibilityLabel || '').toUpperCase();
    const googleCombined2 = combinedClaims.filter(c => c.source === 'google' || (c.url && c.reviewer && !/^(ML Model|Zyla Labs)$/i.test(c.reviewer)));
    // Fallback to ML/Zyla when Google has no claims
    const fallbackCombined2 = googleCombined2.length > 0 ? [] : combinedClaims.filter(c => (
        c.source === 'ml' || c.source === 'zyla' || /^(ML Model)$/i.test(c.reviewer) || (c.url && c.reviewer)
    ));
    const activeCombined2 = googleCombined2.length > 0 ? googleCombined2 : fallbackCombined2;
    // Only show Sources when Google claimReview URLs exist
    const hasGoogleUrl2 = googleCombined2.some(c => !!c.url);
    const claimsOrderHtml2 = hasGoogleUrl2 ? '' : `${realClaimsSection}${fakeClaimsSection}`;

    const reviewedClaimsPanel2 = (activeCombined2.length > 0) ? `
        <div class="panel">
            <div class="panel-title"><span class="label">Reviewed Claims</span></div>
            <ul>
                ${activeCombined2.map(c => `
                    <li>
                        <div><strong>Claim:</strong> ${safeTextForHtml(c.claim || 'N/A')}</div>
                        <div><strong>Reviewer:</strong> ${safeTextForHtml(c.reviewer || 'Unknown reviewer')}</div>
                        <div><strong>Title:</strong> ${safeTextForHtml(c.rating || 'Unrated')}</div>
                        <div><strong>Explanation:</strong> ${safeTextForHtml(c.explanation || 'No explanation')}</div>
                        ${c.url ? `<div><a href="${c.url}" target="_blank">View fact check</a></div>` : (c.source === 'google' ? `<div><em>No fact-check URL available.</em></div>` : ``)}
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    const realPanelHtml2 = (!hasGoogle || googleReal.length === 0) ? '' : `
        <div class="panel trust">
          <div class="panel-title"><span class="label">Verified Claims</span></div>
          <ul>
            ${googleReal.slice(0, 2).map(rc => `
              <li>
                <div><strong>Claim:</strong> ${safeTextForHtml(rc.claim || 'N/A')}</div>
                <div><strong>Reviewer:</strong> ${safeTextForHtml(rc.reviewer || 'Unknown reviewer')}</div>
                <div><strong>Title:</strong> ${safeTextForHtml(rc.rating || rc.textualRating || 'Unrated')}</div>
                <div><strong>Explanation:</strong> ${safeTextForHtml(rc.explanation || 'No explanation')}</div>
                ${rc.url ? `<div><a href="${rc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
              </li>
            `).join('')}
          </ul>
        </div>`;

    const fakePanelHtml2 = (!hasGoogle || googleFake.length === 0) ? '' : `
        <div class="panel risk">
          <div class="panel-title"><span class="label">Debunked Claims</span></div>
          <ul>
            ${googleFake.slice(0, 2).map(fc => `
              <li>
                <div><strong>Claim:</strong> ${safeTextForHtml(fc.claim || 'N/A')}</div>
                <div><strong>Reviewer:</strong> ${safeTextForHtml(fc.reviewer || 'Unknown reviewer')}</div>
                <div><strong>Title:</strong> ${safeTextForHtml(fc.rating || fc.textualRating || 'Unrated')}</div>
                <div><strong>Explanation:</strong> ${safeTextForHtml(fc.explanation || 'No explanation')}</div>
                ${fc.url ? `<div><a href="${fc.url}" target="_blank">View fact check</a></div>` : `<div><em>No fact-check URL available.</em></div>`}
              </li>
            `).join('')}
          </ul>
        </div>`;

    const factCheckDetailsSection = `
        ${realPanelHtml2}
        ${fakePanelHtml2}
        ${(!realPanelHtml2 && !fakePanelHtml2) ? reviewedClaimsPanel2 : ''}
        ${(!hasGoogleUrl2) ? `
            <div class="panel">
                <div class="panel-title"><span class="label">Sources</span></div>
                <ul>
                    ${googleCombined2.map(c => c.url ? `
                        <li><a href="${c.url}" target="_blank">View fact check</a></li>
                    ` : '').join('')}
                </ul>
            </div>
        ` : ''}
    `;

    let ps2 = getPoserStyleClass(data.credibilityScore);
    const labelLower2 = String(data.credibilityLabel || '').toLowerCase();
    if (labelLower2.includes('unverified') || labelLower2.includes('neutral')) {
      ps2 = 'neutral';
    }
    const panelStatus2 = (function(l, s) {
      const t = String(l || '').toLowerCase();
      // 1. Check for Neutral/Unverified labels FIRST
      if (t.includes('unverified') || t.includes('neutral')) return 'neutral';
      
      // 2. Then check Trust/Risk/Mixed based on labels or score
      if ((t.includes('credible') && !t.includes('low')) || s >= 75) return 'trust';
      if (t.includes('low') || s < 50) return 'risk';
      
      // 3. Fallback for mixed score range (50-74)
      if (t.includes('mixed') || (s >= 50 && s < 75)) return 'mixed';
      return 'neutral';
    })(data.credibilityLabel, Number(data.credibilityScore || 0));
    const hl2 = (function(s){ if (s>=75) return 'hl-good'; if (s>=50) return 'hl-mixed'; return 'hl-bad'; })(Number(data.credibilityScore||0));
    const textHL2 = (function(l, s) {
      const t = String(l || '').toLowerCase();
      if (t.includes('credible') && !t.includes('low')) return 'hl-good';
      if (t.includes('mixed')) return 'hl-mixed';
      if (t.includes('low')) return 'hl-bad';
      if (t.includes('unverified') || t.includes('neutral')) return 'hl-neutral';
      if (s >= 75) return 'hl-good';
      if (s >= 50) return 'hl-mixed';
      return 'hl-bad';
    })(data.credibilityLabel, Number(data.credibilityScore || 0));
    // ... inside showVerificationResult ...

    // --- UPDATED DISCLAIMER: Matches Cached "Panel" Style ---
    const disclaimerHtml2 = `
        <div class="disclaimer-box">
            <strong>Disclaimer:</strong> 
            This tool uses automated analysis of public signals to estimate credibility. Always verify independently. The results are for awareness and guidance purposes only.
        </div>`;

    const resultHtml = `
        <div class="verify-result-card ${ps2} verification-result url-result">
            <div class="result-header">
                <div class="platform-badge">
                    <i class="fas fa-globe"></i>
                    <span>Web Analysis</span>
                </div>
                <div class="content-type">${data.domain || 'Article'}</div>
            </div>
            
            <div class="summary-band ${ps2}">
                <div class="score-donut ${ps2}" style="--pct:${data.credibilityScore}">
                  <div class="inner">
                    <div class="num">${data.credibilityScore}</div>
                    <div class="pct">%</div>
                  </div>
                </div>
                <div class="summary-text">
                  <div class="classification-row">
                    <span class="risk-icon ${ps2}"><i class="fas fa-shield-alt"></i></span>
                    <h3 class="${hl2}">${data.credibilityLabel || ''}</h3>
                  </div>
                  <div class="accent-bar ${ps2}"></div>
                  <p>${getScoreSummary(data.credibilityScore)}</p>
                </div>
            </div>

            <div class="panels-row">
               <div class="panel ${panelStatus2}">
                <div class="panel-title"><span class="label">Analyzed Text</span></div>
                ${data.analyzedText ? `<div style="max-height: 150px; overflow-y: auto; white-space: pre-wrap;"><p class="${textHL2}">${safeTextForHtml(data.analyzedText)}</p></div>` : `<p>No text provided.</p>`}
              </div>
              <div class="panel metrics">
                <div class="panel-title"><span class="label">Metrics</span></div>
                <ul>
                  <li><strong>Web Page:</strong> ${safeTextForHtml(pageName || '')}</li>
                  <li><strong>Sources Found:</strong> ${data.sources ?? 0}</li>
                  <li><strong>Fact Checks:</strong> ${data.factChecks ?? 0}</li>
                  ${type === 'url' && articleUrl && articleUrl.value ? `<li><strong>URL:</strong> <span class="url-value">${articleUrl.value}</span></li>` : ''}
                </ul>
              </div>
            </div>

            ${explanationSection}
            ${slangSection}
            ${factCheckDetailsSection}
            
            ${disclaimerHtml2} <div class="feedback-section compact" 
                 data-analysis="${type}"
                 data-platform="web"
                 data-url="${type === 'url' && articleUrl && articleUrl.value ? articleUrl.value : (data.url || '')}"
                 data-content-type="${data.domain || 'Article'}"
                 data-score="${data.credibilityScore}"
                 data-label="${data.credibilityLabel || ''}">
                <div class="feedback-controls">
                    <button class="feedback-btn" type="button" data-feedback="agree">
                        <i class="fas fa-thumbs-up"></i>
                        <span>Agree</span>
                    </button>
                    <button class="feedback-btn" type="button" data-feedback="disagree">
                        <i class="fas fa-thumbs-down"></i>
                        <span>Disagree</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    showModal('Credibility Analysis Complete', resultHtml);
}

// Get score class for styling
function getScoreClass(score) {
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
}

function getPoserStyleClass(score) {
    const s = Number(score || 0);
    if (s >= 75) return 'high';
    if (s >= 50) return 'medium';
    return 'low';
}

// Get score class based on label (requested behavior)
function getScoreClassByLabel(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!t) return 'neutral';
    if (t === 'credible') return 'high';
    if (t === 'mixed') return 'medium'; // Maps to orange/yellow usually
    if (t.includes('unverified')) return 'neutral'; // Maps to grey/blue
    if (t.includes('low credibility')) return 'low';
    return 'neutral';
}

// Get score summary text
function getScoreSummary(score) {
    if (score >= 75) {
        return 'The content aligns with verified information and shows no signs of misinformation.';
    } else if (score >= 55) {
        return 'Contains mixed information. Some claims may be true while others are disputed or lack context.';
    } else if (score >= 46) {
        return 'We could not find sufficient evidence to verify this content. It has not been debunked, but it is not confirmed.';
    } else {
        return 'This post may contain false or misleading information. Please verify before sharing.';
    }
}

// Map verdict label text to credibility color classes (CREDIBLE/MIXED/LOW CREDIBILITY)
function getCredibilityClass(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!t) return 'neutral-credibility';
    if (t === 'low credibility' || t.includes('low credibility')) return 'low-credibility';
    if (t === 'credible') return 'high-credibility';
    if (t === 'mixed') return 'medium-credibility'; // Ensure CSS has .medium-credibility
    if (t.includes('unverified')) return 'neutral-credibility'; // Ensure CSS has .neutral-credibility
    return 'neutral-credibility';
}

// Highlight class for analyzed text based on label
function getHighlightClassByLabel(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!t) return 'highlight-neutral';
    if (t === 'credible') return 'highlight-high';
    if (t === 'mixed') return 'highlight-medium';
    if (t.includes('unverified') || t.includes('neutral')) return 'highlight-neutral';
    if (t.includes('low credibility')) return 'highlight-low';
    return 'highlight-neutral';
}

// Decode incoming HTML entities (e.g., &quot;, &#x2019;) to plain text
function decodeHtmlEntities(str) {
    const t = document.createElement('textarea');
    t.innerHTML = String(str || '');
    return t.value;
}

// Normalize curly “smart” quotes to straight quotes for consistency
function normalizeSmartQuotes(str) {
    return String(str)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"');
}

// Escape for HTML context without converting quotes, so they display correctly
function safeTextForHtml(str) {
    const decoded = decodeHtmlEntities(str);
    const normalized = normalizeSmartQuotes(decoded);
    return String(normalized)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Show modal
function showModal(title, content) {
    // Create modal HTML
    const modalHtml = `
        <div class="modal-overlay" id="verificationModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="closeModal()">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    document.getElementById('verificationModal').style.display = 'flex';
}

// Close modal
function closeModal() {
  const modal = document.getElementById('verificationModal');
  if (modal) {
    modal.remove();
    // Trigger feedback popup only on first verification close
    try {
      if (window.Feedback && typeof window.Feedback.promptIfFirstTime === 'function') {
        window.Feedback.promptIfFirstTime();
      }
    } catch (e) {
      console.warn('Feedback prompt failed:', e);
    }
  }
}

// Facebook word counter (max 300 words)
function updateFacebookCharacterCount() {
    if (facebookContent && facebookCharCount) {
        // Split by whitespace and filter out empty entries
        let words = facebookContent.value.trim().split(/\s+/).filter(Boolean);
        let currentWords = words.length;

        // Enforce 300-word maximum by truncating excess words
        if (currentWords > 300) {
            words = words.slice(0, 300);
            facebookContent.value = words.join(' ');
            currentWords = 300;
        }

        // Update counter text with current word count
        facebookCharCount.textContent = currentWords;

        // Change color based on word count (soft warnings near the limit)
        if (currentWords > 280) {
            facebookCharCount.style.color = '#ef4444'; // danger near limit
        } else if (currentWords > 260) {
            facebookCharCount.style.color = '#f59e0b'; // warning approaching limit
        } else {
            facebookCharCount.style.color = '#6b7280'; // neutral
        }

        // Button gating: enable when either valid URL OR ≥14 valid words
        // If content is present but <14, keep disabled even if URL exists
        if (facebookVerifyBtn) {
            const urlText = facebookUrl ? facebookUrl.value.trim() : '';
            const validUrl = !!urlText && isValidUrl(urlText) && isFacebookUrl(urlText);
            const contentText = facebookContent ? facebookContent.value.trim() : '';
            const validCount = countValidWords(contentText);

            if (contentText) {
                facebookVerifyBtn.disabled = validCount < 5;
                facebookVerifyBtn.title = validCount < 5 ? 'Enter at least 5 valid words to analyze.' : '';
            } else if (validUrl) {
                facebookVerifyBtn.disabled = false;
                facebookVerifyBtn.title = '';
            } else {
                facebookVerifyBtn.disabled = true;
                facebookVerifyBtn.title = 'Provide a valid Facebook URL or at least 14 words.';
            }
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checking elements...');
    console.log('facebookVerifyBtn:', facebookVerifyBtn);
    console.log('facebookUrl:', facebookUrl);
    console.log('facebookContent:', facebookContent);
    console.log('facebookCharCount:', facebookCharCount);
    
    // URL verification
    if (urlVerifyBtn) {
        urlVerifyBtn.addEventListener('click', handleUrlVerification);
    }
    
    // Facebook verification
    if (facebookVerifyBtn) {
        facebookVerifyBtn.addEventListener('click', handleFacebookVerification);
        console.log('Facebook verification event listener added');
    } else {
        console.error('Facebook verify button not found!');
    }
    
    // Word counter for Facebook content
    if (facebookContent) {
        facebookContent.addEventListener('input', updateFacebookCharacterCount);
        facebookContent.addEventListener('input', updateVerifyButtons);
    }

    // Press Enter to start verification
    if (articleUrl) {
        articleUrl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleUrlVerification();
            }
        });
        articleUrl.addEventListener('input', updateVerifyButtons);
    }
    if (facebookUrl) {
        facebookUrl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleFacebookVerification();
            }
        });
        facebookUrl.addEventListener('input', updateVerifyButtons);
    }
    if (facebookContent) {
        facebookContent.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleFacebookVerification();
            }
        });
    }
    
    // Toggle between URL and Facebook sections
    if (showUrlVerifyBtn) {
        showUrlVerifyBtn.addEventListener('click', function() {
            switchVerifySection('url');
        });
    }
    if (showFacebookVerifyBtn) {
        showFacebookVerifyBtn.addEventListener('click', function() {
            switchVerifySection('facebook');
        });
    }

    // Open standalone Poser Detection page
    const openPoserDetectBtn = document.getElementById('open-poser-detection');
    if (openPoserDetectBtn) {
        openPoserDetectBtn.addEventListener('click', function() {
            window.location.href = 'poser-detection.html';
        });
    }
    // Default to Facebook section visible on load
    switchVerifySection('facebook');
    updateVerifyButtons();
    
    // Close modal when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });
    
    // Handle escape key for modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});

// Feedback interactions: like/dislike selection and submit
document.addEventListener('click', async function(e) {
    const fbBtn = e.target.closest('.feedback-btn');
    if (!fbBtn) return;

    const section = fbBtn.closest('.feedback-section');
    if (!section) return;

    section.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));
    fbBtn.classList.add('selected');

    const feedbackChoice = fbBtn.dataset.feedback;
    const resultId = section.dataset.resultId || '';

    if (!feedbackChoice) {
        showNotification('Please select agree or disagree.', 'error');
        return;
    }

    if (!window.firebase || !firebase.firestore) {
        showNotification('Feedback unavailable: Firestore not initialized.', 'error');
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user || !user.uid) {
        showNotification('Sign in to vote.', 'error');
        return;
    }

    if (!resultId) {
        showNotification('Unable to record vote: missing result ID.', 'error');
        return;
    }

    try {
        const docRef = firebase.firestore().collection('facebook_verification_results').doc(resultId);
        await firebase.firestore().runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            const data = snap.exists ? snap.data() : {};
            const feedback = data.feedback || { agreeCount: 0, disagreeCount: 0 };
            const voters = data.voters || {};
            const prev = voters[user.uid];
            const next = feedbackChoice;
            if (prev === next) return;
            if (prev === 'agree') feedback.agreeCount = Math.max(0, Number(feedback.agreeCount || 0) - 1);
            if (prev === 'disagree') feedback.disagreeCount = Math.max(0, Number(feedback.disagreeCount || 0) - 1);
            if (next === 'agree') feedback.agreeCount = Number(feedback.agreeCount || 0) + 1;
            if (next === 'disagree') feedback.disagreeCount = Number(feedback.disagreeCount || 0) + 1;
            voters[user.uid] = next;
            tx.set(docRef, { feedback, voters }, { merge: true });
        });
        showNotification('Your vote has been recorded.', 'success');
    } catch (err) {
        console.error('Error recording vote:', err);
        showNotification('Failed to record vote. Please try again.', 'error');
    }
});

document.addEventListener('click', async function(e) {
    const btn = e.target.closest('.request-verification-btn');
    if (!btn) return;
    try {
        const u = btn.dataset.url || '';
        if (!u) { showNotification('Missing page URL.', 'error'); return; }
        if (typeof firebase === 'undefined' || !firebase.firestore) { showNotification('Database not initialized.', 'error'); return; }
        const id = hashString(String(u).toLowerCase());
        async function getNotifyOptInOnce(){
            const user = firebase.auth().currentUser;
            if (!user) { try { if (typeof showNotification === 'function') showNotification('Sign in to manage notifications in the Notifications page.', 'info'); } catch(_){} return false; }
            const ref = firebase.firestore().collection('users').doc(user.uid);
            const snap = await ref.get();
            const data = snap.exists ? (snap.data() || {}) : {};
            if (typeof data.notifyOptIn === 'boolean') return !!data.notifyOptIn;
            const wants = window.confirm('Would you like to receive a notification when this verification request is processed?');
            await ref.set({ notifyOptIn: !!wants }, { merge: true });
            return !!wants;
        }
        const wantsNotify = await getNotifyOptInOnce();
        await firebase.firestore().collection('pending_verifications').doc(id).set({ url: u, status: 'pending', source: 'user_request', timestamp: firebase.firestore.FieldValue.serverTimestamp(), userId: (firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous'), notifyUser: !!wantsNotify }, { merge: true });
        if (wantsNotify && firebase.auth().currentUser){
            await firebase.firestore().collection('notifications').add({ userId: firebase.auth().currentUser.uid, type: 'info', title: 'Verification requested', message: 'You will receive a notification when processed.', timestamp: firebase.firestore.FieldValue.serverTimestamp(), link: 'my-verifications.html' });
        } else { try { if (typeof showNotification === 'function') showNotification('You can enable notifications in the Notifications page.', 'info'); } catch(_){} }
        showNotification('Request submitted for verification review.', 'success');
        btn.disabled = true;
        btn.textContent = 'Requested';
    } catch (_) {
        showNotification('Failed to submit request.', 'error');
    }
});

// Toggle controls
const showUrlVerifyBtn = document.getElementById('show-url-verify');
const showFacebookVerifyBtn = document.getElementById('show-facebook-verify');
const urlVerifySection = document.getElementById('url-verify-section');
const facebookVerifySection = document.getElementById('facebook-verify-section');

function switchVerifySection(section) {
    if (!urlVerifySection || !facebookVerifySection) return;
    const showUrl = section === 'url';
    urlVerifySection.style.display = showUrl ? 'block' : 'none';
    facebookVerifySection.style.display = showUrl ? 'none' : 'block';
    if (showUrlVerifyBtn && showFacebookVerifyBtn) {
        showUrlVerifyBtn.classList.toggle('active', showUrl);
        showFacebookVerifyBtn.classList.toggle('active', !showUrl);
    }
}

switchVerifySection('facebook');
function extractFacebookPageUrl(u) {
    try {
        if (!u) return '';
        const url = new URL(u);
        if (!url.hostname.includes('facebook.com')) return '';
        const path = url.pathname;
        // story/permalink style: use id param
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
        // default: return without query/fragment
        return `${url.protocol}//${url.hostname}${path}`;
    } catch (e) {
        return (u || '').split('?')[0];
    }
}

//poser detect result
function buildPoserSummaryHtml(pd) {
    try {
        const analysis = pd && pd.analysis ? pd.analysis : {};
        let verdict = analysis.verdict || (pd && (pd.verdict || pd.classification)) || 'Unknown';
        let score = (typeof analysis.final_trust_score === 'number') ? analysis.final_trust_score : (pd && typeof pd.credi_score === 'number' ? pd.credi_score : ((pd && pd.trust && pd.trust.raw_score) || 0));
        const meta = pd && pd.metadata ? pd.metadata : {};
        const name = meta.name || 'Unknown';
        const followersRaw = (meta.followers_count !== undefined && meta.followers_count !== null) ? Number(meta.followers_count) : NaN;
        const likesRaw = (meta.fan_count !== undefined && meta.fan_count !== null) ? Number(meta.fan_count) : NaN;
        const hasFollowers = Number.isFinite(followersRaw) && followersRaw > 0;
        const hasLikes = Number.isFinite(likesRaw) && likesRaw > 0;
        const audienceCount = (hasFollowers || hasLikes) ? Math.max(hasFollowers ? followersRaw : 0, hasLikes ? likesRaw : 0) : null;
        const audienceLabel = (hasFollowers && (!hasLikes || followersRaw >= likesRaw)) ? 'followers' : 'likes';
        const hasBadge = !!(meta.is_verified || String(meta.verification_status||'').toLowerCase().includes('verified'));
        const fromRegistry = String(meta.verification_source || '').toLowerCase() === 'verified_registry' || !!meta.is_verified_source;
        const aiRisk = (analysis && analysis.breakdown && analysis.breakdown.scoring_layers && typeof analysis.breakdown.scoring_layers.ai_risk === 'number') ? analysis.breakdown.scoring_layers.ai_risk : null;
        const isHighRisk = (typeof aiRisk === 'number' && aiRisk >= 70) || String(verdict || '').toLowerCase().includes('poser');
        const isLowRisk = (typeof aiRisk === 'number' && aiRisk <= 30) || (score >= 80 && !isHighRisk);
        const fromApify = !!meta._apify_fallback_used;
        const restricted = !!meta._permissions_restricted;
        const badgeOrigin = fromRegistry ? 'Registry' : (fromApify ? 'Apify' : (restricted ? 'Graph (restricted)' : 'Graph'));
        const badgeLine = fromRegistry
            ? 'Badge: Verified (Registry)'
            : (hasBadge ? `Badge: Badged (${badgeOrigin})` : 'Badge: Unverified');
        const color = (typeof aiRisk === 'number')
            ? (aiRisk >= 70 ? '#ef4444' : (aiRisk >= 55 ? '#f59e0b' : '#22c55e'))
            : (score >= 80 ? '#22c55e' : (score >= 55 ? '#f59e0b' : '#ef4444'));
        const availability = (analysis && analysis.data_availability) || null;
        const note = availability === 'sparse'
            ? 'Data unavailable for public signals; using AI + limited metadata.'
            : (availability === 'partial'
                ? 'Some signals are missing; verdict blends AI with available metadata.'
                : (pd && pd.note ? pd.note : ''));
        const availabilityBadgeHtml = availability === 'sparse' 
            ? '<span class="availability-badge sparse">Data Unavailable</span>' 
            : (availability === 'partial' 
                ? '<span class="availability-badge partial">Some Data Missing</span>' 
                : '');
        let aiExplanation = (analysis && analysis.breakdown && analysis.breakdown.ai_explanation) ? analysis.breakdown.ai_explanation : (analysis.ai_explanation || '');
        const aiVerdict = (analysis && analysis.breakdown && analysis.breakdown.ai_verdict) ? analysis.breakdown.ai_verdict : ((typeof aiRisk === 'number') ? (aiRisk >= 70 ? 'Likely Poser' : (aiRisk <= 30 ? 'Likely Authentic' : 'Mixed Signals')) : '');
        try {
            const t = String(aiExplanation || '').toLowerCase();
            const hasPic = !!(meta && meta.picture && meta.picture.data && meta.picture.data.url && !meta.picture.data.is_silhouette);
            const hasBio = !!(meta && (meta.about || meta.description));
            if (hasBadge && (/not verified|unverified|no verified|lacks official verification/.test(t))) {
                aiExplanation = 'Verified account with official signals.';
            } else if (audienceCount >= 100000 && (/low follower|few follower|no follower/.test(t))) {
                aiExplanation = 'High audience and established presence.';
            } else if (hasBio && (/no bio|missing bio|no description/.test(t))) {
                aiExplanation = 'Bio present with details.';
            } else if (hasPic && (/no profile picture|default picture|missing profile/.test(t))) {
                aiExplanation = 'Custom profile image present.';
            }
        } catch (_) {}
        const requestBtnHtml = (!fromRegistry && pd && pd.request && pd.request.url) ? `<div><button class="request-verification-btn" data-url="${pd.request.url}" style="margin-top:6px;background:#0b1626;color:#e5e7eb;border:1px solid rgba(148,163,184,0.24);border-radius:10px;padding:6px 10px;font-weight:700;">Request Verified Badge Review</button></div>` : '';
        return `
            <div class="result-summary" style="margin-top:1rem; border-left:4px solid ${color};">
                <h4 style="margin:0 0 0.5rem 0;">Source Risk (Poser Detection)</h4>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="min-width:56px; height:56px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:${color}20; color:${color}; font-weight:700;">${Math.max(0, Math.min(100, Math.round(score)))}%</div>
                    <div>
                        <div><strong>${verdict}</strong> ${availabilityBadgeHtml}</div>
                        <div style="color:#6b7280; font-size:0.9rem;">${name}${audienceCount !== null ? ` • ${audienceCount.toLocaleString()} ${audienceLabel}` : ''} • ${badgeLine}</div>
                        ${note ? `<div style="color:#6b7280; font-size:0.85rem;">${note}</div>` : ''}
                        ${aiExplanation || typeof aiRisk === 'number' ? `<div style="color:#334155; font-size:0.85rem; margin-top:4px;">${aiExplanation || ''}${typeof aiRisk === 'number' ? ` • AI Risk: ${aiRisk}/100` : ''}${aiVerdict ? ` • AI Verdict: ${aiVerdict}` : ''}</div>` : ''}
                        ${requestBtnHtml}
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        return '';
    }
}

/* --- REQUEST MANUAL NEWS VERIFICATION --- */
window.submitNewsVerificationRequest = async function(resultId, url, type, score) {
    if (!resultId) {
        showNotification("Cannot verify: Result ID missing.", "error");
        return;
    }

    const btn = document.getElementById(`news-req-btn-${resultId}`);
    if (btn) {
        btn.innerHTML = '<span class="btn-spinner" style="width:14px;height:14px;border-width:2px;"></span> Sending...';
        btn.disabled = true;
    }

    try {
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error("Database not connected");
        }

        const user = firebase.auth().currentUser;
        const db = firebase.firestore();
        
        
        await db.collection('pending_news_verification').add({
            resultId: resultId,
            url: url || null,
            type: type || 'text',
            currentScore: score || 0,
            contentSnippet: url ? null : "Text Content Analysis",
            userId: user ? user.uid : 'anonymous',
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });

        showNotification("Request submitted to Admin for manual review.", "success");
        if (btn) {
            btn.innerHTML = 'Request Sent <i class="fas fa-check"></i>';
            btn.style.borderColor = '#16a34a';
            btn.style.color = '#16a34a';
            btn.style.background = 'rgba(22, 163, 74, 0.1)';
        }

    } catch (e) {
        console.error("Submission error:", e);
        showNotification("Failed to submit request.", "error");
        if (btn) {
            btn.innerText = "Request Manual Verification";
            btn.disabled = false;
        }
    }
}

function getManualRequestButtonHtml(data, type) {
    const safeId = data.resultId || 'temp_' + Math.floor(Math.random() * 10000);
    const safeUrl = (data.url || '').replace(/'/g, "\\'");
    const safeType = type || 'facebook';
    const safeScore = data.credibilityScore || 0;

    return `
    <div style="margin-top: 20px; padding: 16px; border-top: 1px solid rgba(148,163,184,0.15); text-align: center; background: rgba(15, 23, 42, 0.3); border-radius: 12px;">
        <p style="font-size: 0.85rem; color: #94a3b8; margin: 0 0 12px 0;">
            Is this analysis incorrect? You can request a human review.
        </p>
        <button id="news-req-btn-${safeId}" 
                onclick="window.submitNewsVerificationRequest('${safeId}', '${safeUrl}', '${safeType}', ${safeScore})" 
                style="background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #60a5fa; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.9rem; transition: all 0.2s;">
            Request Manual Verification
        </button>
    </div>
    `;
}