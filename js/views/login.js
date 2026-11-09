// Inloggen, wachtwoord vergeten en nieuw wachtwoord instellen
import { esc } from '../ui.js';

export function renderLogin(mode = 'login', message = '') {
  const forms = {
    login: `<form class="form" data-form="login">
        <div class="field"><label for="email">E-mailadres</label><input id="email" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="pw">Wachtwoord</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit" style="justify-content:center">Inloggen</button>
        <button class="linkbtn" type="button" data-action="to-forgot" style="align-self:center">Wachtwoord vergeten?</button>
      </form>`,
    forgot: `<form class="form" data-form="forgot">
        <p class="small">Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord in te stellen.</p>
        <div class="field"><label for="email">E-mailadres</label><input id="email" name="email" type="email" autocomplete="username" required></div>
        <button class="btn primary" type="submit" style="justify-content:center">Stuur link</button>
        <button class="linkbtn" type="button" data-action="to-login" style="align-self:center">Terug naar inloggen</button>
      </form>`,
    reset: `<form class="form" data-form="reset">
        <p class="small">Kies een nieuw wachtwoord (minstens 8 tekens).</p>
        <div class="field"><label for="pw">Nieuw wachtwoord</label><input id="pw" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
        <button class="btn primary" type="submit" style="justify-content:center">Opslaan en verder</button>
      </form>`
  };
  return `<main class="login"><div class="card">
      <img src="assets/logo.png" alt="Hans &amp; Grietje">
      <h1 style="text-align:center;font-size:26px">Marketingdashboard</h1>
      <p class="form-msg ${message.startsWith('!') ? 'error' : 'ok'}" role="status">${esc(message.replace(/^!/, ''))}</p>
      ${forms[mode]}
    </div></main>`;
}
