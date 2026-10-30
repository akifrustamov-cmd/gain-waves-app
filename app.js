// GAIN WAVES app — phone-first web app on Supabase.
// Views are rendered into #view from the URL hash: #auth, #onboard, #home, #log, #gym, #shelf, #profile.

const sb = window.supabase.createClient(window.GW_CONFIG.supabaseUrl, window.GW_CONFIG.supabaseKey);

const LEVELS = [
  { n: 1, name: 'Rookie', min: 0 },
  { n: 2, name: 'Gym Rat', min: 15000 },
  { n: 3, name: 'Swole', min: 30000 },
  { n: 4, name: 'Freak', min: 63000 },
];
const DAILY_CAP = 800, WEEKLY_CAP = 1200, WORKOUT_BONUS = 20;
const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];

const state = { session: null, profile: null, gym: null, exercises: null };
const view = document.getElementById('view');

// ---- helpers ----
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(Number(n || 0)).toLocaleString('en-GB');
const levelOf = xp => [...LEVELS].reverse().find(l => xp >= l.min);
const nextOf = lv => LEVELS.find(l => l.n === lv.n + 1);
const daysAgo = d => { const t = new Date(); t.setDate(t.getDate() - d); return t.toLocaleDateString('en-CA'); };
// Mirrors public.set_xp() for the live preview; the server's number is the one that counts.
function setXp(ex, st) {
  const reps = +st.reps || 0, kg = +st.weight_kg || 0, min = +st.minutes || 0;
  if (ex.category === 'weighted') return (4 + 0.6 * reps + Math.min(kg, 250) * reps / 150) * ex.mult;
  if (ex.category === 'bodyweight') return (4 + reps + Math.min(kg, 100) * reps / 150) * ex.mult;
  return min * ex.rate;
}

