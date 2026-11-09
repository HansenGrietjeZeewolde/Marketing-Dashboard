// Beheer — alleen voor de rol 'admin'
import { LOCATIONS, loc, PLATFORM_LABEL } from '../data.js';
import { esc } from '../ui.js';

const when = (ts) => ts ? new Date(ts).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }) : '—';
const STATUS = { ok: 'Gelukt', partial: 'Deels gelukt', error: 'Mislukt', running: 'Bezig' };

export function renderBeheer({ data, query }) {
  const msg = query.get('meta');
  const banner = msg === 'ok'
    ? `<p class="ok" role="status">Meta gekoppeld: ${esc(query.get('gekoppeld') || '0')} accounts.${query.get('overgeslagen') ? ` Niet herkend: ${esc(query.get('overgeslagen'))}.` : ''} Klik op “Nu ophalen” voor de eerste cijfers.</p>`
    : msg ? `<p class="error" role="alert">Koppelen is niet gelukt (${esc(msg)}${query.get('melding') ? `: ${esc(query.get('melding'))}` : ''}).</p>` : '';

  const accounts = LOCATIONS.flatMap((l) => ['facebook', 'instagram'].map((p) => {
    const a = data.accounts.find((x) => x.location_id === l.id && x.platform === p);
    return `<tr><td><span class="dot" style="background:${l.color}" aria-hidden="true"></span> ${esc(l.name)}</td><td>${PLATFORM_LABEL[p]}</td>
      <td>${a?.handle ? esc(a.handle) : '<span class="muted">—</span>'}</td>
      <td>${a?.connected ? '<span class="badge up">Gekoppeld</span>' : '<span class="badge">Niet gekoppeld</span>'}</td>
      <td>${when(a?.last_synced_at)}</td></tr>`;
  })).join('');

  const runs = data.syncRuns.length ? data.syncRuns.map((r) => {
    const errors = (r.details || []).filter((d) => d.error).map((d) => `${loc(d.location)?.short || d.location} ${PLATFORM_LABEL[d.platform] || ''}: ${d.error}`);
    const posts = (r.details || []).reduce((a, d) => a + (d.posts || 0), 0);
    return `<tr><td>${when(r.started_at)}</td><td>${esc(r.triggered_by || '')}</td><td>${STATUS[r.status] || esc(r.status)}</td><td>${posts}</td>
      <td class="cap">${errors.length ? esc(errors.join(' · ')) : '<span class="muted">—</span>'}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="muted">Nog niet gesynchroniseerd.</td></tr>';

  const users = data.profiles.map((u) => `<tr data-user="${esc(u.id)}">
      <td>${esc(u.email)}</td>
      <td><label class="sr-only" for="role-${esc(u.id)}">Rol van ${esc(u.email)}</label>
        <select id="role-${esc(u.id)}" data-action="role" data-id="${esc(u.id)}" style="min-height:40px;border-radius:8px;border:1.5px solid var(--line-strong);padding:0 8px">
        ${['management', 'marketing', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${{ management: 'Management', marketing: 'Marketing', admin: 'Beheerder' }[r]}</option>`).join('')}
      </select></td>
      <td>${LOCATIONS.map((l) => `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;min-height:32px">
        <input type="checkbox" data-action="member" data-id="${esc(u.id)}" data-loc="${l.id}" ${data.members.some((m) => m.user_id === u.id && m.location_id === l.id) ? 'checked' : ''}> ${esc(l.short)}</label>`).join('')}</td>
    </tr>`).join('');

  return `${banner}
    <section class="card"><div class="head"><h2>Meta-koppeling</h2>
      <div class="tabs"><button class="btn" type="button" data-action="meta-connect">Koppel Meta-account</button>
        <button class="btn primary" type="button" data-action="meta-sync">Nu ophalen</button></div></div>
      <p class="small muted">Koppelen doet een beheerder één keer: inloggen bij Facebook en toestemming geven voor de pagina's en Instagram-accounts. Daarna haalt het systeem elke nacht zelf de cijfers op. “Nu ophalen” haalt de laatste 90 dagen direct op.</p>
      <p class="sync-msg small" role="status"></p>
      <div class="scroll"><table><thead><tr><th>Locatie</th><th>Platform</th><th>Account</th><th>Status</th><th>Laatst opgehaald</th></tr></thead><tbody>${accounts}</tbody></table></div>
    </section>
    <section class="card"><h2>Laatste synchronisaties</h2>
      <div class="scroll"><table><thead><tr><th>Moment</th><th>Door</th><th>Resultaat</th><th>Posts</th><th>Meldingen</th></tr></thead><tbody>${runs}</tbody></table></div>
    </section>
    <section class="card"><h2>Gebruikers en toegang</h2>
      <p class="small muted">Management ziet alleen het overzicht, marketing ook de analyse en evenementen, een beheerder alles. Nieuwe gebruikers voeg je toe in Supabase (Authentication → Users → Invite user); daarna verschijnen ze hier en geef je ze een rol en locaties.</p>
      <p class="user-msg small" role="status"></p>
      <div class="scroll"><table><thead><tr><th>E-mail</th><th>Rol</th><th>Locaties</th></tr></thead><tbody>${users}</tbody></table></div>
    </section>`;
}
