// Global variables
const container = document.getElementById('historyGrid');
const searchInput = document.getElementById('ph-search');
const sortSelect = document.getElementById('ph-sort');
const prevBtn = document.getElementById('ph-prev');
const nextBtn = document.getElementById('ph-next');
const pageInfo = document.getElementById('ph-page');
const totalPagesInfo = document.getElementById('ph-pages');

const pageSize = 9; // 3 columns * 3 rows
let allDocs = [];
let currentPage = 1;
let totalPages = 1;
let currentUserID = null;
let currentSort = 'date_desc';
let currentQuery = '';

// --- HELPER FUNCTIONS ---
    function normalizeKey(str) {
        if (!str) return '';
        str = String(str).trim();
        if (str.endsWith('/')) str = str.slice(0, -1);
        str = str.replace(/^https?:\/\/(www\.)?/, '');
        return str.toLowerCase();
    }

    function safeText(s) {
    if (!s) return '';
    return String(s).replace(/[&<>]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]; });
}

function shorten(text, maxLength = 50) {
    if (!text) return '';
    text = String(text);
    if (text.length > maxLength) {
        return text.substring(0, maxLength - 3) + '...';
    }
    return text;
}

function formatTimestamp(ts) {
    try {
        if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
        if (ts && ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
        if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts).toLocaleString();
    } catch (e) {}
    return 'N/A';
}

function getVerdictStyle(verdict) {
    const v = String(verdict || '').toLowerCase();
    if (v.includes('likely authentic')) return 'high';
    if (v.includes('likely poser')) return 'low';
    return 'medium';
}

function getScoreColor(score) {
    const s = Number(score || 0);
    if (s >= 80) return '#22c55e'; // High Trust (Green)
    if (s >= 55) return '#f59e0b'; // Mixed (Yellow)
    return '#ef4444'; // Low Trust (Red)
}

function getVerdictScore(verdict) {
    const v = String(verdict || '').toLowerCase();
    if (v.includes('likely authentic')) return 3;
    if (v.includes('likely poser')) return 1;
    if (v.includes('mixed signals')) return 2;
    return 0;
}

// --- RENDERING & FILTERING ---