// Small line icons for the exercise picker (24px grid, currentColor).
const ICONS = {
  barbell: '<path d="M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8"/>',
  dumbbell: '<path d="M7 12h10M4 9v6M7 7v10M17 7v10M20 9v6"/>',
  machine: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M12 15v3"/>',
  bar: '<path d="M3 4h18M7 4v3M17 4v3"/><circle cx="12" cy="10" r="2"/><path d="M12 12v5M8 7l4 3 4-3M10 21l2-4 2 4"/>',
  body: '<circle cx="12" cy="5" r="2"/><path d="M12 7v7M7 10h10M9 21l3-7 3 7"/>',
  run: '<circle cx="15" cy="4.5" r="2"/><path d="M8 21l3-6 3 2 1 4M6 12l4-4 4 2 2 3h3M11 15l-1-5"/>',
  hiit: '<path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z"/>',
  row: '<path d="M3 17h18M6 17l3-6h6l3 6"/><circle cx="12" cy="7" r="2"/>',
  stairs: '<path d="M3 21h4v-4h4v-4h4V9h4V5h2"/>',
  swim: '<circle cx="16" cy="6" r="2"/><path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M5 14l5-4 3 2 3-2"/>',
  bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-7h5l3 7M10 9l2 7"/>',
  walk: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7l-1 6 3 3v5M11 13l-3 8M9 9l-2 4M13 9l3 3"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.body}</svg>`;

async function loadExercises() {
  if (state.exercises) return state.exercises;
  const { data, error } = await sb.from('exercises').select('*').order('sort');
  if (error) throw error;
  state.exercises = Object.fromEntries(data.map(e => [e.id, { ...e, mult: +e.mult, rate: +e.rate }]));
  return state.exercises;
}

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
  const tab = (location.hash.slice(1) || 'home').replace(/^edit\/.*/, 'log');
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
  view.onclick = null;
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (!state.session) { setChrome(false); return renderAuth(); }
  try { await loadProfile(); } catch (e) { view.innerHTML = `<p class="error">Couldn't load your profile. ${esc(e.message)}</p>`; return; }
  if (!state.profile) { setChrome(false); return renderOnboard(); }
  const tab = location.hash.slice(1) || 'home';
  setChrome(true);
  if (tab.startsWith('edit/')) return renderLog(tab.slice(5));
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
function summarise(w, ex) {
  const by = {};
  (w.workout_sets || []).sort((a, b) => a.set_no - b.set_no).forEach(st => { (by[st.exercise_id] = by[st.exercise_id] || []).push(st); });
  return Object.entries(by).map(([id, sets]) => {
    const e = ex[id]; if (!e) return '';
    if (e.category === 'cardio') return `${e.name} ${sets.reduce((a, s) => a + (s.minutes || 0), 0)} min`;
    const top = Math.max(...sets.map(s => +s.weight_kg || 0));
    return `${e.name} ${sets.length}×${sets[0].reps}${top ? ` @ ${top} kg` : ''}`;
  }).filter(Boolean).join(' · ');
}
async function renderHome() {
  const p = state.profile;
  const ex = await loadExercises();
  const { data: rows } = await sb.from('workouts').select('id, performed_on, notes, xp, capped, created_at, workout_sets(exercise_id, set_no, reps, weight_kg, minutes)')
    .gte('performed_on', daysAgo(30)).order('performed_on', { ascending: false }).order('created_at', { ascending: false });
  const dow = (new Date().getDay() + 6) % 7;   // Monday = 0
  const week = (rows || []).filter(w => w.performed_on >= daysAgo(dow));
  const weekXp = week.reduce((a, w) => a + w.xp, 0);
  const weekSets = week.reduce((a, w) => a + (w.workout_sets || []).length, 0);
  view.innerHTML = `
    <div><p class="eyebrow">${esc(state.gym ? state.gym.name : 'No gym yet')}</p><h1>Hi, ${esc(p.display_name)}</h1></div>
    ${levelCard(p.xp)}
    <div class="stats">
      <div class="stat"><b>${week.length}</b><span>workouts this week</span></div>
      <div class="stat"><b>${weekSets}</b><span>sets this week</span></div>
      <div class="stat"><b>${fmt(weekXp)}</b><span>of ${fmt(WEEKLY_CAP)} XP this week</span></div>
    </div>
    <a class="btn" href="#log">Log a workout</a>
    <section class="card"><h2>Recent workouts</h2>
      ${rows && rows.length ? `<ul class="list">${rows.slice(0, 10).map(w => `
        <li><div class="grow"><p>${esc(summarise(w, ex))}</p>
          <p class="muted">${esc(w.performed_on)}${w.capped ? ' · weekly or daily limit reached' : ''}${w.notes ? ' · ' + esc(w.notes) : ''}</p></div>
          <span class="xp">+${fmt(w.xp)} XP</span>
          <span class="row-actions">${w.performed_on >= daysAgo(7) ? `<a class="link-btn" href="#edit/${w.id}" aria-label="Edit workout">Edit</a>` : ''}
          <button class="link-btn" data-del="${w.id}" aria-label="Delete workout">Delete</button></span></li>`).join('')}</ul>`
        : '<p class="muted">No workouts yet. Log your first one to start earning XP.</p>'}
    </section>`;
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.from('workouts').delete().eq('id', b.dataset.del);
    if (error) { toast(error.message); b.disabled = false; return; }
    toast('Workout deleted'); route();
  });
}

