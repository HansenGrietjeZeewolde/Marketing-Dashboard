/* ============================================================
   Gebruikersbeheer-UI (alleen admins)
   ------------------------------------------------------------
   Koppelt de gebruikersbeheer-modal aan UsersAdmin. Wordt apart
   geladen zodat app.js overzichtelijk blijft. Werkt alleen wanneer
   /api/users beschikbaar is (Vercel).
   ============================================================ */

import { loadCurrentProfile } from './auth.js';
import { UsersAdmin } from './users-admin.js';
import { DashboardRepository } from './repository.js';

let COMPANIES = [];
let isAdminUser = false;

const $ = (id) => document.getElementById(id);

(async function initUsersUi() {
  // Wacht tot app.js een sessie heeft; profiel opnieuw ophalen is goedkoop (gecached).
  let profile = null;
  try { profile = await loadCurrentProfile(); } catch (e) { return; }
  if (!profile) return;
  isAdminUser = profile.role === 'admin';
  if (!isAdminUser) return;

  try { COMPANIES = await DashboardRepository.getCompanies(); } catch (e) { COMPANIES = []; }

  const usersBtn = $('usersBtn');
  if (usersBtn) usersBtn.addEventListener('click', openUsers);
  $('usersClose').addEventListener('click', () => ($('usersOverlay').style.display = 'none'));
  $('usersOverlay').addEventListener('click', (e) => { if (e.target.id === 'usersOverlay') $('usersOverlay').style.display = 'none'; });
  $('inviteBtn').addEventListener('click', invite);
  $('membershipClose').addEventListener('click', () => ($('membershipOverlay').style.display = 'none'));
  $('membershipOverlay').addEventListener('click', (e) => { if (e.target.id === 'membershipOverlay') $('membershipOverlay').style.display = 'none'; });
})();

async function openUsers() {
  $('usersOverlay').style.display = 'flex';
  $('inviteMsg').textContent = '';
  await refreshUsers();
}

async function refreshUsers() {
  const table = $('usersTable');
  table.innerHTML = '<tr><td class="hint">Laden...</td></tr>';
  let users;
  try {
    users = await UsersAdmin.list();
  } catch (e) {
    table.innerHTML = '<tr><td class="hint">Gebruikerslijst niet beschikbaar: ' + escapeHtml(e.message) +
      '. Dit vereist de serverless functie /api/users (Vercel).</td></tr>';
    return;
  }
  let html = '<tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Status</th><th>Acties</th></tr>';
  users.forEach((u) => {
    html += '<tr>' +
      '<td>' + escapeHtml(u.full_name || '') + '</td>' +
      '<td>' + escapeHtml(u.email || '') + '</td>' +
      '<td>' + (u.role === 'admin' ? 'Beheerder' : 'Alleen-lezen') + '</td>' +
      '<td>' + (u.is_active ? 'Actief' : 'Inactief') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="linkbtn" data-act="role" data-id="' + u.id + '" data-role="' + u.role + '">Rol wisselen</button> ' +
        '<button class="linkbtn" data-act="active" data-id="' + u.id + '" data-active="' + u.is_active + '">' + (u.is_active ? 'Deactiveren' : 'Activeren') + '</button> ' +
        '<button class="linkbtn" data-act="members" data-id="' + u.id + '" data-name="' + escapeAttr(u.full_name || u.email) + '">Vestigingen</button>' +
      '</td></tr>';
  });
  table.innerHTML = html;

  table.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', () => onUserAction(b)));
}

async function onUserAction(b) {
  const id = b.dataset.id;
  try {
    if (b.dataset.act === 'role') {
      const next = b.dataset.role === 'admin' ? 'viewer' : 'admin';
      await UsersAdmin.setRole(id, next);
      await refreshUsers();
    } else if (b.dataset.act === 'active') {
      const next = !(b.dataset.active === 'true');
      await UsersAdmin.setActive(id, next);
      await refreshUsers();
    } else if (b.dataset.act === 'members') {
      await openMembership(id, b.dataset.name);
    }
  } catch (e) {
    alert('Actie mislukt: ' + e.message);
  }
}

async function invite() {
  $('inviteMsg').textContent = 'Bezig...';
  try {
    const email = $('inviteEmail').value.trim();
    const name = $('inviteName').value.trim();
    const role = $('inviteRole').value;
    if (!email) { $('inviteMsg').textContent = 'Vul een e-mailadres in.'; return; }
    await UsersAdmin.invite(email, name, role);
    $('inviteMsg').textContent = 'Uitnodiging verstuurd naar ' + email + '.';
    $('inviteEmail').value = ''; $('inviteName').value = '';
    await refreshUsers();
  } catch (e) {
    $('inviteMsg').textContent = 'Uitnodigen mislukt: ' + e.message;
  }
}

async function openMembership(userId, name) {
  $('membershipTitle').textContent = 'Vestigingen voor ' + name;
  const body = $('membershipBody');
  body.innerHTML = '<p class="hint">Laden...</p>';
  let current = [];
  try { current = await UsersAdmin.getMemberships(userId); } catch (e) {}
  const set = new Set(current);
  body.innerHTML = COMPANIES.map((c) =>
    '<label class="metric-toggle" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">' +
    '<span>' + escapeHtml(c.name) + '</span>' +
    '<input type="checkbox" data-cid="' + c.id + '"' + (set.has(c.id) ? ' checked' : '') + '></label>'
  ).join('') + '<p class="hint" style="margin-top:10px">Een beheerder ziet altijd alle vestigingen; koppelingen zijn vooral van belang voor alleen-lezen-gebruikers.</p>';

  body.querySelectorAll('input[data-cid]').forEach((inp) => inp.addEventListener('change', async () => {
    try {
      if (inp.checked) await UsersAdmin.addMembership(userId, inp.dataset.cid);
      else await UsersAdmin.removeMembership(userId, inp.dataset.cid);
    } catch (e) {
      alert('Koppeling wijzigen mislukt: ' + e.message);
      inp.checked = !inp.checked;
    }
  }));
  $('membershipOverlay').style.display = 'flex';
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
