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
        const fcResp = await fetch('http://127.0.0.1:5000/api/fact-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '', content: effectiveContent || '', url })
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
    if (t.length < 60) return false;
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
        if (!passesQuality || validCount < 14) {
            showNotification('Content is invalid or too short. Please enter at least 14 valid words.', 'error');
            return;
        }
    }
    
    // Analysis options removed
    
    // Disable button and show loading state
    facebookVerifyBtn.disabled = true;
    facebookVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing Facebook Content...';
    
    // Call the fact check API for Facebook content
    if (firebase.auth().currentUser) {
        // Store verification request in Firebase
        firebase.firestore().collection('facebook_verification_requests').add({
            url: url || null,
            content: content || null,
            userId: firebase.auth().currentUser.uid,
            userEmail: firebase.auth().currentUser.email,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
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
    const contentForApi = effectiveContent || '';

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
            hasGoogleClaims: !!result.has_google_claims
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

// Get Facebook-specific score summary
function getFacebookScoreSummary(score) {
    if (score >= 70) {
        return 'The content aligns with verified information and shows no signs of misinformation.';
    } else if (score >= 50) {
        return 'Contains both reliable and questionable information. Consider cross-referencing with additional sources.';
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
        
        await firebase.firestore().collection('verification_results').add(verificationData);
        console.log('Verification result stored in Firebase');
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
    if (!t) return 'low';
    if (t === 'credible') return 'high';
    if (t === 'mixed') return 'medium';
    if (t.includes('low credibility') || t.includes('unverified')) return 'low';
    return 'low';
}

// Get score summary text
function getScoreSummary(score) {
    if (score >= 70) {
        return 'The content aligns with verified information and shows no signs of misinformation.';
    } else if (score >= 50) {
        return 'Contains both reliable and questionable information. Consider cross-referencing with additional sources.';
    } else {
        return 'This post may contain false or misleading information. Please verify before sharing.';
    }
}

// Map verdict label text to credibility color classes (CREDIBLE/MIXED/LOW CREDIBILITY)
function getCredibilityClass(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!t) return '';
    if (t === 'low credibility' || t.includes('low credibility')) return 'low-credibility';
    if (t === 'credible') return 'high-credibility';
    if (t === 'mixed' || t.includes('unverified')) return 'medium-credibility';
    return '';
}

// Highlight class for analyzed text based on label
function getHighlightClassByLabel(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!t) return 'highlight-low';
    if (t === 'credible') return 'highlight-high';
    if (t === 'mixed') return 'highlight-medium';
    if (t.includes('low credibility') || t.includes('unverified')) return 'highlight-low';
    return 'highlight-low';
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
                facebookVerifyBtn.disabled = validCount < 14;
                facebookVerifyBtn.title = validCount < 14 ? 'Enter at least 14 valid words to analyze.' : '';
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
document.addEventListener('click', function(e) {
    // Toggle agree/disagree selection
    const fbBtn = e.target.closest('.feedback-btn');
    if (fbBtn) {
        const section = fbBtn.closest('.feedback-section');
        if (section) {
            section.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));
            fbBtn.classList.add('selected');
        }
    }

    // Submit feedback
    const submitBtn = e.target.closest('.submit-feedback-btn');
    if (submitBtn) {
        const section = submitBtn.closest('.feedback-section');
        if (!section) return;
        const selectedBtn = section.querySelector('.feedback-btn.selected');
        const feedbackChoice = selectedBtn ? selectedBtn.dataset.feedback : null;
        const commentEl = section.querySelector('.feedback-text');
        const comment = commentEl ? commentEl.value.trim() : '';

        if (!feedbackChoice && !comment) {
            showNotification('Please select like/dislike or add a comment.', 'error');
            return;
        }

        const payload = {
            analysis: section.dataset.analysis || null,
            platform: section.dataset.platform || null,
            url: section.dataset.url || null,
            contentType: section.dataset.contentType || null,
            score: Number(section.dataset.score || 0),
            label: section.dataset.label || null,
            feedback: feedbackChoice,
            comment: comment
        };

        try {
            if (window.firebase && firebase.firestore) {
                firebase.firestore().collection('verification_feedback').add({
                    ...payload,
                    userId: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous',
                    userEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                console.log('Feedback payload:', payload);
            }
            showNotification('Thanks for your feedback!', 'success');
        } catch (err) {
            console.error('Error submitting feedback:', err);
            showNotification('Failed to submit feedback. Please try again.', 'error');
        }
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

// Add CSS for notifications and modal
const additionalStyles = `
<style>
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease;
}

.notification-error {
    background: #ef4444;
}

.notification-success {
    background: #22c55e;
}

.notification-info {
    background: #3b82f6;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.modal-content {
    background: white;
    border-radius: 12px;
    max-width: 980px;
    width: 95%;
    max-height: 92vh;
    overflow-y: auto;
    border-left: 4px solid #1877f2;
}

.modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-header h2 {
    margin: 0;
    color: #1f2937;
}

.modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
}

.modal-body {
    padding: 1.5rem;
}

.modal-footer {
    display: flex;
    margin: 0 auto;
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
    text-align: center;
}

.verification-result {
    text-align: left;
    color: #1f2937;
}

.result-grid {
    display: grid;
    gap: 1rem;
    margin: 1rem 0;
}


.result-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f3f4f6;
}

.result-label {
    font-weight: 600;
    color: #374151;
}

.result-value {
    font-weight: 500;
    color: #1f2937;
}

.score-high {
    color: #22c55e;
}

.score-medium {
    color: #f59e0b;
}

.score-low {
    color: #ef4444;
}

.result-summary {
    margin-top: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    border-left: 4px solid #3b82f6;
    color: #374151;    
}

  .toggle-buttons {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      justify-content: center;
  }
.toggle-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    color: #374151;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
}
  .toggle-btn.active {
      background: #3b82f6;
      color: #fff;
      border-color: #2563eb;
  }
  #open-poser-detection.toggle-btn:hover {
      background: #7e22ce;
      color: #fff;
      border-color: #7e22ce;
  }
/* Verify Url Toggle */
#show-url-verify.toggle-btn.active {
    background: #22c55e;
    color: #fff;
    border-color: #16a34a;

}
/* Verify Facebook toggle */
#show-facebook-verify.toggle-btn.active {
    background: #1877f2;
    color: #fff;
    border-color: #166fe5;
}
.btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
}

.btn-primary {
    background: #3b82f6;
    color: white;
}

.btn-primary:hover {
    background: #2563eb;
}
/* Disabled button visuals */
.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}


.result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
}

.platform-badge {
    display: flex;
    align-items: center;
    background: linear-gradient(135deg, #1877f2 0%, #166fe5 100%);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.875rem;
}

.platform-badge i {
    margin-right: 0.5rem;
}

.content-type {
    background: #f3f4f6;
    color: #374151;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
}

.result-score {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1.25rem;
    align-items: center;
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 12px;
    border: 1px solid #e2e8f0;
}

.score-circle {
    width: 140px;
    height: 140px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    border: 4px solid;
}

.score-circle.score-high {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    border-color: #22c55e;
    color: #15803d;
}

.score-circle.score-medium {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border-color: #f59e0b;
    color: #d97706;
}

.score-circle.score-low {
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    border-color: #ef4444;
    color: #dc2626;
}

.score-number {
    font-size: 2.25rem;
    line-height: 1;
}

.score-label {
    font-size: 1rem;
    opacity: 0.8;
    line-height: 1;
}

.score-description h3 {
    margin: 0 0 0.5rem 0;
    color: #1f2937;
    font-size: 1.5rem;
}

.score-description p {
    margin: 0;
    color: #6b7280;
    font-size: 1.125rem;
    line-height: 1.7;
}

/* Credibility label color (verdict-based), referencing fact_check_styles.css */
.score-description .credibility-label {
    font-weight: 700;
}
.score-description .credibility-label.high-credibility {
    color: #10B981;
    background: transparent !important;
}
.score-description .credibility-label.medium-credibility {
    color: #F59E0B;
    background: transparent !important;
}
.score-description .credibility-label.low-credibility {
    color: #EF4444;
    background: transparent !important;
}

/* Responsive adjustments for small screens */
@media (max-width: 640px) {
    .result-score {
        grid-template-columns: 120px 1fr;
        gap: 1rem;
    }
    .score-circle {
        width: 110px;
        height: 110px;
    }
    .score-number {
        font-size: 1.75rem;
    }
    .score-description h3 {
        font-size: 1.25rem;
    }
    .score-description p {
        font-size: 0.95rem;
        line-height: 1.6;
    }
}

.analysis-features {
    margin: 1.5rem 0;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
}

.analysis-features h4 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.feature-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    color: #1f2937;
}

.feature-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: white;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    font-size: 0.875rem;
    color: #1f2937;
}

.feature-item.enabled {
    border-color: #22c55e;
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
}

.feature-item.disabled {
    border-color: #e5e7eb;
    background: #f9fafb;
    opacity: 0.6;
}

.feature-item i:first-child {
    margin-right: 0.5rem;
    color: #6b7280;
}

.feature-item.enabled i:first-child {
    color: #22c55e;
}

.feature-item i:last-child {
    color: #22c55e;
}

.feature-item.disabled i:last-child {
    color: #ef4444;
}

.facebook-summary {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border: 1px solid #3b82f6;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1.5rem;
}

.facebook-summary p {
    margin: 0;
    color: #1e40af;
    font-size: 0.875rem;
    line-height: 1.6;
}

/* Analyzed text highlighting */
.analyzed-text {
    border-left-width: 4px;
}
.analyzed-text.highlight-high {
    border-left-color: #22c55e;
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    color: #166534;
}
.analyzed-text.highlight-medium {
    border-left-color: #f59e0b;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
}
.analyzed-text.highlight-low {
    border-left-color: #ef4444;
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    color: #7f1d1d;
}

.url-value {
    word-break: break-all;
    font-family: monospace;
    font-size: 0.75rem;
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
}
/* Feedback section styles */
.feedback-section {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
}
.feedback-section.compact {
    margin-top: 0.5rem;
    padding: 0;
    background: transparent;
    border: 0;
}
.feedback-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.75rem;
}
.feedback-controls {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
}
.feedback-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #374151;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
}
.feedback-btn i { color: #6b7280; }
.feedback-btn.selected i { color: inherit; }
.facebook-result .feedback-btn.selected {
    border-color: #1877f2;
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    color: #1e40af;
}
.url-result .feedback-btn.selected {
    border-color: #22c55e;
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    color: #166534;
}
.feedback-comment .feedback-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
    color: #6b7280;
}
.feedback-text {
    width: 100%;
    resize: vertical;
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.875rem;
    color: #1f2937;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
.feedback-text::placeholder {
    color: #6b7280;
    opacity: 1;
    font-family: inherit;
}
.feedback-actions {
    margin-top: 0.75rem;
    text-align: right;
}
.facebook-result .submit-feedback-btn {
    background: #1877f2;
    color: #fff;
}
.url-result .submit-feedback-btn {
    background: #22c55e;
    color: #fff;
}
.submit-feedback-btn:hover {
    opacity: 0.95;
}
/* Add green left border and 12px radius to the Verify URL card */
#url-verify-section .verify-card {
    border-left: 4px solid #22c55e;
    border-radius: 20px;
}
</style>
`;

// Add styles to head
// Inline styles have been moved to verify-news.css and are no longer injected.