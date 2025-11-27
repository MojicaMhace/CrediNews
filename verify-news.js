// Verify News Page JavaScript

// Firebase will be available globally after firebase-config.js loads

// DOM Elements
const urlVerifyBtn = document.getElementById('verify-url-btn');
const facebookVerifyBtn = document.getElementById('verify-facebook-btn');
const articleUrl = document.getElementById('article-url');
const facebookUrl = document.getElementById('facebook-url');
const facebookContent = document.getElementById('facebook-content');
const facebookCharCount = document.getElementById('facebook-char-count');


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
    urlVerifyBtn.disabled = true;
    urlVerifyBtn.textContent = 'Verifying...';
    
    let effectiveContent = '';
    // Try to extract key claim from URL first
    try {
        const kcResp = await fetch('http://127.0.0.1:5000/api/extract-key-claim', {
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
        const contentForApi = effectiveContent || (url ? buildNonEmptyContentFromUrl(url) : '') || '';
        const fcResp = await fetch('http://127.0.0.1:5000/api/fact-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '', content: contentForApi, url })
        });
        if (!fcResp.ok) throw new Error(`API error: ${fcResp.status}`);
        const result = await fcResp.json();

        const adjustedScore = Math.min(Math.round(result.credibility.score * 100), 100);

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
            hasGoogleClaims: !!result.has_google_claims
        });
    } catch (error) {
        console.error('Verification error:', error);
        showNotification('Error connecting to verification services. Please try again later.', 'error');
    } finally {
        urlVerifyBtn.disabled = false;
        urlVerifyBtn.textContent = 'Verify URL';
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
    
    // Analysis options removed
    
    // Disable button and show loading state
    facebookVerifyBtn.disabled = true;
    facebookVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing Facebook Content...';
    
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
            const resp = await fetch('http://127.0.0.1:5000/api/extract-key-claim', {
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
        const response = await fetch('http://127.0.0.1:5000/api/fact-check', { // Replace with your actual API endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: 'Facebook Content',
                content: contentForApi,
                url: url || null
            })
        });
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const result = await response.json();

        const analysisType = url ? 'facebook-url' : 'facebook-content';
        
        // Use credibility score directly
        const adjustedScore = Math.min(Math.round(result.credibility.score * 100), 100);
        
        let resultId = null;
        if (window.firebase && firebase.firestore) {
            try {
                const resultDocRef = await firebase.firestore().collection('facebook_verification_results').add({
                    platform: 'Facebook',
                    analysis: analysisType,
                    url: url || null,
                    contentType: url ? 'Post/Article URL' : 'Text Content',
                    credibilityScore: adjustedScore,
                    label: result.credibility && result.credibility.label,
                    sourcesFound: (result.credibility && result.credibility.sources) ?? 0,
                    factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
                    analyzedText: contentForApi,
                    userID: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous',
                    userEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
                    analyzed_at: firebase.firestore.FieldValue.serverTimestamp()
                });
                resultId = resultDocRef.id;
            } catch (e) {
                console.error('Error writing facebook_verification_results:', e);
                showNotification('Failed to store analysis result. Check Firestore rules.', 'error');
            }
        } else {
            console.log('FB verification result payload:', {
                platform: 'Facebook',
                analysis: analysisType,
                url: url || null,
                contentType: url ? 'Post/Article URL' : 'Text Content',
                credibilityScore: adjustedScore,
                label: result.credibility && result.credibility.label,
                sourcesFound: (result.credibility && result.credibility.sources) ?? 0,
                factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
                analyzedText: contentForApi
            });
        }

        showFacebookVerificationResult(analysisType, {
            credibilityScore: adjustedScore,
            sources: (result.credibility && result.credibility.sources) ?? 0,
            factChecks: (result.credibility && result.credibility.factChecks) ?? 0,
            platform: 'Facebook',
            contentType: url ? 'Post/Article URL' : 'Text Content',
            url: url || null,
            // Prefer Zyla's explanation/reason when available; fallback to overall explanation
            credibilityExplanation: (result.zyla && (result.zyla.explanation || result.zyla.analysis)) || (result.credibility && result.credibility.explanation),
            credibilityLabel: result.credibility.label,
            analyzedText: contentForApi,
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
            resultId: resultId
        });
    } catch (error) {
        console.error('Fact check API error:', error);
        showNotification('Error connecting to fact check service. Please try again later.', 'error');
    } finally {
        // Reset button
        facebookVerifyBtn.disabled = false;
        facebookVerifyBtn.innerHTML = '<i class="fab fa-facebook"></i> Analyze Facebook Content';
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
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Explanation</h4>
            <p>${safeTextForHtml(data.credibilityExplanation)}</p>
        </div>
    ` : '';

    const mlSection = '';

    const slangSection = (Array.isArray(data.slangDetected) && data.slangDetected.length) ? `
        <div class="result-summary" style="margin-top:1rem; border-left-color:#1877f2;">
            <h4 style="margin:0 0 0.5rem 0;">Slang Detection</h4>
            <div><strong>Slang Words Detected:</strong> ${data.slangDetected.join(', ')}</div>
            ${(typeof data.sarcasmPercent === 'number') ? `<div><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</div>` : ''}
            ${data.sarcasmRisk ? `<div><strong>Risk:</strong> ${data.sarcasmRisk}</div>` : ''}
        </div>
    ` : (typeof data.sarcasmPercent === 'number' ? `
        <div class="result-summary" style="margin-top:1rem; border-left-color:#1877f2;">
            <h4 style="margin:0 0 0.5rem 0;">Slang Detection</h4>
            <div><em>No slang words detected.</em></div>
            <div><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</div>
            ${data.sarcasmRisk ? `<div><strong>Risk:</strong> ${data.sarcasmRisk}</div>` : ''}
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

    const reviewedClaimsSection = (activeCombined.length > 0) ? `
        <div style="margin-top:0.75rem;">
            <h4 style="margin:0 0 0.5rem 0;">Reviewed Claims</h4>
            ${googleCombined.length === 0 ? `<div style="margin:0 0 0.5rem 0; color:#6b7280; font-size:0.9rem;">No Google Fact Check reviews found; showing other analysis sources.</div>` : ''}
            <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                ${activeCombined.map(c => `
                    <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
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

    const factCheckDetailsSection = `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Fact-Check Claims</h4>
            ${claimsOrderHtml}
            ${reviewedClaimsSection}
            ${(!hasGoogleUrl) ? `
                <div style="margin-top:0.75rem;">
                    <h4 style="margin:0 0 0.5rem 0;">Sources:</h4>
                    <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                        ${googleCombined.map(c => c.url ? `
                            <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                                <div><a href="${c.url}" target="_blank">View fact check</a></div>
                            </li>
                        ` : '').join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    const resultHtml = `
        <div class="verification-result facebook-result">
            <div class="result-header">
                <div class="platform-badge">
                    <i class="fab fa-facebook"></i>
                    <span>Facebook Analysis</span>
                </div>
                <div class="content-type">${data.contentType || 'Post'}</div>
            </div>
            <div class="result-score">
                <div class="score-circle score-${getScoreClassByLabel(data.credibilityLabel)}">
                    <span class="score-number">${data.credibilityScore}</span>
                    <span class="score-label">%</span>
                </div>
                <div class="score-description">
                    <h3>CREDIBILITY SCORE - <span class="credibility-label ${getCredibilityClass(data.credibilityLabel)}">${data.credibilityLabel || ''}</span></h3>
                    <p>${getFacebookScoreSummary(data.credibilityScore)}</p>
                </div>
            </div>
            <div class="result-details">
                <div class="result-item">
                    <span class="result-label">Platform:</span>
                    <span class="result-value">${data.platform || 'Facebook'}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Sources Found:</span>
                    <span class="result-value">${data.sources ?? 0}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Fact Checks:</span>
                    <span class="result-value">${data.factChecks ?? 0}</span>
                </div>
                ${data.url ? `
                <div class="result-item">
                    <span class="result-label">URL:</span>
                    <span class="result-value url-value">${data.url}</span>
                </div>
                ` : ''}
            </div>
            ${data.analyzedText ? `
            <div class="result-summary analyzed-text ${getHighlightClassByLabel(data.credibilityLabel)}">
                <h4 style="margin:0 0 0.5rem 0;">Analyzed Text</h4>
                <p>${safeTextForHtml(data.analyzedText)}</p>
            </div>` : ''}
            ${explanationSection}
            ${slangSection}
            ${factCheckDetailsSection}
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
    
    // Create and show modal
    showModal('Credibility Analysis Complete', resultHtml);
}

// Get Facebook-specific score summary
function getFacebookScoreSummary(score) {
    if (score >= 75) {
        return 'The content aligns with verified information and shows no signs of misinformation.';
    } else if (score >= 55) {
        return 'Contains both reliable and questionable information. Consider cross-referencing.';
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
        const verificationData = {
            type: type, // 'text' or 'url'
            content: type === 'text' ? articleContent.value.trim() : null,
            url: type === 'url' ? articleUrl.value.trim() : null,
            domain: data.domain || null,
            credibilityScore: data.credibilityScore,
            sourcesFound: data.sources,
            factChecks: data.factChecks,
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
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Slang Detection</h4>
            <div><strong>Slang Words Detected:</strong> ${data.slangDetected.join(', ')}</div>
            ${(typeof data.sarcasmPercent === 'number') ? `<div><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</div>` : ''}
            ${data.sarcasmRisk ? `<div><strong>Risk:</strong> ${data.sarcasmRisk}</div>` : ''}
        </div>
    ` : (typeof data.sarcasmPercent === 'number' ? `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Slang Detection</h4>
            <div><em>No slang words detected.</em></div>
            <div><strong>Sarcasm Score:</strong> ${data.sarcasmPercent}%</div>
            ${data.sarcasmRisk ? `<div><strong>Risk:</strong> ${data.sarcasmRisk}</div>` : ''}
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

    const reviewedClaimsSection2 = (activeCombined2.length > 0) ? `
        <div style="margin-top:0.75rem;">
            <h4 style="margin:0 0 0.5rem 0;">Reviewed Claims</h4>
            ${googleCombined2.length === 0 ? `<div style=\"margin:0 0 0.5rem 0; color:#6b7280; font-size:0.9rem;\">No Google Fact Check reviews found; showing other analysis sources.</div>` : ''}
            <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                ${activeCombined2.map(c => `
                    <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
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

    const factCheckDetailsSection = `
        <div class="result-summary" style="margin-top:1rem;">
            <h4 style="margin:0 0 0.5rem 0;">Fact-Check Claims</h4>
            ${claimsOrderHtml2}
            ${reviewedClaimsSection2}
            ${(!hasGoogleUrl2) ? `
                <div style="margin-top:0.75rem;">
                    <h4 style="margin:0 0 0.5rem 0;">Sources:</h4>
                    <ul class="claim-list" style="list-style:none; padding:0; margin:0;">
                        ${googleCombined2.map(c => c.url ? `
                            <li class="claim-item" style="padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:0.5rem; background:#fff;">
                                <div><a href="${c.url}" target="_blank">View fact check</a></div>
                            </li>
                        ` : '').join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    const resultHtml = `
        <div class="verification-result url-result">
            <div class="result-header">
                <div class="platform-badge">
                    <i class="fas fa-globe"></i>
                    <span>Web Analysis</span>
                </div>
                <div class="content-type">${data.domain || 'Article'}</div>
            </div>
            <div class="result-score">
                <div class="score-circle score-${getScoreClassByLabel(data.credibilityLabel)}">
                    <span class="score-number">${data.credibilityScore}</span>
                    <span class="score-label">%</span>
                </div>
                <div class="score-description">
                    <h3>CREDIBILITY SCORE - <span class="credibility-label ${getCredibilityClass(data.credibilityLabel)}">${data.credibilityLabel || ''}</span></h3>
                    <p>${getScoreSummary(data.credibilityScore)}</p>
                </div>
            </div>
            <div class="result-details">
                <div class="result-item">
                    <span class="result-label">Platform:</span>
                    <span class="result-value">Web</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Sources Found:</span>
                    <span class="result-value">${data.sources ?? 0}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">Fact Checks:</span>
                    <span class="result-value">${data.factChecks ?? 0}</span>
                </div>
                
                ${type === 'url' && articleUrl && articleUrl.value ? `
                <div class="result-item">
                    <span class="result-label">URL:</span>
                    <span class="result-value url-value">${articleUrl.value}</span>
                </div>
                ` : ''}
            </div>
            ${data.analyzedText ? `
            <div class="result-summary analyzed-text ${getHighlightClassByLabel(data.credibilityLabel)}">
                <h4 style="margin:0 0 0.5rem 0;">Analyzed Text</h4>
                <p>${safeTextForHtml(data.analyzedText)}</p>
            </div>` : ''}

            ${explanationSection}
            ${slangSection}
            ${factCheckDetailsSection}
            <div class="feedback-section compact" 
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
    
    // Create and show modal
    showModal('Credibility Analysis Complete', resultHtml);
}

// Get score class for styling
function getScoreClass(score) {
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
}

// Get score class based on label (requested behavior)
function getScoreClassByLabel(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!t) return 'neutral';
    if (t === 'credible') return 'high';
    if (t === 'mixed') return 'medium';
    if (t.includes('unverified')) return 'neutral';
    if (t.includes('low credibility')) return 'low';
    return 'neutral';
}

// Get score summary text
function getScoreSummary(score) {
    if (score >= 75) {
        return 'The content aligns with verified information and shows no signs of misinformation.';
    } else if (score >= 55) {
        return 'Contains both reliable and questionable information. Consider cross-referencing.';
    } else if (score >= 46) {
        return 'We could not find sufficient evidence to verify this content. Proceed with caution.';
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
    if (t === 'mixed') return 'medium-credibility';
    if (t.includes('unverified')) return 'neutral-credibility';
    return 'neutral-credibility';
}

// Highlight class for analyzed text based on label
function getHighlightClassByLabel(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!t) return 'highlight-neutral';
    if (t === 'credible') return 'highlight-high';
    if (t === 'mixed') return 'highlight-medium';
    if (t.includes('unverified')) return 'highlight-neutral';
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

// Facebook word counter (max 2000 words)
function updateFacebookCharacterCount() {
    if (facebookContent && facebookCharCount) {
        // Split by whitespace and filter out empty entries
        let words = facebookContent.value.trim().split(/\s+/).filter(Boolean);
        let currentWords = words.length;

        // Enforce 2000-word maximum by truncating excess words
        if (currentWords > 2000) {
            words = words.slice(0, 2000);
            facebookContent.value = words.join(' ');
            currentWords = 2000;
        }

        // Update counter text with current word count
        facebookCharCount.textContent = currentWords;

        // Change color based on word count (soft warnings near the limit)
        if (currentWords > 1900) {
            facebookCharCount.style.color = '#ef4444'; // danger near limit
        } else if (currentWords > 1800) {
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
    }

    // Press Enter to start verification
    if (articleUrl) {
        articleUrl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleUrlVerification();
            }
        });
    }
    if (facebookUrl) {
        facebookUrl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleFacebookVerification();
            }
        });
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

// Default to Facebook section visible
switchVerifySection('facebook');

