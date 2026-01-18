// Reports dashboard logic

(function() {
  const LABELS = {
    CREDIBLE: 'CREDIBLE',
    LOW: 'LOW CREDIBILITY',
    MIXED: 'MIXED',
    UNVERIFIED: 'UNVERIFIED'
  };

  const COLORS = {
    [LABELS.CREDIBLE]: '#22C55E',
    [LABELS.LOW]: '#FF4D4F',
    [LABELS.MIXED]: '#FFA500',
    [LABELS.UNVERIFIED]: '#CBD5E1'
  };

  let volumeChart = null;
  let breakdownChart = null;
  
  // State for theme updates
  let currentItems = [];
  let currentCounts = {};
  let currentView = 'month';

  function toDateSafe(ts) {
    if (!ts) return null;
    try {
      if (typeof ts.toDate === 'function') return ts.toDate();
    } catch (_) {}
    return null;
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function formatDay(d) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatMonth(d) {
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  function buildHourlyBuckets(hours, items) {
    const now = new Date();
    const labels = [];
    const counts = [];
    for (let i = hours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const start = new Date(d);
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const label = start.toLocaleTimeString(undefined, { hour: '2-digit' });
      labels.push(label);
      const c = items.reduce((acc, it) => {
        const t = toDateSafe(it.analyzed_at);
        if (!t) return acc;
        const ms = t.getTime();
        return acc + (ms >= start.getTime() && ms < end.getTime() ? 1 : 0);
      }, 0);
      counts.push(c);
    }
    return { labels, counts };
  }

  function buildDailyBuckets(days, items) {
    const today = startOfDay(new Date());
    const labels = [];
    const counts = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      labels.push(formatDay(day));
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const c = items.reduce((acc, it) => {
        const t = toDateSafe(it.analyzed_at);
        if (!t) return acc;
        const ms = t.getTime();
        return acc + (ms >= dayStart && ms < dayEnd ? 1 : 0);
      }, 0);
      counts.push(c);
    }
    return { labels, counts };
  }

  function buildMonthlyBuckets(months, items) {
    const now = new Date();
    const labels = [];
    const counts = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(formatMonth(d));
      const year = d.getFullYear();
      const month = d.getMonth();
      const start = new Date(year, month, 1).getTime();
      const end = new Date(year, month + 1, 1).getTime();
      const c = items.reduce((acc, it) => {
        const t = toDateSafe(it.analyzed_at);
        if (!t) return acc;
        const ms = t.getTime();
        return acc + (ms >= start && ms < end ? 1 : 0);
      }, 0);
      counts.push(c);
    }
    return { labels, counts };
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const r = parseInt(n.substring(0, 2), 16);
    const g = parseInt(n.substring(2, 4), 16);
    const b = parseInt(n.substring(4, 6), 16);
    return { r, g, b };
  }

  function lighten(hex, ratio) {
    const base = hexToRgb(hex);
    const r = Math.round(base.r + (255 - base.r) * ratio);
    const g = Math.round(base.g + (255 - base.g) * ratio);
    const b = Math.round(base.b + (255 - base.b) * ratio);
    return `rgba(${r},${g},${b},1)`;
  }

  function makeRadialGradient(ctx, baseColor) {
    const chart = ctx.chart;
    const { ctx: canvasCtx, chartArea } = chart;
    if (!chartArea) return baseColor;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    const r = Math.min(chartArea.width, chartArea.height) / 2;
    const grad = canvasCtx.createRadialGradient(x, y, r * 0.1, x, y, r);
    const inner = lighten(baseColor, 0.45);
    const mid = lighten(baseColor, 0.2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.6, mid);
    grad.addColorStop(1, baseColor);
    return grad;
  }

  function getThemeConfig() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return {
      textColor: isLight ? '#000000' : '#FFFFFF',
      gridColor: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255,255,255,0.06)',
      tickColor: isLight ? '#000000' : '#CCCCCC'
    };
  }

  function renderBreakdownChart(counts) {
    const el = document.getElementById('breakdownChart');
    if (!el) return;
    
    if (breakdownChart) {
      breakdownChart.destroy();
    }

    const total = counts.total;
    const dataMap = [
      { label: LABELS.CREDIBLE, count: counts[LABELS.CREDIBLE], color: COLORS[LABELS.CREDIBLE] },
      { label: LABELS.LOW, count: counts[LABELS.LOW], color: COLORS[LABELS.LOW] },
      { label: LABELS.MIXED, count: counts[LABELS.MIXED], color: COLORS[LABELS.MIXED] },
      { label: LABELS.UNVERIFIED, count: counts[LABELS.UNVERIFIED], color: COLORS[LABELS.UNVERIFIED] }
    ];
    const labels = dataMap.map(x => `${x.label} (${x.count.toLocaleString()} | ${Math.round((x.count / Math.max(total, 1)) * 100)}%)`);
    const data = dataMap.map(x => x.count);
    const colors = dataMap.map(x => x.color);
    
    const theme = getThemeConfig();

    breakdownChart = new Chart(el, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ 
          data, 
          backgroundColor: (context) => makeRadialGradient(context, colors[context.dataIndex]),
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          hoverOffset: 14,
          offset: data.map(() => 0)
        }]
      },
      options: { 
        plugins: { 
          legend: { 
            position: 'bottom', 
            labels: { 
              color: theme.textColor, 
              font: { weight: 'bold' } 
            } 
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.parsed;
                const pct = Math.round((value / Math.max(total, 1)) * 100);
                return `${ctx.label}: ${value.toLocaleString()} (${pct}%)`;
              }
            }
          }
        }, 
        cutout: '60%',
        maintainAspectRatio: true,
        layout: { padding: 8 }
      }
    });

    el.addEventListener('click', (evt) => {
      const points = breakdownChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
      if (!points.length) return;
      const idx = points[0].index;
      const ds = breakdownChart.data.datasets[0];
      ds.offset = ds.offset.map((_, i) => (i === idx ? 20 : 0));
      breakdownChart.update();
    });
  }

  function renderVolumeChart(view, items) {
    const el = document.getElementById('volumeChart');
    if (!el) return;
    
    currentView = view;
    
    const cfg = view === 'day' ? buildHourlyBuckets(24, items)
              : view === 'week' ? buildDailyBuckets(7, items)
              : view === 'month' ? buildDailyBuckets(30, items)
              : buildMonthlyBuckets(12, items);
    
    const data = {
      labels: cfg.labels,
      datasets: [{
        label: 'News Analyzed',
        data: cfg.counts,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59,130,246,0.2)',
        tension: 0.25,
        fill: true,
        pointRadius: 2
      }]
    };

    const theme = getThemeConfig();

    if (!volumeChart) {
      volumeChart = new Chart(el, {
        type: 'line',
        data,
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { 
              grid: { color: theme.gridColor },
              ticks: { color: theme.tickColor }
            },
            y: { 
              grid: { color: theme.gridColor }, 
              ticks: { color: theme.tickColor },
              beginAtZero: true 
            }
          }
        }
      });
    } else {
      volumeChart.data.labels = data.labels;
      volumeChart.data.datasets[0].data = data.datasets[0].data;
      
      // Update theme colors
      volumeChart.options.scales.x.grid.color = theme.gridColor;
      volumeChart.options.scales.x.ticks.color = theme.tickColor;
      volumeChart.options.scales.y.grid.color = theme.gridColor;
      volumeChart.options.scales.y.ticks.color = theme.tickColor;
      
      volumeChart.update();
    }
  }

  function setActiveFilter(target) {
    document.querySelectorAll('.filter-buttons button').forEach(btn => btn.classList.toggle('active', btn === target));
  }

  function updateStats(counts) {
    const totalEl = document.getElementById('total-analyzed');
    const credibleEl = document.getElementById('credible-count');
    const lowEl = document.getElementById('low-count');
    if (totalEl) totalEl.textContent = counts.total.toLocaleString();
    if (credibleEl) credibleEl.textContent = (counts[LABELS.CREDIBLE] || 0).toLocaleString();
    if (lowEl) lowEl.textContent = (counts[LABELS.LOW] || 0).toLocaleString();
  }

  async function init() {
    try {
      if (!window.firebase || !firebase.firestore) return;
      const db = firebase.firestore();
      const qs = await db.collection('facebook_verification_results').orderBy('analyzed_at', 'asc').get();
      const items = qs.docs.map(d => d.data());

      // Save to global state
      currentItems = items;

      const counts = {
        [LABELS.CREDIBLE]: 0,
        [LABELS.LOW]: 0,
        [LABELS.MIXED]: 0,
        [LABELS.UNVERIFIED]: 0,
        total: items.length
      };
      items.forEach(it => {
        const label = String(it.label || '').trim().toUpperCase();
        if (label in counts) counts[label]++;
        else counts[LABELS.UNVERIFIED]++;
      });

      currentCounts = counts;

      updateStats(counts);
      renderBreakdownChart(counts);
      renderVolumeChart('month', items);

      const dayBtn = document.getElementById('filter-day');
      const weekBtn = document.getElementById('filter-week');
      const monthBtn = document.getElementById('filter-month');
      const yearBtn = document.getElementById('filter-year');
      if (dayBtn && weekBtn && monthBtn && yearBtn) {
        setActiveFilter(monthBtn);
        dayBtn.addEventListener('click', () => { setActiveFilter(dayBtn); renderVolumeChart('day', items); });
        weekBtn.addEventListener('click', () => { setActiveFilter(weekBtn); renderVolumeChart('week', items); });
        monthBtn.addEventListener('click', () => { setActiveFilter(monthBtn); renderVolumeChart('month', items); });
        yearBtn.addEventListener('click', () => { setActiveFilter(yearBtn); renderVolumeChart('year', items); });
      }

      // Theme Observer
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
             // Re-render with new theme
             if (currentCounts.total) renderBreakdownChart(currentCounts);
             if (currentItems.length) renderVolumeChart(currentView, currentItems);
          }
        });
      });
      observer.observe(document.documentElement, { attributes: true });

    } catch (e) {
      console.error('Reports init error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
