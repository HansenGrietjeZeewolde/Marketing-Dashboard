// Scherm 2 — analyse voor marketing
import { LOCATIONS, loc, selectPosts, totals, followers, topAndBottom, byType, bySlot, weeklyReach, prevMonth, monthName, dayLabel, timeLabel, TYPE_LABEL, PLATFORM_LABEL, autoInsights } from '../data.js';
import { esc, nl, pctTxt, short, href, postItem, aiBlock, singleBar, emptyMonth } from '../ui.js';

function topLists(rows, showLoc) {
  const { top, bottom } = topAndBottom(rows, 3);
  const list = (items, low) => items.length
    ? `<ol class="posts">${items.map((p, i) => postItem(p, i + 1, low, showLoc)).join('')}</ol>`
    : '<p class="empty">Te weinig posts om te vergelijken.</p>';
  return `<section class="row">
    <div class="card" style="flex:1 1 520px"><h2>Top 3 beste posts</h2>${list(top, false)}</div>
    <div class="card" style="flex:1 1 520px"><h2>Top 3 slechtste posts</h2>${list(bottom, true)}</div>
  </section>`;
}

function typeBlock(rows, location) {
  if (location === 'alle') {
    const lines = LOCATIONS.map((l) => {
      const t = byType(rows.filter((p) => p.location_id === l.id));
      if (!t.length) return '';
      const max = Math.max(...t.map((x) => x.avgReach), 1);
      return `<span style="display:flex;align-items:center;gap:8px;font-weight:700"><span class="dot" style="background:${l.color}" aria-hidden="true"></span>${esc(l.short)}</span>
        <div style="display:flex;flex-direction:column;gap:6px">${t.map((x) => `<div style="display:grid;grid-template-columns:100px minmax(0,1fr) 120px;gap:10px;align-items:center">
          <span class="small">${esc(x.plural)}</span>${singleBar(x.avgReach / max, l.color, `${x.plural}: gemiddeld ${Math.round(x.avgReach)} bereik`)}<span class="small"><b>${nl(x.avgReach)}</b> · ${x.count} posts</span></div>`).join('')}</div>
        <span class="badge" style="justify-self:start">${esc(t[0].plural)}</span>`;
    }).join('');
    return `<section class="card"><div class="head"><h2>Welke soort post werkt?</h2><p class="small muted">Gemiddeld bereik per post · per locatie op eigen schaal</p></div>
      <div class="scroll"><div style="min-width:640px;display:grid;grid-template-columns:200px minmax(0,1fr) 120px;gap:16px 20px;align-items:center">
        <span class="tiny muted" style="font-weight:800">Locatie</span><span class="tiny muted" style="font-weight:800">Soort post</span><span class="tiny muted" style="font-weight:800">Werkt het best</span>
        ${lines}</div></div></section>`;
  }
  const t = byType(rows);
  const maxR = Math.max(...t.map((x) => x.avgReach), 1);
  const maxI = Math.max(...t.map((x) => x.avgInteractions), 0.0001);
  const color = loc(location).color;
  return `<div class="card"><h2>Welke soort post werkt?</h2>
    <div class="hbars" style="grid-template-columns:120px minmax(0,1fr) minmax(0,1fr)">
      <span></span><span class="tiny muted" style="font-weight:800">Gem. bereik per post</span><span class="tiny muted" style="font-weight:800">Gem. interacties per post</span>
      ${t.map((x) => `<span style="font-weight:700">${esc(x.plural)} <span class="muted" style="font-weight:400">· ${x.count}</span></span>
        <div style="display:flex;align-items:center;gap:8px"><div style="flex:1">${singleBar(x.avgReach / maxR, color, `gemiddeld bereik ${Math.round(x.avgReach)}`)}</div><b style="width:52px">${nl(x.avgReach)}</b></div>
        <div style="display:flex;align-items:center;gap:8px"><div style="flex:1">${singleBar(x.avgInteractions / maxI, '#1F3A7A', `gemiddeld ${x.avgInteractions.toFixed(1)} interacties`)}</div><b style="width:40px">${nl(x.avgInteractions, 1)}</b></div>`).join('')}
    </div></div>`;
}

