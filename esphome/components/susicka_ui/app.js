// On-device web UI of the meat dryer, served by the ESPHome web server as /0.js.
// States come from /events (SSE), controls use the REST API POST /<domain>/<name>/<action>.
// bundle.py prepends the GUIDE (guide.yaml) and UI_CSS (app.css) constants.
(() => {
  'use strict';

  // Entity keys "domain/Name", names as in esphome/packages (scripts/check_dashboard.py verifies them)
  const E = {
    t: 'sensor/Teplota', rh: 'sensor/Vlhkost',
    duty: 'sensor/Výkon ventilátorů', ctl: 'text_sensor/Stav regulace', mode: 'select/Režim',
    manual: 'number/Ruční výkon', target: 'number/Cílová vlhkost', band: 'number/Pásmo regulace vlhkosti',
    tmax: 'number/Maximální teplota', dmin: 'number/Minimální výkon', dmax: 'number/Maximální výkon',
    fallback: 'number/Nouzový výkon',
    rpm1: 'sensor/Ventilátor 1 otáčky', fault1: 'binary_sensor/Ventilátor 1 porucha',
    rpm2: 'sensor/Ventilátor 2 otáčky', fault2: 'binary_sensor/Ventilátor 2 porucha',
    profile: 'select/Profil', stage: 'text_sensor/Fáze profilu', next: 'sensor/Do další fáze',
    need: 'binary_sensor/Vyžadován zásah', action: 'text_sensor/Požadovaný zásah', done: 'button/Zásah proveden',
    tout: 'binary_sensor/Teplota mimo profil', rhout: 'binary_sensor/Vlhkost mimo profil',
    len: 'number/Program délka', count: 'select/Program odpočet', endact: 'select/Program po dokončení',
    start: 'button/Program start', stop: 'button/Program stop',
    run: 'binary_sensor/Program běží', fin: 'binary_sensor/Program dokončen',
    el: 'sensor/Program uplynulo', rem: 'sensor/Program zbývá', end: 'sensor/Program konec',
    pouth: 'sensor/Program doba výpadků', poutn: 'sensor/Program počet výpadků',
    total: 'sensor/Celková doba provozu', fanrun: 'sensor/Doba běhu ventilátorů',
    outh: 'sensor/Celková doba výpadků', outn: 'sensor/Počet výpadků', avail: 'sensor/Dostupnost',
    lastout: 'sensor/Poslední výpadek', lastoutmin: 'sensor/Poslední výpadek délka',
    boot: 'sensor/Poslední start', hist: 'text_sensor/Historie výpadků', reset: 'button/Vynulovat statistiky',
    wifi: 'sensor/WiFi signál', uptime: 'sensor/Doba běhu', restart: 'button/Restart',
  };
  const COLORS = ['#3b82f6', '#14b8a6', '#f4a300', '#7c4dff'];
  const HIST_KEY = 'susicka-hist';
  const HIST_MAX = 360;  // 6 h at one sample per minute

  const S = {};       // key -> last entity JSON
  const legacy = {};  // old id "sensor-teplota" -> key, for firmware without name_id
  const openGuide = new Set();
  let es = null;
  let online = false;
  let lastMsg = 0;
  let pending = false;
  let guideInit = false;
  let hist = { t: [], rh: [] };
  try { hist = JSON.parse(localStorage.getItem(HIST_KEY)) || hist; } catch (e) { /* private mode */ }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const has = (k) => k in S;
  const val = (k) => S[k]?.value;
  const num = (k) => { const v = parseFloat(S[k]?.value); return Number.isFinite(v) ? v : NaN; };
  const on = (k) => S[k]?.value === true;
  const txt = (k) => { const v = S[k]?.value; return v === undefined || v === null || v === '' ? '–' : String(v); };
  const fmt = (x, d = 0) => Number.isFinite(x)
    ? x.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
  const when = (k) => { const v = num(k); return v > 0 ? new Date(v * 1000).toLocaleString('cs-CZ',
    { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'; };
  const days = (d) => !Number.isFinite(d) ? '–' : d < 1 ? fmt(d * 24, 1) + ' h' : fmt(d, 1) + ' d';
  const hours = (h) => !Number.isFinite(h) ? '–' : h < 24 ? fmt(h, 1) + ' h' : fmt(h / 24, 1) + ' d';
  const row = (l, v) => `<div class="row"><span>${l}</span><span>${v}</span></div>`;
  const label = (k) => k.slice(k.indexOf('/') + 1);
  const profile = () => GUIDE.profiles.find((p) => p.name === val(E.profile));
  const totalH = (p) => p.stages.reduce((a, s) => a + s[0], 0);
  const stageIdx = () => { const m = /^(\d+)\//.exec(txt(E.stage)); return m ? m[1] - 1 : -1; };

  // ------------------------------------------------------------------ device link

  function keyOf(d) {
    if (d.name_id) return d.name_id;
    if (d.domain && d.name) return (legacy[d.id] = d.domain + '/' + d.name);
    return legacy[d.id];
  }

  function connect() {
    es = new EventSource('/events');
    es.onopen = () => { online = true; lastMsg = Date.now(); schedule(); };
    es.onerror = () => { online = false; schedule(); };
    es.addEventListener('ping', (e) => {
      lastMsg = Date.now();
      online = true;
      try {
        const d = JSON.parse(e.data);
        if (d.title) { $('title').textContent = d.title; document.title = d.title; }
      } catch (err) { /* empty ping */ }
      schedule();
    });
    es.addEventListener('state', (e) => {
      lastMsg = Date.now();
      let d;
      try { d = JSON.parse(e.data); } catch (err) { return; }
      const k = keyOf(d);
      if (!k) return;
      S[k] = Object.assign(S[k] || {}, d);
      if (k === E.t) sample('t', num(k));
      if (k === E.rh) sample('rh', num(k));
      schedule();
    });
    es.addEventListener('log', (e) => addLog(e.data));
  }

  async function call(k, action, params) {
    const i = k.indexOf('/');
    const dom = k.slice(0, i);
    const q = params ? '?' + new URLSearchParams(params) : '';
    try {
      let r = await fetch(`/${dom}/${encodeURIComponent(k.slice(i + 1))}/${action}${q}`, { method: 'POST' });
      const id = S[k]?.id;
      if (r.status === 404 && id) r = await fetch(`/${dom}/${id.slice(dom.length + 1)}/${action}${q}`, { method: 'POST' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return true;
    } catch (err) {
      toast(`${label(k)}: nepodařilo se (${err.message})`);
      return false;
    }
  }

  function setNum(k, v) {
    const e = S[k];
    if (!e || !Number.isFinite(v)) return;
    const step = parseFloat(e.step) || 1;
    v = Math.min(parseFloat(e.max_value), Math.max(parseFloat(e.min_value), Math.round(v / step) * step));
    v = +v.toFixed(3);
    call(k, 'set', { value: v }).then((ok) => ok && toast(`${label(k)}: ${fmt(v, step < 1 ? 1 : 0)} ${e.uom || ''}`));
  }

  function sample(s, v) {
    if (!Number.isFinite(v)) return;
    const h = hist[s];
    const now = Date.now();
    if (h.length && now - h[h.length - 1][0] < 60000) return;
    h.push([now, v]);
    if (h.length > HIST_MAX) h.splice(0, h.length - HIST_MAX);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch (e) { /* storage full or blocked */ }
  }

  // ------------------------------------------------------------------ widgets

  function ask(text, ok = 'Potvrdit') {
    return new Promise((resolve) => {
      const d = document.createElement('div');
      d.className = 'dlg';
      d.innerHTML = `<div role="dialog" aria-modal="true"><p>${esc(text)}</p><div class="btns">`
        + `<button class="btn" data-r="0">Zrušit</button><button class="btn pri" data-r="1">${esc(ok)}</button></div></div>`;
      d.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (!b && e.target !== d) return;
        d.remove();
        resolve(b?.dataset.r === '1');
      });
      document.body.appendChild(d);
      d.querySelector('.pri').focus();
    });
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function spark(pts, color, ref) {
    if (pts.length < 2) return '<svg class="spark"></svg>';
    const t0 = pts[0][0];
    const dt = Math.max(1, pts[pts.length - 1][0] - t0);
    const vs = pts.map((p) => p[1]).concat(Number.isFinite(ref) ? [ref] : []);
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    const x = (t) => ((t - t0) / dt * 300).toFixed(1);
    const y = (v) => (40 - (v - lo) / (hi - lo) * 36).toFixed(1);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]) + ' ' + y(p[1])).join('');
    const r = Number.isFinite(ref) ? `<line x1="0" x2="300" y1="${y(ref)}" y2="${y(ref)}" stroke="${color}" `
      + 'stroke-dasharray="4 4" opacity=".5" vector-effect="non-scaling-stroke"/>' : '';
    return `<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none">${r}<path d="${d}" fill="none" `
      + `stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // Stage bar of a profile, elapsed hours marks the position (NaN = not running)
  function timeline(p, elH, labels) {
    const tot = totalH(p);
    const run = Number.isFinite(elH);
    let acc = 0;
    let seg = '';
    let lab = '';
    p.stages.forEach((s, i) => {
      seg += `<div style="flex:${s[0]};background:${COLORS[i % 4]};opacity:${run && acc + s[0] <= elH ? 0.35 : 0.9}"></div>`
        + (s[11] && i < p.stages.length - 1 ? '<div class="a" title="zásah"></div>' : '');
      lab += `<span><i style="background:${COLORS[i % 4]}"></i>${fmt(acc / 24 + 1, 0)}. den ${esc(s[10])} · ${s[1]} %</span>`;
      acc += s[0];
    });
    const now = run ? `<div class="now" style="left:${Math.min(100, Math.max(0, elH / tot * 100))}%"></div>` : '';
    return `<div class="tl"><div class="s">${seg}</div>${now}</div>` + (labels ? `<div class="lab">${lab}</div>` : '');
  }

  function seg(k, opts) {
    const cur = val(k);
    return `<div class="seg">${(S[k]?.option || opts).map((o) => `<button data-do="select" data-k="${esc(k)}" `
      + `data-opt="${esc(o)}" class="${o === cur ? 'on' : ''}">${esc(o)}</button>`).join('')}</div>`;
  }

  function numInput(k, name) {
    if (!has(k)) return '';
    const e = S[k];
    return `<div class="set"><label>${esc(name || label(k))}</label><div class="num">`
      + `<button data-do="step" data-k="${esc(k)}" data-dir="-1" aria-label="méně">−</button>`
      + `<input type="number" inputmode="decimal" data-num="${esc(k)}" value="${esc(e.value)}" `
      + `min="${esc(e.min_value)}" max="${esc(e.max_value)}" step="${esc(e.step)}">`
      + `<button data-do="step" data-k="${esc(k)}" data-dir="1" aria-label="více">+</button></div>`
      + `<span class="u">${esc(e.uom || '')}</span></div>`;
  }

  // ------------------------------------------------------------------ cards

  function alerts() {
    let h = '';
    const a = (cls, body) => { h += `<div class="alert ${cls}">${body}</div>`; };
    if (!online) a('bad', '<span><b>Spojení se zařízením je přerušené.</b> Stránka se připojí sama, jakmile bude zařízení dostupné.</span>');
    if (on(E.need)) {
      a('warn', `<span><b>Vyžadován zásah:</b> ${esc(txt(E.action))}. Program běží dál.</span>`
        + `<button class="btn pri" data-do="press" data-k="${esc(E.done)}" data-ask="Potvrdit provedení zásahu?">Zásah proveden</button>`);
    }
    if (txt(E.ctl).startsWith('Porucha')) a('bad', '<span><b>Porucha čidla teploty a vlhkosti.</b> Ventilátory běží na nouzový výkon.</span>');
    [[E.fault1, 1], [E.fault2, 2]].forEach(([k, n]) => on(k) && a('bad', `<span><b>Ventilátor ${n}:</b> porucha, neotáčí se.</span>`));
    const p = profile();
    const s = p && p.stages[stageIdx()];
    if (on(E.tout)) a('warn', `<span><b>Teplota mimo profil:</b> ${fmt(num(E.t), 1)} °C`
      + (s ? `, profil počítá s ${s[6]}–${s[7]} °C` : '') + '. Sušička netopí ani nechladí, uprav prostředí.</span>');
    if (on(E.rhout)) a('warn', `<span><b>Vlhkost mimo profil:</b> ${fmt(num(E.rh))} %`
      + (s ? `, profil počítá s ${s[8]}–${s[9]} %` : '') + '.</span>');
    if (on(E.fin)) a('ok', '<span><b>Program dokončen.</b> Zkontroluj hotovost (úbytek hmotnosti).</span>');
    return h;
  }

  function room() {
    const p = profile();
    const s = on(E.run) && p ? p.stages[stageIdx()] : null;
    const span = hist.t.length > 1 ? (hist.t[hist.t.length - 1][0] - hist.t[0][0]) / 3600000 : 0;
    return `<h2>Komora<small>${esc(txt(E.ctl))}</small></h2><div class="pair">`
      + `<div><div class="sub">Teplota</div><div class="big">${fmt(num(E.t), 1)}<span class="u">°C</span></div>${spark(hist.t, 'var(--c-t)', num(E.tmax))}</div>`
      + `<div><div class="sub">Vlhkost</div><div class="big">${fmt(num(E.rh))}<span class="u">%</span></div>${spark(hist.rh, 'var(--c-rh)', num(E.target))}</div></div>`
      + row('Cílová vlhkost', `${fmt(num(E.target))} % <span class="sub">(pásmo ${fmt(num(E.band))} %)</span>`)
      + row('Max. teplota', `${fmt(num(E.tmax), 1)} °C`)
      + (s ? row('Rozsah profilu', `${s[6]}–${s[7]} °C · ${s[8]}–${s[9]} %`) : '')
      + `<p class="note">${span >= 0.1 ? `Průběh za posledních ${fmt(span, 1)} h od otevření stránky,` : 'Průběh se začne kreslit během pár minut,'} čárkovaně maximální teplota a cílová vlhkost.</p>`;
  }

  function fans() {
    const duty = num(E.duty);
    const fan = (n, rpm, fault) => !has(rpm) ? '' : row(`Ventilátor ${n}`,
      `${fmt(num(rpm))} ot/min ${on(fault) ? '<span class="badge bad">porucha</span>' : ''}`);
    let h = `<h2>Ventilátory</h2><div class="big">${fmt(duty)}<span class="u">%</span></div>`
      + `<div class="bar"><div style="width:${Number.isFinite(duty) ? duty : 0}%"></div></div>`
      + fan(1, E.rpm1, E.fault1) + fan(2, E.rpm2, E.fault2)
      + row('Rozsah výkonu', `${fmt(num(E.dmin))}–${fmt(num(E.dmax))} %`)
      + seg(E.mode, ['Automaticky', 'Ručně', 'Vypnuto']);
    if (val(E.mode) === 'Ručně' && has(E.manual)) {
      const m = S[E.manual];
      h += `<div class="set"><label>Ruční výkon</label><b data-live="${esc(E.manual)}">${fmt(num(E.manual))} %</b></div>`
        + `<input type="range" data-num="${esc(E.manual)}" min="${esc(m.min_value)}" max="${esc(m.max_value)}" `
        + `step="${esc(m.step)}" value="${esc(m.value)}">`;
    }
    if (val(E.mode) === 'Vypnuto') h += '<p class="note">Ventilátory stojí, regulace neběží.</p>';
    return h;
  }

  function program() {
    const p = profile();
    const run = on(E.run);
    const fin = on(E.fin);
    let h = `<h2>Program<small>${esc(txt(E.profile))}</small></h2>`
      + `<div class="big" style="font-size:24px">${run ? esc(txt(E.stage)) : fin ? 'Dokončeno' : 'Neběží'}</div>`;
    if (p && p.stages.length) h += timeline(p, run ? num(E.el) * 24 : NaN, true);
    h += row('Profil', `${esc(txt(E.profile))} · <a href="#c-guide">změnit</a>`)
      + row('Délka programu', `${fmt(num(E.len), 1)} d`);
    if (run || fin) {
      h += row('Uplynulo', days(num(E.el))) + row('Zbývá', days(num(E.rem))) + row('Konec', when(E.end));
    }
    if (run && Number.isFinite(num(E.next))) h += row('Do další fáze', hours(num(E.next)));
    if (run) h += row('Výpadky v programu', `${fmt(num(E.poutn))} × · ${fmt(num(E.pouth), 1)} h`);
    if (!run) {
      h += `<div class="hint">${p && p.stages.length
        ? `Profil ${esc(p.name)} nastaví regulaci a délku programu ${days(totalH(p) / 24)}. Spusť ho tlačítkem Start.`
        : 'Bez profilu reguluje sušička podle hodnot v Nastavení regulace. Délku programu nastav tam.'}</div>`;
    }
    return h + '<div class="btns">'
      + `<button class="btn go" data-do="press" data-k="${esc(E.start)}" data-ok="Spustit" `
      + `data-ask="${run ? 'Program běží. Spustit znovu od začátku? Uplynulá doba a fáze se vynulují.' : 'Spustit program?'}">▶ Start</button>`
      + `<button class="btn stop" data-do="press" data-k="${esc(E.stop)}" data-ok="Zastavit" data-ask="Zastavit program?"${run ? '' : ' disabled'}>■ Stop</button></div>`;
  }

  function suggest() {
    const t = num(E.t);
    if (!Number.isFinite(t)) return 'Teplota v komoře zatím není známá.';
    const ok = GUIDE.profiles.filter((p) => p.stages.length && t >= p.stages[0][6] && t <= p.stages[0][7]).map((p) => esc(p.name));
    return `Teď je v komoře ${fmt(t, 1)} °C. ` + (ok.length ? `Pro tuto teplotu se hodí: <b>${ok.join(', ')}</b>.`
      : 'Pro tuto teplotu se nehodí žádný profil, uprav prostředí nebo zvol Vlastní.');
  }

  function guide() {
    const cur = val(E.profile);
    const run = on(E.run);
    const si = stageIdx();
    const kv = (l, v) => `<div class="kv"><span>${l}</span><span>${esc(v)}</span></div>`;
    if (!guideInit && cur !== undefined) { guideInit = true; openGuide.add(cur); }
    return GUIDE.profiles.map((p) => {
      const tot = totalH(p);
      const act = p.name === cur;
      const q = !tot ? 'Zvolit Vlastní? Profil přestane řídit regulaci, zůstanou aktuální hodnoty z Nastavení regulace.'
        : run ? `Program běží. Po změně na ${p.name} se fáze určí podle dosavadní doby programu a přepíší nastavení regulace. Změnit?`
          : `Zvolit profil ${p.name}? Nastaví i délku programu, spustíš ho tlačítkem Start.`;
      let h = `<details class="p" data-name="${esc(p.name)}"${openGuide.has(p.name) ? ' open' : ''}><summary>`
        + `<span class="t">${esc(p.name)}</span>${act ? '<span class="badge acc">zvoleno</span>' : ''}`
        + `<span class="m">${tot ? days(tot / 24) : '–'} · ${esc(p.level)}</span></summary><div class="b">`
        + `<p>${esc(p.about)}</p>` + kv('Maso', p.meat) + kv('Prostředí', p.room) + kv('Příprava', p.prep);
      if (tot) {
        h += timeline(p, NaN, false) + '<div class="wrap-table"><table><tr><th>Fáze</th><th>Délka</th><th>Cíl RH</th><th>Výkon</th><th>Teplota</th></tr>'
          + p.stages.map((s, i) => `<tr${act && run && i === si ? ' class="cur"' : ''}><td><i style="background:${COLORS[i % 4]}"></i>${esc(s[10])}</td>`
            + `<td>${days(s[0] / 24)}</td><td>${s[1]} %</td><td>${s[3]}–${s[4]} %</td><td>${s[6]}–${s[7]} °C</td></tr>`
            + (s[11] ? `<tr class="act"><td colspan="5">✋ ${esc(s[11])}</td></tr>` : '')).join('') + '</table></div>';
      }
      h += kv('Hotovo', p.done) + `<p class="tip">${esc(p.tip)}</p>`;
      if (!act) h += `<button class="btn pri" data-do="select" data-k="${esc(E.profile)}" data-opt="${esc(p.name)}" data-ok="Zvolit" data-ask="${esc(q)}">Zvolit profil</button>`;
      return h + '</div></details>';
    }).join('');
  }

  function settings() {
    const p = profile();
    return '<h2>Nastavení regulace</h2>'
      + (on(E.run) && p && p.stages.length ? `<div class="hint">Hodnoty řídí profil ${esc(p.name)}. Ruční změna platí do další fáze, pak je profil přepíše.</div>` : '')
      + numInput(E.target) + numInput(E.band, 'Pásmo vlhkosti') + numInput(E.tmax)
      + numInput(E.dmin) + numInput(E.dmax) + numInput(E.fallback, 'Nouzový výkon (porucha čidla)')
      + numInput(E.len)
      + '<div class="set"><label>Odpočet programu</label></div>' + seg(E.count, ['Reálný čas', 'Jen doba provozu'])
      + '<div class="set"><label>Po dokončení programu</label></div>' + seg(E.endact, ['Pokračovat', 'Vypnout ventilátory']);
  }

  function stats() {
    const hs = txt(E.hist);
    const list = hs === '–' || hs === 'žádné' ? 'žádné' : hs.split('; ').map(esc).join('<br>');
    return `<h2>Provoz a výpadky</h2><div class="big">${fmt(num(E.avail), 2)}<span class="u">%</span></div><div class="sub">dostupnost</div>`
      + row('Celková doba provozu', hours(num(E.total))) + row('Doba běhu ventilátorů', hours(num(E.fanrun)))
      + row('Počet výpadků', fmt(num(E.outn))) + row('Celková doba výpadků', hours(num(E.outh)))
      + row('Poslední výpadek', `${when(E.lastout)}${Number.isFinite(num(E.lastoutmin)) ? ` · ${fmt(num(E.lastoutmin))} min` : ''}`)
      + row('Historie výpadků', list) + row('Poslední start', when(E.boot))
      + `<div class="btns"><button class="btn" data-do="press" data-k="${esc(E.reset)}" data-ok="Vynulovat" `
      + 'data-ask="Vynulovat statistiky provozu a historii výpadků? Program to neovlivní.">Vynulovat statistiky</button></div>';
  }

  function system() {
    const up = num(E.uptime);
    const d = Math.floor(up / 86400);
    const upTxt = Number.isFinite(up) ? `${d ? d + ' d ' : ''}${Math.floor(up % 86400 / 3600)} h ${Math.floor(up % 3600 / 60)} min` : '–';
    return '<h2>Zařízení</h2>' + row('Spojení', online ? 'připojeno' : 'odpojeno')
      + row('WiFi signál', `${fmt(num(E.wifi))} dBm`) + row('Doba běhu', upTxt)
      + `<div class="btns"><button class="btn" data-do="press" data-k="${esc(E.restart)}" data-ok="Restartovat" `
      + 'data-ask="Restartovat zařízení? Program pokračuje po startu, ventilátory se na chvíli rozběhnou na plno.">Restart</button>'
      + '<button class="btn" data-do="classic" data-ask="Přepnout na původní rozhraní ESPHome? Potřebuje internet, zpět se vrátíš obnovením stránky." data-ok="Přepnout">Původní rozhraní</button></div>';
  }

  // ------------------------------------------------------------------ render

  // Skips a block while the user edits an input in it, unchanged HTML is not touched
  function put(id, html) {
    const el = $(id);
    const a = document.activeElement;
    if (!el || (a && a.tagName === 'INPUT' && el.contains(a)) || el._h === html) return;
    el.innerHTML = html;
    el._h = html;
  }

  function render() {
    pending = false;
    const c = $('conn');
    c.className = 'pill' + (online ? ' on' : '');
    c.lastChild.textContent = online ? 'online' : 'offline';
    put('alerts', alerts());
    put('c-room', room());
    put('c-fan', fans());
    put('c-prog', program());
    put('suggest', suggest());
    put('guide', guide());
    put('c-set', settings());
    put('c-stats', stats());
    put('sys', system());
  }

  function schedule() {
    if (!pending) { pending = true; setTimeout(render, 150); }
  }

  function addLog(line) {
    const el = $('log');
    if (!el) return;
    el.textContent += line.replace(/\x1b\[[0-9;]*m/g, '') + '\n';
    if (el.textContent.length > 20000) el.textContent = el.textContent.slice(-15000);
    el.scrollTop = el.scrollHeight;
  }

  function classic() {
    if (es) es.close();
    document.body.innerHTML = '<esp-app></esp-app>';
    document.getElementById('ui-css').remove();
    const s = document.createElement('script');
    s.src = 'https://oi.esphome.io/v3/www.js';
    s.onerror = () => { document.body.textContent = 'Původní rozhraní se nenačetlo, chybí připojení k internetu. Obnov stránku.'; };
    document.body.appendChild(s);
  }

  // ------------------------------------------------------------------ events

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-do]');
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (d.ask && !(await ask(d.ask, d.ok))) return;
    if (d.do === 'press') {
      if (await call(d.k, 'press')) toast(`${label(d.k)}: hotovo`);
    } else if (d.do === 'select') {
      if (val(d.k) !== d.opt && await call(d.k, 'set', { option: d.opt })) {
        S[d.k].value = d.opt;  // optimistic, the device confirms over /events
        render();
      }
    } else if (d.do === 'step') {
      const input = el.parentNode.querySelector('input');
      const v = parseFloat(input.value) + Number(d.dir) * (parseFloat(input.step) || 1);
      input.value = v;
      setNum(d.k, v);
    } else if (d.do === 'classic') {
      classic();
    }
  });

  document.addEventListener('change', (ev) => {
    const k = ev.target.dataset.num;
    if (k) setNum(k, parseFloat(ev.target.value));
  });

  document.addEventListener('input', (ev) => {
    const k = ev.target.dataset.num;
    const live = k && document.querySelector(`[data-live="${CSS.escape(k)}"]`);
    if (live) live.textContent = fmt(parseFloat(ev.target.value)) + ' %';
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.dataset.num) ev.target.blur();
  });

  document.addEventListener('focusout', schedule);

  // toggle does not bubble, listen in the capture phase
  document.addEventListener('toggle', (ev) => {
    const n = ev.target.dataset?.name;
    if (n === undefined) return;
    if (ev.target.open) openGuide.add(n); else openGuide.delete(n);
    const g = $('guide');
    g._h = guide();  // keep put() from rebuilding the list just because of the click
  }, true);

  // ------------------------------------------------------------------ page

  document.head.insertAdjacentHTML('beforeend', '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<style id="ui-css">${UI_CSS}</style>`);
  document.title = 'Sušička na maso';
  document.body.innerHTML = '<header><h1 id="title">Sušička na maso</h1><span id="conn" class="pill"><i></i><span>připojuji</span></span></header>'
    + '<main><div id="alerts"></div><div class="grid">'
    + '<section class="card" id="c-room"></section><section class="card" id="c-fan"></section>'
    + '<section class="card" id="c-prog"></section>'
    + '<section class="card wide" id="c-guide"><h2>Průvodce profily</h2><div class="hint" id="suggest"></div>'
    + `<div id="guide"></div><p class="note">${esc(GUIDE.note)}</p></section>`
    + '<section class="card" id="c-set"></section><section class="card" id="c-stats"></section>'
    + '<section class="card" id="c-sys"><div id="sys"></div><details><summary class="sub">Log zařízení</summary><div id="log"></div></details></section>'
    + '</div></main><footer>Sušička na maso · <a href="https://github.com/KinDR007/esphome-susicka-maso">dokumentace</a></footer>';

  setInterval(() => {
    if (online && Date.now() - lastMsg > 40000) { online = false; schedule(); }
  }, 5000);

  render();
  connect();
})();
