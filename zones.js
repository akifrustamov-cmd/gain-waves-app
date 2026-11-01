// GAIN WAVES — Rewards zone (members), Partner dashboard (suppliers, gyms, online stores),
// Admin (partner approvals + ambassador board). Loaded after app.js; boots the router at the end.

const eur = n => '€' + Number(n).toFixed(2);
const CATEGORIES = { protein: 'Protein', creatine: 'Creatine', pre_workout: 'Pre-workout', vitamins: 'Vitamins', snacks: 'Snacks', apparel: 'Apparel', other: 'Other' };
const PARTNER_KINDS = { supplier: 'Supplier / brand', gym: 'Gym', online_store: 'Online store' };
const MAX_TOTAL_DISCOUNT = 40;

// ---- shared pricing ----
async function loadPricing() {
  const [{ data: disc }, { data: brands, error }] = await Promise.all([
    sb.from('level_discounts').select('level, pct').order('level'),
    sb.from('brands').select('id, name, tagline, sponsored, shelf_rank, products(id, name, category, size, price_eur, extra_discount_pct, min_level, active, image_url)').order('shelf_rank'),
  ]);
  if (error) throw error;
  const pctAt = n => ((disc || []).find(d => d.level === n) || { pct: 0 }).pct;
  const { data: live } = await sb.from('challenges').select('brand_id').eq('status', 'approved');
  const hasChallenge = new Set((live || []).map(c => c.brand_id));
  const products = [];
  (brands || []).forEach(b => (b.products || []).filter(p => p.active).forEach(p => products.push({ ...p, brand: b.name, sponsored: b.sponsored,
    challenge: hasChallenge.has(b.id), rank: (hasChallenge.has(b.id) ? 0 : 1000) + b.shelf_rank })));
  const priceAt = (pr, n) => { const total = Math.min(MAX_TOTAL_DISCOUNT, pctAt(n) + pr.extra_discount_pct); return { total, price: pr.price_eur * (1 - total / 100) }; };
  return { pctAt, products, priceAt };
}

// ---- Rewards: brand challenges + medals ----
const PERIODS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const METRICS = { workouts: 'workouts', sets: 'sets', cardio_minutes: 'min cardio', volume_kg: 'kg lifted', xp: 'XP', exercise_reps: 'reps' };
const endsText = (period, d) => period === 'daily' ? 'Ends tonight' : `Ends ${new Date(d + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
async function renderRewards(period = 'all', openBoard = null) {
  const p = state.profile, lv = levelOf(p.xp), nx = nextOf(lv);
  const [{ data: ch, error: cErr }, { data: medals, error: mErr }, { pctAt }] = await Promise.all([sb.rpc('my_challenges'), sb.rpc('my_achievements'), loadPricing()]);
  let board = null;
  if (openBoard) { const r = await sb.rpc('challenge_board', { p_challenge: openBoard }); board = r.data || []; }
  const list = (ch || []).filter(c => period === 'all' || c.period === period);
  const earned = (medals || []).filter(m => m.earned).length;
  view.innerHTML = `
    <div><p class="eyebrow">Rewards</p><h1>Win free gear</h1></div>
    <p class="muted">Brands set challenges. Your logged workouts count automatically. Join, train, and the top finishers win the prize.</p>
    <div class="chips">${['all', 'daily', 'weekly', 'monthly'].map(k => `<button type="button" class="chipbtn ${k === period ? 'is-on' : ''}" data-per="${k}">${k === 'all' ? 'All' : PERIODS[k]}</button>`).join('')}</div>
    ${cErr ? `<p class="error">${esc(cErr.message)}</p>` : list.length ? list.map(c => {
      const pct = Math.min(100, Math.round((Number(c.progress) / Number(c.goal)) * 100));
      const done = Number(c.progress) >= Number(c.goal);
      const lockedLv = lv.n < c.min_level;
      return `<article class="card chal ${c.featured ? 'chal--feat' : ''}">
        <div class="chal__top"><span class="chip cat">${PERIODS[c.period]}</span>${c.featured ? '<span class="chip amb">Featured</span>' : ''}${c.sponsored ? '<span class="sponsored">Sponsored</span>' : ''}<span class="chal__ends">${endsText(c.period, c.ends_on)}</span></div>
        <p class="sp__brand">${esc(c.brand)}</p>
        <h2>${esc(c.title)}</h2>
        ${c.description ? `<p class="muted">${esc(c.description)}</p>` : ''}
        <div class="chal__prize">${c.prize_image ? `<span class="thumb chal__img"><img src="${esc(c.prize_image)}" alt="" loading="lazy" /></span>` : ''}<span>Top ${c.winners} win</span><b>${esc(c.reward)}</b>${Number(c.reward_value_eur) ? `<s>${eur(c.reward_value_eur)}</s>` : ''}</div>
        <div class="bar bar--thin"><span style="width:${pct}%"></span></div>
        <p class="chal__stat"><b>${fmt(c.progress)} / ${fmt(c.goal)}</b> ${c.metric === 'exercise_reps' ? esc((c.exercise || '').toLowerCase()) + ' reps' : METRICS[c.metric]}${done ? ' · goal reached' : ''}
          ${c.joined && c.my_rank ? ` · <span class="gold">#${c.my_rank} of ${c.participants}</span>` : c.participants ? ` · ${c.participants} joined` : ''}</p>
        <div class="btnrow">
          ${lockedLv ? `<span class="teaser">Needs ${LEVELS[c.min_level - 1].name}</span>`
            : c.joined ? '<span class="act act--edit is-static">Joined</span>' : `<button type="button" class="act act--edit" data-join="${c.id}">Join challenge</button>`}
          <button type="button" class="act act--del" data-board="${c.id}">${openBoard === c.id ? 'Hide top' : 'See top'}</button>
        </div>
        ${openBoard === c.id ? `<ol class="list chal__board">${board.length ? board.map(r => `<li><span class="rank">${r.rk}</span><div class="grow"><p>${esc(r.display_name)} <span class="muted">@${esc(r.username)}</span></p></div><span class="xp">${fmt(r.progress)}</span></li>`).join('') : '<li><p class="muted">Nobody has joined yet. Be first.</p></li>'}</ol>` : ''}
      </article>`; }).join('') : '<p class="muted">No challenges in this group right now.</p>'}
    <p class="muted">Joining shows your display name on that challenge's top list. Winners are contacted by the Waves team after the period ends. Challenges marked (example) are placeholders.</p>

    <section class="level lv-${lv.n}">
      <div class="level__row"><span>${lv.name}</span><span>${earned} of ${(medals || []).length} medals</span></div>
      <div class="level__name">−${pctAt(lv.n)} %</div>
      <div class="level__row"><span>Member discount in the store</span><span>${nx ? `${nx.name}: −${pctAt(nx.n)} %` : 'Top level'}</span></div>
    </section>
    <section class="card"><h2>Medals</h2>
      ${mErr ? `<p class="error">${esc(mErr.message)}</p>` : `<div class="medals">${(medals || []).map(m => {
        const pct = Math.round((Number(m.progress) / Number(m.goal)) * 100);
        return `<div class="medal ${m.earned ? 'is-earned' : ''}">
          <div class="medal__disc" aria-hidden="true">${m.earned ? '★' : `${pct}%`}</div>
          <p class="medal__name">${esc(m.name)}</p><p class="medal__desc">${esc(m.description)}</p>
          ${m.earned ? '' : `<div class="bar bar--thin"><span style="width:${pct}%"></span></div>`}
        </div>`; }).join('')}</div>`}
    </section>`;
  view.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.per) return renderRewards(b.dataset.per);
    if (b.dataset.board) return renderRewards(period, openBoard === b.dataset.board ? null : b.dataset.board);
    if (b.dataset.join) {
      b.disabled = true;
      const { error } = await sb.rpc('join_challenge', { p_challenge: b.dataset.join });
      toast(error ? error.message : 'You joined. Your workouts now count.');
      return renderRewards(period);
    }
  };
}

