/* ============================================================
   Rechten in de interface
   ------------------------------------------------------------
   Verbergt beheerknoppen voor viewers. Dit is PURE UI: de echte
   beveiliging zit in RLS. Elementen met [data-admin-only] worden
   verborgen voor viewers.
   ============================================================ */

let _profile = null;

export function setProfile(profile) {
  _profile = profile;
}

export function isAdmin() {
  return !!(_profile && _profile.isAdmin);
}

export function currentProfile() {
  return _profile;
}

/* Verberg/toon alle admin-only elementen en zet de leesbadge. */
export function applyPermissionsToDom() {
  const admin = isAdmin();
  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.style.display = admin ? '' : 'none';
  });
  document.querySelectorAll('[data-viewer-only]').forEach((el) => {
    el.style.display = admin ? 'none' : '';
  });
  const badge = document.getElementById('readOnlyBadge');
  if (badge) badge.style.display = admin ? 'none' : 'inline-flex';
}

/* Zachte guard voor UI-handlers. RLS blijft de harde grens. */
export function assertAdmin() {
  if (!isAdmin()) {
    alert('Je hebt alleen leesrechten. Deze actie is voorbehouden aan beheerders.');
    return false;
  }
  return true;
}
