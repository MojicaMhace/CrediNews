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
function safeText(s) {
    if (!s) return '';
    return String(s).replace(/[&<>]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]; });
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
        const score = Number(item.score || item.final_trust_score || 0);
        const verdict = item.verdict || 'Mixed Signals';
        const pageName = item.pageName || item.name || shorten(item.input || 'No input URL', 50);
        const color = getScoreColor(score);
        const verdictClass = getVerdictStyle(verdict);
        
        const card = document.createElement('div');
        card.className = `poser-card poser-result-card ${verdictClass}`;
        card.setAttribute('data-id', item.id);
        
        // This is a minimal representation of the verification result structure
        card.innerHTML = `
            <div class="card-body">
                <div class="summary-band" style="border-left-color: ${color};">
                    <div class="risk-score-circle" style="background: ${color}20; color: ${color};">
                        ${Math.round(score)}%
                    </div>
                    <div class="risk-details">
                        <div class="risk-verdict">${safeText(verdict)}</div>
                        <div class="risk-subtext">${safeText(pageName)}</div>
                        <div class="risk-explanation" style="font-size:0.8rem; margin-top:5px; color:#a1a1aa;">
                           ${safeText(item.ai_explanation || item.rawExplanation || 'No AI summary available.')}
                        </div>
                    </div>
                </div>
                <div class="card-footer" style="padding: 10px 0; border: none; background: transparent; justify-content: flex-start; gap: 15px;">
                    <div class="source-row" style="color:#9ca3af; font-size:0.85rem;">
                        <i class="fas fa-calendar"></i>
                        <span>${formatTimestamp(item.analyzedAt || item.createdAt)}</span>
                    </div>
                    <button class="btn-primary" data-action="view-details">View Details</button>
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
        docs.sort((a, b) => (b.analyzedAt ? b.analyzedAt.toMillis() : 0) - (a.analyzedAt ? a.analyzedAt.toMillis() : 0));
    } else if (currentSort === 'date_asc') {
        docs.sort((a, b) => (a.analyzedAt ? a.analyzedAt.toMillis() : 0) - (b.analyzedAt ? b.analyzedAt.toMillis() : 0));
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
            return (b.analyzedAt ? b.analyzedAt.toMillis() : 0) - (a.analyzedAt ? a.analyzedAt.toMillis() : 0);
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
    const q = db.collection('poser_detections')
                .where('userId', '==', user.uid) // Filter by authenticated user's ID
                .orderBy('analyzedAt', 'desc'); // Order by newest first

    try {
        const snap = await q.get();
        allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
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
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            // NOTE: Add your verification check here if you want to block unverified users before fetch.
            // (e.g., if (!user.emailVerified) { display verification error message; return; })
            fetchHistory(user);
        } else {
            // Redirect unauthenticated users
            window.location.href = 'login.html'; 
        }
    });
}