/* ============================================================
   Grafieken (Chart.js) + posts/widgets-rendering
   ------------------------------------------------------------
   Ongewijzigd overgenomen renderlogica uit v15, aangepast om te lezen
   uit een in-memory Store (gevuld vanuit Supabase) i.p.v. localStorage.
   Elke grafiek vernietigt de oude Chart.js-instantie bij het wisselen.
   ============================================================ */

import { fmtNum, fmtDuration, isReel, postTypeLabel, monthKey } from './helpers.js';

/* ---- In-memory store (gevuld door app.js na Supabase-load) ---- */
export const Store = {
  activeCompany: null,          // { id, slug, name, accent_color }
  posts: [],
  followerStats: [],
  widgets: []
};

/* ---- Chart-registry ---- */
let charts = {};
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }
function destroyChartsByPrefix(prefix) { Object.keys(charts).forEach((k) => { if (k.startsWith(prefix)) destroyChart(k); }); }
export function destroyAllCharts() { Object.keys(charts).forEach(destroyChart); }

const metricsOrder = [['views', 'Weergaven'], ['reach', 'Bereik'], ['likes', 'Likes'], ['comments', 'Reacties'], ['shares', 'Doorgestuurd'], ['saves', 'Saves'], ['engagement', 'Engagement']];
export const metricLabels = { likes: 'Likes', comments: 'Reacties', shares: 'Doorgestuurd', reach: 'Bereik', views: 'Weergaven', saves: 'Saves', watchDuration: 'Kijktijd (minuten)', engagement: 'Engagement' };
let ovVisibleMetrics = new Set(metricsOrder.map((m) => m[0]));
let ovRangeStart = null, ovRangeEnd = null;

function dark() { return matchMedia('(prefers-color-scheme: dark)').matches; }
function muted() { return dark() ? '#c3c2b7' : '#52514e'; }
function gridColor() { return dark() ? '#2c2c2a' : '#e1e0d9'; }

/* ---- Metric cards ---- */
export function renderMetricCards() {
  const posts = Store.posts;
  const t = posts.reduce((a, p) => ({ eng: a.eng + p.engagement, reach: a.reach + p.reach, views: a.views + p.views }), { eng: 0, reach: 0, views: 0 });
  const cards = [['Aantal posts', posts.length], ['Totaal engagement', fmtNum(t.eng)], ['Totaal bereik', fmtNum(t.reach)], ['Totaal weergaven', fmtNum(t.views)]];
  document.getElementById('metriccards').innerHTML = cards.map((c) => '<div class="mc"><p>' + c[0] + '</p><p>' + c[1] + '</p></div>').join('');
}

/* ---- Overzicht ---- */
export function initMetricToggles() {
  const box = document.getElementById('metricToggles');
  box.innerHTML = metricsOrder.map(([k, l]) => '<label class="metric-toggle"><input type="checkbox" checked data-metric="' + k + '">' + l + '</label>').join('');
  box.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
    if (inp.checked) ovVisibleMetrics.add(inp.dataset.metric); else ovVisibleMetrics.delete(inp.dataset.metric);
    renderCharts();
  }));
}
export function applyOvRange(range) {
  document.querySelectorAll('.ov-range-btn[data-range]').forEach((b) => b.classList.toggle('active', b.dataset.range === range));
  const now = new Date();
  if (range === 'all') { ovRangeStart = null; ovRangeEnd = null; }
  else {
    const start = new Date(now);
    if (range === 'month') start.setMonth(start.getMonth() - 1);
    if (range === '3months') start.setMonth(start.getMonth() - 3);
    if (range === 'halfyear') start.setMonth(start.getMonth() - 6);
    if (range === 'year') start.setFullYear(start.getFullYear() - 1);
    ovRangeStart = start.toISOString().slice(0, 10); ovRangeEnd = now.toISOString().slice(0, 10);
  }
  document.getElementById('ovStart').value = ovRangeStart || '';
  document.getElementById('ovEnd').value = ovRangeEnd || '';
  renderCharts();
}
export function setCustomOvRange(s, e) { ovRangeStart = s; ovRangeEnd = e; renderCharts(); }
function ovFilter(posts) { if (!ovRangeStart || !ovRangeEnd) return posts; return posts.filter((p) => p.date >= ovRangeStart && p.date <= ovRangeEnd); }

