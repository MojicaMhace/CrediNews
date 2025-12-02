document.addEventListener('DOMContentLoaded', () => {
  const auth = firebase.auth();
  const db = firebase.firestore();
  const grid = document.getElementById('historyGrid');
  const modal = null;
  const closeModal = null;
  const modalTitle = null;
  const modalBody = null;
  const searchInput = document.getElementById('ph-search');
  const sortSelect = document.getElementById('ph-sort');

  let allDocs = [];
  let currentQuery = '';
  let currentSort = 'date_desc';
  let currentPage = 0;
  const pageSize = 6;

  function getCategory(doc){
    const score = Number(doc.score || doc.trustScore || doc.credi_score || (doc.analysis && doc.analysis.final_trust_score) || 0);
    const breakdown = (doc.analysis && doc.analysis.breakdown) ? doc.analysis.breakdown : {};
    const aiVerdict = String(breakdown.ai_verdict || '').toLowerCase();
    if (aiVerdict.includes('poser')) return 'poser';
    if (aiVerdict.includes('mixed')) return 'mixed';
    if (aiVerdict.includes('authentic')) return 'authentic';
    if (score >= 80) return 'authentic';
    if (score >= 50) return 'mixed';
    return 'poser';
  }

  function getFilteredDocs(){
    const list = allDocs.slice();
    const q = String(currentQuery||'').trim().toLowerCase();
    let docs = list;
    docs = docs.filter(d => !d.deletedAt); // hide soft-deleted
    if (q){
      docs = docs.filter(d => {
        const name = String(getName(d)).toLowerCase();
        const input = String(d.input||'').toLowerCase();
        const verdict = String(d.verdict || (d.analysis && d.analysis.verdict) || '').toLowerCase();
        return name.includes(q) || input.includes(q) || verdict.includes(q);
      });
    }
    if (currentSort === 'verdict_poser') {
      docs = docs.filter(d => getCategory(d) === 'poser');
    } else if (currentSort === 'verdict_mixed') {
      docs = docs.filter(d => getCategory(d) === 'mixed');
    } else if (currentSort === 'verdict_authentic') {
      docs = docs.filter(d => getCategory(d) === 'authentic');
    }
    return docs;
  }

  function safeText(s){ try{ return String(s||''); } catch(_){ return ''; } }
  function formatTs(ts){
    try{
      if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
      if (ts && ts.seconds) return new Date(ts.seconds*1000).toLocaleString();
      if (typeof ts === 'string') return new Date(ts).toLocaleString();
    }catch(_){}
    return '';
  }
  function tsMillis(ts){
    try{
      if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (ts && ts.seconds) return ts.seconds*1000;
      if (typeof ts === 'number') return ts;
    }catch(_){}
    return 0;
  }

  function labelBadge(score){
    const s = Number(score||0);
    if (s >= 80) return '<span class="badge badge-verified">Trusted</span>';
    if (s >= 50) return '<span class="badge badge-warning">Moderate Risk</span>';
    return '<span class="badge badge-danger">High Risk</span>';
  }

  function getScoreClass(score){
    const s = Number(score||0);
    if (s >= 80) return 'high';
    if (s >= 50) return 'medium';
    return 'low';
  }

  function getName(doc){
    const meta = doc.metadata || {};
    return meta.name || doc.pageName || doc.pageId || doc.poster_id || safeText(doc.input) || 'Unknown';
  }

  function openModal(d){ return; }

  

  function render(){
    if (!grid) return;
    let docs = getFilteredDocs();
    if (currentSort === 'date_desc') docs.sort((a,b)=> tsMillis((b.createdAt||b.analyzedAt||b.last_updated)) - tsMillis((a.createdAt||a.analyzedAt||a.last_updated)));
    else if (currentSort === 'date_asc') docs.sort((a,b)=> tsMillis((a.createdAt||a.analyzedAt||a.last_updated)) - tsMillis((b.createdAt||b.analyzedAt||b.last_updated)));
    else if (currentSort === 'score_desc') docs.sort((a,b)=> ((b.score||b.trustScore||b.credi_score||0) - (a.score||a.trustScore||a.credi_score||0)));
    else if (currentSort === 'score_asc') docs.sort((a,b)=> ((a.score||a.trustScore||a.credi_score||0) - (b.score||b.trustScore||b.credi_score||0)));

    if (docs.length === 0){
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#9ca3af; padding:2rem;"><i class="fas fa-folder-open" style="font-size:2rem; margin-bottom:1rem;"></i><p>No poser detections found.</p><a href="poser-detection.html" style="color:#3b82f6; text-decoration: underline;">Run a poser detection</a></div>`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(docs.length / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    const start = currentPage * pageSize;
    const end = start + pageSize;
    const displayDocs = docs.slice(start, end);
    grid.innerHTML = displayDocs.map(d => {
      const score = Math.round(Number(d.score || d.trustScore || d.credi_score || (d.analysis && d.analysis.final_trust_score) || 0));
      const name = getName(d);
      const verdict = d.verdict || (d.analysis && d.analysis.verdict) || '';
      const explanation = (d.analysis && (d.analysis.human_explanation || d.analysis.ai_explanation)) || '';
      const hasBadge = !!(d.metadata && (d.metadata.verification_status === 'blue_verified' || d.metadata.is_verified || d.metadata.verification_source === 'verified_registry'));
      const donutClass = getScoreClass(score);
      const posterId = safeText(d.poster_id || d.input || '');
      const created = d.createdAt || d.analyzedAt || d.last_updated;
      const createdStr = formatTs(created);
      const breakdown = d.analysis && d.analysis.breakdown ? d.analysis.breakdown : {};
      const aiTrust = typeof breakdown.ai_agent_trust_score === 'number' ? Math.round(breakdown.ai_agent_trust_score) : null;
      const ruleScore = typeof breakdown.rule_based_score === 'number' ? Math.round(breakdown.rule_based_score) : null;
      const whyLine = (aiTrust !== null && ruleScore !== null) ? `Final Score uses 70% AI + 30% Rules: AI Trust ${aiTrust}% • Rule Score ${ruleScore}% → ${score}%` : '';
      const requestTarget = String(d.input || d.poster_id || '').replace(/'/g, "\\'");
      return `
        <div class="poser-result-card" data-id="${d.id}">
          ${hasBadge ? `<div style="background:linear-gradient(135deg,#0ea5e9 0%,#38bdf8 100%);color:#07283b;padding:0.75rem 1rem;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:10px;"><i class='fas fa-check-circle' style='font-size:1.25rem;'></i><div><strong>Verified</strong><div style='font-size:0.9rem;opacity:.9;'>Official Blue Badge detected.</div></div></div>` : ''}
          <div class="summary-band ${donutClass}">
            <div class="score-donut ${donutClass}" style="--pct:${score}">
              <div class="inner"><div class="num">${score}</div><div class="pct">%</div></div>
            </div>
            <div>
              <h3 class="poser-result-title" style="margin:0 0 6px; color:#e5e7eb;">${safeText(name)}</h3>
              <div style="color:#9fb3c8; font-weight:600;">${safeText(verdict || 'Unknown')}</div>
              ${explanation ? `<div class="expl" style='margin-top:8px; color:#cbd5e1;'>${safeText(explanation)}</div>` : ''}
            </div>
          </div>
          <div class="meta-row"><span class="meta-label">ID:</span><span class="mono">${posterId || 'N/A'}</span><span class="dot">•</span><span class="meta-label">Analyzed:</span><span class="meta-value">${createdStr}</span></div>
          <div class="why-card">
            <h5>WHY THIS SCORE</h5>
            ${whyLine ? `<div style='opacity:.7; font-size:.9rem; margin-bottom:8px;'>${whyLine}</div>` : ''}
            ${(breakdown.ai_verdict || breakdown.ai_explanation) ? `<div style='color:#e2e8f0; font-size:.95rem; line-height:1.6;'>${safeText(breakdown.ai_verdict || '')}${(breakdown.ai_verdict && breakdown.ai_explanation) ? ' • ' : ''}${safeText(breakdown.ai_explanation || '')}</div>` : ''}
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); display:flex; justify-content: space-between; align-items:center;">
              <p style="font-size: 0.85rem; color: #cbd5e1; margin: 0;">Is this actually a legitimate official news source?</p>
              <div style="display:flex; gap:8px;">
                <button class="btn-primary" onclick="window.submitVerificationRequest('${requestTarget}')"><i class="fas fa-paper-plane"></i> Request Manual Verification</button>
                <button class="btn-delete" title="Hold Shift to permanently delete" data-id="${d.id}"><i class="fas fa-trash"></i> Delete</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

document.addEventListener('click', async (e)=>{
  const delBtn = e.target.closest('.btn-delete');
  if (delBtn){
    e.preventDefault();
    const id = delBtn.getAttribute('data-id');
    if (!id) return;
    try{
      if (typeof firebase === 'undefined' || !firebase.firestore){ alert('Database connection not ready.'); return; }
      const user = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser : null;
      if (!user){ window.location.href = 'login.html'; return; }
      const hardDelete = !!e.shiftKey;
      if (hardDelete) {
        const ok = window.confirm('Permanently delete this entry? This cannot be undone.');
        if (!ok) return;
      } else {
        const ok = window.confirm('Move this entry to trash? It will be hidden from your history.');
        if (!ok) return;
      }
      delBtn.disabled = true;
      delBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
      const dbx = firebase.firestore();
      if (hardDelete) {
        await dbx.collection('poser_detections').doc(id).delete();
        await dbx.collection('account_activity').add({
          userId: user.uid,
          action: 'delete_poser_history_hard',
          details: { id },
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await dbx.collection('poser_detections').doc(id).set({
          deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
          deletedBy: user.uid
        }, { merge: true });
        await dbx.collection('account_activity').add({
          userId: user.uid,
          action: 'delete_poser_history_soft',
          details: { id },
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch(err){
      console.error('Delete failed:', err);
      alert('Failed to delete entry.');
    } finally {
      delBtn.disabled = false;
      delBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    }
    return;
  }
  const card = e.target.closest('.poser-result-card');
  if (!card) return;
});

  auth.onAuthStateChanged(user => {
    if (!user){ window.location.href = 'login.html'; return; }
    const q = db.collection('poser_detections').where('userId','==',user.uid).limit(50);
    const unsubscribe = q.onSnapshot(snap => {
      allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
      updatePager();
    }, err => {
      console.error('Error loading poser history:', err);
      grid.innerHTML = '<div style="color:#ef4444; padding:2rem; text-align:center;">Error loading history. Please try again later.</div>';
    });
    try {
      window.addEventListener('beforeunload', () => { try { unsubscribe && unsubscribe(); } catch(_){} });
      window.addEventListener('pagehide', () => { try { unsubscribe && unsubscribe(); } catch(_){} });
    } catch(_){}
  });

  if (searchInput) searchInput.addEventListener('input', (e)=>{ currentQuery = e.target.value; currentPage = 0; render(); updatePager(); });
  if (sortSelect) sortSelect.addEventListener('change', (e)=>{ currentSort = e.target.value; currentPage = 0; render(); updatePager(); });

  function updatePager(){
    const pageEl = document.getElementById('ph-page');
    const pagesEl = document.getElementById('ph-pages');
    const prevBtn = document.getElementById('ph-prev');
    const nextBtn = document.getElementById('ph-next');
    const docs = getFilteredDocs();
    const totalPages = Math.max(1, Math.ceil(docs.length / pageSize));
    if (pageEl) pageEl.textContent = String(currentPage + 1);
    if (pagesEl) pagesEl.textContent = String(totalPages);
    if (prevBtn) prevBtn.disabled = currentPage <= 0;
    if (nextBtn) nextBtn.disabled = currentPage >= (totalPages - 1);
  }

  const prevBtn = document.getElementById('ph-prev');
  const nextBtn = document.getElementById('ph-next');
  if (prevBtn) prevBtn.addEventListener('click', ()=>{ if (currentPage > 0) { currentPage--; render(); updatePager(); } });
  if (nextBtn) nextBtn.addEventListener('click', ()=>{ currentPage++; render(); updatePager(); });

  window.submitVerificationRequest = async function(urlToCheck){
    if (!urlToCheck) return;
    try{
      if (typeof firebase === 'undefined' || !firebase.firestore){ alert('Database connection not ready.'); return; }
      const dbx = firebase.firestore();
      await dbx.collection('pending_verifications').add({ url: urlToCheck, timestamp: firebase.firestore.FieldValue.serverTimestamp(), status: 'pending', source: 'user_report' });
      alert('Request submitted! Our team will review this source.');
    } catch(e){ alert('Error sending request.'); }
  };
});
