/* Splitsmachine – OpenBoard-widget
 * Bovenaan het getal (bolletjes in tienstructuur en/of cijfer), twee benen naar de twee delen.
 * Stap voor stap: bolletjes één voor één naar links of rechts (pijlen op de benen, of slepen).
 * Automatisch: de machine splitst ("Splits!") of toont de volgende splitsing op volgorde.
 * Het splitshuis toont alle splitsingen die al gemaakt zijn, op hun plaats.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var PALETTE = ['#d62828', '#1f5fbf', '#18212f', '#1f8a55', '#e67700', '#7b2cbf', '#d6336c', '#8b5a2b'];
  var DEF_KLEUR = '#d62828';
  var FONT = '"Segoe UI", Arial, sans-serif';

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: getal (te splitsen getal), tot ('10'|'20'), toon ('bol'|'beide'|'cijfer'),
  // wijze ('stap'|'auto'), links en rechts (aantal bolletjes in elk deel), verstopt (''|'l'|'r'),
  // huis ('0'|'1', splitshuis tonen), gezien (linkerdelen van gemaakte splitsingen, komma's),
  // kleur (#rrggbb), kleur2 (#rrggbb voor het rechterdeel, '' = zelfde kleur).
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
    try { var l = localStorage.getItem('splitsmachine.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('splitsmachine.' + k, String(v)); } catch (e) {}
  }
  function isColor(c) { return /^#[0-9a-f]{6}$/i.test(c); }
  function int(s, d) { var n = parseInt(s, 10); return isNaN(n) ? d : n; }

  var state = { n: 7, tot: 10, toon: 'bol', wijze: 'stap', a: 0, b: 0, verstopt: '', huis: false, gezien: {}, kleur: DEF_KLEUR, kleur2: '' };
  (function load() {
    state.tot = prefGet('tot', '10') === '20' ? 20 : 10;
    state.n = Math.max(1, Math.min(state.tot, int(prefGet('getal', '7'), 7)));
    var t = prefGet('toon', 'bol');
    state.toon = t === 'beide' || t === 'cijfer' ? t : 'bol';
    state.wijze = prefGet('wijze', 'stap') === 'auto' ? 'auto' : 'stap';
    state.a = Math.max(0, Math.min(state.n, int(prefGet('links', '0'), 0)));
    state.b = Math.max(0, Math.min(state.n - state.a, int(prefGet('rechts', '0'), 0)));
    var v = prefGet('verstopt', '');
    state.verstopt = v === 'l' || v === 'r' ? v : '';
    state.huis = prefGet('huis', '0') === '1';
    var g = prefGet('gezien', ''), list = g === '' ? [] : g.split(',');
    for (var i = 0; i < list.length; i++) {
      var x = int(list[i], -1);
      if (x >= 0 && x <= state.n) state.gezien[x] = true;
    }
    var k = prefGet('kleur', DEF_KLEUR), k2 = prefGet('kleur2', '');
    state.kleur = isColor(k) ? k : DEF_KLEUR;
    state.kleur2 = isColor(k2) ? k2 : '';
  })();

  function rest() { return state.n - state.a - state.b; }
  function save() {
    if (rest() === 0) state.gezien[state.a] = true;
    var g = [];
    for (var i = 0; i <= state.n; i++) if (state.gezien[i]) g.push(i);
    prefSet('getal', state.n);
    prefSet('tot', state.tot);
    prefSet('toon', state.toon);
    prefSet('wijze', state.wijze);
    prefSet('links', state.a);
    prefSet('rechts', state.b);
    prefSet('verstopt', state.verstopt);
    prefSet('huis', state.huis ? '1' : '0');
    prefSet('gezien', g.join(','));
    prefSet('kleur', state.kleur);
    prefSet('kleur2', state.kleur2);
  }

  // ---------- Hulpjes ----------
  function $(id) { return document.getElementById(id); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, s, size, attrs) {
    var t = el('text', { x: x, y: y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 700, 'font-family': FONT, fill: '#18212f' }, parent);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) t.setAttribute(k, attrs[k]);
    t.textContent = s;
    return t;
  }
  function colorOf(w) { return w === 'r' && state.kleur2 ? state.kleur2 : state.kleur; }

  // ---------- Afmetingen (viewBox W x 600; W volgt de verhouding van de widget) ----------
  var W = 1000, H = 600, HUIS_W = 240, PAD = 14;
  var geo = {}; // t, l, r: { x, y, w, h }, c: celgrootte, cols, mw
  function layout() {
    var st = $('stageIn'), w = st.clientWidth, h = st.clientHeight;
    W = h > 0 ? Math.round(Math.max(1000, Math.min(2000, H * w / h))) : 1000;
    $('board').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var mw = W - (state.huis ? HUIS_W : 0), cols = state.tot === 20 ? 10 : 5, ex = cols === 10 ? 0.4 : 0;
    var LEG = 90, NUM = 90, GAP = state.tot === 20 ? 60 : 100;
    var g = { mw: mw, cols: cols, ex: ex, leg: LEG };
    if (state.toon === 'cijfer') {
      var bw = 180, bh = 150, tot = bh + LEG + 30 + bh + NUM, y0 = (H - tot) / 2;
      g.t = { x: (mw - bw) / 2, y: y0, w: bw, h: bh };
      g.l = { x: mw / 2 - 210 - bw / 2, y: y0 + bh + LEG + 30, w: bw, h: bh };
      g.r = { x: mw / 2 + 210 - bw / 2, y: g.l.y, w: bw, h: bh };
    } else {
      var num = state.toon === 'beide' ? NUM : 70;
      var c = Math.min(76, (mw - GAP - 40 - 4 * PAD) / (2 * (cols + ex)), (H - 20 - LEG - num - 4 * PAD) / 4);
      var w2 = (cols + ex) * c + 2 * PAD, h2 = 2 * c + 2 * PAD, total = h2 + LEG + h2 + num, top = (H - total) / 2;
      g.c = c;
      g.t = { x: (mw - w2) / 2, y: top, w: w2, h: h2 };
      g.l = { x: mw / 2 - GAP / 2 - w2, y: top + h2 + LEG, w: w2, h: h2 };
      g.r = { x: mw / 2 + GAP / 2, y: g.l.y, w: w2, h: h2 };
    }
    geo = g;
  }
  function cellXY(box, i) {
    var c = geo.c, col = i % geo.cols, row = Math.floor(i / geo.cols);
    return { x: box.x + PAD + (col + (geo.cols === 10 && col >= 5 ? geo.ex : 0)) * c + c / 2, y: box.y + PAD + row * c + c / 2 };
  }

  // ---------- Tekenen ----------
  function drawBox(svg, box, role, w) {
    el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 18, fill: '#ffffff', stroke: '#b9c3d3', 'stroke-width': 3,
      'data-role': role, 'data-w': w }, svg);
  }
  // een vak met bolletjes: count gevulde, (bij de bovenkant) moved lege plaatsen met stippellijn
  function drawDots(svg, box, w, count, moved) {
    var c = geo.c, r = c * 0.38, i;
    for (i = 0; i < geo.cols * 2; i++) {
      var p = cellXY(box, i);
      if (i < count) {
        el('circle', { cx: p.x, cy: p.y, r: r, fill: colorOf(w), stroke: '#000000', 'stroke-opacity': 0.15, 'stroke-width': 1,
          'data-role': 'dot', 'data-w': w, 'data-i': i, cursor: 'pointer' }, svg);
      } else if (i < count + moved) {
        el('circle', { cx: p.x, cy: p.y, r: r - 2, fill: 'none', stroke: '#98a2b3', 'stroke-width': 2.5, 'stroke-dasharray': '6 5', 'pointer-events': 'none' }, svg);
      } else {
        el('circle', { cx: p.x, cy: p.y, r: r - 3, fill: '#f1f3f7', stroke: '#e1e5ec', 'stroke-width': 2, 'pointer-events': 'none' }, svg);
      }
    }
    // scheidingslijn tussen de twee rijen van vijf bij tot 20
    if (geo.cols === 10) {
      var mx = box.x + PAD + (5 + geo.ex / 2) * c;
      el('line', { x1: mx, y1: box.y + 10, x2: mx, y2: box.y + box.h - 10, stroke: '#d3d9e3', 'stroke-width': 2, 'pointer-events': 'none' }, svg);
    }
  }
  function cover(svg, box, w) {
    var g = el('g', { 'data-role': 'cover', 'data-w': w, cursor: 'pointer' }, svg);
    el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 18, fill: '#dfe4ec', stroke: '#b9c3d3', 'stroke-width': 3 }, g);
    text(g, box.x + box.w / 2, box.y + box.h / 2 + Math.min(box.h * 0.3, 40), '?', Math.min(box.h * 0.8, 110), { fill: '#667085' });
  }
  function pill(svg, cx, cy, label, act, w, on) {
    var bw = 118, bh = 46, g = el('g', { 'data-role': 'btn', 'data-act': act, 'data-w': w, cursor: 'pointer' }, svg);
    el('rect', { x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh, rx: 12, fill: on ? '#1f5fbf' : '#ffffff',
      stroke: on ? '#1f5fbf' : '#c9d1de', 'stroke-width': 2.5 }, g);
    text(g, cx, cy + 9, label, 25, { 'font-weight': 600, fill: on ? '#ffffff' : '#18212f' });
  }
  // pijl op een been: één bolletje naar dat deel
  function legButton(svg, x1, y1, x2, y2, w) {
    var cx = x1 + (x2 - x1) * 0.5, cy = y1 + (y2 - y1) * 0.5, ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI - 90;
    var g = el('g', { 'data-role': 'leg', 'data-w': w, cursor: 'pointer' }, svg);
    el('circle', { cx: cx, cy: cy, r: 34, fill: '#1f5fbf', stroke: '#ffffff', 'stroke-width': 4 }, g);
    el('path', { d: 'M -8 -18 L 8 -18 L 8 0 L 18 0 L 0 19 L -18 0 L -8 0 Z', fill: '#ffffff',
      transform: 'translate(' + cx + ',' + cy + ') rotate(' + ang + ')' }, g);
  }

  function render() {
    layout();
    var svg = $('board'), g = geo, R = rest(), parts = [['l', state.a], ['r', state.b]], i;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // benen
    var tx = g.t.x + g.t.w / 2, ty = g.t.y + g.t.h;
    var legs = [];
    for (i = 0; i < 2; i++) {
      var box = g[parts[i][0]];
      legs.push([tx, ty, box.x + box.w / 2, box.y]);
      el('line', { x1: tx, y1: ty, x2: box.x + box.w / 2, y2: box.y, stroke: '#18212f', 'stroke-width': 6, 'stroke-linecap': 'round' }, svg);
    }

    // boven: het getal
    drawBox(svg, g.t, 'zone', 't');
    if (state.toon === 'cijfer') {
      text(svg, tx, g.t.y + g.t.h / 2 + 38, String(state.n), 110, { 'class': 'num', 'data-w': 't', 'pointer-events': 'none' });
      if (R > 0) text(svg, g.t.x + g.t.w + 24, g.t.y + g.t.h / 2 + 12, 'nog ' + R, 34, { 'text-anchor': 'start', fill: '#667085', 'font-weight': 600 });
    } else {
      drawDots(svg, g.t, 't', R, state.n - R);
      if (state.toon === 'beide') text(svg, g.t.x + g.t.w + 24, g.t.y + g.t.h / 2 + 30, String(state.n), 90, { 'text-anchor': 'start', 'class': 'num', 'data-w': 't' });
    }

    // onder: de twee delen
    for (i = 0; i < 2; i++) {
      var w = parts[i][0], cnt = parts[i][1], b = g[w], hid = state.verstopt === w, cx = b.x + b.w / 2;
      drawBox(svg, b, 'zone', w);
      if (state.toon === 'cijfer') {
        if (!hid) text(svg, cx, b.y + b.h / 2 + 38, String(cnt), 110, { 'class': 'num', 'data-w': w, fill: colorOf(w) === state.kleur && !state.kleur2 ? '#18212f' : colorOf(w), 'pointer-events': 'none' });
      } else {
        drawDots(svg, b, w, cnt, 0);
      }
      if (hid) cover(svg, b, w);
      var by = b.y + b.h + 45;
      if (state.toon === 'beide') {
        text(svg, cx - 50, by + 30, hid ? '?' : String(cnt), 80, { 'class': 'num', 'data-w': w, fill: hid ? '#667085' : '#18212f' });
        pill(svg, cx + 80, by + 2, hid ? 'toon' : 'verstop', 'verstop', w, hid);
      } else {
        pill(svg, cx, by, hid ? 'toon' : 'verstop', 'verstop', w, hid);
      }
    }

    // pijlen op de benen (stap voor stap)
    if (state.wijze === 'stap' && R > 0) for (i = 0; i < 2; i++) legButton(svg, legs[i][0], legs[i][1], legs[i][2], legs[i][3], parts[i][0]);

    if (state.huis) drawHuis(svg);
    renderControls();
  }

  // splitshuis: dak met het getal, per rij een splitsing (links | rechts) op haar vaste plaats
  function drawHuis(svg) {
    var x = geo.mw + 10, w = HUIS_W - 24, roofTop = 16, roofH = 80, top = roofTop + roofH, bottom = H - 12;
    el('polygon', { points: (x - 6) + ',' + top + ' ' + (x + w / 2) + ',' + roofTop + ' ' + (x + w + 6) + ',' + top,
      fill: '#d62828', stroke: '#9b1c1c', 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);
    text(svg, x + w / 2, top - 14, String(state.n), 48, { fill: '#ffffff', 'class': 'huisgetal' });
    el('rect', { x: x, y: top, width: w, height: bottom - top, fill: '#ffffff', stroke: '#b9c3d3', 'stroke-width': 3 }, svg);
    el('line', { x1: x + w / 2, y1: top, x2: x + w / 2, y2: bottom, stroke: '#b9c3d3', 'stroke-width': 3 }, svg);
    var rows = state.n + 1, rh = (bottom - top) / rows, fs = Math.min(38, rh * 0.78);
    for (var a = 0; a <= state.n; a++) {
      var y = top + a * rh + rh / 2 + fs * 0.36;
      if (a) el('line', { x1: x, y1: top + a * rh, x2: x + w, y2: top + a * rh, stroke: '#eef1f5', 'stroke-width': 1.5 }, svg);
      if (!state.gezien[a]) continue;
      var nu = rest() === 0 && state.a === a, f = nu ? '#1f5fbf' : '#18212f';
      text(svg, x + w / 4, y, String(a), fs, { fill: f, 'class': 'rij', 'data-a': a });
      text(svg, x + 3 * w / 4, y, String(state.n - a), fs, { fill: f });
    }
  }

  function renderControls() {
    var segs = [['toonSeg', 'data-toon', state.toon], ['totSeg', 'data-tot', String(state.tot)], ['wijzeSeg', 'data-wijze', state.wijze]];
    for (var s = 0; s < segs.length; s++) {
      var b = $(segs[s][0]).getElementsByTagName('button');
      for (var i = 0; i < b.length; i++) b[i].className = b[i].getAttribute(segs[s][1]) === segs[s][2] ? 'on' : '';
    }
    $('getalVal').textContent = state.n;
    $('btnMin').disabled = state.n <= 1;
    $('btnPlus').disabled = state.n >= state.tot;
    $('btnHuis').className = 'btn small' + (state.huis ? ' on' : '');
    $('btnSplit').style.display = state.wijze === 'auto' ? '' : 'none';
    $('btnNext').style.display = state.wijze === 'auto' ? '' : 'none';
  }

  // ---------- Acties ----------
  var anim = null;
  function stopAnim() { if (anim) { clearInterval(anim); anim = null; } }
  function change() { save(); render(); }
  // één bolletje van 'van' naar 'naar' (t = boven, l = links, r = rechts)
  function verplaats(van, naar) {
    if (van === naar) return false;
    var n = { t: rest(), l: state.a, r: state.b };
    if (!n[van]) return false;
    if (van === 'l') state.a--; else if (van === 'r') state.b--;
    if (naar === 'l') state.a++; else if (naar === 'r') state.b++;
    return true;
  }
  function setGetal(n) {
    stopAnim();
    n = Math.max(1, Math.min(state.tot, n));
    if (n !== state.n) state.gezien = {};
    state.n = n; state.a = 0; state.b = 0;
    change();
  }
  function opnieuw() { stopAnim(); state.a = 0; state.b = 0; change(); }
  // de machine splitst: bij voorkeur een splitsing die nog niet in het splitshuis staat
  function splits() {
    stopAnim();
    var keuze = [], a;
    for (a = 0; a <= state.n; a++) if (!state.gezien[a]) keuze.push(a);
    if (!keuze.length) for (a = 0; a <= state.n; a++) if (a !== state.a || rest() > 0) keuze.push(a);
    if (!keuze.length) keuze.push(0);
    var doel = keuze[Math.floor(Math.random() * keuze.length)], seq = [], i;
    for (i = 0; i < state.n; i++) seq.push(i < doel ? 'l' : 'r');
    for (i = seq.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = seq[i]; seq[i] = seq[j]; seq[j] = x; }
    state.a = 0; state.b = 0;
    change();
    if (api.snel) { state.a = doel; state.b = state.n - doel; change(); return; }
    anim = setInterval(function () {
      if (!seq.length) { stopAnim(); return; }
      verplaats('t', seq.shift());
      change();
      if (!seq.length) stopAnim();
    }, state.n > 10 ? 160 : 260);
  }
  function volgende() {
    stopAnim();
    var a = rest() === 0 ? (state.a + 1) % (state.n + 1) : 0;
    state.a = a; state.b = state.n - a;
    change();
  }

  // ---------- Muis en vinger: tikken en slepen ----------
  function svgPoint(cx, cy) {
    var svg = $('board'), p = svg.createSVGPoint();
    p.x = cx; p.y = cy;
    var m = svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : p;
  }
  function roleOf(n) {
    var svg = $('board');
    while (n && n !== svg) {
      if (n.getAttribute && n.getAttribute('data-role')) return n;
      n = n.parentNode;
    }
    return null;
  }
  function zoneAt(p) {
    var ws = ['t', 'l', 'r'];
    for (var i = 0; i < ws.length; i++) {
      var b = geo[ws[i]];
      if (p.x >= b.x - 30 && p.x <= b.x + b.w + 30 && p.y >= b.y - 30 && p.y <= b.y + b.h + 30) return ws[i];
    }
    return '';
  }

  var press = null;
  function down(target, cx, cy) {
    var n = roleOf(target);
    if (!n) return false;
    stopAnim();
    press = { n: n, role: n.getAttribute('data-role'), w: n.getAttribute('data-w'), cx: cx, cy: cy, drag: false, ghost: null };
    return true;
  }
  function move(cx, cy) {
    if (!press || press.role !== 'dot') return;
    if (!press.drag) {
      if (Math.abs(cx - press.cx) + Math.abs(cy - press.cy) < 12) return;
      press.drag = true;
      press.n.setAttribute('opacity', 0.3);
      press.ghost = el('circle', { r: geo.c * 0.42, fill: colorOf(press.w), opacity: 0.85, 'pointer-events': 'none' }, $('board'));
    }
    var p = svgPoint(cx, cy);
    press.ghost.setAttribute('cx', p.x);
    press.ghost.setAttribute('cy', p.y);
  }
  function up(cx, cy) {
    var pr = press;
    press = null;
    if (!pr) return;
    if (pr.drag) {
      var naar = zoneAt(svgPoint(cx, cy));
      // een bolletje van boven naar het rechterdeel kan ook met kleur2: kleur volgt het deel
      if (naar) verplaats(pr.w, naar);
      change();
      return;
    }
    if (pr.role === 'dot') {
      if (pr.w !== 't' && verplaats(pr.w, 't')) change();
    } else if (pr.role === 'leg') {
      if (verplaats('t', pr.w)) change();
    } else if (pr.role === 'cover') {
      state.verstopt = ''; change();
    } else if (pr.role === 'btn') {
      state.verstopt = state.verstopt === pr.w ? '' : pr.w; change();
    }
  }
  function bindPointer() {
    var svg = $('board');
    svg.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || !down(e.target, e.clientX, e.clientY)) return;
      e.preventDefault();
      function mv(ev) { move(ev.clientX, ev.clientY); }
      function u(ev) { document.removeEventListener('mousemove', mv, false); document.removeEventListener('mouseup', u, false); up(ev.clientX, ev.clientY); }
      document.addEventListener('mousemove', mv, false);
      document.addEventListener('mouseup', u, false);
    }, false);
    // Vinger: luisteren op het aangeraakte element zelf (zie docs/OPENBOARD.md).
    svg.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || !down(e.target, e.touches[0].clientX, e.touches[0].clientY)) return;
      e.preventDefault();
      var tgt = e.target, last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      function mv(ev) { if (ev.touches.length) { ev.preventDefault(); last.x = ev.touches[0].clientX; last.y = ev.touches[0].clientY; move(last.x, last.y); } }
      function u() {
        tgt.removeEventListener('touchmove', mv, false); tgt.removeEventListener('touchend', u, false); tgt.removeEventListener('touchcancel', u, false);
        up(last.x, last.y);
      }
      tgt.addEventListener('touchmove', mv, false);
      tgt.addEventListener('touchend', u, false);
      tgt.addEventListener('touchcancel', u, false);
    }, false);
  }

  // ---------- Kleuren ----------
  function buildColors() {
    function pal(id, cur, zelfde) {
      var box = $(id), b;
      box.innerHTML = '';
      if (zelfde) {
        b = document.createElement('button');
        b.className = 'kleur zelfde' + (cur === '' ? ' on' : '');
        b.setAttribute('data-c', '-');
        b.textContent = 'zelfde';
        box.appendChild(b);
      }
      for (var i = 0; i < PALETTE.length; i++) {
        b = document.createElement('button');
        b.className = 'kleur' + (PALETTE[i] === cur ? ' on' : '');
        b.style.background = PALETTE[i];
        b.setAttribute('data-c', PALETTE[i]);
        b.setAttribute('aria-label', 'kleur ' + PALETTE[i]);
        box.appendChild(b);
      }
    }
    pal('palA', state.kleur, false);
    pal('palB', state.kleur2, true);
    var s = $('colorSample');
    s.innerHTML = '';
    var w = ['l', 'l', 'l', '', 'r', 'r', 'r', 'r'];
    for (var i = 0; i < w.length; i++) {
      var sp = document.createElement('span');
      if (w[i]) sp.style.background = colorOf(w[i]); else sp.className = 'tus';
      s.appendChild(sp);
    }
  }

  function on(id, fn) { $(id).addEventListener('click', fn, false); }
  function show(id, yes) { $(id).className = 'overlay' + (yes ? '' : ' hidden'); }
  function segClick(id, attr, fn) {
    $(id).addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute(attr);
      if (v) fn(v);
    }, false);
  }
  var api = { state: state, render: render, geo: function () { return geo; }, snel: false,
    splits: splits, volgende: volgende, bezig: function () { return !!anim; } };
  function init() {
    window.__splitsmachine = api;
    bindPointer();
    on('btnMin', function () { setGetal(state.n - 1); });
    on('btnPlus', function () { setGetal(state.n + 1); });
    on('btnDice', function () {
      var n = state.n;
      if (state.tot > 2) while (n === state.n) n = 2 + Math.floor(Math.random() * (state.tot - 1));
      setGetal(n);
    });
    on('btnReset', opnieuw);
    on('btnSplit', splits);
    on('btnNext', volgende);
    on('btnHuis', function () { state.huis = !state.huis; change(); });
    segClick('toonSeg', 'data-toon', function (v) { state.toon = v; change(); });
    segClick('wijzeSeg', 'data-wijze', function (v) { stopAnim(); state.wijze = v; change(); });
    segClick('totSeg', 'data-tot', function (v) {
      state.tot = v === '20' ? 20 : 10;
      if (state.n > state.tot) setGetal(state.tot); else change();
    });
    on('btnColors', function () { buildColors(); show('overlayColors', true); });
    on('btnColorsClose', function () { show('overlayColors', false); });
    on('btnColorsReset', function () { state.kleur = DEF_KLEUR; state.kleur2 = ''; change(); buildColors(); });
    function pick(which) {
      return function (e) {
        var c = e.target.getAttribute && e.target.getAttribute('data-c');
        if (!c) return;
        if (which === 'a') state.kleur = c; else state.kleur2 = c === '-' ? '' : c;
        change(); buildColors();
      };
    }
    $('palA').addEventListener('click', pick('a'), false);
    $('palB').addEventListener('click', pick('b'), false);
    on('btnTip', function () { show('overlayTip', true); });
    on('btnTipClose', function () { show('overlayTip', false); });
    window.addEventListener('resize', render, false);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
