document.addEventListener('DOMContentLoaded', () => {
  const auth = firebase.auth();
  const db = firebase.firestore();
  const grid = document.getElementById('historyGrid');
  const modal = document.getElementById('historyModal');
  const closeModal = document.getElementById('closeModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');

  function card(d){
    const name = d.pageName || d.pageId || 'Unknown';
    const score = Math.round(Number(d.trustScore || d.credi_score || 0));
    const verdict = d.verdict || 'Unknown';
    return `<div class="trend-card" style="cursor:pointer;" data-id="${d.id}">
      <div class="card-body" data-action="open"><div class="card-text">${name}</div></div>
      <div class="card-footer"><div class="source-row"><span>${score}% • ${verdict}</span></div></div>
      <div class="card-actions"><button class="btn-primary" data-action="view">View</button></div>
    </div>`;
  }

  function openModal(d){
    modalTitle.textContent = d.pageName || d.pageId || 'Analysis';
    modalBody.innerHTML = `<div class="result-summary"><div class="result-grid">
      <div class="result-item"><div class="result-label">Trust Score</div><div class="result-value">${Math.round(Number(d.trustScore || d.credi_score || 0))}%</div></div>
      <div class="result-item"><div class="result-label">Verdict</div><div class="result-value">${d.verdict || 'Unknown'}</div></div>
      <div class="result-item"><div class="result-label">Analyzed At</div><div class="result-value">${(d.analyzedAt && d.analyzedAt.seconds)? new Date(d.analyzedAt.seconds*1000).toLocaleString(): ''}</div></div>
    </div></div>`;
    modal.style.display = 'flex';
  }

  closeModal.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  auth.onAuthStateChanged(async user => {
    if (!user){ window.location.href = 'login.html'; return; }
    const q = await db.collection('poser_detections').where('userId','==',user.uid).orderBy('analyzedAt','desc').get();
    const list = q.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    grid.innerHTML = list.map(d => card(d)).join('');
    grid.querySelectorAll('[data-action="view"]').forEach(btn => {
      btn.addEventListener('click', e => {
        const cardEl = e.target.closest('.trend-card');
        const id = cardEl.getAttribute('data-id');
        const entry = list.find(x => x.id === id);
        if (entry) openModal(entry);
      });
    });
  });
});
