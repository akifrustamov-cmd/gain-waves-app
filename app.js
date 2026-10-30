// GAIN WAVES app — phone-first web app on Supabase.
// Views are rendered into #view from the URL hash: #auth, #onboard, #home, #log, #gym, #shelf, #profile.

const sb = window.supabase.createClient(window.GW_CONFIG.supabaseUrl, window.GW_CONFIG.supabaseKey);

const LEVELS = [
  { n: 1, name: 'Rookie', min: 0 },
  { n: 2, name: 'Gym Rat', min: 6000 },
  { n: 3, name: 'Swole', min: 15000 },
  { n: 4, name: 'Freak', min: 30000 },
];
const KINDS = { strength: 'Strength', cardio: 'Cardio', hiit: 'HIIT', sport: 'Sport', mobility: 'Mobility' };
const INTENSITY = { light: 'Light', moderate: 'Moderate', hard: 'Hard' };
const DAILY_CAP = 600;

const state = { session: null, profile: null, gym: null };
const view = document.getElementById('view');

// ---- helpers ----
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('en-GB');
const levelOf = xp => [...LEVELS].reverse().find(l => xp >= l.min);
const nextOf = lv => LEVELS.find(l => l.n === lv.n + 1);
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
// Mirrors public.workouts_compute_xp() for the preview; the server value is the one that counts.
const previewXp = (kind, intensity, min) =>
  Math.min(DAILY_CAP, Math.round(min * ({ light: 2, moderate: 3, hard: 4 }[intensity] || 3) * (kind === 'strength' || kind === 'hiit' ? 1.2 : 1)));

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}
function setChrome(signedIn) {
  document.getElementById('tabs').hidden = !signedIn;
  const top = document.getElementById('top-xp');
  top.hidden = !signedIn;
  if (signedIn && state.profile) top.textContent = `${levelOf(state.profile.xp).name} · ${fmt(state.profile.xp)} XP`;
  const tab = location.hash.slice(1) || 'home';
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}
function busy(form, on) { form.querySelectorAll('button').forEach(b => { b.disabled = on; }); }

async function loadProfile() {
  const uid = state.session.user.id;
  const { data, error } = await sb.from('profiles').select('*, gyms(name, city)').eq('id', uid).maybeSingle();
  if (error) throw error;
  state.profile = data;
  state.gym = data && data.gyms;
}

// ---- router ----
async function route() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (!state.session) { setChrome(false); return renderAuth(); }
  try { await loadProfile(); } catch (e) { view.innerHTML = `<p class="error">Couldn't load your profile. ${esc(e.message)}</p>`; return; }
  if (!state.profile) { setChrome(false); return renderOnboard(); }
  const tab = location.hash.slice(1) || 'home';
  setChrome(true);
  const views = { home: renderHome, log: renderLog, gym: renderGym, shelf: renderShelf, profile: renderProfile };
  (views[tab] || renderHome)();
}
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') route(); });

// ---- auth ----
function renderAuth(mode = 'signin') {
  const creating = mode === 'signup';
  view.innerHTML = `
    <div><p class="eyebrow">No pain, no gain waves</p><h1>${creating ? 'Join free' : 'Welcome back'}</h1></div>
    <p class="muted">${creating ? 'Create your account, then earn every level from Rookie to Freak.' : 'Sign in to log your training and earn XP.'}</p>
    <form id="auth-form" class="card" novalidate>
      <label>Email<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com" /></label>
      <label>Password<input id="auth-pass" type="password" autocomplete="${creating ? 'new-password' : 'current-password'}" minlength="8" required /></label>
      <p class="error" id="auth-err" hidden></p>
      <button class="btn" type="submit">${creating ? 'Create account' : 'Sign in'}</button>
    </form>
    <button class="link-btn" id="auth-switch">${creating ? 'Already a member? Sign in' : 'New here? Join free'}</button>`;
  document.getElementById('auth-switch').onclick = () => renderAuth(creating ? 'signin' : 'signup');
  const form = document.getElementById('auth-form');
  form.onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('auth-err'); err.hidden = true;
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value;
    if (!email || password.length < 8) { err.textContent = 'Enter your email and a password of at least 8 characters.'; err.hidden = false; return; }
    busy(form, true);
    const res = creating ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
    busy(form, false);
    if (res.error) { err.textContent = res.error.message; err.hidden = false; return; }
    if (creating && !res.data.session) {
      view.innerHTML = `<div class="card"><h2>Check your email</h2><p class="muted">We sent a confirmation link to ${esc(email)}. Open it, then come back and sign in.</p></div>`;
      return;
    }
    location.hash = '#home'; route();
  };
}