function slotBlock(rows, location) {
  const s = bySlot(rows);
  const max = Math.max(...s.map((x) => x.avgReach || 0), 1);
  const color = location === 'alle' ? '#1F3A7A' : loc(location).color;
  const used = s.filter((x) => x.count);
  const note = location === 'alle' && rows.some((p) => p.location_id === 'hg')
    ? 'Let op: Hans & Grietje heeft veruit het grootste bereik en weegt daardoor zwaar mee. Kies een locatie voor het echte beste moment.'
    : used.length === 1 ? 'Alle posts gingen op hetzelfde dagdeel online, dus er is nog niets om mee te vergelijken.' : '';
  return `<div class="card"><h2>Beste moment om te posten</h2>
    <div class="hbars" style="grid-template-columns:150px minmax(0,1fr) 150px">
      ${s.map((x) => `<span style="font-weight:700">${x.label} <span class="muted" style="font-weight:400">${x.hint}</span></span>
        ${x.count ? singleBar(x.avgReach / max, color, `${x.label}: gemiddeld ${Math.round(x.avgReach)} bereik`) : '<div class="bar"></div>'}
        <span class="small">${x.count ? `<b>${nl(x.avgReach)}</b> gem. · ${x.count} ${x.count === 1 ? 'post' : 'posts'}` : '<span class="muted">geen posts</span>'}</span>`).join('')}
    </div>${note ? `<p class="small muted">${esc(note)}</p>` : ''}</div>`;
}

