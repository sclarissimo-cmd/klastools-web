/* Letterbord – OpenBoard-widget voor aanvankelijk lezen
 * Klanken uit de letterkast (onderaan) samen leggen tot woorden (bovenaan). Eén kaartje = één klank
 * (oo, ie, sch ... liggen samen op één kaartje). Hakken (uit elkaar) en plakken (aan elkaar).
 * Onder elk woord: het woord in Vlaams handschrift (Playwrite België Vlaams), drukletters met
 * schoolletter a en g (KT Druk = verkleinde Andika) of getypt. Alle lettertypes zitten in de widget.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var GROUPS = [
    { id: 'kort', naam: 'Korte klinkers', klinker: true, k: ['a', 'e', 'i', 'o', 'u'] },
    { id: 'lang', naam: 'Lange klinkers', klinker: true, k: ['aa', 'ee', 'oo', 'uu'] },
    { id: 'twee', naam: 'Tweeklanken en andere klinkers', klinker: true, k: ['ie', 'oe', 'eu', 'ui', 'ei', 'ij', 'ou', 'au'] },
    { id: 'mede', naam: 'Medeklinkers', klinker: false,
      k: ['m', 'r', 's', 'v', 'n', 'p', 't', 'k', 'l', 'd', 'b', 'h', 'j', 'w', 'z', 'f', 'g', 'c', 'q', 'x', 'y'] },
    { id: 'samen', naam: 'Medeklinkers samen', klinker: false, k: ['ng', 'nk', 'ch', 'sch'] },
    { id: 'later', naam: 'Klankgroepen (later)', klinker: true, k: ['aai', 'ooi', 'oei', 'eeuw', 'ieuw', 'uw'] }
  ];
  var KLINKER = {}, ALL = [], DEFAULT_ON = [];
  (function () {
    for (var g = 0; g < GROUPS.length; g++) {
      for (var i = 0; i < GROUPS[g].k.length; i++) {
        var t = GROUPS[g].k[i];
        KLINKER[t] = GROUPS[g].klinker;
        ALL.push(t);
        if (GROUPS[g].id !== 'later') DEFAULT_ON.push(t);
      }
    }
  })();
  var PALETTE = ['#d62828', '#1f5fbf', '#18212f', '#1f8a55', '#e67700', '#7b2cbf', '#d6336c', '#8b5a2b'];
  var DEF_K = '#d62828', DEF_M = '#1f5fbf';
  var FONTS = { hand: '"KT Hand", "Segoe Script", cursive', handLijnen: '"KT Hand Lijnen", "KT Hand", cursive',
    druk: '"KT Druk", "Segoe UI", sans-serif', typ: 'Arial, "Helvetica Neue", Helvetica, sans-serif' };
  var MAX_LINES = 4;

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: woorden (woordlijnen gescheiden door |, kaartjes door komma's, bv. "r,oo,s|m,aa,n"),
  // gehakt en verborgen ('0'/'1' per woordlijn), actief (nummer van de gekozen woordlijn),
  // onder ('geen'|'hand'|'druk'|'typ'), lijnen ('0'|'1', schrijflijnen bij handschrift),
  // hoofd ('0'|'1', hoofdletters in de letterkast), letters (klanken in de letterkast, komma's),
  // kKlinker en kMede (kleur van klinkers en medeklinkers, #rrggbb).
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
    try { var l = localStorage.getItem('letterbord.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('letterbord.' + k, String(v)); } catch (e) {}
  }
  function isColor(c) { return /^#[0-9a-f]{6}$/i.test(c); }
  function validTile(t) { return KLINKER.hasOwnProperty(t.toLowerCase()); }

  var state = { lines: [], active: 0, under: 'hand', lijnen: false, caps: false, on: {}, kK: DEF_K, kM: DEF_M };
  (function load() {
    var w = prefGet('woorden', ''), hak = prefGet('gehakt', ''), hide = prefGet('verborgen', '');
    var parts = w === '' ? [''] : w.split('|');
    for (var i = 0; i < parts.length && i < MAX_LINES; i++) {
      var tiles = [], raw = parts[i] === '' ? [] : parts[i].split(',');
      for (var j = 0; j < raw.length; j++) if (validTile(raw[j])) tiles.push(raw[j]);
      state.lines.push({ t: tiles, hak: hak.charAt(i) === '1', hide: hide.charAt(i) === '1' });
    }
    var a = parseInt(prefGet('actief', '0'), 10);
    state.active = a >= 0 && a < state.lines.length ? a : 0;
    var u = prefGet('onder', 'hand');
    state.under = u === 'geen' || u === 'druk' || u === 'typ' ? u : 'hand';
    state.lijnen = prefGet('lijnen', '0') === '1';
    state.caps = prefGet('hoofd', '0') === '1';
    var on = prefGet('letters', ''), list = on === '' ? DEFAULT_ON : on.split(',');
    for (i = 0; i < list.length; i++) if (KLINKER.hasOwnProperty(list[i])) state.on[list[i]] = true;
    var k = prefGet('kKlinker', DEF_K), m = prefGet('kMede', DEF_M);
    state.kK = isColor(k) ? k : DEF_K;
    state.kM = isColor(m) ? m : DEF_M;
  })();

  function save() {
    var w = [], hak = '', hide = '';
    for (var i = 0; i < state.lines.length; i++) {
      w.push(state.lines[i].t.join(','));
      hak += state.lines[i].hak ? '1' : '0';
      hide += state.lines[i].hide ? '1' : '0';
    }
    prefSet('woorden', w.join('|'));
    prefSet('gehakt', hak);
    prefSet('verborgen', hide);
    prefSet('actief', state.active);
  }
  function saveSettings() {
    prefSet('onder', state.under);
    prefSet('lijnen', state.lijnen ? '1' : '0');
    prefSet('hoofd', state.caps ? '1' : '0');
    var on = [];
    for (var i = 0; i < ALL.length; i++) if (state.on[ALL[i]]) on.push(ALL[i]);
    prefSet('letters', on.join(','));
    prefSet('kKlinker', state.kK);
    prefSet('kMede', state.kM);
  }

  // ---------- Hulpjes ----------
  function $(id) { return document.getElementById(id); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function capOf(t) { return t === 'ij' ? 'IJ' : t.charAt(0).toUpperCase() + t.slice(1); }
  function colorOf(t) { return KLINKER[t.toLowerCase()] ? state.kK : state.kM; }
  function wordOf(line) { return line.t.join(''); }

  // ---------- Afmetingen (viewBox 1600 x 1000) ----------
  // De breedte W volgt de verhouding van de widget (zoals bij Geld), zodat het bord alles vult.
  var W = 1600, TILE_H = 110, LINES_TOP = 15, LINES_H = 560;
  var TRAY = { x: 20, y: 600, w: 1560, h: 385 };
  function layout() {
    var st = $('stageIn'), w = st.clientWidth, h = st.clientHeight;
    W = h > 0 ? Math.round(Math.max(1400, Math.min(2600, 1000 * w / h))) : 1600;
    TRAY.w = W - 40;
    $('board').setAttribute('viewBox', '0 0 ' + W + ' 1000');
  }
  function tileW(t) { return 52 + 40 * t.length; }
  var geo = []; // per woordlijn: { left, cw, top, h, s, x0, x1, xs: [x van elk kaartje], ws: [breedte] }
  // 1 of 2 woorden: onder elkaar over de volle breedte; 3 of 4: in twee kolommen (kaartjes blijven groot).
  function lineGeo(i) {
    var N = state.lines.length, cols = N >= 3 ? 2 : 1, rows = Math.ceil(N / cols);
    var cw = (W - 40) / cols, slotH = LINES_H / rows, line = state.lines[i];
    var col = i % cols, row = Math.floor(i / cols);
    var g = { left: 20 + col * cw, cw: cw, top: LINES_TOP + row * slotH, h: slotH, xs: [], ws: [] };
    g.x0 = g.left + 40;
    g.x1 = g.left + cw - 370;
    var s = Math.min(1, slotH / 255), gap = line.hak ? 30 : 3, total = 0, j;
    for (j = 0; j < line.t.length; j++) total += tileW(line.t[j]) + (j ? gap : 0);
    if (total * s > g.x1 - g.x0) s = (g.x1 - g.x0) / total;
    g.s = s;
    g.y = g.top + Math.max(8, (slotH - 245 * s) / 2 - 20 * s);
    var x = g.x0;
    for (j = 0; j < line.t.length; j++) {
      g.xs.push(x);
      g.ws.push(tileW(line.t[j]) * s);
      x += (tileW(line.t[j]) + gap) * s;
    }
    return g;
  }

  // ---------- Tekenen ----------
  function drawTile(parent, t, x, y, s, attrs) {
    var w = tileW(t), g = el('g', { transform: 'translate(' + x + ',' + y + ') scale(' + s + ')' }, parent);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) g.setAttribute(k, attrs[k]);
    el('rect', { x: 0, y: 0, width: w, height: TILE_H, rx: 14, fill: '#ffffff', stroke: '#b9c3d3', 'stroke-width': 3 }, g);
    el('rect', { x: 8, y: TILE_H - 12, width: w - 16, height: 5, rx: 2.5, fill: colorOf(t), opacity: 0.35 }, g);
    var tx = el('text', { x: w / 2, y: 79, 'text-anchor': 'middle', 'font-size': 76, 'font-weight': 700,
      'font-family': FONTS.druk, fill: colorOf(t) }, g);
    tx.textContent = t;
    return g;
  }
  function button(parent, x, y, w, h, label, act, li, on) {
    var g = el('g', { 'data-role': 'btn', 'data-act': act, 'data-l': li, cursor: 'pointer' }, parent);
    el('rect', { x: x, y: y, width: w, height: h, rx: 12, fill: on ? '#1f5fbf' : '#ffffff', stroke: on ? '#1f5fbf' : '#c9d1de', 'stroke-width': 2.5 }, g);
    var t = el('text', { x: x + w / 2, y: y + h / 2 + 9, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 600,
      'font-family': 'Segoe UI, Arial, sans-serif', fill: on ? '#ffffff' : '#18212f' }, g);
    t.textContent = label;
    return g;
  }

  var trayItems = []; // { t, x, y, k }
  function render() {
    layout();
    var svg = $('board');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    geo = [];
    var i, j;
    for (i = 0; i < state.lines.length; i++) {
      var line = state.lines[i], g = lineGeo(i), act = i === state.active;
      geo.push(g);
      el('rect', { x: g.left + (g.left > 20 ? 6 : 0), y: g.top + 4, width: g.cw - 6, height: g.h - 8, rx: 18,
        fill: act ? '#eaf2fb' : '#f8f9fb', stroke: act ? '#8fb6ea' : '#e3e7ee', 'stroke-width': act ? 3 : 2,
        'data-role': 'line', 'data-l': i }, svg);
      if (!line.t.length && act) {
        el('text', { x: g.x0 + 10, y: g.y + 70 * g.s, 'font-size': 30, fill: '#98a2b3', 'font-family': 'Segoe UI, Arial, sans-serif',
          'pointer-events': 'none' }, svg).textContent = 'Tik op letters of sleep ze hierheen';
      }
      for (j = 0; j < line.t.length; j++) {
        drawTile(svg, line.t[j], g.xs[j], g.y, g.s, { 'data-role': 'tile', 'data-l': i, 'data-i': j, cursor: 'pointer' });
      }
      // het woord onder de kaartjes
      if (state.under !== 'geen' && line.t.length && !line.hide) {
        var fam = state.under === 'hand' ? (state.lijnen ? FONTS.handLijnen : FONTS.hand) : FONTS[state.under];
        var size = (state.under === 'hand' ? 74 : 86) * g.s;
        var wt = el('text', { x: g.x0, y: g.y + (TILE_H + 95) * g.s, 'font-size': size, 'font-family': fam,
          fill: '#18212f', 'pointer-events': 'none', 'class': 'word' }, svg);
        wt.textContent = wordOf(line);
        try {
          if (wt.getComputedTextLength() > g.x1 - g.x0) {
            wt.setAttribute('textLength', g.x1 - g.x0);
            wt.setAttribute('lengthAdjust', 'spacingAndGlyphs');
          }
        } catch (e) {}
      }
      // knoppen per woordlijn
      var bh = Math.min(58, g.h * 0.42), by = g.y + TILE_H * g.s / 2 - bh / 2;
      if (by + bh > g.top + g.h - 6) by = g.top + g.h - 6 - bh;
      var R = g.left + g.cw;
      button(svg, R - 368, by, 132, bh, line.hak ? 'plakken' : 'hakken', 'hak', i, line.hak);
      if (state.under !== 'geen') button(svg, R - 226, by, 108, bh, line.hide ? 'toon' : 'verberg', 'hide', i, line.hide);
      button(svg, R - 108, by, 72, bh, '✕', 'wis', i, false);
    }
    renderTray(svg);
    renderControls();
  }

  function renderTray(svg) {
    el('rect', { x: TRAY.x, y: TRAY.y, width: TRAY.w, height: TRAY.h, rx: 18, fill: '#e9edf3', stroke: '#d3d9e3', 'stroke-width': 2 }, svg);
    var groups = [], g, i;
    for (g = 0; g < GROUPS.length; g++) {
      var list = [];
      for (i = 0; i < GROUPS[g].k.length; i++) if (state.on[GROUPS[g].k[i]]) list.push(state.caps ? capOf(GROUPS[g].k[i]) : GROUPS[g].k[i]);
      if (list.length) groups.push(list);
    }
    trayItems = [];
    if (!groups.length) {
      el('text', { x: TRAY.x + TRAY.w / 2, y: TRAY.y + TRAY.h / 2, 'text-anchor': 'middle', 'font-size': 34, fill: '#667085',
        'font-family': 'Segoe UI, Arial, sans-serif' }, svg).textContent = 'Kies bovenaan "Letters kiezen" om letters in de letterkast te leggen';
      return;
    }
    // letters doorlopend plaatsen, met wat extra ruimte tussen de groepen; kleiner maken tot alles past
    var k = 0.84, rows, items, innerW = TRAY.w - 40;
    for (var tries = 0; tries < 30; tries++) {
      items = []; rows = 1;
      var x = 0, rowH = (TILE_H + 14) * k;
      for (g = 0; g < groups.length; g++) {
        if (g && x > 0) x += 30 * k;
        // een groep niet beginnen met maar een paar letters achteraan een rij
        var fit = 0, xx = x;
        while (fit < groups[g].length && xx + tileW(groups[g][fit]) * k <= innerW) { xx += (tileW(groups[g][fit]) + 12) * k; fit++; }
        if (x > 0 && fit < Math.min(4, groups[g].length)) { rows++; x = 0; }
        for (i = 0; i < groups[g].length; i++) {
          var w = tileW(groups[g][i]) * k;
          if (x > 0 && x + w > innerW) { rows++; x = 0; }
          items.push({ t: groups[g][i], x: x, row: rows - 1, k: k });
          x += w + 12 * k;
        }
      }
      if (rows * rowH <= TRAY.h - 24) break;
      k *= 0.93;
    }
    var top = TRAY.y + (TRAY.h - rows * (TILE_H + 14) * k) / 2 + 7 * k;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      it.x += TRAY.x + 20;
      it.y = top + it.row * (TILE_H + 14) * k;
      drawTile(svg, it.t, it.x, it.y, k, { 'data-role': 'tray', 'data-t': it.t, cursor: 'pointer' });
      trayItems.push(it);
    }
  }

  function renderControls() {
    var b = $('underSeg').getElementsByTagName('button');
    for (var i = 0; i < b.length; i++) b[i].className = b[i].getAttribute('data-under') === state.under ? 'on' : '';
    $('btnLines').className = 'btn' + (state.lijnen ? ' on' : '');
    $('btnLines').style.display = state.under === 'hand' ? '' : 'none';
    $('btnCaps').className = 'btn small' + (state.caps ? ' on' : '');
    $('btnAdd').disabled = state.lines.length >= MAX_LINES;
    $('btnDel').disabled = state.lines.length <= 1;
  }

  // ---------- Acties ----------
  function addTile(t, li, idx) {
    var line = state.lines[li];
    if (idx === undefined || idx > line.t.length) idx = line.t.length;
    line.t.splice(idx, 0, t);
    state.active = li;
    save(); render();
  }
  function lineAction(act, li) {
    var line = state.lines[li];
    if (act === 'hak') line.hak = !line.hak;
    else if (act === 'hide') line.hide = !line.hide;
    else if (act === 'wis') { line.t = []; line.hak = false; }
    state.active = li;
    save(); render();
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
  function lineAt(p) {
    for (var i = 0; i < geo.length; i++) {
      var g = geo[i];
      if (p.x >= g.left && p.x < g.left + g.cw && p.y >= g.top && p.y < g.top + g.h) return i;
    }
    return -1;
  }
  function insertIndex(li, x, skip) {
    var g = geo[li], idx = 0;
    for (var j = 0; j < g.xs.length; j++) {
      if (j === skip) continue;
      if (x > g.xs[j] + g.ws[j] / 2) idx++;
    }
    return idx;
  }

  var press = null;
  function down(target, cx, cy) {
    var n = roleOf(target);
    if (!n) return false;
    press = { n: n, role: n.getAttribute('data-role'), cx: cx, cy: cy, drag: false, ghost: null };
    return true;
  }
  function startGhost() {
    var t, s;
    if (press.role === 'tray') {
      t = press.n.getAttribute('data-t');
      for (var i = 0; i < trayItems.length; i++) if (trayItems[i].t === t) s = trayItems[i].k;
    } else {
      var li = +press.n.getAttribute('data-l');
      t = state.lines[li].t[+press.n.getAttribute('data-i')];
      s = geo[li].s;
      press.n.setAttribute('opacity', 0.3);
    }
    press.t = t;
    press.s = s || 0.8;
    press.ghost = drawTile($('board'), t, 0, 0, press.s, { opacity: 0.9, 'pointer-events': 'none' });
  }
  function move(cx, cy) {
    if (!press) return;
    if (!press.drag) {
      if (press.role !== 'tray' && press.role !== 'tile') return;
      if (Math.abs(cx - press.cx) + Math.abs(cy - press.cy) < 12) return;
      press.drag = true;
      startGhost();
    }
    var p = svgPoint(cx, cy), w = tileW(press.t) * press.s, h = TILE_H * press.s;
    press.ghost.setAttribute('transform', 'translate(' + (p.x - w / 2) + ',' + (p.y - h / 2) + ') scale(' + press.s + ')');
  }
  function up(cx, cy) {
    var pr = press;
    press = null;
    if (!pr) return;
    var n = pr.n;
    if (pr.drag) {
      var p = svgPoint(cx, cy), li = lineAt(p);
      if (pr.role === 'tray') {
        if (li >= 0 && state.lines[li].t.length < 14) addTile(pr.t, li, insertIndex(li, p.x, -1));
        else render();
      } else {
        var from = +n.getAttribute('data-l'), fi = +n.getAttribute('data-i');
        var t = state.lines[from].t.splice(fi, 1)[0];
        if (li >= 0) {
          var idx = insertIndex(li, p.x, li === from ? fi : -1);
          state.lines[li].t.splice(idx, 0, t);
          state.active = li;
        }
        save(); render();
      }
      return;
    }
    // tikken
    var role = pr.role;
    if (role === 'tray') {
      if (state.lines[state.active].t.length < 14) addTile(n.getAttribute('data-t'), state.active);
    } else if (role === 'tile') {
      var l2 = +n.getAttribute('data-l');
      state.lines[l2].t.splice(+n.getAttribute('data-i'), 1);
      state.active = l2;
      save(); render();
    } else if (role === 'btn') {
      lineAction(n.getAttribute('data-act'), +n.getAttribute('data-l'));
    } else if (role === 'line') {
      state.active = +n.getAttribute('data-l');
      save(); render();
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
    // Vinger: luisteren op het aangeraakte element zelf, want dat blijft de bestemming van de
    // touch-gebeurtenissen, ook als het bord intussen opnieuw getekend wordt (zie docs/OPENBOARD.md).
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

  // ---------- Vensters: letters kiezen en kleuren ----------
  function buildLetters() {
    var box = $('letterGroups');
    box.innerHTML = '';
    for (var g = 0; g < GROUPS.length; g++) {
      var d = document.createElement('div'), h = document.createElement('h3');
      d.className = 'lgroep';
      h.appendChild(document.createTextNode(GROUPS[g].naam));
      var all = document.createElement('button'), none = document.createElement('button');
      all.textContent = 'alles'; all.setAttribute('data-groep', g); all.setAttribute('data-zet', '1');
      none.textContent = 'niets'; none.setAttribute('data-groep', g); none.setAttribute('data-zet', '0');
      h.appendChild(all); h.appendChild(none);
      d.appendChild(h);
      for (var i = 0; i < GROUPS[g].k.length; i++) {
        var t = GROUPS[g].k[i], b = document.createElement('button');
        b.className = 'kies' + (state.on[t] ? ' on' : '');
        b.setAttribute('data-k', t);
        b.style.color = state.on[t] ? colorOf(t) : '';
        b.textContent = t;
        d.appendChild(b);
      }
      box.appendChild(d);
    }
  }
  function buildColors() {
    function pal(id, cur) {
      var box = $(id);
      box.innerHTML = '';
      for (var i = 0; i < PALETTE.length; i++) {
        var b = document.createElement('button');
        b.className = 'kleur' + (PALETTE[i] === cur ? ' on' : '');
        b.style.background = PALETTE[i];
        b.setAttribute('data-c', PALETTE[i]);
        b.setAttribute('aria-label', 'kleur ' + PALETTE[i]);
        box.appendChild(b);
      }
    }
    pal('palK', state.kK);
    pal('palM', state.kM);
    var s = $('colorSample');
    s.innerHTML = '';
    var w = ['m', 'aa', 'n', ' ', 'r', 'oo', 's', ' ', 'v', 'i', 's'];
    for (var i = 0; i < w.length; i++) {
      var sp = document.createElement('span');
      sp.textContent = w[i] === ' ' ? '  ' : w[i];
      if (w[i] !== ' ') sp.style.color = colorOf(w[i]);
      s.appendChild(sp);
    }
  }

  function on(id, fn) { $(id).addEventListener('click', fn, false); }
  function show(id, yes) { $(id).className = 'overlay' + (yes ? '' : ' hidden'); }
  function init() {
    window.__letterbord = { state: state, render: render, geo: function () { return geo; }, tray: function () { return trayItems; }, add: addTile };
    bindPointer();
    on('btnAdd', function () {
      if (state.lines.length >= MAX_LINES) return;
      state.lines.push({ t: [], hak: false, hide: false });
      state.active = state.lines.length - 1;
      save(); render();
    });
    on('btnDel', function () {
      if (state.lines.length <= 1) return;
      state.lines.pop();
      if (state.active >= state.lines.length) state.active = state.lines.length - 1;
      save(); render();
    });
    on('btnClear', function () {
      for (var i = 0; i < state.lines.length; i++) { state.lines[i].t = []; state.lines[i].hak = false; state.lines[i].hide = false; }
      save(); render();
    });
    $('underSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-under');
      if (v) { state.under = v; saveSettings(); render(); }
    }, false);
    on('btnLines', function () { state.lijnen = !state.lijnen; saveSettings(); render(); });
    on('btnCaps', function () { state.caps = !state.caps; saveSettings(); render(); });
    on('btnLetters', function () { buildLetters(); show('overlayLetters', true); });
    on('btnLettersClose', function () { show('overlayLetters', false); });
    $('letterGroups').addEventListener('click', function (e) {
      var n = e.target, t = n.getAttribute && n.getAttribute('data-k'), g = n.getAttribute && n.getAttribute('data-groep');
      if (t) state.on[t] = !state.on[t];
      else if (g !== null && g !== undefined && g !== '') {
        for (var i = 0; i < GROUPS[+g].k.length; i++) state.on[GROUPS[+g].k[i]] = n.getAttribute('data-zet') === '1';
      } else return;
      saveSettings(); buildLetters(); render();
    }, false);
    on('btnColors', function () { buildColors(); show('overlayColors', true); });
    on('btnColorsClose', function () { show('overlayColors', false); });
    on('btnColorsReset', function () { state.kK = DEF_K; state.kM = DEF_M; saveSettings(); buildColors(); render(); });
    function pick(which) {
      return function (e) {
        var c = e.target.getAttribute && e.target.getAttribute('data-c');
        if (!c) return;
        if (which === 'k') state.kK = c; else state.kM = c;
        saveSettings(); buildColors(); render();
      };
    }
    $('palK').addEventListener('click', pick('k'), false);
    $('palM').addEventListener('click', pick('m'), false);
    on('btnTip', function () { show('overlayTip', true); });
    on('btnTipClose', function () { show('overlayTip', false); });
    window.addEventListener('resize', render, false);
    render();
    // opnieuw tekenen als de lettertypes geladen zijn (breedte van het woord)
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { render(); }, false);
    setTimeout(render, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
