// GAIN WAVES — Rewards zone (members), Partner dashboard (suppliers, gyms, online stores),
// Admin (partner approvals + ambassador board). Loaded after app.js; boots the router at the end.

const eur = n => '€' + Number(n).toFixed(2);
const CATEGORIES = { protein: 'Protein', creatine: 'Creatine', pre_workout: 'Pre-workout', vitamins: 'Vitamins', snacks: 'Snacks', apparel: 'Apparel', other: 'Other' };
const PARTNER_KINDS = { supplier: 'Supplier / brand', gym: 'Gym', online_store: 'Online store' };
const MAX_TOTAL_DISCOUNT = 40;

// ---- Rewards zone ----
async function renderRewards() {
  const p = state.profile, lv = levelOf(p.xp), nx = nextOf(lv);
  const [{ data: medals, error: mErr }, { data: disc }, { data: brands, error: bErr }] = await Promise.all([
    sb.rpc('my_achievements'),
    sb.from('level_discounts').select('level, pct').order('level'),
    sb.from('brands').select('id, name, tagline, sponsored, shelf_rank, is_example, products(id, name, category, size, price_eur, extra_discount_pct, min_level, active, is_example)').order('shelf_rank'),
  ]);
  const pctAt = n => ((disc || []).find(d => d.level === n) || { pct: 0 }).pct;
  const myPct = pctAt(lv.n);
  const earned = (medals || []).filter(m => m.earned).length;
  const priceAt = (pr, n) => {
    const total = Math.min(MAX_TOTAL_DISCOUNT, pctAt(n) + pr.extra_discount_pct);
    return { total, price: pr.price_eur * (1 - total / 100) };
  };
  view.innerHTML = `
    <div><p class="eyebrow">Rewards</p><h1>Your rewards</h1></div>
    <section class="level lv-${lv.n}">
      <div class="level__row"><span>${lv.name}</span><span>${earned} of ${(medals || []).length} medals</span></div>
      <div class="level__name">−${myPct} %</div>
      <div class="level__row"><span>Member discount on everything</span><span>${nx ? `${nx.name}: −${pctAt(nx.n)} %` : 'Top level'}</span></div>
    </section>

    <section class="card"><h2>Medals</h2>
      ${mErr ? `<p class="error">${esc(mErr.message)}</p>` : `<div class="medals">${(medals || []).map(m => {
        const pct = Math.round((Number(m.progress) / Number(m.goal)) * 100);
        return `<div class="medal ${m.earned ? 'is-earned' : ''}">
          <div class="medal__disc" aria-hidden="true">${m.earned ? '★' : `${pct}%`}</div>
          <p class="medal__name">${esc(m.name)}</p><p class="medal__desc">${esc(m.description)}</p>
          ${m.earned ? '' : `<div class="bar bar--thin"><span style="width:${pct}%"></span></div>`}
        </div>`; }).join('')}</div>`}
    </section>

    <div><h2>Products for you</h2><p class="muted">Your level discount, plus extra discounts brands add on top. Up to −${MAX_TOTAL_DISCOUNT} % in total.</p></div>
    ${bErr ? `<p class="error">${esc(bErr.message)}</p>` : (brands || []).filter(b => (b.products || []).some(x => x.active)).map(b => `
      <section class="card">
        <div class="brandhead"><h2>${esc(b.name)}</h2>${b.sponsored ? '<span class="sponsored">Sponsored</span>' : ''}</div>
        ${b.tagline ? `<p class="muted">${esc(b.tagline)}</p>` : ''}
        <div class="products">${b.products.filter(x => x.active).sort((a, c) => a.min_level - c.min_level || a.price_eur - c.price_eur).map(pr => {
          const open = lv.n >= pr.min_level;
          const at = priceAt(pr, open ? lv.n : pr.min_level);
          return `<article class="product ${open ? '' : 'locked'}">
            <div class="product__top"><span class="chip cat">${CATEGORIES[pr.category] || 'Other'}</span>${pr.extra_discount_pct ? `<span class="chip extra">Brand extra −${pr.extra_discount_pct} %</span>` : ''}</div>
            <h3>${esc(pr.name)}</h3><p class="muted">${esc(pr.size || '')}</p>
            <div class="product__price"><s>${eur(pr.price_eur)}</s><b>${eur(at.price)}</b></div>
            <p class="product__save">${open ? `You save ${eur(pr.price_eur - at.price)} (−${at.total} %)` : `Unlocks at ${LEVELS[pr.min_level - 1].name}`}</p>
          </article>`; }).join('')}</div>
      </section>`).join('')}
    <p class="muted">Prices and brands marked (example) are placeholders. The shop opens soon; these are the member prices you'll get.</p>`;
}

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
    body = `
      <section class="card"><h2>Your products</h2>
        ${(prods || []).length ? `<ul class="list">${prods.map(pr => `<li><div class="grow"><p>${esc(pr.name)} <span class="muted">${esc(pr.size || '')}</span></p>
          <p class="muted">${eur(pr.price_eur)} · extra −${pr.extra_discount_pct} % · from ${LEVELS[pr.min_level - 1].name}</p></div>
          <span class="row-actions"><button type="button" class="act act--del" data-delp="${pr.id}">Delete</button></span></li>`).join('')}</ul>`
          : '<p class="muted">No products yet. Add your first one below.</p>'}
      </section>
      <form id="pp-form" class="card" novalidate><h2>Add a product</h2>
        <label>Product name<input id="pp-name" placeholder="Whey Isolate Vanilla" /></label>
        <label>Category<select id="pp-cat">${Object.entries(CATEGORIES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <label>Size<input id="pp-size" placeholder="1 kg" /></label>
        <label>Normal price (€)<input id="pp-price" type="number" inputmode="decimal" min="0.5" step="0.01" placeholder="39.90" /></label>
        <label>Your extra member discount (%)<input id="pp-extra" type="number" inputmode="numeric" min="0" max="30" value="5" /></label>
        <label>Visible from level<select id="pp-lvl">${LEVELS.map(l => `<option value="${l.n}">${l.name}</option>`).join('')}</select></label>
        <p class="muted">Members also get their level discount (−5 to −20 %). Total discount is capped at −${MAX_TOTAL_DISCOUNT} %.</p>
        <p class="error" id="pp-err" hidden></p>
        <button class="btn" type="submit">Add product</button>
      </form>`;
    view.dataset.brand = brand ? brand.id : '';
  }
  view.innerHTML = `
    <div><p class="eyebrow">${PARTNER_KINDS[pa.kind]} · Partner</p><h1>${esc(pa.name)}</h1></div>
    <section class="card status status--${pa.status}"><h3>${pa.status === 'approved' ? 'Live' : pa.status === 'pending' ? 'Pending approval' : 'Not approved'}</h3><p>${statusLine}</p></section>
    ${body}
    ${state.profile ? '<a class="btn btn--ghost" href="#home">Back to my training</a>' : signOut}`;
  wireOut();
  view.querySelectorAll('[data-delp]').forEach(b => b.onclick = async () => {
    if (!b.classList.contains('is-armed')) { b.classList.add('is-armed'); b.textContent = 'Confirm?'; setTimeout(() => { b.classList.remove('is-armed'); b.textContent = 'Delete'; }, 4000); return; }
    b.disabled = true;
    const { error } = await sb.from('products').delete().eq('id', b.dataset.delp);
    if (error) { toast(error.message); b.disabled = false; return; }
    toast('Product deleted'); route();
  });
  const pform = document.getElementById('pp-form');
  if (pform) pform.onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('pp-err'); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; busy(pform, false); };
    const name = document.getElementById('pp-name').value.trim();
    const price = parseFloat(document.getElementById('pp-price').value);
    const extra = parseInt(document.getElementById('pp-extra').value, 10) || 0;
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
    const { error } = await sb.from('products').insert({
      brand_id: brandId, name, category: document.getElementById('pp-cat').value,
      size: document.getElementById('pp-size').value.trim() || null, price_eur: price,
      extra_discount_pct: extra, min_level: parseInt(document.getElementById('pp-lvl').value, 10),
    });
    if (error) return fail(error.message);
    toast('Product added'); route();
  };
}