// ---- onboarding ----
async function renderOnboard() {
  const { data: gyms } = await sb.from('gyms').select('id, name, city').order('name');
  view.innerHTML = `
    <div><p class="eyebrow">Step 1 of 1</p><h1>Set up your profile</h1></div>
    <form id="ob-form" class="card" novalidate>
      <label>Username<input id="ob-user" required placeholder="iron_mike" autocomplete="username" /></label>
      <label>Display name<input id="ob-name" required placeholder="Mike" autocomplete="nickname" /></label>
      <label>Your gym
        <select id="ob-gym">
          <option value="">Choose your gym</option>
          ${(gyms || []).map(g => `<option value="${g.id}">${esc(g.name)} · ${esc(g.city)}</option>`).join('')}
          <option value="new">My gym isn't listed — add it</option>
        </select>
      </label>
      <div id="ob-newgym" hidden style="display:flex;flex-direction:column;gap:14px">
        <label>Gym name<input id="ob-gname" placeholder="Iron Temple" /></label>
        <label>City<input id="ob-gcity" placeholder="Riga" /></label>
      </div>
      <label>Favourite sport<input id="ob-sport" placeholder="Bodybuilding" /></label>
      <label class="check"><input id="ob-board" type="checkbox" checked /> Show me on my gym's leaderboard (name, level and XP only)</label>
      <label class="check"><input id="ob-consent" type="checkbox" /> I agree that GAIN WAVES stores my workout data to calculate my XP and level. I can delete it at any time.</label>
      <p class="error" id="ob-err" hidden></p>
      <button class="btn" type="submit">Start as Rookie</button>
    </form>`;
  const sel = document.getElementById('ob-gym'), ng = document.getElementById('ob-newgym');
  sel.onchange = () => { ng.hidden = sel.value !== 'new'; };
  const form = document.getElementById('ob-form');
  form.onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('ob-err'); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; busy(form, false); };
    const username = document.getElementById('ob-user').value.trim().toLowerCase();
    const display_name = document.getElementById('ob-name').value.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return fail('Username: 3–20 characters, letters, numbers or underscore.');
    if (display_name.length < 2) return fail('Enter a display name.');
    if (!sel.value) return fail('Choose your gym, or add it.');
    if (!document.getElementById('ob-consent').checked) return fail('Tick the data consent box to start earning XP.');
    busy(form, true);
    let gym_id = sel.value;
    const uid = state.session.user.id;
    if (gym_id === 'new') {
      const name = document.getElementById('ob-gname').value.trim(), city = document.getElementById('ob-gcity').value.trim();
      if (name.length < 2 || city.length < 2) return fail('Enter your gym name and city.');
      const { data: g, error } = await sb.from('gyms').insert({ name, city, created_by: uid }).select('id').single();
      if (error) return fail(error.code === '23505' ? 'That gym already exists — choose it from the list.' : error.message);
      gym_id = g.id;
    }
    const { error } = await sb.from('profiles').insert({
      id: uid, username, display_name, gym_id,
      favourite_sport: document.getElementById('ob-sport').value.trim() || null,
      show_on_leaderboard: document.getElementById('ob-board').checked,
      health_consent_at: new Date().toISOString(),
    });
    if (error) return fail(error.code === '23505' ? 'That username is taken. Try another.' : error.message);
    location.hash = '#home'; route();
  };
}