// ---- Store: only what your level unlocks ----
const basket = {
  read() { try { return JSON.parse(localStorage.getItem('gw-basket') || '{}'); } catch (e) { return {}; } },
  write(b) { try { localStorage.setItem('gw-basket', JSON.stringify(b)); } catch (e) {} },
};
async function renderStore(filter = 'all', showBasket = false) {
  const p = state.profile, lv = levelOf(p.xp), nx = nextOf(lv);
  let pricing;
  try { pricing = await loadPricing(); } catch (e) { view.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  const { pctAt, products, priceAt } = pricing;
  const open = products.filter(pr => pr.min_level <= lv.n).sort((a, b) => a.rank - b.rank || a.price_eur - b.price_eur);
  const cats = ['all', ...new Set(open.map(pr => pr.category))];
  const shown = open.filter(pr => filter === 'all' || pr.category === filter);
  const lockedBy = n => products.filter(pr => pr.min_level === n).length;
  const pct = nx ? Math.round(((p.xp - lv.min) / (nx.min - lv.min)) * 100) : 100;
  const bk = basket.read();
  Object.keys(bk).forEach(id => { if (!open.find(pr => pr.id === id)) delete bk[id]; });
  const items = Object.entries(bk).map(([id, q]) => ({ pr: open.find(x => x.id === id), q }));
  const count = items.reduce((a, i) => a + i.q, 0);
  const full = items.reduce((a, i) => a + i.pr.price_eur * i.q, 0);
  const yours = items.reduce((a, i) => a + priceAt(i.pr, lv.n).price * i.q, 0);
  const img = pr => pr.image_url ? `<img src="${esc(pr.image_url)}" alt="${esc(pr.name)}" loading="lazy" />` : `<div class="noimg">${esc(CATEGORIES[pr.category] || '')}</div>`;

  view.innerHTML = `
    <div class="storehead"><div><p class="eyebrow">${lv.name} · ${fmt(p.xp)} XP</p><h1>Store</h1></div>
      <button type="button" class="act act--edit" id="st-bag">Basket${count ? ` · ${count}` : ''}</button></div>

    <section class="card ladder-card">
      <ol class="ladder">${LEVELS.map(l => `
        <li class="${l.n < lv.n ? 'is-done' : l.n === lv.n ? 'is-now' : ''}">
          <span class="ladder__pct">−${pctAt(l.n)} %</span><span class="ladder__name">${l.name}</span>
          <span class="ladder__xp">${l.min ? fmt(l.min) + ' XP' : 'Start'}</span></li>`).join('')}</ol>
      <div class="bar bar--thin"><span style="width:${pct}%"></span></div>
      <p class="muted">${nx ? `<b class="gold">${fmt(nx.min - p.xp)} XP</b> to ${nx.name}: −${pctAt(nx.n)} % on everything${lockedBy(nx.n) ? ` and ${lockedBy(nx.n)} more product${lockedBy(nx.n) > 1 ? 's' : ''}` : ''}.` : 'Top level: every product and your best price are unlocked.'}</p>
    </section>

    ${showBasket ? `
    <section class="card"><h2>Your basket</h2>
      ${items.length ? `<ul class="list">${items.map(i => `<li><div class="thumb">${img(i.pr)}</div>
        <div class="grow"><p>${esc(i.pr.name)}</p><p class="muted">${i.q} × ${eur(priceAt(i.pr, lv.n).price)}</p></div>
        <span class="row-actions"><button type="button" class="act act--del" data-dec="${i.pr.id}" aria-label="Remove one ${esc(i.pr.name)}">−1</button></span></li>`).join('')}</ul>
        <div class="totals"><p><span>Normal price</span><s>${eur(full)}</s></p><p><span>You save</span><b class="gold">${eur(full - yours)}</b></p>
        <p class="totals__sum"><span>Your total</span><b>${eur(yours)}</b></p></div>
        <button class="btn" type="button" id="st-checkout">Checkout</button>
        <p class="muted" id="st-note" hidden>Online payment opens soon. To order now, email contact.eu@wavesint.com with your basket and username.</p>`
      : '<p class="muted">Your basket is empty.</p>'}
      <button class="link-btn" type="button" id="st-close">Back to products</button>
    </section>` : `
    <div class="chips" role="tablist">${cats.map(c => `<button type="button" class="chipbtn ${c === filter ? 'is-on' : ''}" data-cat="${c}">${c === 'all' ? 'All' : CATEGORIES[c] || c}</button>`).join('')}</div>
    <div class="shop">${shown.map(pr => { const at = priceAt(pr, lv.n); const q = bk[pr.id] || 0; return `
      <article class="sp">
        <div class="sp__img">${img(pr)}${pr.sponsored ? '<span class="sponsored sp__tag">Sponsored</span>' : ''}${pr.challenge ? '<a class="sp__chal" href="#rewards">Challenge live</a>' : ''}</div>
        <div class="sp__body">
          <p class="sp__brand">${esc(pr.brand)}</p>
          <h3>${esc(pr.name)}</h3><p class="muted">${esc(pr.size || '')}</p>
          <div class="product__price"><s>${eur(pr.price_eur)}</s><b>${eur(at.price)}</b></div>
          <p class="product__save">−${at.total} %${pr.extra_discount_pct ? ` (incl. brand extra −${pr.extra_discount_pct} %)` : ''}</p>
          <button type="button" class="act act--edit sp__add" data-add="${pr.id}">${q ? `In basket · ${q}` : 'Add to basket'}</button>
        </div>
      </article>`; }).join('')}</div>
    ${LEVELS.filter(l => l.n > lv.n && lockedBy(l.n)).map(l => `
      <div class="teaser"><span class="chip lv-${l.n}">${l.name}</span><p>unlocks ${lockedBy(l.n)} more product${lockedBy(l.n) > 1 ? 's' : ''} and −${pctAt(l.n)} % on everything.</p></div>`).join('')}
    <p class="muted">Products and prices marked (example) are placeholders.</p>`}`;

  view.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cat) return renderStore(b.dataset.cat);
    if (b.id === 'st-bag') return renderStore(filter, true);
    if (b.id === 'st-close') return renderStore(filter);
    if (b.id === 'st-checkout') { document.getElementById('st-note').hidden = false; return; }
    if (b.dataset.add) { const k = basket.read(); k[b.dataset.add] = (k[b.dataset.add] || 0) + 1; basket.write(k); toast('Added to basket'); return renderStore(filter); }
    if (b.dataset.dec) { const k = basket.read(); k[b.dataset.dec] = (k[b.dataset.dec] || 1) - 1; if (k[b.dataset.dec] <= 0) delete k[b.dataset.dec]; basket.write(k); return renderStore(filter, true); }
  };
}