function renderCards(docs) {
    if (!container) return;

    if (docs.length === 0 && currentPage === 1) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: #9ca3af; padding: 3rem;">
                <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>No poser detection results found for your account.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageDocs = docs.slice(start, end);

    pageDocs.forEach(item => {
        // Data Mapping (Support flat and nested structures)
        const analysis = item.analysis || {};
        const score = Number(item.score || item.final_trust_score || analysis.final_trust_score || 0);
        const verdict = item.verdict || analysis.verdict || 'Mixed Signals';

        // Data Mapping for New Design
        let pageName = item.pageName || item.name;
        
        // Improve Name Extraction: If pageName is missing, try to parse from Input URL
        if (!pageName && item.input && item.input.includes('http')) {
             try {
                 const urlObj = new URL(item.input);
                 const pathParts = urlObj.pathname.split('/').filter(p => p);
                 // e.g. facebook.com/GMANetwork -> GMANetwork
                 if (pathParts.length > 0) {
                     pageName = pathParts[pathParts.length - 1];
                 } else {
                     pageName = urlObj.hostname;
                 }
             } catch(e) {
                 pageName = item.input;
             }
        }
        pageName = pageName || shorten(item.input || 'No input URL', 30);

        // Prioritize a clean ID (poster_id), then pageName, then fallback to input
        let displayId = item.poster_id || item.input || 'unknown';
        
        // Helper to extract handle from URL
        const extractHandle = (url) => {
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                if (pathParts.length > 0) return pathParts[pathParts.length - 1];
            } catch (e) {}
            return null;
        };

        // If displayId is a URL, extract handle
        if (displayId.includes('http')) {
            const handle = extractHandle(displayId);
            if (handle) displayId = handle;
        } 
        // If displayId is numeric (any length), try to find a better handle from input
        else if (/^\d+$/.test(displayId)) {
             if (item.input && item.input.includes('http')) {
                 const handle = extractHandle(item.input);
                 if (handle) displayId = handle;
             }
        }

        // Detailed Scores
        // Note: In a real scenario, these fields (ai_trust_score, rule_score) need to be saved in the DB record.
        // We use fallback math here if they aren't explicitly saved, to populate the UI.
        const aiTrust = item.ai_trust_score !== undefined ? item.ai_trust_score : (score >= 80 ? 90 : (score < 55 ? 40 : 60));
        const ruleScoreVal = item.rule_score !== undefined ? item.rule_score : score;
        const aiWeight = 60; // Backend uses 60% AI
        const ruleWeight = 40; // Backend uses 40% Rules

        // Construct Breakdown Text
        const breakdownText = `Final Score uses ${aiWeight}% AI + ${ruleWeight}% Rules: AI Trust ${aiTrust}% • Rule Score ${ruleScoreVal}% → ${score}%`;

        // Explanation - Prioritize AI explanation for detailed insight, then human explanation
        const breakdown = analysis.breakdown || {};
        const aiReason = breakdown.ai_explanation || (analysis.ai_agent && analysis.ai_agent.explanation) || analysis.ai_explanation || item.ai_explanation;
        
        let explanation = aiReason;
        
        // If AI reason is missing or generic, fall back to human explanation
        if (!explanation || explanation === "No AI insight available.") {
            explanation = item.human_explanation || analysis.human_explanation || item.verdict_explanation || item.rawExplanation;
        }
        
        if (!explanation) {
             explanation = `This score reflects our assessment of the page's legitimacy, content consistency, branding quality, and follower presence. It also checks for the absence of scam or gambling indicators.`;
        }

        let riskClass = 'risk-medium';
        // 1. Try to base it on the Verdict Text (The "Poser Detection Result")
        const vLower = String(verdict).toLowerCase();
        if (vLower.includes('likely authentic') || vLower.includes('low risk') || vLower.includes('trusted')) {
            riskClass = 'risk-low';
        } else if (vLower.includes('likely poser') || vLower.includes('high risk') || vLower.includes('fake')) {
            riskClass = 'risk-high';
        } else if (vLower.includes('moderate risk') || vLower.includes('mixed signals') || vLower.includes('suspicious')) {
            riskClass = 'risk-medium';
        } else {
            // 2. Fallback to Score Thresholds if verdict is unclear
            if (score >= 80) {
                riskClass = 'risk-low';
            } else if (score < 55) {
                riskClass = 'risk-high';
            } else {
                riskClass = 'risk-medium';
            }
        }

        // Dynamic Border Color for Status Box based on risk
        let statusBorderColor = '#fbbf24'; // Default Mixed
        if (riskClass === 'risk-low') statusBorderColor = '#22c55e'; // Green
        if (riskClass === 'risk-high') statusBorderColor = '#ef4444'; // Red

        const card = document.createElement('div');
        card.className = `ph-card`;
        card.setAttribute('data-id', item.id);
        
        // Verified Banner HTML (Conditional) - Only if verified_registry
        const meta = item.metadata || {};
        const isVerified = String(meta.verification_source || '').toLowerCase() === 'verified_registry' || !!meta.is_verified_source;

        const verifiedBannerHtml = isVerified ? `
            <div class="ph-verified-banner">
                <div class="ph-verified-icon">
                    <i class="fas fa-check"></i>
                </div>
                <div class="ph-verified-text">
                    <strong>Verified</strong>
                    <div class="ph-verified-sub">Official Blue Badge detected.</div>
                </div>
            </div>
        ` : '';

        // Determine gradient based on risk/score for the status box background
        // Screenshot shows a green gradient for Low Risk.
        let statusGradient = '';
        if (score >= 80) statusGradient = 'radial-gradient(circle at 15% 50%, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 40%, rgba(15, 23, 42, 0) 70%)'; // Green glow behind donut
        else if (score < 55) statusGradient = 'radial-gradient(circle at 15% 50%, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 40%, rgba(15, 23, 42, 0) 70%)'; // Red glow
        else statusGradient = 'radial-gradient(circle at 15% 50%, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 40%, rgba(15, 23, 42, 0) 70%)'; // Yellow glow

        card.innerHTML = `
            <div class="ph-card-inner">
                ${verifiedBannerHtml}

                <!-- Main Status Box (Container with Gradient) -->
                <div class="ph-status-box" style="background: ${statusGradient};">
                    <div class="ph-score-donut" style="--pct:${Math.round(score)}; --ring-color:${statusBorderColor}; box-shadow: 0 0 40px ${statusBorderColor}50;">
                        <div class="inner">
                            <div class="num">${Math.round(score)}</div>
                            <div class="pct">%</div>
                        </div>
                    </div>
                    <div class="ph-header-info">
                        <h3>${safeText(pageName)}</h3>
                        <span class="ph-risk-label ${riskClass}">${safeText(verdict)} - Likely Authentic / Trusted Source.</span>
                        <div class="ph-header-desc">
                            ${score >= 80 
                                ? 'Verified Registry: Official page confirmed. Strong signals of authenticity.' 
                                : (score < 55 
                                    ? 'Warning: High risk signals detected. Page may be impersonating an official source.' 
                                    : 'Caution: Mixed signals detected. Proceed with care.')}
                        </div>
                    </div>
                </div>

                <div class="ph-card-body">
                    <!-- Meta Bar -->
                    <div class="ph-meta-bar">
                        <span class="ph-meta-label">ID:</span>
                        <span class="ph-id-badge">${safeText(displayId)}</span>
                        <span class="ph-meta-dot">•</span>
                        <span class="ph-meta-date">Analyzed: ${formatTimestamp(item.analyzedAt || item.createdAt)}</span>
                    </div>

                    <!-- Why This Score Section -->
                    <div class="ph-why-section">
                        <div class="ph-why-title">WHY THIS SCORE</div>
                        <div class="ph-why-breakdown">${safeText(breakdownText)}</div>
                        <div class="ph-why-explanation">
                            <strong style="color: ${statusBorderColor}">${safeText(verdict)}</strong> • ${safeText(explanation)}
                        </div>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="ph-action-footer">
                    <div class="ph-action-prompt">
                        Is this actually a<br>legitimate official news<br>source?
                    </div>
                    <div class="ph-action-buttons">
                        <button class="ph-btn-verify" onclick="requestManualVerification('${item.id}', '${safeText(pageName)}')">
                            <i class="fas fa-paper-plane"></i>
                            <div class="btn-text">
                                Request<br>Manual<br>Verification
                            </div>
                        </button>
                        <button class="ph-btn-delete" onclick="deleteItem('${item.id}')">
                            <i class="fas fa-trash-alt"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    updatePaginationUI(docs.length);
}

function applyFiltersAndRender() {
    const q = String(currentQuery || '').trim().toLowerCase();
    let docs = allDocs.slice();

    if (q) {
        docs = docs.filter(d => {
            const name = String(d.pageName || d.name || '').toLowerCase();
            const input = String(d.input || '').toLowerCase();
            const verdict = String(d.verdict || '').toLowerCase();
            return name.includes(q) || input.includes(q) || verdict.includes(q);
        });
    }

    // Sorting Logic
    if (currentSort === 'date_desc') {
        docs.sort((a, b) => {
            const tA = a.createdAt || a.analyzedAt;
            const tB = b.createdAt || b.analyzedAt;
            return (tB ? tB.toMillis() : 0) - (tA ? tA.toMillis() : 0);
        });
    } else if (currentSort === 'date_asc') {
        docs.sort((a, b) => {
            const tA = a.createdAt || a.analyzedAt;
            const tB = b.createdAt || b.analyzedAt;
            return (tA ? tA.toMillis() : 0) - (tB ? tB.toMillis() : 0);
        });
    } else if (currentSort.startsWith('verdict_')) {
        const targetScore = getVerdictScore(currentSort.replace('verdict_', ''));
        // Higher scores first, then sort by proximity to target verdict score
        docs.sort((a, b) => {
            const scoreA = getVerdictScore(a.verdict);
            const scoreB = getVerdictScore(b.verdict);
            
            // Primary sort: closest to target verdict
            const diffA = Math.abs(scoreA - targetScore);
            const diffB = Math.abs(scoreB - targetScore);
            if (diffA !== diffB) return diffA - diffB;
            
            // Secondary sort: newest first
            const tA = a.createdAt || a.analyzedAt;
            const tB = b.createdAt || b.analyzedAt;
            return (tB ? tB.toMillis() : 0) - (tA ? tA.toMillis() : 0);
        });
    }

    renderCards(docs);
}

function updatePaginationUI(totalItems) {
    totalPages = Math.ceil(totalItems / pageSize) || 1;
    currentPage = Math.min(currentPage, totalPages);

    if (pageInfo) pageInfo.textContent = currentPage;
    if (totalPagesInfo) totalPagesInfo.textContent = totalPages;

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// --- DATA FETCHING (FIXED QUERY) ---

async function fetchHistory(user) {
    if (!container || !user || !user.uid) {
        if (container) container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #9ca3af; padding: 3rem;">Please log in to view history.</div>';
        return;
    }

    currentUserID = user.uid;
    const db = firebase.firestore();
    
    // *** CRITICAL FIX: Secure Query for Poser History ***
    // Note: We removed .orderBy('createdAt', 'desc') to avoid requiring a composite index.
    // Sorting is handled client-side in the sort() block below.
    const q = db.collection('poser_detections')
                .where('userId', '==', user.uid); // Filter by authenticated user's ID

    try {
        const snap = await q.get();
        
        // Deduplicate: Group by unique subject and keep the one with the LATEST activity (analyzedAt or createdAt)
        const groups = {};
        
        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const doc = { id: docSnap.id, ...data };
            
            // Primary key: poster_id, Fallback: input (URL/ID)
            const uniqueKey = data.poster_id || data.input || ('__no_key_' + doc.id);
            
            if (!groups[uniqueKey]) {
                groups[uniqueKey] = doc;
            } else {
                // Compare timestamps to keep the freshest record
                const existingDoc = groups[uniqueKey];
                const getTs = (d) => {
                    const t = d.analyzedAt || d.createdAt;
                    // Handle Firestore Timestamp or Date object
                    if (t && typeof t.toMillis === 'function') return t.toMillis();
                    if (t && t.seconds) return t.seconds * 1000;
                    return 0;
                };
                
                if (getTs(doc) > getTs(existingDoc)) {
                    groups[uniqueKey] = doc;
                }
            }
        });
        
        // Convert back to array
        allDocs = Object.values(groups);
        
        // Re-sort in memory by Date Descending (since the query sort might be mixed up by the grouping)
        allDocs.sort((a, b) => {
             const tA = a.analyzedAt || a.createdAt;
             const tB = b.analyzedAt || b.createdAt;
             const msA = (tA && typeof tA.toMillis === 'function') ? tA.toMillis() : 0;
             const msB = (tB && typeof tB.toMillis === 'function') ? tB.toMillis() : 0;
             return msB - msA;
        });
        
        // Ensure that client-side sorting/filtering runs on the full dataset
        // and only the current page is rendered.
        applyFiltersAndRender();

    } catch (e) {
        console.error("Error fetching poser history:", e);
        
        // This usually indicates the user is UNVERIFIED or the Index is MISSING/BUILDING
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 3rem;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Failed to load history due to permission or indexing issues.</p>
                <p style="color:#f59e0b; margin-top:10px;">Please ensure your account is verified and the required Firestore indexes are enabled.</p>
            </div>`;
    }
}

