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

  function showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
  }

  function isFacebookUrl(url) {
    try {
      const u = new URL(url);
      return /facebook\.com$/.test(u.hostname) || u.hostname.includes('fb.com');
    } catch (_) {
      return false;
    }
  }

  function quickPoserAssessment(url, notes) {
    const signals = [];
    let risk = 30; // baseline risk

    if (/\/groups\//.test(url)) {
      signals.push('Group link detected');
      risk += 10;
    }
    if (/\/share\//.test(url) || /\?sfns/.test(url)) {
      signals.push('Shared content pattern');
      risk += 10;
    }
    if (/\/watch\//.test(url)) {
      signals.push('Video watch link');
      risk += 5;
    }
    if ((notes || '').toLowerCase().includes('sensational')) {
      signals.push('Notes mention sensational claim');
      risk += 10;
    }

    const label = risk >= 70 ? 'High poser risk' : risk >= 50 ? 'Medium poser risk' : 'Low poser risk';
    return { risk, label, signals };
  }

  runBtn.addEventListener('click', () => {
    const url = (urlInput.value || '').trim();
    const notes = (notesInput.value || '').trim();

    if (!url) {
      showNotification('Please enter a Facebook URL.', 'error');
      urlInput.focus();
      return;
    }
    if (!isFacebookUrl(url)) {
      showNotification('Please enter a valid Facebook URL.', 'error');
      return;
    }

    const assessment = quickPoserAssessment(url, notes);
    resultDetails.innerHTML = `
      <div class="result-grid">
        <div class="result-item"><span class="result-label">URL:</span><span class="result-value url-value">${url}</span></div>
        <div class="result-item"><span class="result-label">Risk Score:</span><span class="result-value">${assessment.risk}</span></div>
        <div class="result-item"><span class="result-label">Assessment:</span><span class="result-value">${assessment.label}</span></div>
      </div>
      <div class="result-summary">
        <h4 style="margin:0 0 0.5rem 0;">Signals</h4>
        <p>${assessment.signals.length ? assessment.signals.join(', ') : 'No notable signals detected.'}</p>
      </div>
    `;
    resultSection.style.display = 'block';
    showNotification('Poser detection complete.', 'success');
  });

  // Styles are now defined in poser-detection.css
});