// ---- log workout: pick exercises from icons, then fill in each set ----
async function renderLog(editId) {
  let ex;
  try { ex = await loadExercises(); } catch (e) { view.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  const plan = [];   // [{ id, sets: [{reps, weight_kg, minutes, distance_km}] }]
  let editing = null;
  if (editId) {
    const { data: w, error } = await sb.from('workouts').select('id, performed_on, notes, xp, workout_sets(exercise_id, set_no, reps, weight_kg, minutes, distance_km)').eq('id', editId).maybeSingle();
    if (error || !w) { view.innerHTML = `<div class="card"><h2>Workout not found</h2><a class="btn" href="#home">Back to home</a></div>`; return; }
    if (w.performed_on < daysAgo(7)) { view.innerHTML = `<div class="card"><h2>Too old to edit</h2><p class="muted">Workouts can be edited for 7 days.</p><a class="btn" href="#home">Back to home</a></div>`; return; }
    editing = w;
    // Consecutive sets of the same exercise become one block, in logged order.
    (w.workout_sets || []).sort((a, b) => a.set_no - b.set_no).forEach(st => {
      const last = plan[plan.length - 1];
      const row = { reps: st.reps ?? '', weight_kg: st.weight_kg ?? '', minutes: st.minutes ?? '', distance_km: st.distance_km ?? '' };
      if (last && last.id === st.exercise_id) last.sets.push(row); else plan.push({ id: st.exercise_id, sets: [row] });
    });
  }
  const groups = MUSCLES.map(m => [m, Object.values(ex).filter(e => e.muscle === m)]).filter(([, l]) => l.length);
  view.innerHTML = `
    <div><p class="eyebrow">${editing ? `Editing · ${esc(editing.performed_on)} · ${fmt(editing.xp)} XP now` : 'Log'}</p><h1>${editing ? 'Edit workout' : 'Build your workout'}</h1></div>
    <p class="muted">Tap the exercises you did, then fill in each set. XP is calculated from your sets.</p>
    <section id="lg-plan" class="plan"></section>
    <section class="card">
      <h2>Add exercise</h2>
      ${groups.map(([m, list]) => `<div class="pick"><p class="pick__h">${m}</p><div class="pick__grid">
        ${list.map(e => `<button type="button" class="tile" data-add="${e.id}">${icon(e.icon)}<span>${esc(e.name)}</span></button>`).join('')}
      </div></div>`).join('')}
    </section>
    <section class="card">
      <label>Date<select id="lg-date">${[0,1,2,3,4,5,6,7].map(d => `<option value="${daysAgo(d)}">${d === 0 ? 'Today' : d === 1 ? 'Yesterday' : daysAgo(d)}</option>`).join('')}</select></label>
      <label>Notes (optional)<input id="lg-notes" maxlength="200" placeholder="Felt strong today" value="${esc(editing ? editing.notes || '' : '')}" /></label>
    </section>
    <div class="savebar"><div><b id="lg-total">0 XP</b><span class="muted" id="lg-sub">Add an exercise to start</span></div>
      <button class="btn" id="lg-save" type="button">${editing ? 'Save changes' : 'Save workout'}</button></div>
    ${editing ? '<a class="btn btn--ghost" href="#home">Cancel</a>' : ''}
    <p class="error" id="lg-err" hidden></p>
    <p class="muted">Up to ${fmt(DAILY_CAP)} XP a day and ${fmt(WEEKLY_CAP)} XP a week (Monday to Sunday). +${WORKOUT_BONUS} XP for every completed workout.</p>`;

  const planEl = document.getElementById('lg-plan');
  const total = () => {
    const n = plan.reduce((a, b) => a + b.sets.length, 0);
    const xp = plan.reduce((a, b) => a + b.sets.reduce((c, st) => c + setXp(ex[b.id], st), 0), 0) + (n ? WORKOUT_BONUS : 0);
    document.getElementById('lg-total').textContent = `≈ ${fmt(xp)} XP`;
    document.getElementById('lg-sub').textContent = n ? `${plan.length} exercise${plan.length > 1 ? 's' : ''} · ${n} set${n > 1 ? 's' : ''}` : 'Add an exercise to start';
  };
  const blankSet = e => e.category === 'cardio' ? { minutes: '', distance_km: '' } : { reps: '', weight_kg: '' };
  function draw() {
    planEl.innerHTML = plan.map((b, bi) => {
      const e = ex[b.id], cardio = e.category === 'cardio', bw = e.category === 'bodyweight';
      return `<article class="card ex">
        <div class="ex__head">${icon(e.icon)}<h3>${esc(e.name)}</h3><button type="button" class="link-btn" data-rmex="${bi}" aria-label="Remove ${esc(e.name)}">Remove</button></div>
        <div class="sets">
          <div class="set set--head"><span>Set</span><span>${cardio ? 'Minutes' : 'Reps'}</span><span>${cardio ? 'Km (optional)' : bw ? 'Extra kg' : 'Kg'}</span><span>XP</span><span></span></div>
          ${b.sets.map((st, si) => `<div class="set">
            <span class="set__n">${si + 1}</span>
            <input inputmode="numeric" type="number" min="1" max="${cardio ? 180 : 50}" aria-label="${cardio ? 'Minutes' : 'Reps'}, set ${si + 1}" data-b="${bi}" data-s="${si}" data-f="${cardio ? 'minutes' : 'reps'}" value="${esc(cardio ? st.minutes : st.reps)}" />
            <input inputmode="decimal" type="number" min="0" step="0.5" aria-label="${cardio ? 'Kilometres' : 'Kilograms'}, set ${si + 1}" data-b="${bi}" data-s="${si}" data-f="${cardio ? 'distance_km' : 'weight_kg'}" value="${esc(cardio ? st.distance_km : st.weight_kg)}" />
            <span class="set__xp" id="sx-${bi}-${si}">${fmt(setXp(e, st))}</span>
            <button type="button" class="set__rm" data-rms="${bi}-${si}" aria-label="Remove set ${si + 1}">×</button>
          </div>`).join('')}
        </div>
        <button type="button" class="btn btn--ghost btn--small" data-addset="${bi}">+ Add set</button>
      </article>`;
    }).join('');
    total();
  }
  view.onclick = e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.add) { const id = t.dataset.add; plan.push({ id, sets: [blankSet(ex[id])] }); draw(); planEl.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (t.dataset.addset) { const b = plan[+t.dataset.addset]; b.sets.push({ ...b.sets[b.sets.length - 1] }); draw(); }
    else if (t.dataset.rmex) { plan.splice(+t.dataset.rmex, 1); draw(); }
    else if (t.dataset.rms) { const [bi, si] = t.dataset.rms.split('-').map(Number); plan[bi].sets.splice(si, 1); if (!plan[bi].sets.length) plan.splice(bi, 1); draw(); }
   };
  planEl.addEventListener('input', e => {
    const i = e.target; if (!i.dataset.f) return;
    const b = plan[+i.dataset.b], st = b.sets[+i.dataset.s];
    st[i.dataset.f] = i.value;
    document.getElementById(`sx-${i.dataset.b}-${i.dataset.s}`).textContent = fmt(setXp(ex[b.id], st));
    total();
  });
  document.getElementById('lg-save').onclick = async () => {
    const err = document.getElementById('lg-err'); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    if (!plan.length) return fail('Add at least one exercise.');
    const sets = [];
    for (const b of plan) {
      const e = ex[b.id];
      for (const [si, st] of b.sets.entries()) {
        if (e.category === 'cardio') {
          if (!(+st.minutes >= 1 && +st.minutes <= 180)) return fail(`${e.name}, set ${si + 1}: enter minutes (1–180).`);
          sets.push({ exercise_id: b.id, minutes: +st.minutes, distance_km: st.distance_km === '' ? null : +st.distance_km });
        } else {
          if (!(+st.reps >= 1 && +st.reps <= 50)) return fail(`${e.name}, set ${si + 1}: enter reps (1–50).`);
          if (e.category === 'weighted' && !(+st.weight_kg > 0)) return fail(`${e.name}, set ${si + 1}: enter the weight in kg.`);
          sets.push({ exercise_id: b.id, reps: +st.reps, weight_kg: st.weight_kg === '' ? null : +st.weight_kg });
        }
      }
    }
    const btn = document.getElementById('lg-save'); btn.disabled = true;
    const before = levelOf(state.profile.xp);
    const args = { p_performed_on: document.getElementById('lg-date').value, p_notes: document.getElementById('lg-notes').value, p_sets: sets };
    const { data, error } = editing
      ? await sb.rpc('edit_workout', { p_workout_id: editing.id, ...args })
      : await sb.rpc('log_workout', args);
    btn.disabled = false;
    if (error) return fail(error.message);
    const r = data[0];
    await loadProfile();
    const after = levelOf(state.profile.xp);
    toast(after.n > before.n ? `Level up: you're now ${after.name}` :
      editing ? `Workout updated: ${fmt(r.xp)} XP${r.capped ? ' (limit reached)' : ''}` :
      r.capped ? `+${fmt(r.xp)} XP (limit reached; this workout was worth ${fmt(r.raw_xp)})` : `+${fmt(r.xp)} XP`);
    location.hash = '#home';
  };
  if (editing) document.getElementById('lg-date').value = editing.performed_on;
  draw();
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