// ---- panel building blocks: tab bar + bottom sheet ----
const STATUS_LABEL = { pending: 'Waiting approval', approved: 'Live', rejected: 'Rejected' };
const panelTab = {};
function tabsHtml(key, tabs) {
  if (!tabs[panelTab[key]]) panelTab[key] = Object.keys(tabs)[0];
  return `<div class="ptabs" role="tablist" data-tabs="${key}">${Object.entries(tabs).map(([k, l]) =>
    `<button type="button" role="tab" class="ptab ${k === panelTab[key] ? 'is-on' : ''}" aria-selected="${k === panelTab[key]}" data-ptab="${k}">${l}</button>`).join('')}</div>`;
}
function wireTabs(key) {
  const show = () => view.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== panelTab[key]; });
  const btns = view.querySelectorAll(`[data-tabs="${key}"] [data-ptab]`);
  btns.forEach(b => b.onclick = () => {
    panelTab[key] = b.dataset.ptab;
    btns.forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', x === b); });
    show();
  });
  show();
}
const sheetHtml = (id, inner) => `<div class="sheet" id="sheet-${id}" hidden><div class="sheet__bg" data-close="${id}"></div><div class="sheet__panel" role="dialog" aria-modal="true">${inner}</div></div>`;
function openSheet(id) {
  const s = document.getElementById('sheet-' + id); s.hidden = false; document.body.classList.add('no-scroll');
  s.querySelector('.sheet__panel').scrollTop = 0;
}
function closeSheet(id) { const s = document.getElementById('sheet-' + id); if (s) s.hidden = true; document.body.classList.remove('no-scroll'); }
function wireSheets() { view.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheet(b.dataset.close)); }