function weeklyMultiples(rows, state, location) {
  const list = location === 'alle' ? LOCATIONS : [loc(location)];
  const w = weeklyReach([], state.month);
  return `<section class="card"><div class="head"><h2>Bereik per week${location === 'alle' ? ', per locatie' : ''}</h2>
      <p class="small muted">${location === 'alle' ? 'Elke rij op eigen schaal, zodat ook de kleine locaties hun verloop laten zien' : 'Opgeteld bereik van de posts die die week geplaatst zijn'}</p></div>
    <div class="multiples"><div style="grid-template-columns:200px repeat(${w.length},minmax(0,1fr))">
      <span></span>${w.map((x) => `<span class="tiny muted" style="font-weight:800;text-align:center">${x.label}</span>`).join('')}
      ${list.map((l) => {
        const v = weeklyReach(rows.filter((p) => p.location_id === l.id), state.month);
        if (!v.some((x) => x.value)) return '';
        const max = Math.max(...v.map((x) => x.value), 1);
        return `<span style="align-self:center;display:flex;align-items:center;gap:8px;font-weight:700"><span class="dot" style="background:${l.color}" aria-hidden="true"></span>${esc(l.short)}</span>
          ${v.map((x) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;border-bottom:1.5px solid var(--line)"><span class="tiny" style="font-weight:800">${nl(x.value)}</span><div style="width:40px;height:${Math.max(2, Math.round(x.value / max * 56))}px;background:${l.color};border-radius:6px 6px 0 0"></div></div>`).join('')}`;
      }).join('')}
    </div></div></section>`;
}

function audienceBlock(data, sel) {
  const fol = followers(data.accountMonthly, sel);
  const rows = data.audience.filter((a) => (sel.location === 'alle' || a.location_id === sel.location) && a.kind === 'followers');
  const latest = rows.reduce((m, a) => (a.captured_on > m ? a.captured_on : m), '');
  const top = (dim, n) => {
    const agg = {};
    rows.filter((a) => a.captured_on === latest && a.dimension === dim).forEach((a) => { agg[a.value] = (agg[a.value] || 0) + a.count; });
    return Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const reachSplit = fol.reachFollowers !== null && fol.reachNonFollowers !== null
    ? (() => { const t = fol.reachFollowers + fol.reachNonFollowers; const s = t ? fol.reachFollowers / t : 0;
      return `<p class="small">Bereik bij volgers: <b>${pctTxt(s)}</b> · bij niet-volgers: <b>${pctTxt(1 - s)}</b> (Instagram)</p>${singleBar(s, '#1F3A7A', `${Math.round(s * 100)} procent van het bereik is bij volgers`)}`; })()
    : '<p class="small muted">Bereik bij volgers en niet-volgers komt binnen via de Meta-koppeling (Instagram).</p>';
  const cities = top('city', 5), ages = top('age', 6);
  const list = (items) => `<ol style="margin:0;padding-left:20px">${items.map(([k, v]) => `<li>${esc(k)} <span class="muted">· ${nl(v)}</span></li>`).join('')}</ol>`;
  return `<div class="card"><h2>Doelgroep</h2>${reachSplit}
    ${latest ? `<div class="row" style="gap:12px"><div><p class="small" style="font-weight:800">Top steden</p>${list(cities)}</div><div><p class="small" style="font-weight:800">Leeftijd</p>${list(ages)}</div></div>`
      : '<p class="small muted">Leeftijd, geslacht en woonplaats van volgers komen wekelijks binnen via de Meta-koppeling (vanaf 100 volgers).</p>'}
  </div>`;
}

function allPosts(rows, location) {
  const sorted = [...rows].sort((a, b) => a.published_local.localeCompare(b.published_local));
  return `<section class="card"><h2>Alle posts van de maand</h2>
    <div class="scroll"><table>
      <thead><tr><th>Datum</th><th>Tijd</th>${location === 'alle' ? '<th>Locatie</th>' : ''}<th>Platform</th><th>Soort</th><th>Post</th><th>Bereik</th><th>Weergaven</th><th>Likes</th><th>Reacties</th><th>Gedeeld</th><th>Opgeslagen</th></tr></thead>
      <tbody>${sorted.map((p) => `<tr><td>${dayLabel(p)}</td><td>${timeLabel(p)}</td>${location === 'alle' ? `<td>${esc(loc(p.location_id).short)}</td>` : ''}<td>${PLATFORM_LABEL[p.platform]}</td><td>${TYPE_LABEL[p.media_type] || ''}</td>
        <td class="cap">${p.permalink ? `<a href="${esc(p.permalink)}" target="_blank" rel="noopener">${esc(short(p.caption, 60))}</a>` : esc(short(p.caption, 60))}</td>
        <td><b>${nl(p.reach)}</b></td><td>${nl(p.views)}</td><td>${nl(p.likes)}</td><td>${nl(p.comments)}</td><td>${nl(p.shares)}</td><td>${nl(p.saves)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="tiny muted">Tijden in Nederlandse tijd. Facebook levert geen “opgeslagen”; dat staat daar op —.</p></section>`;
}

function eventsBlock(data, sel, profile) {
  const [y, m] = sel.month.split('-');
  const start = `${sel.month}-01`;
  const end = `${sel.month}-${new Date(Date.UTC(+y, +m, 0)).getUTCDate()}`;
  const ev = data.events.filter((e) => e.starts_on <= end && (e.ends_on || e.starts_on) >= start &&
    (sel.location === 'alle' || !e.location_id || e.location_id === sel.location))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const canEdit = profile.role !== 'management';
  const locOptions = `<option value="">Alle locaties</option>${LOCATIONS.filter((l) => data.allowed.includes(l.id)).map((l) => `<option value="${l.id}" ${sel.location === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}`;
  return `<section class="card"><div class="head"><h2>Evenementen en acties in ${monthName(sel.month)}</h2>
      <p class="small muted">De AI-samenvatting koppelt pieken en dalen aan deze lijst</p></div>
    ${ev.length ? `<ul style="margin:0;padding-left:20px">${ev.map((e) => `<li><b>${esc(e.starts_on.slice(8))}-${esc(e.starts_on.slice(5, 7))}${e.ends_on && e.ends_on !== e.starts_on ? ` t/m ${esc(e.ends_on.slice(8))}-${esc(e.ends_on.slice(5, 7))}` : ''}</b> · ${esc(e.title)}${e.location_id ? ` <span class="muted">(${esc(loc(e.location_id).short)})</span>` : ''}
        ${canEdit ? ` <button class="linkbtn" type="button" data-action="del-event" data-id="${esc(e.id)}" aria-label="Verwijder ${esc(e.title)}">Verwijderen</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="small muted">Nog geen evenementen voor deze maand.</p>'}
    ${canEdit ? `<form class="form" data-form="event"><div class="form-row">
        <div class="field" style="flex:2 1 240px"><label for="ev-title">Evenement of actie</label><input id="ev-title" name="title" required maxlength="200" placeholder="Bijv. start zomervakantie"></div>
        <div class="field"><label for="ev-start">Van</label><input id="ev-start" name="starts_on" type="date" required value="${start}"></div>
        <div class="field"><label for="ev-end">Tot en met</label><input id="ev-end" name="ends_on" type="date"></div>
        <div class="field"><label for="ev-loc">Locatie</label><select id="ev-loc" name="location_id">${locOptions}</select></div>
        <button class="btn primary" type="submit">Toevoegen</button></div>
        <p class="form-msg small" role="status"></p></form>` : ''}
  </section>`;
}

export function renderAnalyse(ctx) {
  const { data, location, state, profile } = ctx;
  const sel = { location, month: state.month, platform: state.platform };
  const cur = selectPosts(data.posts, sel);
  const prev = selectPosts(data.posts, { ...sel, month: prevMonth(state.month) });
  const summary = data.summaries.find((s) => s.month.slice(0, 7) === state.month && s.location_key === location && s.screen === 'analyse');
  const bullets = summary ? summary.bullets : autoInsights({ posts: cur, prevPosts: prev, location, screen: 'analyse' });
  const l = location === 'alle' ? null : loc(location);
  const t = totals(cur);

  const title = l
    ? `<div class="head"><div class="loc-title"><span class="dot" style="width:18px;height:18px;background:${l.color}" aria-hidden="true"></span>
        <div><h2 class="h-loc">${esc(l.name)}</h2><p class="small muted">${state.platform === 'samen' ? 'Facebook en Instagram' : PLATFORM_LABEL[state.platform]} · ${monthName(state.month)} · ${cur.length} posts · gerangschikt op bereik</p></div></div>
        <a class="linkbtn" href="${href('overzicht', location, state)}">← Overzicht ${esc(l.short)}</a></div>`
    : `<p class="small muted">Alle locaties · ${state.platform === 'samen' ? 'Facebook en Instagram' : PLATFORM_LABEL[state.platform]} · ${monthName(state.month)} · ${cur.length} posts · gerangschikt op bereik</p>`;

  if (!cur.length) return `${title}${emptyMonth({ month: state.month, platform: state.platform, anyData: data.posts.length > 0 })}${eventsBlock(data, sel, profile)}`;

  return `${title}
    ${topLists(cur, location === 'alle')}
    ${location === 'alle' ? '<p class="small muted" style="margin-top:-14px">Op bereik wint Hans &amp; Grietje bijna altijd. Kies een locatie bovenin voor een eerlijke vergelijking.</p>' : ''}
    <div class="row">${typeBlock(cur, location)}${location === 'alle' ? '' : slotBlock(cur, location)}</div>
    ${weeklyMultiples(cur, state, location)}
    <div class="row">${location === 'alle' ? slotBlock(cur, location) : ''}${audienceBlock(data, sel)}
      <div class="card"><h2>Interacties</h2>
        <div class="stats3"><div><p class="l">Likes</p><p class="v">${nl(t.likes)}</p></div><div><p class="l">Reacties</p><p class="v">${nl(t.comments)}</p></div><div><p class="l">Gedeeld</p><p class="v">${nl(t.shares)}</p></div></div>
        <div class="stats3"><div><p class="l">Opgeslagen</p><p class="v">${nl(t.saves)}</p></div><div><p class="l">Eng. rate</p><p class="v">${pctTxt(t.er, 2)}</p></div><div><p class="l">Posts</p><p class="v">${t.posts}</p></div></div>
        <p class="tiny muted">Opgeslagen telt alleen Instagram mee.</p></div>
    </div>
    ${aiBlock({ title: 'Wat werkt', bullets, generated: !!summary, canGenerate: true, copyId: 'ai-list' })}
    ${eventsBlock(data, sel, profile)}
    ${allPosts(cur, location)}`;
}
