// Scherm 1 — managementoverzicht (alle locaties of één locatie)
import { LOCATIONS, loc, selectPosts, totals, followers, shares, delta, comparable, weeklyReach, prevMonth, monthName, byReach, dayLabel, timeLabel, TYPE_LABEL, PLATFORM_LABEL, autoInsights } from '../data.js';
import { esc, nl, pctTxt, short, href, deltaBadge, shareBar, singleBar, aiBlock, emptyMonth } from '../ui.js';

function kpiCards({ cur, cmp, fol, folPrev, posts, location, state }) {
  // cmp = { c, p, partial }: dezelfde accounts in deze en vorige maand
  const prev = cmp.p;
  const lbl = cmp.partial ? 'vs vorige maand (deels)' : 'vs vorige maand';
  const allPosts = posts;
  const card = (title, value, sub, extra, badge) => `<div class="card kpi">
      <p class="t">${title}</p><p class="v">${value}</p><p class="small muted">${sub}</p>${extra}${badge}</div>`;
  const shareOrOwn = (metric, label) => {
    if (location === 'alle') return `<div style="margin-top:10px">${shareBar(shares(allPosts, metric), label)}</div>`;
    const tot = totals(state.monthAll)[metric];
    const own = totals(allPosts)[metric];
    const s = tot ? own / tot : 0;
    return `<div style="margin-top:10px">${singleBar(s, loc(location).color, `${Math.round(s * 100)} procent van alle locaties`)}<p class="tiny muted" style="margin-top:6px">${Math.round(s * 100)}% van alle locaties</p></div>`;
  };
  const hasPrev = prev.posts > 0;
  const folPart = fol.total === null
    ? `<div style="margin-top:10px"><div class="hatch" aria-hidden="true"></div><p class="tiny muted" style="margin-top:6px">Komt binnen via de Meta-koppeling</p></div>`
    : location === 'alle'
      ? `<div style="margin-top:10px">${shareBar(LOCATIONS.map((l) => ({ ...l, share: fol.total ? (fol.byLocation[l.id] || 0) / fol.total : 0 })), 'Volgers per locatie')}</div>`
      : '';
  return `<section aria-label="Kerncijfers" class="kpis">
    ${card('Volgers', fol.total === null ? '—' : nl(fol.total),
      fol.gained === null ? 'Totaal aan het eind van de maand' : `${nl(fol.gained)} nieuwe volgers deze maand`,
      folPart, deltaBadge(delta(fol.total, folPrev.total)))}
    ${card('Weergaven', nl(cur.views), `${cur.posts} posts in ${monthName(state.month)}`, shareOrOwn('views', 'Weergaven per locatie'),
      deltaBadge(hasPrev ? delta(cmp.c.views, prev.views) : null, lbl))}
    ${card('Bereik', nl(cur.reach), 'Opgeteld bereik per post', shareOrOwn('reach', 'Bereik per locatie'),
      deltaBadge(hasPrev ? delta(cmp.c.reach, prev.reach) : null, lbl))}
    ${card('Engagement rate', pctTxt(cur.er, 2), `${nl(cur.interactions)} interacties ÷ bereik`,
      location === 'alle' ? `<div style="margin-top:10px">${shareBar(shares(allPosts, 'interactions'), 'Interacties per locatie')}</div>`
        : `<p class="tiny muted">Gemiddelde alle locaties: ${pctTxt(totals(state.monthAll).er, 2)}</p>`,
      deltaBadge(hasPrev && prev.er !== null && cmp.c.er !== null ? cmp.c.er - prev.er : null, lbl, 'pt'))}
  </section>`;
}

