// Kleine opmaak-hulpjes en gedeelde onderdelen (kopbalk, filters, postlijsten).
import { LOCATIONS, loc, monthLabel, prevMonth, nextMonth, dayLabel, timeLabel, TYPE_LABEL, PLATFORM_LABEL } from './data.js';

// Alles wat uit de database of van Meta komt, gaat door esc() voordat het in HTML belandt.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nl = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pctTxt = (x, d = 0) => (x === null || x === undefined) ? '—' : `${nl(x * 100, d)}%`;
export const short = (s, n = 70) => { const a = Array.from(String(s || '').replace(/\s+/g, ' ').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };

export function href(view, location, state, extra = {}) {
  const q = new URLSearchParams({ m: state.month, p: state.platform, ...extra });
  return `#/${view}/${location}?${q}`;
}

export function deltaBadge(d, label = 'vs vorige maand', unit = '') {
  if (d === null || d === undefined) return `<span class="badge">${esc(label)}: nog geen data</span>`;
  const up = d >= 0;
  const arrow = up
    ? '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M1 8h8L5 1z" fill="currentColor"></path></svg>'
    : '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M1 2h8L5 9z" fill="currentColor"></path></svg>';
  const val = unit === 'pt' ? `${nl(Math.abs(d) * 100, 2)} punt` : pctTxt(Math.abs(d));
  return `<span class="badge ${up ? 'up' : 'down'}">${arrow}<span class="sr-only">${up ? 'Gestegen' : 'Gedaald'} met</span>${val} ${esc(label)}</span>`;
}

export function shareBar(parts, label) {
  const any = parts.some((p) => p.share > 0);
  if (!any) return '<div class="hatch" aria-hidden="true"></div>';
  const aria = parts.filter((p) => p.share > 0).map((p) => `${p.name} ${Math.round(p.share * 100)} procent`).join(', ');
  return `<div class="stack" role="img" aria-label="${esc(label)}: ${esc(aria)}">${parts.filter((p) => p.share > 0)
    .map((p) => `<div title="${esc(p.name)} · ${Math.round(p.share * 100)}%" style="flex:${p.share} 1 0;background:${p.color}"></div>`).join('')}</div>
  <p class="tiny muted">${parts.filter((p) => p.share > 0).map((p) => `${esc(p.abbr)} ${Math.round(p.share * 100)}%`).join(' · ')}</p>`;
}

export function singleBar(share, color, label) {
  return `<div class="bar" role="img" aria-label="${esc(label)}"><div style="width:${Math.max(0, Math.min(100, share * 100)).toFixed(1)}%;background:${color}"></div></div>`;
}

const STAR = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D99A1F" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"></path></svg>';
export const star = STAR;

export function header({ view, location, state, profile }) {
  const canAnalyse = profile.role !== 'management';
  const tab = (v, label) => `<a class="pill" href="${href(v, location, state)}" ${view === v ? 'aria-current="page"' : ''}>${label}</a>`;
  const title = view === 'analyse' ? 'Analyse voor marketing' : view === 'beheer' ? 'Beheer' : 'Social media in één oogopslag';
  const name = location === 'alle' ? 'alle vier de locaties' : loc(location)?.name;
  const sub = view === 'analyse' ? `Wat werkt per post, per soort post en per moment · ${name}`
    : view === 'beheer' ? 'Meta-koppeling, gebruikers en synchronisatie' : `Organische cijfers van ${name}`;
  return `<header class="top">
    <a class="brand" href="${href('overzicht', 'alle', state)}" aria-label="Naar het overzicht">
      <img src="assets/logo.png" alt="Hans &amp; Grietje">
      <span><h1>${title}</h1><span class="muted">${esc(sub)}</span></span>
    </a>
    <nav class="tabs" aria-label="Schermen">
      ${tab('overzicht', 'Overzicht')}
      ${canAnalyse ? tab('analyse', 'Analyse marketing') : ''}
      ${profile.role === 'admin' ? tab('beheer', 'Beheer') : ''}
      <button class="linkbtn" data-action="logout" type="button">Uitloggen</button>
    </nav>
  </header>`;
}

export function filters({ view, location, state, months, allowed }) {
  const chip = (id, label, dot) => `<a class="chip" href="${href(view, id, state)}" ${location === id ? 'aria-current="page"' : ''}>${dot}${esc(label)}</a>`;
  const allDots = `<span class="dots" aria-hidden="true">${LOCATIONS.map((l) => `<span class="dot" style="background:${l.color}"></span>`).join('')}</span>`;
  const prev = prevMonth(state.month), next = nextMonth(state.month);
  const mLink = (m, dir, path) => months.includes(m)
    ? `<a href="${href(view, location, { ...state, month: m })}" aria-label="${dir}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F3A7A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg></a>`
    : `<span class="btn" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F3A7A" stroke-width="2.5"><path d="${path}"></path></svg></span>`;
  const seg = (p, label) => `<a href="${href(view, location, { ...state, platform: p })}" ${state.platform === p ? 'aria-current="true"' : ''}>${label}</a>`;
  return `<div class="filters">
    <nav aria-label="Locatie" style="flex:1 1 520px;min-width:0">
      <p class="label">Locatie</p>
      <div class="chips">
        ${allowed.length > 1 ? chip('alle', 'Alle locaties', allDots) : ''}
        ${LOCATIONS.filter((l) => allowed.includes(l.id)).map((l) => chip(l.id, l.short, `<span class="dot" style="background:${l.color}" aria-hidden="true"></span>`)).join('')}
      </div>
    </nav>
    <div><p class="label" id="maand-label">Maand</p>
      <div class="month" role="group" aria-labelledby="maand-label">
        ${mLink(prev, 'Vorige maand', 'M15 5l-7 7 7 7')}<strong>${monthLabel(state.month)}</strong>${mLink(next, 'Volgende maand', 'M9 5l7 7-7 7')}
      </div></div>
    <div><p class="label">Platform</p>
      <div class="seg" role="group" aria-label="Platform">${seg('samen', 'Samen')}${seg('facebook', 'Facebook')}${seg('instagram', 'Instagram')}</div></div>
  </div>`;
}

export function postItem(p, rank, low, showLoc) {
  const l = loc(p.location_id);
  const img = p.thumbnail_url ? `<img class="thumb" src="${esc(p.thumbnail_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb" aria-hidden="true"></div>';
  const nums = [
    `<b>${nl(p.reach)}</b> bereik`, `${nl(p.views)} weergaven`, `${nl(p.likes)} likes`,
    `${nl(p.comments)} reacties`, `${nl(p.shares)} keer gedeeld`, ...(p.saves !== null && p.saves !== undefined ? [`${nl(p.saves)} keer opgeslagen`] : [])
  ].join(' · ');
  const cap = esc(short(p.caption, 90)) || '<span class="muted">(geen tekst)</span>';
  return `<li><span class="rank ${low ? 'low' : ''}">${rank}</span>${img}
    <div style="flex:1 1 auto;min-width:0">
      <p class="meta">${showLoc ? `<span class="dot" style="background:${l.color}" aria-hidden="true"></span>${esc(l.short)} · ` : ''}${PLATFORM_LABEL[p.platform]} · ${TYPE_LABEL[p.media_type] || ''} · ${dayLabel(p)} · ${timeLabel(p)}</p>
      <p class="cap">${p.permalink ? `<a href="${esc(p.permalink)}" target="_blank" rel="noopener">${cap}</a>` : cap}</p>
      <p class="nums">${nums}</p>
    </div></li>`;
}

// Melding voor een maand of selectie zonder posts
export function emptyMonth({ month, platform, anyData }) {
  const which = platform === 'samen' ? '' : ` voor ${PLATFORM_LABEL[platform]}`;
  return `<section class="card" style="align-items:flex-start">
    <h2>Nog geen gegevens${which} in ${esc(monthLabel(month).toLowerCase())}</h2>
    <p>${anyData
      ? 'Voor deze maand zijn (nog) geen posts binnengekomen. Zodra de Meta-koppeling draait, haalt het systeem elke nacht de nieuwe cijfers op; bij de eerste keer ophalen komen ook de laatste 90 dagen mee.'
      : 'Er staan nog geen cijfers in het dashboard. Koppel het Meta-account via Beheer; daarna komen de cijfers elke nacht vanzelf binnen.'}</p>
    <p class="small muted">Gebruik het pijltje bij Maand om naar een maand met cijfers te gaan.</p>
  </section>`;
}

export function aiBlock({ title, bullets, generated, canGenerate, copyId }) {
  return `<section class="card ai" aria-labelledby="ai-title">
    <div class="head"><div class="t">${star}<h2 id="ai-title">${title}</h2>
      <span class="badge">${generated ? 'AI-samenvatting' : 'Automatische samenvatting'}</span></div>
      <div class="tabs">
        ${canGenerate ? '<button class="btn" type="button" data-action="ai">Laat AI samenvatten</button>' : ''}
        <button class="btn" type="button" data-action="copy" data-target="${copyId}">Kopieer voor presentatie</button>
      </div></div>
    ${bullets.length ? `<ul id="${copyId}">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '<p class="empty">Nog niet genoeg gegevens voor een samenvatting.</p>'}
    <p class="ai-status small muted" role="status"></p>
  </section>`;
}
