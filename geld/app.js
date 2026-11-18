/* Geld – OpenBoard-widget
 * Geldbordje: euromunten en -biljetten uit de kassa op het bord leggen, verslepen en tellen.
 * Oefenvormen: vrij leggen, een bedrag leggen (eventueel met zo weinig mogelijk stukken) en wisselgeld.
 * Bedragen worden overal in centen bijgehouden (gehele getallen, geen afrondingsfouten).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- Munten en biljetten (vereenvoudigd getekend, echte verhoudingen binnen munten en binnen biljetten) ----------
  // d = diameter in mm, w x h = biljet in mm. Munten: 4 eenheden per mm; biljetten 1,8 (anders te groot).
  var COIN_K = 2, NOTE_K = 1.8;
  var METAL = {
    koper: { light: '#f4bf93', fill: '#c4743a', dark: '#7d4019', ink: '#5a2c0e' },
    goud:  { light: '#fcebae', fill: '#d6ae45', dark: '#8c6a17', ink: '#5e450a' },
    zilver: { light: '#ffffff', fill: '#c3c8cf', dark: '#7a828d', ink: '#3c434d' },
    geel:  { light: '#fff1bd', fill: '#dcae3e', dark: '#8f6d18', ink: '#5c440a' }
  };
  // edge: rand van de munt; style: bouwstijl van het venster op het biljet
  var MONEY = {
    1: { coin: true, d: 16.25, metal: 'koper', edge: 'glad' },
    2: { coin: true, d: 18.75, metal: 'koper', edge: 'groef' },
    5: { coin: true, d: 21.25, metal: 'koper', edge: 'glad' },
    10: { coin: true, d: 19.75, metal: 'goud', edge: 'kartel' },
    20: { coin: true, d: 22.25, metal: 'goud', edge: 'bloem' },
    50: { coin: true, d: 24.25, metal: 'goud', edge: 'kartel' },
    100: { coin: true, d: 23.25, metal: 'zilver', core: 'geel', edge: 'kartel' },
    200: { coin: true, d: 25.75, metal: 'geel', core: 'zilver', edge: 'kartel' },
    500: { w: 120, h: 62, fill: '#a3a197', light: '#e2e0d6', edge: '#6b685f', style: 'klassiek' },
    1000: { w: 127, h: 67, fill: '#d4573f', light: '#f6bfae', edge: '#93311f', style: 'romaans' },
    2000: { w: 133, h: 72, fill: '#3f73c4', light: '#b4cdf2', edge: '#244f92', style: 'gotisch' },
    5000: { w: 140, h: 77, fill: '#e8862a', light: '#fad3a0', edge: '#9f5510', style: 'renaissance' },
    10000: { w: 147, h: 77, fill: '#3a9356', light: '#b3e2be', edge: '#21643a', style: 'barok' },
    20000: { w: 153, h: 77, fill: '#d1a838', light: '#f4e3a6', edge: '#8f7016', style: 'ijzer' },
    50000: { w: 160, h: 82, fill: '#94649f', light: '#ddc6e5', edge: '#5f3c6b', style: 'modern' }
  };
  var ALL = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  var LEVELS = {
    '10': [100, 200, 500, 1000],
    '100': [100, 200, 500, 1000, 2000, 5000],
    'centen': ALL
  };
  var MAX_ITEMS = 80, MAX_AMOUNT = 100000; // hoogstens € 1000

  // ---------- Indeling van de SVG (viewBox W x 1000; W volgt de breedte van de widget, zie layout) ----------
  var W = 1600;
  var BX = 20, BY = 110, BW = W - 40, BH = 660;    // het bord
  var TY = 790, TH = 200;                          // de kassa
  var MARGIN = 6;                                  // ruimte tussen stukken

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: mode ('vrij'|'bedrag'|'wissel'), level ('10'|'100'|'centen'), items ('waarde:x:y,...' in centen
  // en SVG-eenheden), showTotal ('0'|'1'), target, price, paid (centen), fewest ('0'|'1').
  // Nooit hernoemen of een andere betekenis geven: oude lessen bewaren deze waarden.
  var HAS_SANKORE = !!(window.sankore && typeof sankore.preference === 'function');
  function prefGet(k, d) {
    if (HAS_SANKORE) {
      try {
        var v = sankore.preference(k, '');
        if (v !== '' && v !== null && v !== undefined) return String(v);
      } catch (e) {}
      return d;
    }
    try { var l = localStorage.getItem('geld.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('geld.' + k, String(v)); } catch (e) {}
  }

  // ---------- Toestand ----------
  var nextId = 1;
  var state = {
    mode: oneOf(prefGet('mode', 'vrij'), ['vrij', 'bedrag', 'wissel'], 'vrij'),
    level: oneOf(prefGet('level', '10'), ['10', '100', 'centen'], '10'),
    items: parseItems(prefGet('items', '')),
    showTotal: prefGet('showTotal', '0') === '1',
    target: cents(prefGet('target', '0')),
    price: cents(prefGet('price', '0')),
    paid: cents(prefGet('paid', '0')),
    fewest: prefGet('fewest', '0') === '1',
    revealed: false // wisselgeld zichtbaar (na juist of oplossing); niet bewaard
  };

  function oneOf(v, list, d) { for (var i = 0; i < list.length; i++) if (list[i] === v) return v; return d; }
  function cents(s) { var n = parseInt(s, 10); return n > 0 && n <= MAX_AMOUNT ? n : 0; }
  function parseItems(s) {
    var out = [], parts = s ? s.split(',') : [];
    for (var i = 0; i < parts.length && out.length < MAX_ITEMS; i++) {
      var p = parts[i].split(':'), v = +p[0];
      if (!MONEY[v]) continue;
      out.push({ id: nextId++, v: v, x: +p[1] || BX + BW / 2, y: +p[2] || BY + BH / 2 });
    }
    return out;
  }
  function save() {
    var s = [];
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      s.push(it.v + ':' + Math.round(it.x) + ':' + Math.round(it.y));
    }
    prefSet('mode', state.mode);
    prefSet('level', state.level);
    prefSet('items', s.join(','));
    prefSet('showTotal', state.showTotal ? '1' : '0');
    prefSet('target', state.target);
    prefSet('price', state.price);
    prefSet('paid', state.paid);
    prefSet('fewest', state.fewest ? '1' : '0');
  }

  // ---------- Rekenen ----------
  function total() { var t = 0; for (var i = 0; i < state.items.length; i++) t += state.items[i].v; return t; }
  function denoms() { return LEVELS[state.level]; }
  // Euromunten en -biljetten: telkens het grootste stuk nemen geeft altijd zo weinig mogelijk stukken.
  function greedy(amount, list) {
    list = list || denoms();
    var out = [], rest = amount;
    for (var i = list.length - 1; i >= 0; i--) {
      while (rest >= list[i] && out.length < 500) { out.push(list[i]); rest -= list[i]; }
    }
    return rest === 0 ? out : null;
  }
  function goal() { return state.mode === 'wissel' ? state.paid - state.price : state.target; }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function plain(c, forceCents) {
    var e = Math.floor(c / 100), r = c % 100;
    return r || forceCents ? e + ',' + pad2(r) : String(e);
  }
  function fmt(c) { return '€ ' + plain(c, state.level === 'centen'); }
  function stuks(n) { return n === 1 ? '1 stuk' : n + ' stukken'; }
  // "3,75", "3.75", "€ 3", "3,5" -> centen; NaN als het geen bedrag is
  function parseAmount(s) {
    s = String(s).replace(/[€\s]/g, '').replace(',', '.');
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }

  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function firstAbove(list, price) {
    for (var i = 0; i < list.length; i++) if (list[i] > price) {
      // soms met een groter biljet betalen, dan wordt het teruggeven moeilijker
      if (i + 1 < list.length && Math.random() < 0.3) return list[i + 1];
      return list[i];
    }
    return list[list.length - 1];
  }
  function newTask() {
    var old = goal(), tries = 0;
    do {
      if (state.level === '10') {
        state.target = rnd(1, 10) * 100;
        state.price = rnd(1, 9) * 100;
        state.paid = firstAbove([200, 500, 1000], state.price);
      } else if (state.level === '100') {
        state.target = rnd(1, 100) * 100;
        state.price = rnd(1, 95) * 100;
        state.paid = firstAbove([500, 1000, 2000, 5000, 10000], state.price);
      } else {
        state.target = rnd(1, 1000) * 5;
        do { state.price = rnd(1, 1000) * 5; } while (state.price % 100 === 0);
        state.paid = firstAbove([100, 200, 500, 1000, 2000, 5000], state.price);
      }
    } while (goal() === old && ++tries < 20);
    state.revealed = false;
  }

  // ---------- Tekenen ----------
  function el(name, attrs, parent) {
    var e = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(str, attrs, parent) {
    attrs['font-family'] = 'Segoe UI, Arial, sans-serif';
    attrs['text-anchor'] = attrs['text-anchor'] || 'middle';
    var t = el('text', attrs, parent);
    t.appendChild(document.createTextNode(str));
    return t;
  }
  function size(v) {
    var m = MONEY[v];
    if (m.coin) { var d = m.d * COIN_K * 2; return { w: d, h: d }; }
    return { w: m.w * NOTE_K, h: m.h * NOTE_K };
  }

  // Munten en biljetten tekenen. Herkenbaar (kleur, vorm, rand, sterren, venster per biljet), maar bewust
  // vereenvoudigd: geen afbeeldingen van echte biljetten (regels van de ECB tegen namaak).
  function makeDefs() {
    var defs = el('defs', {}, svg), k, g;
    for (k in METAL) if (METAL.hasOwnProperty(k)) {
      g = el('radialGradient', { id: 'gm-' + k, cx: '35%', cy: '30%', r: '80%' }, defs);
      el('stop', { offset: '0', 'stop-color': METAL[k].light }, g);
      el('stop', { offset: '0.55', 'stop-color': METAL[k].fill }, g);
      el('stop', { offset: '1', 'stop-color': METAL[k].dark }, g);
    }
    for (k in MONEY) if (MONEY.hasOwnProperty(k) && !MONEY[k].coin) {
      g = el('linearGradient', { id: 'gn-' + k, x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
      el('stop', { offset: '0', 'stop-color': MONEY[k].light }, g);
      el('stop', { offset: '0.6', 'stop-color': MONEY[k].fill }, g);
      el('stop', { offset: '1', 'stop-color': MONEY[k].fill }, g);
    }
    g = el('linearGradient', { id: 'gholo', x1: '0', y1: '0', x2: '1', y2: '0.4' }, defs);
    var holo = [['0', '#f4f6f9'], ['0.3', '#b3bcc9'], ['0.55', '#eef1f5'], ['0.8', '#c5ccd6'], ['1', '#9aa4b2']];
    for (k = 0; k < holo.length; k++) el('stop', { offset: holo[k][0], 'stop-color': holo[k][1] }, g);
  }

  function starPts(cx, cy, R) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.42 : R;
      p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return p.join(' ');
  }
  // 20 cent: de "Spaanse bloem" met 7 inkepingen in de rand
  function flowerPath(r) {
    var d = '', n = 140;
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2, seg = Math.PI * 2 / 7;
      var off = Math.abs(((t + seg / 2) % seg) - seg / 2);
      var rr = r - r * 0.075 * Math.exp(-Math.pow(off / 0.09, 2));
      d += (i ? ' L' : 'M') + (rr * Math.cos(t)).toFixed(1) + ' ' + (rr * Math.sin(t)).toFixed(1);
    }
    return d + ' Z';
  }

  function drawCoin(v, g) {
    var m = MONEY[v], r = size(v).w / 2, a = METAL[m.metal];
    el('circle', { cx: 2, cy: 4, r: r, fill: 'rgba(24,33,47,0.25)' }, g);
    if (m.edge === 'bloem') el('path', { d: flowerPath(r - 1), fill: 'url(#gm-' + m.metal + ')', stroke: a.dark, 'stroke-width': 2 }, g);
    else el('circle', { cx: 0, cy: 0, r: r - 1, fill: 'url(#gm-' + m.metal + ')', stroke: a.dark, 'stroke-width': 2 }, g);
    if (m.edge === 'kartel') {
      el('circle', { cx: 0, cy: 0, r: r - 2.5, fill: 'none', stroke: a.dark, 'stroke-width': 3, 'stroke-dasharray': '1.2 2.2', opacity: 0.55 }, g);
    } else if (m.edge === 'groef') {
      el('circle', { cx: 0, cy: 0, r: r - 3.5, fill: 'none', stroke: a.dark, 'stroke-width': 1.2, opacity: 0.55 }, g);
    }
    // opstaande rand
    el('circle', { cx: 0, cy: 0, r: r * 0.88, fill: 'none', stroke: a.light, 'stroke-width': 2.2, opacity: 0.9 }, g);
    el('circle', { cx: 0, cy: 0, r: r * 0.88 - 2, fill: 'none', stroke: a.dark, 'stroke-width': 1, opacity: 0.35 }, g);
    var ink = a.ink, starInk = a.ink, starR = 0.74;
    if (m.core) {
      var c = METAL[m.core];
      el('circle', { cx: 0, cy: 0, r: r * 0.66, fill: 'url(#gm-' + m.core + ')', stroke: c.dark, 'stroke-width': 1.5 }, g);
      ink = c.ink;
      starR = 0.79;
    }
    // Europa (zacht in reliëf) met de lijnen naar de 12 sterren rechts
    var map = el('g', { opacity: 0.22 }, g);
    el('path', { opacity: 0.6, d: 'M' + r * 0.2 + ' ' + (-r * 0.38) + ' q' + r * 0.2 + ' ' + (-r * 0.12) + ' ' + r * 0.32 + ' ' + r * 0.04 +
      ' q' + r * 0.12 + ' ' + r * 0.18 + ' ' + (-r * 0.02) + ' ' + r * 0.3 + ' q' + r * 0.08 + ' ' + r * 0.2 + ' ' + (-r * 0.12) + ' ' + r * 0.32 +
      ' q' + (-r * 0.2) + ' ' + (-r * 0.02) + ' ' + (-r * 0.22) + ' ' + (-r * 0.26) + ' q' + (-r * 0.08) + ' ' + (-r * 0.22) + ' ' + r * 0.04 + ' ' + (-r * 0.4) + ' Z',
      fill: ink }, map);
    for (var i = 0; i < 6; i++) {
      var ly = (-0.5 + i * 0.2) * r, lx = Math.sqrt(Math.max(0, Math.pow(starR * r, 2) - ly * ly));
      el('line', { x1: r * 0.08, y1: ly, x2: lx, y2: ly, stroke: ink, 'stroke-width': Math.max(1, r * 0.016) }, map);
    }
    for (var s = 0; s < 12; s++) {
      var t = (-58 + s * 116 / 11) * Math.PI / 180;
      el('polygon', { points: starPts(Math.cos(t) * starR * r, Math.sin(t) * starR * r, r * 0.06), fill: starInk, opacity: 0.75 }, g);
    }
    var euro = v >= 100, num = String(euro ? v / 100 : v), two = num.length > 1;
    var nx = m.core ? -r * 0.24 : -r * 0.3;
    text(num, { x: nx, y: r * (m.core ? 0.2 : 0.22), 'font-size': r * (m.core ? 0.7 : two ? 0.62 : 0.85), 'font-weight': 800, fill: ink }, g);
    text(euro ? 'EURO' : 'EURO CENT', { x: nx, y: r * (m.core ? 0.44 : 0.52), 'font-size': r * (euro ? 0.15 : 0.13), 'font-weight': 700, fill: ink }, g);
  }

  function archPath(l, rt, top, base) {
    var hw = (rt - l) / 2;
    return 'M' + l + ' ' + base + ' L' + l + ' ' + (top + hw) + ' A' + hw + ' ' + hw + ' 0 0 1 ' + rt + ' ' + (top + hw) + ' L' + rt + ' ' + base + ' Z';
  }
  // Elk biljet toont een bouwstijl: 5 klassiek, 10 romaans, 20 gotisch, 50 renaissance, 100 barok,
  // 200 ijzer en glas, 500 modern.
  function drawArch(style, cx, base, aw, ah, g) {
    var l = cx - aw / 2, rt = cx + aw / 2, top = base - ah, i;
    var win = { fill: 'rgba(255,255,255,0.3)', stroke: 'rgba(255,255,255,0.8)', 'stroke-width': 2 };
    var line = { stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 1.5, fill: 'none' };
    function att(o, extra) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in extra) r[k] = extra[k]; return r; }
    if (style === 'klassiek') {
      el('path', att(win, { d: 'M' + (l - 8) + ' ' + (top + ah * 0.22) + ' L' + cx + ' ' + top + ' L' + (rt + 8) + ' ' + (top + ah * 0.22) + ' Z' }), g);
      el('rect', att(win, { x: l - 6, y: top + ah * 0.24, width: aw + 12, height: ah * 0.08 }), g);
      for (i = 0; i < 4; i++) el('rect', att(win, { x: l + i * aw / 3 - 4, y: top + ah * 0.34, width: 8, height: ah * 0.6 }), g);
      el('rect', att(win, { x: l - 8, y: base - ah * 0.06, width: aw + 16, height: ah * 0.06 }), g);
    } else if (style === 'romaans') {
      el('path', att(win, { d: archPath(l, rt, top, base) }), g);
      el('path', att(win, { d: archPath(l + aw * 0.18, rt - aw * 0.18, top + aw * 0.18, base), fill: 'rgba(0,0,0,0.12)' }), g);
    } else if (style === 'gotisch') {
      el('path', att(win, { d: 'M' + l + ' ' + base + ' L' + l + ' ' + (top + ah * 0.4) + ' Q' + l + ' ' + (top + ah * 0.06) + ' ' + cx + ' ' + top +
        ' Q' + rt + ' ' + (top + ah * 0.06) + ' ' + rt + ' ' + (top + ah * 0.4) + ' L' + rt + ' ' + base + ' Z' }), g);
      el('line', att(line, { x1: cx, y1: top + ah * 0.36, x2: cx, y2: base }), g);
      el('circle', att(line, { cx: cx, cy: top + ah * 0.26, r: aw * 0.13 }), g);
    } else if (style === 'renaissance') {
      el('rect', att(win, { x: l - 8, y: top - 4, width: aw + 16, height: ah + 4, fill: 'rgba(255,255,255,0.15)' }), g);
      el('path', att(win, { d: archPath(l + aw * 0.1, rt - aw * 0.1, top + 8, base) }), g);
      el('circle', att(line, { cx: l + 2, cy: top + 10, r: 5 }), g);
      el('circle', att(line, { cx: rt - 2, cy: top + 10, r: 5 }), g);
    } else if (style === 'barok') {
      el('ellipse', att(win, { cx: cx, cy: top + ah * 0.12, rx: aw * 0.22, ry: ah * 0.1 }), g);
      el('path', att(win, { d: archPath(l, rt, top + ah * 0.28, base) }), g);
      el('path', att(line, { d: 'M' + (l - 10) + ' ' + (top + ah * 0.34) + ' q' + (-8) + ' ' + (-14) + ' ' + 6 + ' ' + (-20) }), g);
      el('path', att(line, { d: 'M' + (rt + 10) + ' ' + (top + ah * 0.34) + ' q' + 8 + ' ' + (-14) + ' ' + (-6) + ' ' + (-20) }), g);
    } else if (style === 'ijzer') {
      el('path', att(win, { d: archPath(l, rt, top, base) }), g);
      for (i = 1; i < 4; i++) el('line', att(line, { x1: l + i * aw / 4, y1: top + aw * 0.08, x2: l + i * aw / 4, y2: base }), g);
      for (i = 1; i < 4; i++) el('line', att(line, { x1: l, y1: top + aw / 2 + i * (ah - aw / 2) / 4, x2: rt, y2: top + aw / 2 + i * (ah - aw / 2) / 4 }), g);
    } else {
      el('rect', att(win, { x: l, y: top, width: aw, height: ah }), g);
      for (i = 1; i < 4; i++) el('line', att(line, { x1: l + i * aw / 4, y1: top, x2: l + i * aw / 4, y2: base }), g);
      for (i = 1; i < 5; i++) el('line', att(line, { x1: l, y1: top + i * ah / 5, x2: rt, y2: top + i * ah / 5 }), g);
    }
  }

  function drawNote(v, g) {
    var n = MONEY[v], s = size(v), w = s.w, h = s.h, x = -w / 2, y = -h / 2, val = String(v / 100), i;
    el('rect', { x: x + 3, y: y + 5, width: w, height: h, rx: 6, fill: 'rgba(24,33,47,0.25)' }, g);
    el('rect', { x: x, y: y, width: w, height: h, rx: 6, fill: 'url(#gn-' + v + ')', stroke: n.edge, 'stroke-width': 2 }, g);
    // fijne lijnen in de achtergrond
    for (i = 1; i < 4; i++) {
      el('path', { d: 'M' + x + ' ' + (y + h * (0.25 * i)) + ' q' + w * 0.2 + ' ' + (-h * 0.12) + ' ' + w * 0.4 + ' 0 t' + w * 0.4 + ' 0',
        fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 1.2 }, g);
    }
    drawArch(n.style, x + w * 0.52, y + h - h * 0.08, w * 0.26, h * 0.66, g);
    // zilveren hologramstrook
    var hx = x + w * 0.79, hw = w * 0.11;
    el('rect', { x: hx, y: y + 1, width: hw, height: h - 2, fill: 'url(#gholo)' }, g);
    el('ellipse', { cx: hx + hw / 2, cy: y + h * 0.42, rx: hw * 0.28, ry: h * 0.16, fill: 'none', stroke: '#8f99a8', 'stroke-width': 1.5 }, g);
    text(val, { x: hx + hw / 2, y: y + h * 0.82, 'font-size': h * 0.13, 'font-weight': 800, fill: '#7a8494' }, g);
    // Europese vlag
    var fw = w * 0.13, fh = fw * 0.67, fx = x + w * 0.05, fy = y + h * 0.09;
    el('rect', { x: fx, y: fy, width: fw, height: fh, fill: '#1f47a8' }, g);
    for (i = 0; i < 12; i++) {
      var t = i * Math.PI / 6;
      el('circle', { cx: fx + fw / 2 + Math.cos(t) * fh * 0.32, cy: fy + fh / 2 + Math.sin(t) * fh * 0.32, r: Math.max(0.8, fh * 0.05), fill: '#ffcc00' }, g);
    }
    text('EURO ΕΥΡΩ', { x: fx + fw + 8, y: fy + fh * 0.75, 'font-size': h * 0.1, 'font-weight': 700, fill: 'rgba(255,255,255,0.9)', 'text-anchor': 'start', 'letter-spacing': 1 }, g);
    text(val, { x: hx - 8, y: y + h * 0.27, 'font-size': h * 0.2, 'font-weight': 800, fill: '#ffffff', 'text-anchor': 'end', stroke: n.edge, 'stroke-width': 1 }, g);
    text(val, { x: x + w * 0.05, y: y + h * 0.88, 'font-size': h * 0.42, 'font-weight': 800, fill: '#ffffff', 'text-anchor': 'start', stroke: n.edge, 'stroke-width': 1.5 }, g);
  }

  // Tekent een munt of biljet gecentreerd rond (0, 0).
  function drawMoney(v, g) {
    if (MONEY[v].coin) drawCoin(v, g);
    else drawNote(v, g);
  }

  function pill(str, x, y, opts, parent) {
    var fs = opts.size || 44, w = str.length * fs * 0.56 + 44, h = fs * 1.45;
    var bx = opts.anchor === 'end' ? x - w : x;
    el('rect', { x: bx, y: y, width: w, height: h, rx: h / 2, fill: opts.fill }, parent);
    text(str, { x: bx + w / 2, y: y + h * 0.7, 'font-size': fs, 'font-weight': 800, fill: opts.ink || '#ffffff', 'class': opts.cls || '' }, parent);
    return bx + w;
  }

  var svg;
  function render() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    makeDefs();
    // bord
    el('rect', { x: BX, y: BY, width: BW, height: BH, rx: 22, fill: '#2f7d55', stroke: '#1f5e3e', 'stroke-width': 6 }, svg);
    el('rect', { x: BX + 10, y: BY + 10, width: BW - 20, height: BH - 20, rx: 16, fill: 'none', stroke: 'rgba(255,255,255,0.18)', 'stroke-width': 3 }, svg);
    // kassa
    var tray = el('g', { id: 'tray' }, svg);
    el('rect', { x: BX, y: TY, width: BW, height: TH, rx: 18, fill: '#e8ebf1', stroke: '#c9d0dc', 'stroke-width': 3 }, tray);
    text('kassa', { x: BX + 18, y: TY + 32, 'font-size': 24, 'font-weight': 700, fill: '#8a94a6', 'text-anchor': 'start' }, tray);
    // munten zo groot mogelijk (liefst echte grootte), de biljetten krijgen de rest van de plaats
    var list = denoms(), coins = 0, notes = 0, i, gap = 22, room = BW - 150 - gap * (list.length - 1);
    for (i = 0; i < list.length; i++) { if (MONEY[list[i]].coin) coins += size(list[i]).w; else notes += size(list[i]).w; }
    var cs = Math.min(1, (TH - 40) / size(200).w, room / (coins + notes * 0.4));
    var ns = notes ? Math.min(1, (TH - 30) / size(list[list.length - 1]).h, (room - coins * cs) / notes) : 1;
    var x = BX + 130 + Math.max(0, (room - coins * cs - notes * ns) / 2);
    for (i = 0; i < list.length; i++) {
      var s = size(list[i]), sc = MONEY[list[i]].coin ? cs : ns;
      var g = el('g', { 'class': 'piece', 'data-v': list[i], transform: 'translate(' + (x + s.w * sc / 2) + ',' + (TY + TH / 2 + 8) + ') scale(' + sc + ')' }, tray);
      drawMoney(list[i], g);
      x += s.w * sc + gap;
    }
    // stukken op het bord
    var board = el('g', { id: 'onBoard' }, svg);
    for (i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      var pg = el('g', { 'class': 'piece', 'data-id': it.id, transform: 'translate(' + it.x + ',' + it.y + ')' }, board);
      drawMoney(it.v, pg);
    }
    renderBand();
    renderControls();
    api.total = total();
  }

  // Strook boven het bord: opdracht en totaal.
  function renderBand() {
    var band = el('g', { id: 'band' }, svg);
    if (state.mode === 'bedrag' && state.target) {
      pill('Leg ' + fmt(state.target), BX, 14, { fill: '#1f5fbf', cls: 'goal' }, band);
    } else if (state.mode === 'wissel' && state.paid > state.price) {
      var x = pill('Prijs ' + fmt(state.price), BX, 14, { fill: '#c2410c', cls: 'goal' }, band);
      text('betaald:', { x: x + 22, y: 78, 'font-size': 34, 'font-weight': 600, fill: '#475467', 'text-anchor': 'start' }, band);
      x += 180;
      var paid = greedy(state.paid, ALL) || [];
      for (var i = 0; i < paid.length; i++) {
        var s = size(paid[i]), sc = Math.min(0.62, 84 / s.h);
        el('g', { transform: 'translate(' + (x + s.w * sc / 2) + ',56) scale(' + sc + ')' }, band);
        drawMoney(paid[i], band.lastChild);
        x += s.w * sc + 10;
      }
      text('terug: ' + (state.revealed ? fmt(state.paid - state.price) : '?'), { x: x + 18, y: 78, 'font-size': 40, 'font-weight': 800,
        fill: '#18212f', 'text-anchor': 'start', 'class': 'change' }, band);
    }
    if (state.showTotal) {
      pill('Op het bord: ' + fmt(total()), BX + BW, 14, { fill: '#18212f', anchor: 'end', cls: 'total', size: 40 }, band);
    }
  }

  // De SVG krijgt dezelfde verhouding als de ruimte in de widget, zodat het bord die helemaal vult.
  function layout() {
    var box = svg.parentNode, w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    var nw = Math.max(1500, Math.min(3200, Math.round(1000 * w / h)));
    if (nw === W && svg.getAttribute('viewBox')) return;
    W = nw;
    BW = W - 40;
    svg.setAttribute('viewBox', '0 0 ' + W + ' 1000');
    for (var i = 0; i < state.items.length; i++) clampItem(state.items[i]);
    render();
  }

  function show(id, on) { document.getElementById(id).style.display = on ? '' : 'none'; }
  function renderControls(force) {
    var b = document.getElementById('modeSeg').getElementsByTagName('button'), i;
    for (i = 0; i < b.length; i++) b[i].className = b[i].getAttribute('data-mode') === state.mode ? 'on' : '';
    b = document.getElementById('levelSeg').getElementsByTagName('button');
    for (i = 0; i < b.length; i++) b[i].className = b[i].getAttribute('data-level') === state.level ? 'on' : '';
    var t = document.getElementById('btnTotal');
    t.className = 'btn small' + (state.showTotal ? ' on' : '');
    t.textContent = 'Totaal';
    t.title = state.showTotal ? 'Het totaal verbergen' : 'Het totaal op het bord tonen';
    var task = state.mode !== 'vrij';
    show('taskBedrag', state.mode === 'bedrag');
    show('taskWissel', state.mode === 'wissel');
    show('btnNew', task); show('btnFewest', task); show('btnCheck', task); show('btnSolve', task);
    var f = document.getElementById('btnFewest');
    f.className = 'btn' + (state.fewest ? ' on' : '');
    setInput('inAmount', state.target, force);
    setInput('inPrice', state.price, force);
    setInput('inPaid', state.paid, force);
  }
  function setInput(id, c, force) {
    var n = document.getElementById(id);
    if (force || document.activeElement !== n) n.value = c ? plain(c, state.level === 'centen') : '';
  }

  // ---------- Meldingen ----------
  function say(str, kind) {
    var m = document.getElementById('msg');
    m.textContent = str;
    m.className = 'msg ' + kind;
    api.msg = str;
  }
  function hush() { document.getElementById('msg').className = 'msg hidden'; api.msg = ''; }

  // ---------- Plaatsen en ordenen ----------
  function clampItem(it) {
    var s = size(it.v);
    it.x = Math.max(BX + s.w / 2 + 4, Math.min(BX + BW - s.w / 2 - 4, it.x));
    it.y = Math.max(BY + s.h / 2 + 4, Math.min(BY + BH - s.h / 2 - 4, it.y));
  }
  function free(x, y, s, skip) {
    for (var i = 0; i < state.items.length; i++) {
      var o = state.items[i];
      if (o === skip) continue;
      var t = size(o.v);
      if (Math.abs(o.x - x) < (s.w + t.w) / 2 + MARGIN && Math.abs(o.y - y) < (s.h + t.h) / 2 + MARGIN) return false;
    }
    return true;
  }
  function findSpot(it) {
    var s = size(it.v);
    for (var y = BY + 16 + s.h / 2; y <= BY + BH - 16 - s.h / 2; y += 14) {
      for (var x = BX + 16 + s.w / 2; x <= BX + BW - 16 - s.w / 2; x += 14) {
        if (free(x, y, s, it)) { it.x = x; it.y = y; return; }
      }
    }
    it.x = BX + 40 + Math.random() * (BW - 80);
    it.y = BY + 40 + Math.random() * (BH - 80);
    clampItem(it);
  }
  // Van groot naar klein, gelijke stukken naast elkaar; schuiven ze over elkaar als het bord te vol is.
  function sortLayout() {
    state.items.sort(function (a, b) { return b.v - a.v; });
    var factors = [1, 0.7, 0.5, 0.36, 0.26];
    for (var f = 0; f < factors.length; f++) {
      var left = BX + 24, top = BY + 24, rowH = 0, prev = null, prevW = 0, ok = true;
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i], s = size(it.v);
        if (prev !== null) left += prev === it.v ? prevW * factors[f] + 4 : prevW + 26;
        if (left + s.w > BX + BW - 24) { top += rowH + 18; left = BX + 24; rowH = 0; }
        it.x = left + s.w / 2;
        it.y = top + s.h / 2;
        prev = it.v;
        prevW = s.w;
        if (s.h > rowH) rowH = s.h;
        if (top + s.h > BY + BH - 16) ok = false;
      }
      if (ok) return;
    }
    for (var j = 0; j < state.items.length; j++) clampItem(state.items[j]);
  }

  // ---------- Bord veranderen ----------
  function changed() { save(); render(); }
  function addPiece(v) {
    if (state.items.length >= MAX_ITEMS) { say('Het bord is vol.', 'info'); return null; }
    var it = { id: nextId++, v: v, x: 0, y: 0 };
    state.items.push(it);
    return it;
  }
  function itemById(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }
  function removeItem(it) { var i = state.items.indexOf(it); if (i >= 0) state.items.splice(i, 1); }

  // ---------- Slepen (muis en aanraken) ----------
  var drag = null;
  function svgPoint(cx, cy) {
    var p = svg.createSVGPoint();
    p.x = cx; p.y = cy;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function pieceOf(n) {
    while (n && n.getAttribute && n.getAttribute('data-id') === null && n.getAttribute('data-v') === null) n = n.parentNode;
    return n && n.getAttribute ? n : null;
  }
  function startDrag(e, cx, cy) {
    var n = pieceOf(e.target);
    if (!n) return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation(); // niet de hele widget verslepen
    var p = svgPoint(cx, cy), it;
    if (n.getAttribute('data-v') !== null) {
      it = addPiece(+n.getAttribute('data-v'));
      if (!it) return;
      it.x = p.x; it.y = p.y;
      drag = { it: it, fromTray: true, cx: cx, cy: cy, dx: 0, dy: 0, moved: false };
    } else {
      it = itemById(+n.getAttribute('data-id'));
      if (!it) return;
      removeItem(it); state.items.push(it); // bovenaan leggen
      drag = { it: it, fromTray: false, cx: cx, cy: cy, dx: it.x - p.x, dy: it.y - p.y, moved: false };
    }
    hush();
    render();
    var g = svg.querySelector('[data-id="' + it.id + '"]');
    if (g) g.setAttribute('class', 'piece dragging');
  }
  function moveDrag(cx, cy) {
    if (!drag) return;
    if (Math.abs(cx - drag.cx) + Math.abs(cy - drag.cy) > 8) drag.moved = true;
    var p = svgPoint(cx, cy);
    drag.it.x = p.x + drag.dx;
    drag.it.y = p.y + drag.dy;
    var g = svg.querySelector('[data-id="' + drag.it.id + '"]');
    if (g) g.setAttribute('transform', 'translate(' + drag.it.x + ',' + drag.it.y + ')');
  }
  function endDrag() {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.moved) {
      if (d.fromTray) findSpot(d.it);    // klik in de kassa: op een vrije plek leggen
      else removeItem(d.it);             // klik op het bord: wegnemen
    } else if (d.it.y > BY + BH) {
      removeItem(d.it);                  // teruggesleept naar de kassa
    } else {
      clampItem(d.it);
    }
    changed();
  }

  // ---------- Opdrachten ----------
  function check() {
    var want = goal(), have = total(), n = state.items.length;
    if (want <= 0) { say('Kies eerst een bedrag.', 'info'); return; }
    var best = greedy(want);
    if (have < want) { say('Nog niet: er ligt te weinig.', 'bad'); return; }
    if (have > want) { say('Nog niet: er ligt te veel.', 'bad'); return; }
    var word = state.mode === 'wissel' ? 'Juist! Je geeft ' + fmt(want) + ' terug' : 'Juist! ' + fmt(want);
    if (best && n > best.length) {
      if (state.fewest) { say('Het bedrag klopt, maar het kan met minder: probeer het met ' + stuks(best.length) + '.', 'bad'); return; }
      say(word + ' met ' + stuks(n) + '. Kan het met minder?', 'ok');
    } else {
      say(word + ' met ' + stuks(n) + (n > 1 ? ': zo weinig mogelijk!' : '.'), 'ok');
    }
    if (state.mode === 'wissel') { state.revealed = true; render(); }
  }
  function solve() {
    var want = goal();
    var best = want > 0 ? greedy(want) : null;
    if (!best) { say(want > 0 ? 'Dit bedrag kan niet met dit geld. Kies "met centen".' : 'Kies eerst een bedrag.', 'info'); return; }
    state.items = [];
    for (var i = 0; i < best.length; i++) addPiece(best[i]);
    sortLayout();
    state.revealed = true;
    changed();
    say('Zo kan het met zo weinig mogelijk: ' + stuks(best.length) + '.', 'info');
  }
  function applyInputs(id) {
    var n = document.getElementById(id), v = parseAmount(n.value);
    var key = id === 'inAmount' ? 'target' : id === 'inPrice' ? 'price' : 'paid';
    if (isNaN(v) || v <= 0 || v > MAX_AMOUNT) { say('Typ een bedrag, bijvoorbeeld 3,75.', 'info'); renderControls(true); return; }
    if (v % 100 && state.level !== 'centen') { say('Een bedrag met centen? Kies bovenaan "met centen".', 'info'); renderControls(true); return; }
    state[key] = v;
    state.revealed = false;
    hush();
    changed();
    if (state.mode === 'wissel' && state.paid <= state.price) say('Het betaalde bedrag moet groter zijn dan de prijs.', 'info');
  }

  // ---------- Gebeurtenissen ----------
  function on(id, fn, ev) { document.getElementById(id).addEventListener(ev || 'click', fn, false); }
  var api = { state: state, total: 0, msg: '', greedy: function (a) { return greedy(a); }, fmt: function (c) { return fmt(c); },
    parse: parseAmount, size: size, board: { x: BX, y: BY, w: BW, h: BH } };

  function init() {
    window.__geld = api;
    svg = document.getElementById('board');
    if (!state.target || !state.price || !state.paid) newTask();

    svg.addEventListener('mousedown', function (e) { if (e.button === 0) startDrag(e, e.clientX, e.clientY); }, false);
    document.addEventListener('mousemove', function (e) { if (drag) { e.preventDefault(); moveDrag(e.clientX, e.clientY); } }, false);
    document.addEventListener('mouseup', endDrag, false);
    // Aanraken: de browser stuurt alle vingerbewegingen naar het element dat eerst aangeraakt werd, ook als
    // dat ondertussen opnieuw getekend (en dus uit de pagina gehaald) is. Daarom luisteren we op dat element zelf.
    svg.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      startDrag(e, e.touches[0].clientX, e.touches[0].clientY);
      if (!drag) return;
      var tgt = e.target;
      function move(ev) { if (drag && ev.touches.length) { ev.preventDefault(); moveDrag(ev.touches[0].clientX, ev.touches[0].clientY); } }
      function up() {
        tgt.removeEventListener('touchmove', move, false);
        tgt.removeEventListener('touchend', up, false);
        tgt.removeEventListener('touchcancel', up, false);
        endDrag();
      }
      tgt.addEventListener('touchmove', move, false);
      tgt.addEventListener('touchend', up, false);
      tgt.addEventListener('touchcancel', up, false);
    }, false);

    document.getElementById('modeSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-mode');
      if (v && v !== state.mode) { state.mode = v; state.revealed = false; hush(); changed(); }
    }, false);
    document.getElementById('levelSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-level');
      if (!v || v === state.level) return;
      state.level = v;
      // geld dat op dit niveau niet bestaat, gaat van het bord
      var keep = [];
      for (var i = 0; i < state.items.length; i++) if (LEVELS[v].indexOf(state.items[i].v) >= 0) keep.push(state.items[i]);
      state.items = keep;
      newTask();
      hush();
      changed();
    }, false);
    on('btnTotal', function () { state.showTotal = !state.showTotal; changed(); });
    on('btnFewest', function () { state.fewest = !state.fewest; hush(); changed(); });
    on('btnNew', function () { newTask(); state.items = []; hush(); changed(); });
    on('btnCheck', check);
    on('btnSolve', solve);
    on('btnSort', function () { sortLayout(); hush(); changed(); });
    on('btnClear', function () { state.items = []; hush(); changed(); });
    on('msg', hush);
    var ins = ['inAmount', 'inPrice', 'inPaid'];
    for (var i = 0; i < ins.length; i++) {
      on(ins[i], function () { this.select(); }, 'focus');
      on(ins[i], function () { applyInputs(this.id); }, 'change');
      on(ins[i], function (e) { if (e.keyCode === 13) this.blur(); }, 'keydown');
    }
    on('btnTip', function () { document.getElementById('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { document.getElementById('overlayTip').className = 'overlay hidden'; });

    window.addEventListener('resize', layout, false);
    save();
    render();
    layout();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