function locationCards(data, state) {
  const share = shares(data.cur, 'reach');
  const card = (l, hero) => {
    const rows = data.cur.filter((p) => p.location_id === l.id);
    const t = totals(rows);
    const [rc, rp] = comparable(rows, data.prev.filter((p) => p.location_id === l.id));
    const tc = totals(rc), tp = totals(rp);
    const s = share.find((x) => x.id === l.id).share;
    const badges = tp.posts
      ? `<div class="tabs">${deltaBadge(delta(tc.reach, tp.reach), 'bereik')}${deltaBadge(delta(tc.interactions, tp.interactions), 'interacties')}<span class="small muted" style="align-self:center">vs vorige maand${rc.length < rows.length ? ' (deels)' : ''}</span></div>`
      : '<span class="badge">vs vorige maand: nog geen data</span>';
    const stats = `<div class="stats3">
      <div><p class="l">Weergaven</p><p class="v">${nl(t.views)}</p></div>
      <div><p class="l">Bereik</p><p class="v">${nl(t.reach)}</p></div>
      <div><p class="l">${hero ? 'Engagement rate' : 'Eng. rate'}</p><p class="v">${pctTxt(t.er, 2)}</p></div></div>`;
    const bar = `<div><div class="small muted" style="display:flex;justify-content:space-between"><span>Aandeel in bereik</span><b style="color:var(--ink)">${Math.round(s * 100)}%</b></div>
      ${singleBar(s, l.color, `${Math.round(s * 100)} procent van het totale bereik`)}</div>`;
    const link = `<a class="${hero ? 'pill' : 'linkbtn'}" href="${href('overzicht', l.id, state)}" ${hero ? 'style="border-color:var(--navy);color:var(--navy)"' : ''}>Bekijk ${esc(l.short)} →</a>`;
    if (hero) {
      return `<article class="card loc-hero">
        <div style="flex:1 1 260px;display:flex;flex-direction:column;gap:10px">
          <div class="loc-title"><span class="dot" style="width:16px;height:16px;background:${l.color}" aria-hidden="true"></span><h3 class="name">${esc(l.name)}</h3></div>
          <p class="small muted">${esc(l.sub)} · ${t.posts} posts</p>${bar}</div>
        <div style="flex:2 1 420px">${stats}</div>
        <div style="flex:0 1 auto;display:flex;flex-direction:column;align-items:flex-end;gap:10px">${badges}${link}</div>
      </article>`;
    }
    return `<article class="card" style="flex:1 1 260px">
      <div class="loc-title"><span class="dot" style="width:12px;height:12px;background:${l.color}" aria-hidden="true"></span><h3 style="font-size:19px;color:var(--ink)">${esc(l.name)}</h3></div>
      ${stats}${bar}${badges}<div>${link}</div></article>`;
  };
  const visible = LOCATIONS.filter((l) => data.allowed.includes(l.id));
  const [first, ...rest] = visible;
  return `<section style="display:flex;flex-direction:column;gap:14px">
    <div class="head"><h2>Per locatie</h2><p class="small muted">${state.platform === 'samen' ? 'Facebook en Instagram' : esc(PLATFORM_LABEL[state.platform])} · ${monthName(state.month)} · aandeel = deel van het totale bereik</p></div>
    ${first ? card(first, true) : ''}
    <div class="row">${rest.map((l) => card(l, false)).join('')}</div>
  </section>`;
}

function weekly(rows, state, color) {
  const w = weeklyReach(rows, state.month);
  const max = Math.max(...w.map((x) => x.value), 1);
  const cols = `grid-template-columns:repeat(${w.length},minmax(0,1fr))`;
  return `<div class="card wide">
    <div class="head"><h2>Bereik per week</h2><p class="small muted">Opgeteld bereik van de posts die die week geplaatst zijn</p></div>
    <div class="chart" style="${cols}" role="img" aria-label="Bereik per week: ${w.map((x) => `${x.label} ${nl(x.value)}`).join(', ')}">
      ${w.map((x) => `<div class="col"><span>${nl(x.value)}</span><div style="height:${Math.max(2, Math.round(x.value / max * 140))}px;background:${color}"></div></div>`).join('')}
    </div>
    <div class="chart-x" style="${cols}">${w.map((x) => `<span>${x.label}</span>`).join('')}</div>
  </div>`;
}