// ---- home ----
function levelCard(xp) {
  const lv = levelOf(xp), nx = nextOf(lv);
  const pct = nx ? Math.round(((xp - lv.min) / (nx.min - lv.min)) * 100) : 100;
  return `<section class="level lv-${lv.n}">
      <div class="level__row"><span>Gain Waves</span><span>Level ${lv.n} of 4</span></div>
      <div class="level__name">${lv.name}</div>
      <div class="bar" aria-label="Progress to next level"><span style="width:${pct}%"></span></div>
      <div class="level__row"><span>${fmt(xp)} XP</span><span>${nx ? `${fmt(nx.min - xp)} XP to ${nx.name}` : 'Top level'}</span></div>
    </section>`;
}
async function renderHome() {
  const p = state.profile;
  const { data: rows } = await sb.from('workouts').select('*').gte('performed_on', daysAgo(30)).order('performed_on', { ascending: false }).order('created_at', { ascending: false });
  const week = (rows || []).filter(w => w.performed_on >= daysAgo(6));
  const weekXp = week.reduce((a, w) => a + w.xp, 0), weekMin = week.reduce((a, w) => a + w.duration_min, 0);
  view.innerHTML = `
    <div><p class="eyebrow">${esc(state.gym ? state.gym.name : 'No gym yet')}</p><h1>Hi, ${esc(p.display_name)}</h1></div>
    ${levelCard(p.xp)}
    <div class="stats">
      <div class="stat"><b>${week.length}</b><span>workouts this week</span></div>
      <div class="stat"><b>${fmt(weekMin)}</b><span>minutes</span></div>
      <div class="stat"><b>${fmt(weekXp)}</b><span>XP this week</span></div>
    </div>
    <a class="btn" href="#log">Log a workout</a>
    <section class="card"><h2>Recent workouts</h2>
      ${rows && rows.length ? `<ul class="list">${rows.slice(0, 10).map(w => `
        <li><div class="grow"><p>${KINDS[w.kind]} · ${INTENSITY[w.intensity]} · ${w.duration_min} min</p>
          <p class="muted">${esc(w.performed_on)}${w.notes ? ' · ' + esc(w.notes) : ''}</p></div>
          <span class="xp">+${fmt(w.xp)} XP</span>
          <button class="link-btn" data-del="${w.id}" aria-label="Delete workout">Delete</button></li>`).join('')}</ul>`
        : '<p class="muted">No workouts yet. Log your first one to start earning XP.</p>'}
    </section>`;
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.from('workouts').delete().eq('id', b.dataset.del);
    if (error) { toast(error.message); b.disabled = false; return; }
    toast('Workout deleted'); route();
  });
}

// ---- log workout ----
function renderLog() {
  const seg = (name, opts, def) => `<div class="seg" role="radiogroup">${Object.entries(opts).map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${v}" ${v === def ? 'checked' : ''} /><span>${l}</span></label>`).join('')}</div>`;
  view.innerHTML = `
    <div><p class="eyebrow">Log</p><h1>Today's workout</h1></div>
    <form id="log-form" class="card" novalidate>
      <label>Type</label>${seg('kind', KINDS, 'strength')}
      <label>Intensity</label>${seg('intensity', INTENSITY, 'moderate')}
      <label>Minutes<input id="lg-min" type="number" inputmode="numeric" min="5" max="240" value="60" /></label>
      <label>Date<select id="lg-date">${[0,1,2,3,4,5,6,7].map(d => `<option value="${daysAgo(d)}">${d === 0 ? 'Today' : d === 1 ? 'Yesterday' : daysAgo(d)}</option>`).join('')}</select></label>
      <label>Notes (optional)<input id="lg-notes" maxlength="200" placeholder="Leg day, 5x5 squats" /></label>
      <p class="muted" id="lg-preview"></p>
      <p class="error" id="lg-err" hidden></p>
      <button class="btn" type="submit">Save workout</button>
    </form>
    <p class="muted">XP = minutes × intensity (light 2, moderate 3, hard 4), +20% for strength and HIIT. Up to ${DAILY_CAP} XP a day.</p>`;
  const form = document.getElementById('log-form');
  const val = n => form.querySelector(`input[name="${n}"]:checked`).value;
  const upd = () => {
    const m = parseInt(document.getElementById('lg-min').value, 10) || 0;
    document.getElementById('lg-preview').textContent = m >= 5 ? `About +${fmt(previewXp(val('kind'), val('intensity'), Math.min(m, 240)))} XP` : '';
  };
  form.oninput = upd; upd();
  form.onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('lg-err'); err.hidden = true;
    const duration_min = parseInt(document.getElementById('lg-min').value, 10);
    if (!(duration_min >= 5 && duration_min <= 240)) { err.textContent = 'Minutes must be between 5 and 240.'; err.hidden = false; return; }
    busy(form, true);
    const before = levelOf(state.profile.xp);
    const { data, error } = await sb.from('workouts').insert({
      user_id: state.session.user.id, kind: val('kind'), intensity: val('intensity'), duration_min,
      performed_on: document.getElementById('lg-date').value, notes: document.getElementById('lg-notes').value.trim() || null,
    }).select('xp').single();
    busy(form, false);
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    await loadProfile();
    const after = levelOf(state.profile.xp);
    toast(after.n > before.n ? `Level up: you're now ${after.name}` : data.xp > 0 ? `+${fmt(data.xp)} XP` : `Saved. Daily limit of ${DAILY_CAP} XP reached.`);
    location.hash = '#home';
  };
}