// ---- Partner dashboard ----
async function renderPartner() {
  const pa = state.partner;
  const signOut = '<button class="btn btn--ghost" id="pt-out">Sign out</button>';
  const wireOut = () => { const b = document.getElementById('pt-out'); if (b) b.onclick = async () => { intent.set(null); await sb.auth.signOut(); location.hash = ''; }; };

  if (!pa) {
    const { data: gyms } = await sb.from('gyms').select('id, name, city').order('name');
    view.innerHTML = `
      <div><p class="eyebrow">Partner</p><h1>Join as a partner</h1></div>
      <p class="muted">Suppliers and online stores can list products with extra member discounts. Gyms see how their members train. Every partner is checked by the Waves team before going live.</p>
      <form id="pt-form" class="card" novalidate>
        <label>You are</label>
        <div class="seg" role="radiogroup">${Object.entries(PARTNER_KINDS).map(([v, l], i) => `<label><input type="radio" name="kind" value="${v}" ${i === 0 ? 'checked' : ''} /><span>${l}</span></label>`).join('')}</div>
        <label>Company or gym name<input id="pt-name" required placeholder="Northline Nutrition" /></label>
        <label>Website (optional)<input id="pt-web" type="url" placeholder="https://" /></label>
        <label>Country<input id="pt-country" placeholder="Latvia" autocomplete="country-name" /></label>
        <label id="pt-gymwrap" hidden>Your gym<select id="pt-gym"><option value="">Choose your gym</option>${(gyms || []).map(g => `<option value="${g.id}">${esc(g.name)} · ${esc(g.city)}</option>`).join('')}</select></label>
        <p class="error" id="pt-err" hidden></p>
        <button class="btn" type="submit">Send for approval</button>
      </form>
      ${state.profile ? '<a class="btn btn--ghost" href="#home">Back to my training</a>' : signOut}`;
    wireOut();
    const form = document.getElementById('pt-form');
    const kind = () => form.querySelector('input[name="kind"]:checked').value;
    form.onchange = () => { document.getElementById('pt-gymwrap').hidden = kind() !== 'gym'; };
    form.onsubmit = async e => {
      e.preventDefault();
      const err = document.getElementById('pt-err'); err.hidden = true;
      const fail = m => { err.textContent = m; err.hidden = false; busy(form, false); };
      const name = document.getElementById('pt-name').value.trim();
      if (name.length < 2) return fail('Enter your company or gym name.');
      const gym_id = kind() === 'gym' ? document.getElementById('pt-gym').value : null;
      if (kind() === 'gym' && !gym_id) return fail('Choose your gym. If it is missing, ask a member to add it, or email contact.eu@wavesint.com.');
      busy(form, true);
      const { error } = await sb.from('partners').insert({
        user_id: state.session.user.id, kind: kind(), name, gym_id,
        website: document.getElementById('pt-web').value.trim() || null,
        country: document.getElementById('pt-country').value.trim() || null,
      });
      if (error) return fail(error.message);
      intent.set(null);
      toast('Sent for approval'); route();
    };
    return;
  }

  const statusLine = { pending: 'Waiting for approval by the Waves team. You can prepare everything now; it goes live once approved.',
    approved: 'Approved. Members can see what you list.', rejected: 'Not approved. Contact contact.eu@wavesint.com for details.' }[pa.status];
  let body = '';
  if (pa.kind === 'gym') {
    const { data: st } = await sb.rpc('gym_partner_stats');
    const s0 = st && st[0];
    body = s0 ? `<section class="card"><h2>${esc(s0.gym_name)}</h2>
        <div class="stats">
          <div class="stat"><b>${fmt(s0.members)}</b><span>members</span></div>
          <div class="stat"><b>${fmt(s0.active_30d)}</b><span>active, 30 days</span></div>
          <div class="stat"><b>${fmt(s0.workouts_30d)}</b><span>workouts, 30 days</span></div>
        </div><p class="muted">Totals only. Members' personal data stays private.</p></section>`
      : '<section class="card"><p class="muted">Your gym numbers appear here once you are approved.</p></section>';
  } else {
    let { data: brand } = await sb.from('brands').select('id, name, tagline').eq('partner_id', pa.id).maybeSingle();
    const { data: prods } = brand ? await sb.from('products').select('*').eq('brand_id', brand.id).order('created_at') : { data: [] };
    partnerProducts = prods || [];
    const ch = brand ? await partnerChallengesHtml(brand.id) : null;
    if (!brand) partnerChallenges = [];
    const countSt = st => partnerChallenges.filter(c => c.status === st).length;
    body = `
      <div class="stats">
        <div class="stat"><b>${partnerProducts.filter(p => p.active).length}</b><span>in the Store</span></div>
        <div class="stat"><b>${countSt('approved')}</b><span>live challenges</span></div>
        <div class="stat"><b>${countSt('pending')}</b><span>waiting approval</span></div>
      </div>
      ${tabsHtml('partner', { products: `Products <span class="badge">${partnerProducts.length}</span>`, challenges: `Challenges <span class="badge">${partnerChallenges.length}</span>` })}
      <section class="card" data-pane="products">
        <div class="pane-head"><h2>Products</h2><button type="button" class="act act--edit" id="pp-new">+ Add product</button></div>
        ${partnerProducts.length ? `<ul class="list">${partnerProducts.map(pr => `<li><div class="thumb">${photoTag(pr)}</div>
          <div class="grow"><p>${esc(pr.name)} <span class="muted">${esc(pr.size || '')}</span></p>
          <p class="muted">${eur(pr.price_eur)} · −${pr.extra_discount_pct} % extra · ${LEVELS[pr.min_level - 1].name}+</p>
          ${pr.active ? '' : '<span class="chip st-rejected">Hidden</span>'}</div>
          <span class="row-actions"><button type="button" class="act act--edit" data-editp="${pr.id}">Edit</button>
          <button type="button" class="act act--del" data-delp="${pr.id}">Delete</button></span></li>`).join('')}</ul>`
          : '<p class="muted">No products yet. Tap “+ Add product”.</p>'}
      </section>
      <section class="card" data-pane="challenges">
        <div class="pane-head"><h2>Challenges</h2>${brand ? '<button type="button" class="act act--edit" id="pc-new">+ New challenge</button>' : ''}</div>
        ${brand ? ch.list : '<p class="muted">Add your first product, then you can create challenges and give it away as a prize.</p>'}
      </section>
      ${sheetHtml('pp', `<form id="pp-form" class="sheet-form" novalidate data-edit="">
        <div class="sheet__head"><h2 id="pp-h">Add a product</h2><button type="button" class="sheet__x" data-close="pp" aria-label="Close">×</button></div>
        <label class="photo-pick"><span class="photo-pick__img" id="pp-prev"><span class="noimg">No photo</span></span>
          <span class="photo-pick__txt"><span class="act act--del">Choose photo</span>Square photos look best.</span>
          <input id="pp-photo" class="vh" type="file" accept="image/*" /></label>
        <label>Product name<input id="pp-name" placeholder="Whey Isolate Vanilla" /></label>
        <div class="frow"><label>Category<select id="pp-cat">${Object.entries(CATEGORIES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label>Size<input id="pp-size" placeholder="1 kg" /></label></div>
        <div class="frow"><label>Price (€)<input id="pp-price" type="number" inputmode="decimal" min="0.5" step="0.01" placeholder="39.90" /></label>
          <label>Extra −%<input id="pp-extra" type="number" inputmode="numeric" min="0" max="30" value="5" /></label></div>
        <label>Visible from level<select id="pp-lvl">${LEVELS.map(l => `<option value="${l.n}">${l.name}</option>`).join('')}</select></label>
        <label class="check"><input id="pp-active" type="checkbox" checked /> Show in the Store</label>
        <p class="hint">Members also get their level discount (−5 to −20 %). Total is capped at −${MAX_TOTAL_DISCOUNT} %.</p>
        <p class="error" id="pp-err" hidden></p>
        <div class="btnrow"><button class="btn btn--ghost" type="button" data-close="pp">Cancel</button><button class="btn" type="submit" id="pp-save">Add product</button></div>
      </form>`)}
      ${brand ? ch.sheet : ''}`;
    view.dataset.brand = brand ? brand.id : '';
  }
  view.innerHTML = `
    <div class="phead"><div><p class="eyebrow">${PARTNER_KINDS[pa.kind]} · Partner</p><h1>${esc(pa.name)}</h1></div>
      <span class="chip st-${pa.status}">${pa.status === 'approved' ? 'Live' : pa.status === 'pending' ? 'Waiting approval' : 'Not approved'}</span></div>
    ${pa.status === 'approved' ? '' : `<p class="hint">${statusLine}</p>`}
    ${body}
    ${state.profile ? '<a class="btn btn--ghost" href="#home">Back to my training</a>' : signOut}`;
  wireOut();
  if (pa.kind !== 'gym') { wireTabs('partner'); wireSheets(); }
  wireArmedDelete('[data-delp]', 'products', 'Product deleted');
  wirePartnerChallenges();
  const pform = document.getElementById('pp-form');
  if (!pform) return;
  const $ = id => document.getElementById(id);
  let photo = null;
  const resetForm = () => {
    pform.reset(); pform.dataset.edit = ''; photo = null;
    $('pp-h').textContent = 'Add a product'; $('pp-save').textContent = 'Add product';
    $('pp-prev').innerHTML = '<span class="noimg">No photo</span>';
  };
  $('pp-new').onclick = () => { resetForm(); openSheet('pp'); };
  $('pp-photo').onchange = async () => {
    const f = $('pp-photo').files[0]; if (!f) return;
    try { photo = await squarePhoto(f); $('pp-prev').innerHTML = `<img src="${URL.createObjectURL(photo)}" alt="" />`; }
    catch (e) { photo = null; toast('Could not read that photo. Try a JPG or PNG.'); }
  };
  view.querySelectorAll('[data-editp]').forEach(b => b.onclick = () => {
    const pr = partnerProducts.find(x => x.id === b.dataset.editp); if (!pr) return;
    resetForm(); pform.dataset.edit = pr.id;
    $('pp-name').value = pr.name; $('pp-cat').value = pr.category; $('pp-size').value = pr.size || '';
    $('pp-price').value = pr.price_eur; $('pp-extra').value = pr.extra_discount_pct; $('pp-lvl').value = pr.min_level;
    $('pp-active').checked = pr.active;
    $('pp-prev').innerHTML = photoTag(pr);
    $('pp-h').textContent = 'Edit product'; $('pp-save').textContent = 'Save';
    openSheet('pp');
  });
  pform.onsubmit = async e => {
    e.preventDefault();
    const err = $('pp-err'); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; busy(pform, false); };
    const name = $('pp-name').value.trim();
    const price = parseFloat($('pp-price').value);
    const extra = parseInt($('pp-extra').value, 10) || 0;
    if (name.length < 2) return fail('Enter the product name.');
    if (!(price > 0)) return fail('Enter the normal price.');
    if (extra < 0 || extra > 30) return fail('Extra discount must be between 0 and 30 %.');
    busy(pform, true);
    let brandId = view.dataset.brand;
    if (!brandId) {
      const { data: nb, error: be } = await sb.from('brands').insert({ name: pa.name, partner_id: pa.id, shelf_rank: 50 }).select('id').single();
      if (be) return fail(be.message);
      brandId = nb.id;
    }
    const row = { name, category: $('pp-cat').value, size: $('pp-size').value.trim() || null, price_eur: price,
      extra_discount_pct: extra, min_level: parseInt($('pp-lvl').value, 10), active: $('pp-active').checked };
    const old = partnerProducts.find(x => x.id === pform.dataset.edit);
    if (photo) {
      const path = `${brandId}/${crypto.randomUUID()}.${photo.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error: ue } = await sb.storage.from('product-photos').upload(path, photo, { contentType: photo.type });
      if (ue) return fail('Photo upload failed: ' + ue.message);
      row.image_url = sb.storage.from('product-photos').getPublicUrl(path).data.publicUrl;
    }
    const { error } = old ? await sb.from('products').update(row).eq('id', old.id)
      : await sb.from('products').insert({ ...row, brand_id: brandId });
    if (error) return fail(error.message);
    if (photo && old && old.image_url) removePhoto(old.image_url);
    toast(old ? 'Product saved' : 'Product added'); route();
  };
}

// ---- partner helpers ----
let partnerProducts = [], partnerChallenges = [];
const PHOTO_PREFIX = '/storage/v1/object/public/product-photos/';
const photoTag = pr => pr && pr.image_url ? `<img src="${esc(pr.image_url)}" alt="${esc(pr.name)}" loading="lazy" />` : '<span class="noimg">No photo</span>';
function removePhoto(url) {
  const i = url.indexOf(PHOTO_PREFIX); if (i < 0) return;
  sb.storage.from('product-photos').remove([url.slice(i + PHOTO_PREFIX.length)]);
}
// Centre-crop to a 1000 px square (what the Store shows) and re-encode small
async function squarePhoto(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height), out = Math.min(1000, s);
  const c = document.createElement('canvas'); c.width = c.height = out;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, out, out);
  const enc = type => new Promise(r => c.toBlob(r, type, 0.85));
  let blob = await enc('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await enc('image/jpeg');
  return blob;
}
function wireArmedDelete(sel, table, done) {
  view.querySelectorAll(sel).forEach(b => b.onclick = async () => {
    if (!b.classList.contains('is-armed')) { b.classList.add('is-armed'); b.textContent = 'Confirm?'; setTimeout(() => { b.classList.remove('is-armed'); b.textContent = 'Delete'; }, 4000); return; }
    b.disabled = true;
    const id = b.dataset.delp || b.dataset.delc;
    const pr = table === 'products' && partnerProducts.find(x => x.id === id);
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { toast(error.message); b.disabled = false; return; }
    if (pr && pr.image_url) removePhoto(pr.image_url);
    toast(done); route();
  });
}

const prizeText = c => c.prize_product_id && partnerProducts.find(p => p.id === c.prize_product_id)
  ? `${c.prize_qty} × ${partnerProducts.find(p => p.id === c.prize_product_id).name}` : c.reward;
async function partnerChallengesHtml(brandId) {
  const [{ data: mine }, ex] = await Promise.all([
    sb.from('challenges').select('*').eq('brand_id', brandId).order('created_at'),
    loadExercises(),
  ]);
  partnerChallenges = mine || [];
  const prizeOf = c => partnerProducts.find(p => p.id === c.prize_product_id);
  const list = partnerChallenges.length ? `<ul class="list">${partnerChallenges.map(c => `<li><div class="thumb">${prizeOf(c) ? photoTag(prizeOf(c)) : '<span class="noimg">Prize</span>'}</div>
        <div class="grow"><p>${esc(c.title)}</p>
        <p class="muted">${PERIODS[c.period]} · ${fmt(c.goal)} ${METRICS[c.metric]} · top ${c.winners} win ${esc(prizeText(c))}</p>
        <span class="chip st-${esc(c.status)}">${STATUS_LABEL[c.status] || esc(c.status)}</span>${c.featured ? ' <span class="chip amb">Featured</span>' : ''}</div>
        <span class="row-actions"><button type="button" class="act act--edit" data-editc="${c.id}">Edit</button>
        <button type="button" class="act act--del" data-delc="${c.id}">Delete</button></span></li>`).join('')}</ul>`
    : '<p class="muted">No challenges yet. The best challenges go to the top of members\' Rewards and Store.</p>';
  const sheet = sheetHtml('pc', `<form id="pc-form" class="sheet-form" novalidate data-brand="${brandId}" data-edit="">
      <div class="sheet__head"><h2 id="pc-h">New challenge</h2><button type="button" class="sheet__x" data-close="pc" aria-label="Close">×</button></div>
      <label>Title<input id="pc-title" maxlength="60" placeholder="20 Tonne Week" /></label>
      <label>Description (optional)<input id="pc-desc" maxlength="200" placeholder="Lift 20,000 kg in total this week." /></label>
      <label>Members must reach<select id="pc-metric">${Object.entries({ workouts: 'Number of workouts', sets: 'Number of sets', volume_kg: 'Kg lifted in total', cardio_minutes: 'Minutes of cardio', xp: 'XP earned', exercise_reps: 'Reps of one exercise' }).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label id="pc-exwrap" hidden>Exercise<select id="pc-ex">${Object.values(ex).filter(e => e.category !== 'cardio').map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
      <div class="frow"><label>Goal<input id="pc-goal" type="number" inputmode="numeric" min="1" placeholder="20000" /></label>
        <label>Period<select id="pc-period">${Object.entries(PERIODS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label></div>
      <label>Free product for each winner<select id="pc-prize">
        ${partnerProducts.map(p => `<option value="${p.id}">${esc(p.name)}${p.size ? ' · ' + esc(p.size) : ''} (${eur(p.price_eur)})</option>`).join('')}
        <option value="">Something else (merch, voucher…)</option></select></label>
      <div class="prize-pick" id="pc-prodwrap"><span class="thumb" id="pc-prev"></span>
        <label>Each winner gets<input id="pc-qty" type="number" inputmode="numeric" min="1" max="10" value="1" /></label></div>
      <div class="frow" id="pc-otherwrap" hidden>
        <label>Prize<input id="pc-reward" maxlength="80" placeholder="Gym bag" /></label>
        <label>Value (€)<input id="pc-value" type="number" inputmode="decimal" min="0" step="0.01" placeholder="25.00" /></label>
      </div>
      <div class="frow"><label>Winners<input id="pc-winners" type="number" inputmode="numeric" min="1" max="100" value="3" /></label>
        <label>Open from<select id="pc-lvl">${LEVELS.map(l => `<option value="${l.n}">${l.name}</option>`).join('')}</select></label></div>
      <p class="hint" id="pc-note">Higher prize value and more winners rank your challenge higher. Waves approves every challenge before it goes live.</p>
      <p class="error" id="pc-err" hidden></p>
      <div class="btnrow"><button class="btn btn--ghost" type="button" data-close="pc">Cancel</button><button class="btn" type="submit" id="pc-save">Send</button></div>
    </form>`);
  return { list, sheet };
}
function wirePartnerChallenges() {
  wireArmedDelete('[data-delc]', 'challenges', 'Challenge deleted');
  const f = document.getElementById('pc-form'); if (!f) return;
  const $ = id => document.getElementById(id);
  const metric = $('pc-metric'), prize = $('pc-prize');
  const sync = () => {
    $('pc-exwrap').hidden = metric.value !== 'exercise_reps';
    const pr = partnerProducts.find(p => p.id === prize.value);
    $('pc-prodwrap').hidden = !pr; $('pc-otherwrap').hidden = !!pr;
    $('pc-prev').innerHTML = pr ? photoTag(pr) : '';
  };
  metric.onchange = sync; prize.onchange = sync; sync();
  const NOTE_NEW = $('pc-note').textContent;
  const resetForm = () => {
    f.reset(); f.dataset.edit = ''; sync();
    $('pc-h').textContent = 'New challenge'; $('pc-save').textContent = 'Send'; $('pc-note').textContent = NOTE_NEW;
  };
  $('pc-new').onclick = () => { resetForm(); openSheet('pc'); };
  view.querySelectorAll('[data-editc]').forEach(b => b.onclick = () => {
    const c = partnerChallenges.find(x => x.id === b.dataset.editc); if (!c) return;
    resetForm(); f.dataset.edit = c.id;
    $('pc-title').value = c.title; $('pc-desc').value = c.description || ''; $('pc-period').value = c.period;
    metric.value = c.metric; if (c.exercise_id) $('pc-ex').value = c.exercise_id;
    $('pc-goal').value = c.goal; prize.value = c.prize_product_id || ''; $('pc-qty').value = c.prize_qty || 1;
    $('pc-reward').value = c.prize_product_id ? '' : c.reward; $('pc-value').value = c.prize_product_id ? '' : c.reward_value_eur;
    $('pc-winners').value = c.winners; $('pc-lvl').value = c.min_level; sync();
    $('pc-h').textContent = 'Edit challenge'; $('pc-save').textContent = 'Save';
    $('pc-note').textContent = c.status === 'approved'
      ? 'This challenge is live. Saving changes takes it off members\' Rewards until Waves approves it again. Members who joined keep their progress.'
      : 'Waves approves every challenge before it goes live.';
    openSheet('pc');
  });
  f.onsubmit = async e => {
    e.preventDefault();
    const err = $('pc-err'); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; busy(f, false); };
    const v = id => $(id).value.trim();
    if (v('pc-title').length < 3) return fail('Enter a title.');
    if (!(+v('pc-goal') > 0)) return fail('Enter a goal.');
    const pr = partnerProducts.find(p => p.id === prize.value);
    const qty = parseInt(v('pc-qty'), 10) || 1;
    if (pr && !(qty >= 1 && qty <= 10)) return fail('Each winner can get 1 to 10 of the product.');
    if (!pr && v('pc-reward').length < 3) return fail('Describe the prize.');
    const winners = parseInt(v('pc-winners'), 10);
    if (!(winners >= 1 && winners <= 100)) return fail('Winners must be between 1 and 100.');
    busy(f, true);
    const row = {
      title: v('pc-title'), description: v('pc-desc') || null, period: v('pc-period'),
      metric: metric.value, exercise_id: metric.value === 'exercise_reps' ? v('pc-ex') : null, goal: +v('pc-goal'),
      prize_product_id: pr ? pr.id : null, prize_qty: pr ? qty : 1,
      reward: pr ? `${qty > 1 ? qty + ' × ' : ''}${pr.name}${pr.size ? ' ' + pr.size : ''}` : v('pc-reward'),
      reward_value_eur: pr ? Math.round(pr.price_eur * qty * 100) / 100 : +v('pc-value') || 0,
      winners, min_level: parseInt(v('pc-lvl'), 10),
    };
    const { error } = f.dataset.edit ? await sb.from('challenges').update(row).eq('id', f.dataset.edit)
      : await sb.from('challenges').insert({ ...row, brand_id: f.dataset.brand });
    if (error) return fail(error.message);
    toast(f.dataset.edit ? 'Saved. Sent to Waves for approval.' : 'Challenge sent for approval'); route();
  };
}

// ---- Admin: partner approvals + ambassador board ----
async function renderAdmin() {
  const [{ data: partners }, { data: board, error: bErr }] = await Promise.all([
    sb.from('partners').select('id, kind, name, website, country, status, created_at').order('created_at', { ascending: false }),
    sb.rpc('ambassador_board'),
  ]);
  const { data: chs } = await sb.from('challenges').select('id, title, period, reward, reward_value_eur, winners, status, featured, brands(name)').order('created_at', { ascending: false });
  const amb = { invited: 'Invited', ambassador: 'Ambassador', declined: 'Declined' };
  const pendFirst = (a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1);
  const plist = (partners || []).slice().sort(pendFirst), clist = (chs || []).slice().sort(pendFirst);
  const pendP = plist.filter(p => p.status === 'pending').length, pendC = clist.filter(c => c.status === 'pending').length;
  const ambN = (board || []).filter(m => m.status === 'ambassador').length;
  if (!panelTab.admin) panelTab.admin = pendP || !pendC ? 'partners' : 'challenges';
  const badge = n => n ? ` <span class="badge badge--hot">${n}</span>` : '';
  view.innerHTML = `
    <div class="phead"><div><p class="eyebrow">Waves admin</p><h1>Control panel</h1></div></div>
    <div class="stats">
      <button type="button" class="stat" data-goto="partners"><b>${pendP}</b><span>partners waiting</span></button>
      <button type="button" class="stat" data-goto="challenges"><b>${pendC}</b><span>challenges waiting</span></button>
      <button type="button" class="stat" data-goto="ambassadors"><b>${ambN}</b><span>ambassadors</span></button>
    </div>
    ${tabsHtml('admin', { partners: 'Partners' + badge(pendP), challenges: 'Challenges' + badge(pendC), ambassadors: 'Ambassadors' })}
    <section class="card" data-pane="partners"><h2>Partners</h2>
      ${plist.length ? `<ul class="list">${plist.map(pa => `
        <li><div class="grow"><p>${esc(pa.name)}</p>
          <p class="muted">${PARTNER_KINDS[pa.kind]}${pa.country ? ' · ' + esc(pa.country) : ''}${pa.website ? ' · ' + esc(pa.website) : ''}</p>
          <span class="chip st-${esc(pa.status)}">${STATUS_LABEL[pa.status] || esc(pa.status)}</span></div>
          <span class="row-actions">
            ${pa.status !== 'approved' ? `<button type="button" class="act act--edit" data-pst="${pa.id}:approved">Approve</button>` : ''}
            ${pa.status !== 'rejected' ? `<button type="button" class="act act--del" data-pst="${pa.id}:rejected">Reject</button>` : ''}
          </span></li>`).join('')}</ul>` : '<p class="muted">No partner sign-ups yet.</p>'}
    </section>
    <section class="card" data-pane="challenges"><h2>Brand challenges</h2>
      ${clist.length ? `<ul class="list">${clist.map(c => `<li><div class="grow"><p>${esc(c.title)}</p>
        <p class="muted">${esc(c.brands ? c.brands.name : '')} · ${PERIODS[c.period]} · top ${c.winners} win ${esc(c.reward)} (${eur(c.reward_value_eur)})</p>
        <span class="chip st-${esc(c.status)}">${STATUS_LABEL[c.status] || esc(c.status)}</span>${c.featured ? ' <span class="chip amb">Featured</span>' : ''}</div>
        <span class="row-actions">
          ${c.status !== 'approved' ? `<button type="button" class="act act--edit" data-cst="${c.id}:approved">Approve</button>` : `<button type="button" class="act act--edit" data-cfeat="${c.id}:${!c.featured}">${c.featured ? 'Unfeature' : 'Feature'}</button>`}
          ${c.status !== 'rejected' ? `<button type="button" class="act act--del" data-cst="${c.id}:rejected">Reject</button>` : ''}
        </span></li>`).join('')}</ul>` : '<p class="muted">No challenges yet.</p>'}
    </section>
    <section class="card" data-pane="ambassadors"><h2>Ambassador board</h2>
      <p class="hint">Strongest members first. Followers are self-reported; check their profile before inviting.</p>
      ${bErr ? `<p class="error">${esc(bErr.message)}</p>` : `<ul class="list">${(board || []).map((m, i) => `
        <li><span class="rank">${i + 1}</span>
          <div class="grow"><p>${esc(m.display_name)} <span class="muted">@${esc(m.username)}</span></p>
            <p class="muted">${esc(m.gym || 'No gym')} · ${fmt(m.workouts_30d)} workouts/30 d · ${m.followers != null ? fmt(m.followers) + ' followers' : 'no followers'}${m.instagram ? ' · @' + esc(m.instagram) : ''}</p>
            <p><span class="chip lv-${m.level}">${LEVELS[m.level - 1].name}</span> <span class="xp">${fmt(m.xp)} XP</span>${m.natty ? ' <span class="chip extra">Natty</span>' : ''}${m.status ? ` <span class="chip amb">${amb[m.status]}</span>` : ''}</p></div>
          <span class="row-actions">
            ${m.status !== 'invited' && m.status !== 'ambassador' ? `<button type="button" class="act act--edit" data-amb="${m.user_id}:invited">Invite</button>` : ''}
            ${m.status === 'invited' ? `<button type="button" class="act act--edit" data-amb="${m.user_id}:ambassador">Make ambassador</button>` : ''}
            ${m.status ? `<button type="button" class="act act--del" data-amb="${m.user_id}:clear">Clear</button>` : ''}
          </span></li>`).join('')}</ul>`}
    </section>
    <a class="btn btn--ghost" href="${state.profile ? '#profile' : '#partner'}">Back</a>`;
  wireTabs('admin');
  view.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => view.querySelector(`[data-ptab="${b.dataset.goto}"]`).click());
  view.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pst) {
      const [id, status] = b.dataset.pst.split(':'); b.disabled = true;
      const { error } = await sb.from('partners').update({ status }).eq('id', id);
      toast(error ? error.message : `Partner ${status}`); route();
    } else if (b.dataset.cst) {
      const [id, status] = b.dataset.cst.split(':'); b.disabled = true;
      const { error } = await sb.from('challenges').update({ status }).eq('id', id);
      toast(error ? error.message : `Challenge ${status}`); route();
    } else if (b.dataset.cfeat) {
      const [id, f] = b.dataset.cfeat.split(':'); b.disabled = true;
      const { error } = await sb.from('challenges').update({ featured: f === 'true' }).eq('id', id);
      toast(error ? error.message : f === 'true' ? 'Featured' : 'No longer featured'); route();
    } else if (b.dataset.amb) {
      const [uid, status] = b.dataset.amb.split(':'); b.disabled = true;
      const { error } = status === 'clear'
        ? await sb.from('ambassadors').delete().eq('user_id', uid)
        : await sb.from('ambassadors').upsert({ user_id: uid, status, updated_at: new Date().toISOString() });
      toast(error ? error.message : status === 'clear' ? 'Status cleared' : status === 'invited' ? 'Marked as invited' : 'Now an ambassador'); route();
    }
  };
}

route();