function renderPlatformMetricCharts(platform, containerId, color, colorLight, onPostClick) {
  const posts = ovFilter(Store.posts.filter((p) => p.platform === platform)).sort((a, b) => a.date.localeCompare(b.date));
  const container = document.getElementById(containerId);
  let order = metricsOrder.filter(([k]) => ovVisibleMetrics.has(k));
  const sortMode = document.getElementById('ovSort').value;
  if (sortMode !== 'default') {
    const totals = order.map(([k, l]) => [k, l, posts.reduce((a, p) => a + p[k], 0)]);
    totals.sort((a, b) => (sortMode === 'total-desc' ? b[2] - a[2] : a[2] - b[2]));
    order = totals.map(([k, l]) => [k, l]);
  }
  container.innerHTML = order.map(([k, l]) => '<p class="hint">' + l + '</p><div class="chart-wrap" style="height:170px"><canvas id="mc_' + platform + '_' + k + '"></canvas></div>').join('');
  if (posts.length === 0) { container.innerHTML += '<p class="hint">Nog geen posts in deze periode.</p>'; return; }
  order.forEach(([k, l]) => {
    const data = posts.map((p) => p[k]);
    const avg = data.length ? data.reduce((a, b) => a + b, 0) / data.length : 0;
    const canvas = document.getElementById('mc_' + platform + '_' + k); if (!canvas) return;
    charts['mc_' + platform + '_' + k] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: posts.map((p) => p.date.slice(5)), datasets: [
          { label: l, data: data, borderColor: color, backgroundColor: colorLight, borderWidth: 2, pointRadius: 5, pointHoverRadius: 8, pointBackgroundColor: color, pointBorderColor: '#fff', pointBorderWidth: 1.5, tension: 0.15, fill: true },
          { label: 'Gemiddelde', data: data.map(() => avg), borderColor: muted(), borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, tooltip: {
            callbacks: {
              title: (items) => { const p = posts[items[0].dataIndex]; return p ? p.date + ' - ' + p.text.slice(0, 30) : ''; },
              label: (ctx) => ctx.dataset.label + ': ' + fmtNum(ctx.parsed.y)
            }
          }
        },
        scales: { x: { grid: { display: false }, ticks: { color: muted(), font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }, y: { grid: { color: gridColor() }, ticks: { color: muted(), font: { size: 10 }, callback: (v) => fmtNum(v) }, beginAtZero: true } },
        onClick: (e, el) => { if (el.length) { const p = posts[el[0].index]; if (p && onPostClick) onPostClick(p.id); } },
        onHover: (e, el) => { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; }
      }
    });
  });
}

let _onPostClick = null;
export function setPostClickHandler(fn) { _onPostClick = fn; }