// ---- Admin: partner approvals + ambassador board ----
async function renderAdmin() {
  const [{ data: partners }, { data: board, error: bErr }] = await Promise.all([
    sb.from('partners').select('id, kind, name, website, country, status, created_at').order('created_at', { ascending: false }),
    sb.rpc('ambassador_board'),
  ]);
  const amb = { invited: 'Invited', ambassador: 'Ambassador', declined: 'Declined' };
  view.innerHTML = `
    <div><p class="eyebrow">Waves admin</p><h1>Partners and ambassadors</h1></div>
    <section class="card"><h2>Partner approvals</h2>
      ${(partners || []).length ? `<ul class="list">${partners.map(pa => `
        <li><div class="grow"><p>${esc(pa.name)} <span class="chip cat">${PARTNER_KINDS[pa.kind]}</span></p>
          <p class="muted">${esc(pa.country || '')}${pa.website ? ' · ' + esc(pa.website) : ''} · <b>${esc(pa.status)}</b></p></div>
          <span class="row-actions">
            ${pa.status !== 'approved' ? `<button type="button" class="act act--edit" data-pst="${pa.id}:approved">Approve</button>` : ''}
            ${pa.status !== 'rejected' ? `<button type="button" class="act act--del" data-pst="${pa.id}:rejected">Reject</button>` : ''}
          </span></li>`).join('')}</ul>` : '<p class="muted">No partner sign-ups yet.</p>'}
    </section>
    <section class="card"><h2>Ambassador board</h2>
      <p class="muted">Strongest members first. Followers are self-reported; check their profile before inviting.</p>
      ${bErr ? `<p class="error">${esc(bErr.message)}</p>` : `<ul class="list">${(board || []).map((m, i) => `
        <li><span class="rank">${i + 1}</span>
          <div class="grow"><p>${esc(m.display_name)} <span class="muted">@${esc(m.username)}</span> ${m.natty ? '<span class="chip extra">Natty</span>' : ''}</p>
            <p class="muted">${esc(m.gym || 'No gym')} · ${fmt(m.workouts_30d)} workouts in 30 days · ${m.followers != null ? fmt(m.followers) + ' followers' : 'no followers listed'}${m.instagram ? ' · @' + esc(m.instagram) : ''}</p>
            <p><span class="chip lv-${m.level}">${LEVELS[m.level - 1].name}</span> <span class="xp">${fmt(m.xp)} XP</span> ${m.status ? `<span class="chip amb">${amb[m.status]}</span>` : ''}</p></div>
          <span class="row-actions">
            ${m.status !== 'invited' && m.status !== 'ambassador' ? `<button type="button" class="act act--edit" data-amb="${m.user_id}:invited">Invite</button>` : ''}
            ${m.status === 'invited' ? `<button type="button" class="act act--edit" data-amb="${m.user_id}:ambassador">Make ambassador</button>` : ''}
            ${m.status ? `<button type="button" class="act act--del" data-amb="${m.user_id}:clear">Clear</button>` : ''}
          </span></li>`).join('')}</ul>`}
    </section>
    <a class="btn btn--ghost" href="${state.profile ? '#profile' : '#partner'}">Back</a>`;
  view.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pst) {
      const [id, status] = b.dataset.pst.split(':'); b.disabled = true;
      const { error } = await sb.from('partners').update({ status }).eq('id', id);
      toast(error ? error.message : `Partner ${status}`); route();
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