function bestPost(rows, location) {
  const p = [...rows].sort(byReach)[0];
  if (!p) return '';
  const l = loc(p.location_id);
  return `<div class="card">
    <h2>Beste post van de maand</h2>
    ${p.thumbnail_url ? `<img src="${esc(p.thumbnail_url)}" alt="" style="width:100%;height:150px;object-fit:cover;border-radius:12px" loading="lazy" referrerpolicy="no-referrer">`
      : '<div class="empty" style="height:120px;display:flex;align-items:center;justify-content:center;font-weight:700">Miniatuur volgt via de Meta-koppeling</div>'}
    <p class="small muted" style="font-weight:700">${location === 'alle' ? esc(l.name) + ' · ' : ''}${PLATFORM_LABEL[p.platform]}-${(TYPE_LABEL[p.media_type] || '').toLowerCase()} · ${dayLabel(p)} · ${timeLabel(p)}</p>
    <p>${p.permalink ? `<a href="${esc(p.permalink)}" target="_blank" rel="noopener">“${esc(short(p.caption, 110))}”</a>` : `“${esc(short(p.caption, 110))}”`}</p>
    <div class="stats3" style="border-top:1px solid var(--bg-deep);padding-top:12px">
      <div><p class="l">Bereik</p><p class="v">${nl(p.reach)}</p></div>
      <div><p class="l">Weergaven</p><p class="v">${nl(p.views)}</p></div>
      <div><p class="l">Interacties</p><p class="v">${nl(p.interactions)}</p></div></div>
  </div>`;
}

export function renderOverzicht(ctx) {
  const { data, location, state, profile } = ctx;
  const sel = { location, month: state.month, platform: state.platform };
  const cur = selectPosts(data.posts, sel);
  const prev = selectPosts(data.posts, { ...sel, month: prevMonth(state.month) });
  state.monthAll = selectPosts(data.posts, { ...sel, location: 'alle' });
  const fol = followers(data.accountMonthly, sel);
  const folPrev = followers(data.accountMonthly, { ...sel, month: prevMonth(state.month) });
  const summary = data.summaries.find((s) => s.month.slice(0, 7) === state.month && s.location_key === location && s.screen === 'overzicht');
  const bullets = summary ? summary.bullets : autoInsights({ posts: cur, prevPosts: prev, location, screen: 'overzicht' });
  const dataForCards = { cur, prev, allowed: data.allowed };
  const [cc, pc] = comparable(cur, prev);
  const cmp = { c: totals(cc), p: totals(pc), partial: cc.length > 0 && cc.length < cur.length };

  if (!cur.length) return emptyMonth({ month: state.month, platform: state.platform, anyData: data.posts.length > 0 });

  if (location === 'alle') {
    return `
      <div class="legend"><b style="color:var(--muted)">Aandeel per locatie in de balken:</b>${LOCATIONS.map((l) => `<span><span class="dot" style="background:${l.color}" aria-hidden="true"></span>${esc(l.short)}</span>`).join('')}</div>
      ${kpiCards({ cur: totals(cur), cmp, fol, folPrev, posts: cur, location, state })}
      ${locationCards(dataForCards, state)}
      <div class="row">
        <div class="wide" style="display:flex">${aiBlock({ title: 'Wat viel op', bullets, generated: !!summary, canGenerate: profile.role !== 'management', copyId: 'ai-list' })}</div>
        ${bestPost(cur, location)}
      </div>`;
  }

  const l = loc(location);
  return `
    <div class="head">
      <div class="loc-title"><span class="dot" style="width:18px;height:18px;background:${l.color}" aria-hidden="true"></span>
        <div><h2 class="h-loc">${esc(l.name)}</h2><p class="small muted">${[l.sub, state.platform === 'samen' ? 'Facebook en Instagram' : PLATFORM_LABEL[state.platform], monthName(state.month), `${cur.length} posts`].filter(Boolean).map(esc).join(' · ')}</p></div></div>
      <a class="linkbtn" href="${href('overzicht', 'alle', state)}">← Alle locaties</a>
    </div>
    ${kpiCards({ cur: totals(cur), cmp, fol, folPrev, posts: cur, location, state })}
    <div class="row">${weekly(cur, state, l.color)}${bestPost(cur, location)}</div>
    ${aiBlock({ title: 'Wat viel op', bullets, generated: !!summary, canGenerate: profile.role !== 'management', copyId: 'ai-list' })}
    ${profile.role !== 'management' ? `<div><a class="btn primary" href="${href('analyse', location, state)}">Naar de analyse →</a></div>` : ''}`;
}