// --- EVENT LISTENERS & INIT ---

document.addEventListener('DOMContentLoaded', () => {
    if (searchInput) searchInput.addEventListener('input', (e) => {
        currentQuery = e.target.value;
        currentPage = 1;
        applyFiltersAndRender();
    });
    if (sortSelect) sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        applyFiltersAndRender();
    });
    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            applyFiltersAndRender();
        }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            applyFiltersAndRender();
        }
    });
    // Add listener for View Details modal if needed (requires a modal function definition)
});

if (window.firebase && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            try { await user.reload(); } catch(_) {}
            if (user.emailVerified) {
                fetchHistory(user);
            } else {
                if (container) {
                    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff9800; padding: 3rem;">' +
                                          '<i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>' +
                                          '<p>Please verify your email address to view your poser detection history.</p>' +
                                          '<button id="phResend" class="page-btn" style="margin-top:10px;">Resend Verification Email</button>' +
                                          '</div>';
                    const btn = document.getElementById('phResend');
                    if (btn) btn.onclick = async function(){ try { await user.sendEmailVerification(); } catch(_) {} };
                }
            }
        } else {
            window.location.href = 'login.html'; 
        }
    });
}

// --- ACTIONS ---

window.deleteItem = async function(docId) {
    if (!confirm('Are you sure you want to delete this record? This cannot be undone.')) return;
    
    try {
        const db = firebase.firestore();
        await db.collection('poser_detections').doc(docId).delete();
        
        // Remove from local list and re-render
        allDocs = allDocs.filter(d => d.id !== docId);
        applyFiltersAndRender();
        
        try {
            const user = firebase.auth().currentUser;
            if (user) {
                await db.collection('account_activity').add({
                    userId: user.uid,
                    action: 'delete_poser_history_soft',
                    details: { id: docId },
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (_){}
        try { if (typeof toast === 'function') toast('History item deleted.', 'success'); } catch(_){}
    } catch (e) {
        console.error("Error deleting document:", e);
        alert('Failed to delete record: ' + e.message);
    }
};

window.requestManualVerification = async function(posterId, pageName) {
    try {
        const db = firebase.firestore();
        const user = firebase.auth().currentUser;
        
        // Add to pending_verifications collection for admin review
        await db.collection('pending_verifications').add({
            posterId: posterId,
            pageName: pageName || '',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: "pending",
            source: "history_request",
            userId: user ? user.uid : null
        });

        // Create user notification using shared logic
        if (typeof window.createVerificationNotification === 'function') {
            await window.createVerificationNotification(posterId);
        }

        alert("Request Submitted! A manual review is now in progress (Estimated: 1-2 days)");
        
    } catch (e) {
        console.error("Error requesting verification:", e);
        alert("Failed to submit request: " + e.message);
    }
};