export function renderCharts() {
  destroyChartsByPrefix('mc_'); destroyChart('tot'); destroyChart('new');
  renderPlatformMetricCharts('Facebook', 'fbMetricCharts', '#2f5233', 'rgba(47,82,51,0.12)', _onPostClick);
  renderPlatformMetricCharts('Instagram', 'igMetricCharts', '#c0392b', 'rgba(192,57,43,0.10)', _onPostClick);
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, labels: { color: muted(), boxWidth: 12, font: { size: 12 } } }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + fmtNum(ctx.parsed.y) } } },
    scales: { x: { grid: { display: false }, ticks: { color: muted(), font: { size: 11 } } }, y: { grid: { color: gridColor() }, ticks: { color: muted(), font: { size: 11 }, callback: (v) => fmtNum(v) }, beginAtZero: true } }
  };
  const fs = [...Store.followerStats].sort((a, b) => a.month.localeCompare(b.month));
  const ptR = fs.length < 2 ? 6 : 4;
  charts.tot = new Chart(document.getElementById('chartTotalFollowers'), {
    type: 'line',
    data: {
      labels: fs.map((f) => f.month), datasets: [
        { label: 'Facebook', data: fs.map((f) => f.fbTotal), borderColor: '#2f5233', backgroundColor: 'rgba(47,82,51,0.14)', borderWidth: 2.5, pointRadius: ptR, pointHoverRadius: ptR + 2, fill: true, tension: 0.25 },
        { label: 'Instagram', data: fs.map((f) => f.igTotal), borderColor: '#c0392b', backgroundColor: 'rgba(192,57,43,0.12)', borderWidth: 2.5, pointRadius: ptR, pointHoverRadius: ptR + 2, fill: true, tension: 0.25 }
      ]
    }, options: opts
  });
  document.getElementById('hintTotal').textContent = fs.length < 2 ? 'Nog maar ' + fs.length + ' maand(en) ingevuld — voeg volgers per maand toe bij "Data invoeren".' : '';
  charts.new = new Chart(document.getElementById('chartNewFollowers'), {
    type: 'bar',
    data: {
      labels: fs.map((f) => f.month), datasets: [
        { label: 'Facebook', data: fs.map((f) => f.fbNew), backgroundColor: '#2f5233', borderRadius: 4 },
        { label: 'Instagram', data: fs.map((f) => f.igNew), backgroundColor: '#c0392b', borderRadius: 4 }
      ]
    }, options: opts
  });
}

/* ---- Vergelijken ---- */
let cmpLastRows = null;
export function runCompare() {
  const s1 = document.getElementById('cmpStart1').value, e1 = document.getElementById('cmpEnd1').value;
  const s2 = document.getElementById('cmpStart2').value, e2 = document.getElementById('cmpEnd2').value;
  if (!s1 || !e1 || !s2 || !e2) { document.getElementById('cmpResult').innerHTML = '<p class="hint">Vul beide periodes in.</p>'; return; }
  const inR = (d, s, e) => d >= s && d <= e;
  const agg = (s, e) => Store.posts.filter((p) => inR(p.date, s, e)).reduce((a, p) => ({ count: a.count + 1, likes: a.likes + p.likes, comments: a.comments + p.comments, shares: a.shares + p.shares, follows: a.follows + (p.follows || 0), reach: a.reach + p.reach, views: a.views + p.views, saves: a.saves + p.saves, engagement: a.engagement + p.engagement }), { count: 0, likes: 0, comments: 0, shares: 0, reach: 0, views: 0, saves: 0, engagement: 0, follows: 0 });
  const A = agg(s1, e1), B = agg(s2, e2);
  const rows = [['Aantal posts', 'count'], ['Likes', 'likes'], ['Reacties', 'comments'], ['Follows', 'follows'], ['Doorsturen', 'shares'], ['Bereik', 'reach'], ['Weergaven', 'views'], ['Saves', 'saves'], ['Engagement', 'engagement']];
  const pct = (a, b) => (b === 0 ? (a === 0 ? '0' : '+∞') : (((a - b) / b) * 100).toFixed(0) + '%');
  let html = '<table><tr><th>Statistiek</th><th>Periode A</th><th>Periode B</th><th>Verschil</th></tr>';
  rows.forEach((r) => { const a = A[r[1]], b = B[r[1]], d = a - b, sign = d > 0 ? '+' : ''; html += '<tr><td>' + r[0] + '</td><td>' + fmtNum(a) + '</td><td>' + fmtNum(b) + '</td><td>' + sign + fmtNum(d) + ' (' + pct(a, b) + ')</td></tr>'; });
  html += '</table>';
  document.getElementById('cmpResult').innerHTML = html;
  cmpLastRows = rows.map((r) => [r[0], A[r[1]], B[r[1]]]);
  renderCmpCharts();
}
export function renderCmpCharts() {
  const box = document.getElementById('cmpChartResult');
  if (!cmpLastRows) { box.innerHTML = '<p class="hint">Vergelijk eerst twee periodes.</p>'; return; }
  const activeBtn = document.querySelector('#cmpViewBtns .ov-range-btn.active');
  const viewType = activeBtn ? activeBtn.dataset.view : 'chart';
  destroyChartsByPrefix('cmp_');
  box.innerHTML = cmpLastRows.map(([l], i) => '<p class="hint">' + l + '</p><div class="chart-wrap" style="height:140px;margin-bottom:14px"><canvas id="cmp_' + i + '"></canvas></div>').join('');
  cmpLastRows.forEach(([l, a, b], i) => {
    if (viewType === 'line') {
      charts['cmp_' + i] = new Chart(document.getElementById('cmp_' + i), {
        type: 'line',
        data: { labels: ['Periode A', 'Periode B'], datasets: [{ data: [a, b], borderColor: '#7a4fa0', backgroundColor: 'rgba(122,79,160,0.14)', borderWidth: 2.5, pointRadius: 6, pointBackgroundColor: ['#2f5233', '#c0392b'], fill: true, tension: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmtNum(ctx.parsed.y) } } }, scales: { x: { grid: { display: false }, ticks: { color: muted() } }, y: { grid: { color: gridColor() }, ticks: { color: muted(), callback: (v) => fmtNum(v) }, beginAtZero: true } } }
      });
    } else {
      charts['cmp_' + i] = new Chart(document.getElementById('cmp_' + i), {
        type: 'bar',
        data: { labels: ['Periode A', 'Periode B'], datasets: [{ data: [a, b], backgroundColor: ['#2f5233', '#c0392b'], borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmtNum(ctx.parsed.x) } } }, scales: { x: { grid: { color: gridColor() }, ticks: { color: muted(), callback: (v) => fmtNum(v) }, beginAtZero: true }, y: { grid: { display: false }, ticks: { color: muted() } } } }
      });
    }
  });
}
export function resetCompare() {
  cmpLastRows = null;
  document.getElementById('cmpResult').innerHTML = '<p class="hint">Vergelijk twee periodes om resultaten te zien.</p>';
  document.getElementById('cmpChartResult').innerHTML = '';
}