// ---- gym leaderboard ----
async function renderGym() {
  const p = state.profile;
  if (!p.gym_id) { view.innerHTML = `<div class="card"><h2>No gym yet</h2><p class="muted">Choose your gym in your profile to see its leaderboard.</p><a class="btn" href="#profile">Choose gym</a></div>`; return; }
  const { data, error } = await sb.rpc('gym_leaderboard', { p_gym: p.gym_id });
  view.innerHTML = `
    <div><p class="eyebrow">${esc(state.gym.city)}</p><h1>${esc(state.gym.name)}</h1></div>
    <section class="card"><h2>Leaderboard</h2>
      ${error ? `<p class="error">${esc(error.message)}</p>` : `<ul class="list">${(data || []).map((r, i) => `
        <li class="${r.username === p.username ? 'me' : ''}"><span class="rank">${i + 1}</span>
          <div class="grow"><p>${esc(r.display_name)}</p><p class="muted">@${esc(r.username)}</p></div>
          <span class="chip lv-${r.level}">${LEVELS[r.level - 1].name}</span><span class="xp">${fmt(r.xp)}</span></li>`).join('')}</ul>`}
    </section>
    <p class="muted">Only members who chose to be shown appear here. Change this in your profile.</p>`;
}

// ---- brand shelf ----
async function renderShelf() {
  const lv = levelOf(state.profile.xp);
  const { data: brands, error } = await sb.from('brands').select('id, name, tagline, sponsored, shelf_rank, offers(id, title, description, min_level, member_discount_pct)').order('shelf_rank');
  view.innerHTML = `
    <div><p class="eyebrow">Your level: ${lv.name}</p><h1>The shelf</h1></div>
    <p class="muted">Higher levels unlock better prices and limited drops. The shop opens soon; these are your member prices.</p>
    ${error ? `<p class="error">${esc(error.message)}</p>` : (brands || []).map(b => `
      <section class="card">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <h2>${esc(b.name)}</h2>${b.sponsored ? '<span class="sponsored">Sponsored</span>' : ''}</div>
        ${b.tagline ? `<p class="muted">${esc(b.tagline)}</p>` : ''}
        ${(b.offers || []).sort((a, c) => a.min_level - c.min_level).map(o => {
          const open = lv.n >= o.min_level;
          return `<div class="offer ${open ? '' : 'locked'}"><div class="grow"><p>${esc(o.title)}</p>
            <p class="muted">${open ? esc(o.description || '') : `Unlocks at ${LEVELS[o.min_level - 1].name}`}</p></div>
            <span class="offer__pct">${o.member_discount_pct ? `−${o.member_discount_pct} %` : ''}</span></div>`;
        }).join('')}
      </section>`).join('')}`;
}

// ---- profile ----
async function renderProfile() {
  const p = state.profile;
  const { data: gyms } = await sb.from('gyms').select('id, name, city').order('name');
  view.innerHTML = `
    <div><p class="eyebrow">@${esc(p.username)}</p><h1>Your profile</h1></div>
    <form id="pf-form" class="card" novalidate>
      <label>Display name<input id="pf-name" value="${esc(p.display_name)}" /></label>
      <label>Gym<select id="pf-gym">${(gyms || []).map(g => `<option value="${g.id}" ${g.id === p.gym_id ? 'selected' : ''}>${esc(g.name)} · ${esc(g.city)}</option>`).join('')}</select></label>
      <label>Favourite sport<input id="pf-sport" value="${esc(p.favourite_sport || '')}" /></label>
      <label>Bio<textarea id="pf-bio" maxlength="160" rows="3">${esc(p.bio || '')}</textarea></label>
      <label class="check"><input id="pf-board" type="checkbox" ${p.show_on_leaderboard ? 'checked' : ''} /> Show me on my gym's leaderboard</label>
      <p class="error" id="pf-err" hidden></p>
      <button class="btn" type="submit">Save profile</button>
    </form>
    <button class="btn btn--ghost" id="pf-out">Sign out</button>
    <p class="muted">To delete your account and all workout data, email contact.eu@wavesint.com.</p>`;
  const form = document.getElementById('pf-form');
  form.onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('pf-err'); err.hidden = true;
    const display_name = document.getElementById('pf-name').value.trim();
    if (display_name.length < 2) { err.textContent = 'Enter a display name.'; err.hidden = false; return; }
    busy(form, true);
    const { error } = await sb.from('profiles').update({
      display_name, gym_id: document.getElementById('pf-gym').value,
      favourite_sport: document.getElementById('pf-sport').value.trim() || null,
      bio: document.getElementById('pf-bio').value.trim() || null,
      show_on_leaderboard: document.getElementById('pf-board').checked,
    }).eq('id', p.id);
    busy(form, false);
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    toast('Profile saved'); route();
  };
  document.getElementById('pf-out').onclick = async () => { await sb.auth.signOut(); location.hash = ''; };
}

route();