/* ---- Posts ---- */
export function renderPostsTab(onPostClick) {
  const plat = document.getElementById('postsPlatformFilter').value;
  const typeFilter = document.getElementById('postsTypeFilter').value;
  const metric = document.getElementById('postsMetric').value;
  let posts = Store.posts.filter((p) => (plat === 'all' || p.platform === plat) && (typeFilter === 'all' || postTypeLabel(p) === typeFilter));
  if (metric === 'watchDuration') posts = posts.filter(isReel);
  const sorted = [...posts].sort((a, b) => b[metric] - a[metric]);
  const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse();
  const cardValue = (p) => (metric === 'watchDuration' ? fmtDuration(p.watchDuration) : fmtNum(p[metric]));
  const card = (title, list) => '<div class="postcard"><p style="font-weight:600;font-size:13px;margin:0 0 8px">' + title + '</p>' + (list.length ? list.map((p) => '<div class="postrow post-clickable" data-id="' + p.id + '" style="cursor:pointer"><span>' + p.date + ' - ' + p.platform + ' - ' + p.text.slice(0, 28) + '</span><span style="font-weight:600">' + cardValue(p) + '</span></div>').join('') : '<p class="hint">Geen Reels met kijktijd beschikbaar</p>') + '</div>';
  document.getElementById('topWorstRow').innerHTML = card('Top 3 best presterend', best) + card('Top 3 slechtst presterend', worst);
  let html = '<tr><th>Datum</th><th>Platform</th><th>Type</th><th>Post</th><th>Weergaven</th><th>Bereik</th><th>Likes</th><th>Reacties</th><th>Follows</th><th>Doorgestuurd</th><th>Saves</th><th>Kijktijd</th><th>Engagement</th></tr>';
  sorted.forEach((p) => { html += '<tr class="post-clickable" data-id="' + p.id + '" style="cursor:pointer"><td>' + p.date + '</td><td>' + p.platform + '</td><td>' + (isReel(p) ? '🎬 Reel' : 'Post') + '</td><td>' + p.text.slice(0, 30) + '</td><td>' + fmtNum(p.views) + '</td><td>' + fmtNum(p.reach) + '</td><td>' + fmtNum(p.likes) + '</td><td>' + fmtNum(p.comments) + '</td><td>' + fmtNum(p.follows) + '</td><td>' + fmtNum(p.shares) + '</td><td>' + fmtNum(p.saves) + '</td><td>' + fmtDuration(p.watchDuration) + '</td><td>' + fmtNum(p.engagement) + '</td></tr>'; });
  document.getElementById('postsTable').innerHTML = html;
  document.querySelectorAll('.post-clickable').forEach((el) => el.addEventListener('click', () => onPostClick(el.dataset.id)));
  renderPostsTimeline(posts, metric, onPostClick);
}
function renderPostsTimeline(posts, metric, onPostClick) {
  metric = metric || 'views';
  document.getElementById('timelineTitle').textContent = metricLabels[metric] + ' per post, in tijdlijn';
  const sorted = [...posts].sort((a, b) => a.date.localeCompare(b.date));
  destroyChart('timeline');
  const wrap = document.getElementById('timelineWrap');
  if (sorted.length === 0) { wrap.style.height = '80px'; wrap.innerHTML = '<p class="hint">Geen posts binnen deze filters.</p><canvas id="postsTimelineChart"></canvas>'; return; }
  wrap.style.height = Math.max(280, sorted.length * 34) + 'px';
  wrap.innerHTML = '<canvas id="postsTimelineChart"></canvas>';
  const isDur = metric === 'watchDuration';
  charts.timeline = new Chart(document.getElementById('postsTimelineChart'), {
    type: 'line',
    data: {
      labels: sorted.map((p) => p.date + ' · ' + p.platform + (isReel(p) ? ' 🎬' : '')), datasets: [{
        data: sorted.map((p) => p[metric]), borderColor: '#7a4fa0', backgroundColor: 'rgba(122,79,160,0.10)',
        borderWidth: 2, pointRadius: 6, pointHoverRadius: 9, pointBackgroundColor: sorted.map((p) => (p.platform === 'Facebook' ? '#2f5233' : '#c0392b')),
        pointBorderColor: '#fff', pointBorderWidth: 1.5, fill: false, tension: 0.1
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, tooltip: {
          callbacks: {
            title: (items) => { const p = sorted[items[0].dataIndex]; return p ? p.text.slice(0, 40) : ''; },
            label: (ctx) => metricLabels[metric] + ': ' + (isDur ? fmtDuration(ctx.parsed.x) : fmtNum(ctx.parsed.x))
          }
        }
      },
      scales: { x: { grid: { color: gridColor() }, ticks: { color: muted(), callback: (v) => (isDur ? fmtDuration(v) : fmtNum(v)) }, beginAtZero: true, title: { display: true, text: metricLabels[metric], color: muted() } }, y: { grid: { display: false }, ticks: { color: muted(), font: { size: 10 } } } },
      onClick: (e, el) => { if (el.length) { const p = sorted[el[0].index]; if (p) onPostClick(p.id); } },
      onHover: (e, el) => { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; }
    }
  });
}

/* ---- Widgets ---- */
function isoWeekKey(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z'); const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7; target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf(); target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) { target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7); }
  const week = 1 + Math.round((firstThursday - target) / (7 * 86400000));
  return target.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}
function periodKey(d, g) { return g === 'week' ? isoWeekKey(d) : monthKey(d); }
function widgetAggregate(metric, groupBy, platformFilter) {
  let posts = Store.posts;
  if (platformFilter && platformFilter !== 'all') posts = posts.filter((p) => p.platform === platformFilter);
  if (metric === 'watchDuration') posts = posts.filter(isReel);
  const metricValue = (p) => (metric === 'watchDuration' ? (p.watchDuration || 0) / 60 : (p[metric] || 0));
  const palette = ['#2f5233', '#c0392b', '#d99a1f', '#7a4fa0', '#4d7a52', '#8c4a3e'];
  if (groupBy === 'platform') {
    const fb = posts.filter((p) => p.platform === 'Facebook').reduce((a, p) => a + metricValue(p), 0);
    const ig = posts.filter((p) => p.platform === 'Instagram').reduce((a, p) => a + metricValue(p), 0);
    return { labels: ['Facebook', 'Instagram'], data: [fb, ig], colors: ['#2f5233', '#c0392b'] };
  } else if (groupBy === 'month' || groupBy === 'week') {
    const map = {}; posts.forEach((p) => { const k = periodKey(p.date, groupBy); map[k] = (map[k] || 0) + metricValue(p); });
    const labels = Object.keys(map).sort();
    return { labels, data: labels.map((l) => map[l]), colors: labels.map((_, i) => palette[i % palette.length]) };
  } else {
    const sorted = [...posts].sort((a, b) => b[metric] - a[metric]).slice(0, 10);
    return { labels: sorted.map((p) => p.date + ' ' + p.text.slice(0, 16)), data: sorted.map((p) => metricValue(p)), colors: sorted.map((p) => (p.platform === 'Facebook' ? '#2f5233' : '#c0392b')) };
  }
}
const groupLabels = { platform: 'per platform', month: 'per maand', week: 'per week', post: 'per post (top 10)' };
const platformLabels = { all: '', Facebook: ' - alleen Facebook', Instagram: ' - alleen Instagram' };

export function renderWidgets(canManage, onDelete) {
  destroyChartsByPrefix('widget_');
  const grid = document.getElementById('widgetsGrid');
  grid.innerHTML = Store.widgets.map((w) => '<div class="postcard"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><p style="font-weight:600;font-size:13px;margin:0">' + metricLabels[w.metric] + ' ' + groupLabels[w.groupBy] + (platformLabels[w.platformFilter] || '') + '</p>' + (canManage ? '<button class="delbtn" data-wid="' + w.id + '">verwijderen</button>' : '') + '</div><div style="position:relative;height:220px"><canvas id="canvas_' + w.id + '"></canvas></div></div>').join('');
  Store.widgets.forEach((w) => {
    const agg = widgetAggregate(w.metric, w.groupBy, w.platformFilter);
    const canvas = document.getElementById('canvas_' + w.id); if (!canvas) return;
    if (w.chartType === 'pie') {
      charts['widget_' + w.id] = new Chart(canvas, { type: 'pie', data: { labels: agg.labels, datasets: [{ data: agg.data, backgroundColor: agg.colors }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: muted(), font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => ctx.label + ': ' + fmtNum(ctx.parsed) } } } } });
    } else if (w.chartType === 'line') {
      charts['widget_' + w.id] = new Chart(canvas, { type: 'line', data: { labels: agg.labels, datasets: [{ data: agg.data, borderColor: '#2f5233', backgroundColor: 'rgba(47,82,51,0.14)', borderWidth: 2.5, pointRadius: 4, fill: true, tension: 0.25 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmtNum(ctx.parsed.y) } } }, scales: { x: { grid: { display: false }, ticks: { color: muted(), font: { size: 10 } } }, y: { grid: { color: gridColor() }, ticks: { color: muted(), callback: (v) => fmtNum(v) }, beginAtZero: true } } } });
    } else {
      charts['widget_' + w.id] = new Chart(canvas, { type: 'bar', data: { labels: agg.labels, datasets: [{ data: agg.data, backgroundColor: agg.colors, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmtNum(ctx.parsed.y) } } }, scales: { x: { grid: { display: false }, ticks: { color: muted(), font: { size: 10 } } }, y: { grid: { color: gridColor() }, ticks: { color: muted(), callback: (v) => fmtNum(v) }, beginAtZero: true } } } });
    }
  });
  if (canManage) {
    document.querySelectorAll('#widgetsGrid .delbtn').forEach((b) => b.addEventListener('click', () => onDelete(b.dataset.wid)));
  }
}
