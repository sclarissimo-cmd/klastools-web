/* Getalkaarten – OpenBoard-widget
 * Kaarten per plaatswaarde (E, T, H, D) uit de bak links naar het bord slepen. Vastklikken aan: kaarten die je
 * op elkaar legt, schuiven rechts tegen elkaar en vormen samen het getal (9000 + 800 + 40 + 5 = 9845).
 * Vastklikken uit: vrij slepen. Bovenaan (aan/uit) het getal om te leggen: willekeurig of zelf gekozen.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FONT = '"Segoe UI", Arial, sans-serif';
  // plaats 0 = E, 1 = T, 2 = H, 3 = D
  var LETTER = ['E', 'T', 'H', 'D'];
  var NAAM = ['eenheden', 'tientallen', 'honderdtallen', 'duizendtallen'];
  var KLEUR = ['#ffd43b', '#f25555', '#5fc95f', '#4b8ff0'];
  var RAND = ['#d9a400', '#c42d2d', '#2f9a3a', '#2463c4'];
  var INK = '#18212f';

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: tot ('100'|'1000'|'10000'), getal (het getal om te leggen), toon ('1'|'0': getal bovenaan),
  // magneet ('1'|'0': vastklikken), letters ('1'|'0': D H T E boven de kaarten),
  // stapels (JSON-lijst [{x: rechterrand, y: bovenkant, c: [kaartwaarden]}], in bordeenheden).
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
    try { var l = localStorage.getItem('getalkaarten.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('getalkaarten.' + k, String(v)); } catch (e) {}
  }
  function int(s, d) { var n = parseInt(s, 10); return isNaN(n) ? d : n; }

  // ---------- Kaarten ----------
  function pow(p) { return p === 0 ? 1 : p === 1 ? 10 : p === 2 ? 100 : 1000; }
  function plaats(v) { return v >= 1000 ? 3 : v >= 100 ? 2 : v >= 10 ? 1 : 0; }
  function geldig(v) { var p = plaats(v); return v >= 1 && v <= 9000 && v % pow(p) === 0; }
  function willekeurig() {
    var k = state.k, lo = k === 1 ? 1 : pow(k - 1), hi = maxGetal();
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  function maxGetal() { return pow(state.k - 1) * 10 - 1; }

  var state = { k: 4, getal: 9845, toon: true, magneet: true, letters: true, stapels: [] };
  (function load() {
    var t = prefGet('tot', '10000');
    state.k = t === '100' ? 2 : t === '1000' ? 3 : 4;
    state.getal = int(prefGet('getal', ''), 0);
    if (state.getal < 1 || state.getal > maxGetal()) state.getal = willekeurig();
    state.toon = prefGet('toon', '1') !== '0';
    state.magneet = prefGet('magneet', '1') !== '0';
    state.letters = prefGet('letters', '1') !== '0';
    var s = [];
    try { s = JSON.parse(prefGet('stapels', '[]')); } catch (e) { s = []; }
    if (!(s instanceof Array)) s = [];
    var gezien = {};
    for (var i = 0; i < s.length; i++) {
      var st = s[i];
      if (!st || !(st.c instanceof Array)) continue;
      var c = [], pl = {};
      for (var j = 0; j < st.c.length; j++) {
        var v = int(st.c[j], 0);
        if (geldig(v) && plaats(v) < state.k && !gezien[v] && !pl[plaats(v)]) { gezien[v] = true; pl[plaats(v)] = true; c.push(v); }
      }
      if (c.length) state.stapels.push({ x: +st.x || 0, y: +st.y || 0, c: sorteer(c) });
    }
  })();
  function sorteer(c) { return c.sort(function (a, b) { return b - a; }); }
  function bewaar() { prefSet('stapels', JSON.stringify(state.stapels)); }
  function opBord(v) {
    for (var i = 0; i < state.stapels.length; i++) if (state.stapels[i].c.indexOf(v) >= 0) return i;
    return -1;
  }
  function som(st) { var s = 0; for (var i = 0; i < st.c.length; i++) s += st.c[i]; return s; }

  // ---------- SVG ----------
  function $(id) { return document.getElementById(id); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function txt(parent, x, y, s, size, attrs) {
    var t = el('text', { x: x, y: y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 700, 'font-family': FONT, fill: INK }, parent);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) t.setAttribute(k, attrs[k]);
    t.textContent = s;
    return t;
  }

  // ---------- Afmetingen (viewBox W x 600; W volgt de verhouding van de widget) ----------
  var W = 1000, H = 600;
  var g = {};
  function layout() {
    var st = $('stageIn'), w = st.clientWidth, h = st.clientHeight;
    W = h > 0 ? Math.round(Math.max(900, Math.min(2000, H * w / h))) : 1000;
    $('board').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var k = state.k, tdw = 24, th = 48, gap = 12, colX = [], x = 22;
    for (var p = k - 1; p >= 0; p--) { colX[p] = x; x += (p + 1) * tdw + gap; }
    var TW = x - gap + 20;
    var bx0 = TW + 18, bx1 = W - 8;
    var dw = Math.min(90, (bx1 - bx0) / (k * 2), (H - 128 - 60) / 1.85 / 1.4);
    g = { tdw: tdw, th: th, colX: colX, TW: TW, bx0: bx0, bx1: bx1, dw: dw, ch: Math.round(dw * 1.85),
      rowY: function (d) { return 16 + (9 - d) * ((H - 32 - th) / 8); }, top: 128 };
  }
  function cardW(v, dw) { return (plaats(v) + 1) * dw; }
  // Kaart tekenen met linkerbovenhoek (x, y); dw = breedte van één cijfer, h = hoogte.
  function kaart(parent, v, x, y, dw, h, attrs) {
    var p = plaats(v), w = (p + 1) * dw, r = Math.round(h * 0.13), s = String(v);
    var gr = el('g', attrs || {}, parent);
    el('rect', { x: x + 1, y: y + Math.max(2, h * 0.05), width: w, height: h, rx: r, ry: r, fill: '#000000', 'fill-opacity': 0.16 }, gr);
    el('rect', { x: x, y: y, width: w, height: h, rx: r, ry: r, fill: KLEUR[p], stroke: RAND[p], 'stroke-width': Math.max(1.5, h * 0.03) }, gr);
    el('rect', { x: x + h * 0.06, y: y + h * 0.05, width: w - h * 0.12, height: h * 0.36, rx: r * 0.7, ry: r * 0.7, fill: '#ffffff', 'fill-opacity': 0.22 }, gr);
    var fs = Math.min(h * 0.66, dw * 1.45);
    for (var i = 0; i < s.length; i++) txt(gr, x + (i + 0.5) * dw, y + h * 0.5 + fs * 0.35, s.charAt(i), fs, {});
    return gr;
  }

  function render() {
    var svg = $('board');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var k = state.k, i, j;

    // bak links
    el('rect', { x: 8, y: 6, width: g.TW - 8, height: H - 12, rx: 18, ry: 18, fill: '#eef1f6', stroke: '#dde2ea', 'stroke-width': 1.5 }, svg);
    for (var p = k - 1; p >= 0; p--) {
      for (var d = 9; d >= 1; d--) {
        var v = d * pow(p), x = g.colX[p], y = g.rowY(d), w = (p + 1) * g.tdw;
        if (opBord(v) >= 0) {
          el('rect', { x: x, y: y, width: w, height: g.th, rx: 6, ry: 6, fill: 'none', stroke: '#c5ccd8', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
        } else {
          kaart(svg, v, x, y, g.tdw, g.th, { 'data-role': 'bak', 'data-v': v, style: 'cursor:pointer' });
        }
      }
    }

    // het getal bovenaan
    var mid = (g.bx0 + g.bx1) / 2, ok = false;
    for (i = 0; i < state.stapels.length; i++) if (som(state.stapels[i]) === state.getal) ok = true;
    if (state.toon) {
      var s = String(state.getal), bw = Math.max(240, s.length * 62 + 90);
      el('rect', { x: mid - bw / 2, y: 12, width: bw, height: 100, rx: 22, ry: 22, fill: ok ? '#e6f7ec' : '#ffffff',
        stroke: ok ? '#2f9e44' : '#d4dae4', 'stroke-width': ok ? 4 : 2, id: 'doel' }, svg);
      for (i = 0; i < s.length; i++) {
        var pl = s.length - 1 - i;
        txt(svg, mid - (s.length * 62) / 2 + (i + 0.5) * 62, 88, s.charAt(i), 82, { fill: state.letters ? RAND[pl] : INK, 'data-cijfer': pl });
      }
    }

    // stapels op het bord
    for (i = 0; i < state.stapels.length; i++) {
      var st = state.stapels[i], sw = cardW(st.c[0], g.dw), x0 = st.x - sw, juist = state.toon && som(st) === state.getal;
      var grp = el('g', { 'data-stapel': i }, svg);
      if (juist) el('rect', { x: x0 - 9, y: st.y - 9, width: sw + 18, height: g.ch + 18, rx: 18, ry: 18, fill: 'none', stroke: '#2f9e44', 'stroke-width': 5, 'class': 'juist' }, grp);
      if (state.letters) {
        for (j = 0; j <= plaats(st.c[0]); j++) {
          var q = plaats(st.c[0]) - j;
          txt(grp, x0 + (j + 0.5) * g.dw, st.y - 12, LETTER[q], 24, { fill: RAND[q] });
        }
      }
      for (j = 0; j < st.c.length; j++) {
        kaart(grp, st.c[j], st.x - cardW(st.c[j], g.dw), st.y, g.dw, g.ch, { 'data-role': 'kaart', 'data-v': st.c[j], 'data-s': i, style: 'cursor:move' });
      }
      if (st.c.length > 1) {
        var gw = Math.min(120, sw * 0.6), gx = st.x - sw / 2 - gw / 2, gy = st.y + g.ch + 12;
        var grip = el('g', { 'data-role': 'greep', 'data-s': i, style: 'cursor:move' }, grp);
        el('rect', { x: gx, y: gy, width: gw, height: 26, rx: 13, ry: 13, fill: '#dfe4ec' }, grip);
        for (var b = 0; b < 3; b++) for (var c = 0; c < 2; c++) el('circle', { cx: st.x - sw / 2 - 12 + b * 12, cy: gy + 8 + c * 10, r: 2.6, fill: '#7a8599' }, grip);
      }
    }

    // knoppen
    var segs = $('totSeg').getElementsByTagName('button');
    for (i = 0; i < segs.length; i++) segs[i].className = int(segs[i].getAttribute('data-k'), 0) === k ? 'on' : '';
    $('btnToon').className = 'btn small toggle' + (state.toon ? ' on' : '');
    $('btnMagneet').className = 'btn small toggle' + (state.magneet ? ' on' : '');
    $('btnLetters').className = 'btn small toggle' + (state.letters ? ' on' : '');
  }

  // ---------- Stapels aanpassen ----------
  function haalWeg(v) {
    var s = opBord(v);
    if (s < 0) return;
    var st = state.stapels[s];
    st.c.splice(st.c.indexOf(v), 1);
    if (!st.c.length) state.stapels.splice(s, 1);
  }
  function klem(st) {
    var sw = cardW(st.c[0], g.dw), top = g.top + (state.letters ? 6 : 0);
    st.x = Math.round(Math.max(g.bx0 + sw, Math.min(g.bx1 - 4, st.x)));
    st.y = Math.round(Math.max(top, Math.min(H - g.ch - 44, st.y)));
  }
  function naarVoor(st) {
    var i = state.stapels.indexOf(st);
    if (i >= 0 && i !== state.stapels.length - 1) { state.stapels.splice(i, 1); state.stapels.push(st); }
  }
  // Kaart v in stapel st leggen; een kaart met dezelfde plaatswaarde moet eruit (terug naar de bak of ernaast).
  function leg(st, v, ernaast) {
    for (var i = 0; i < st.c.length; i++) {
      if (plaats(st.c[i]) === plaats(v)) {
        var oud = st.c[i];
        st.c.splice(i, 1);
        if (ernaast) {
          var plek = vrijePlek(cardW(oud, g.dw), st);
          state.stapels.splice(state.stapels.indexOf(st), 0, { x: plek.x, y: plek.y, c: [oud] });
        }
        break;
      }
    }
    st.c.push(v);
    sorteer(st.c);
  }
  // Grootste overlap tussen het rechthoekje (x, y, w, h) en een stapel (behalve stapel 'niet').
  function overlap(x, y, w, h, niet) {
    var best = null, bestA = 0;
    for (var i = 0; i < state.stapels.length; i++) {
      var st = state.stapels[i];
      if (st === niet) continue;
      var sw = cardW(st.c[0], g.dw), sx = st.x - sw;
      var ox = Math.min(x + w, sx + sw) - Math.max(x, sx), oy = Math.min(y + h, st.y + g.ch) - Math.max(y, st.y);
      if (ox > 0 && oy > 0 && ox * oy > bestA) { bestA = ox * oy; best = st; }
    }
    return bestA >= 0.2 * w * h ? best : null;
  }
  // Een lege plek voor een kaart van breedte w, zo dicht mogelijk bij stapel 'bij' (rechterrand x, bovenkant y).
  function vrijePlek(w, bij) {
    var top = g.top + (state.letters ? 6 : 0), bodem = H - g.ch - 44, best = null, bestD = 0;
    for (var y = top; y <= bodem; y += 16) {
      for (var x = g.bx0 + w; x <= g.bx1 - 4; x += 16) {
        var vrij = true;
        for (var i = 0; i < state.stapels.length && vrij; i++) {
          var st = state.stapels[i], sw = cardW(st.c[0], g.dw);
          if (x + 16 > st.x - sw && x - w - 16 < st.x && y + g.ch + 40 > st.y - 30 && y - 30 < st.y + g.ch + 40) vrij = false;
        }
        if (!vrij) continue;
        var d = (x - bij.x) * (x - bij.x) + (y - bij.y) * (y - bij.y);
        if (!best || d < bestD) { best = { x: x, y: y }; bestD = d; }
      }
    }
    return best || { x: bij.x + 40, y: bodem };
  }
  function hoofdstapel() {
    if (state.stapels.length) return state.stapels[state.stapels.length - 1];
    var sw = state.k * g.dw;
    var st = { x: (g.bx0 + g.bx1) / 2 + sw / 2, y: Math.round((g.top + H - g.ch - 40) / 2), c: [] };
    state.stapels.push(st);
    return st;
  }
  function change() {
    for (var i = 0; i < state.stapels.length; i++) klem(state.stapels[i]);
    bewaar();
    render();
  }

  // ---------- Acties ----------
  function opnieuw() { state.stapels = []; change(); }
  function nieuwGetal(n) {
    state.getal = n;
    prefSet('getal', n);
    state.stapels = [];
    change();
  }
  function legGetal() {
    var s = String(state.getal), c = [];
    for (var i = 0; i < s.length; i++) {
      var d = int(s.charAt(i), 0), p = s.length - 1 - i;
      if (d) c.push(d * pow(p));
    }
    // de oplossing: alle kaarten terug in de bak, dan het getal in het midden leggen
    state.stapels = [];
    hoofdstapel().c = sorteer(c);
    change();
  }
  function setTot(k) {
    if (k === state.k) return;
    state.k = k;
    prefSet('tot', k === 2 ? '100' : k === 3 ? '1000' : '10000');
    for (var i = state.stapels.length - 1; i >= 0; i--) {
      var st = state.stapels[i], c = [];
      for (var j = 0; j < st.c.length; j++) if (plaats(st.c[j]) < k) c.push(st.c[j]);
      st.c = c;
      if (!c.length) state.stapels.splice(i, 1);
    }
    layout();
    if (state.getal > maxGetal() || String(state.getal).length < k) nieuwGetal(willekeurig());
    else change();
  }

  // ---------- Muis en vinger ----------
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

  var press = null;
  function down(target, cx, cy) {
    var n = roleOf(target);
    if (!n) return false;
    var role = n.getAttribute('data-role'), p = svgPoint(cx, cy);
    press = { n: n, role: role, v: int(n.getAttribute('data-v'), 0), s: int(n.getAttribute('data-s'), -1), cx: cx, cy: cy, p0: p, drag: false };
    return true;
  }
  function move(cx, cy) {
    if (!press) return;
    var p = svgPoint(cx, cy);
    if (!press.drag) {
      if (Math.abs(cx - press.cx) + Math.abs(cy - press.cy) < 12) return;
      press.drag = true;
      var svg = $('board');
      if (press.role === 'greep') {
        press.st = state.stapels[press.s];
        press.grp = svg.querySelector('[data-stapel="' + press.s + '"]');
        press.grp.parentNode.appendChild(press.grp);
      } else {
        var w = cardW(press.v, g.dw);
        if (press.role === 'kaart') {
          var st = state.stapels[press.s];
          press.off = { x: press.p0.x - (st.x - w), y: press.p0.y - st.y };
          press.n.setAttribute('display', 'none');
        } else {
          press.off = { x: w / 2, y: g.ch / 2 };
          press.n.setAttribute('opacity', 0.25);
        }
        press.ghost = kaart(svg, press.v, 0, 0, g.dw, g.ch, { 'pointer-events': 'none', opacity: 0.95 });
      }
    }
    if (press.ghost) {
      press.gx = p.x - press.off.x; press.gy = p.y - press.off.y;
      press.ghost.setAttribute('transform', 'translate(' + press.gx + ',' + press.gy + ')');
    } else if (press.grp) {
      press.dx = p.x - press.p0.x; press.dy = p.y - press.p0.y;
      press.grp.setAttribute('transform', 'translate(' + press.dx + ',' + press.dy + ')');
    }
  }
  function up(cx, cy) {
    var pr = press;
    press = null;
    if (!pr) return;
    var p = svgPoint(cx, cy);
    if (!pr.drag) {
      // tikken op een kaart in de bak: bij de laatst gebruikte stapel leggen
      if (pr.role === 'bak') { var st0 = hoofdstapel(); leg(st0, pr.v, false); change(); }
      return;
    }
    if (pr.role === 'greep') {
      pr.st.x += pr.dx || 0; pr.st.y += pr.dy || 0;
      if (p.x < g.TW) { state.stapels.splice(state.stapels.indexOf(pr.st), 1); change(); return; }
      naarVoor(pr.st);
      change();
      return;
    }
    if (p.x < g.TW) { haalWeg(pr.v); change(); return; }
    var w = cardW(pr.v, g.dw), van = pr.role === 'kaart' ? state.stapels[pr.s] : null;
    var alleen = van && van.c.length === 1 ? van : null;
    var doel = state.magneet ? overlap(pr.gx, pr.gy, w, g.ch, alleen) : null;
    haalWeg(pr.v);
    if (doel) {
      leg(doel, pr.v, true);
      naarVoor(doel);
    } else {
      state.stapels.push({ x: pr.gx + w, y: pr.gy, c: [pr.v] });
    }
    change();
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

  // ---------- Eigen getal (cijferklavier) ----------
  var invoer = '';
  function padRender() {
    $('padVal').textContent = invoer === '' ? ' ' : invoer;
    $('padOk').disabled = invoer === '' || int(invoer, 0) < 1;
    $('padHint').textContent = 'Een getal van 1 tot ' + maxGetal() + '.';
  }
  function padTyp(c) {
    if (c === 'wis') invoer = invoer.substr(0, invoer.length - 1);
    else if (invoer.length < state.k && !(invoer === '' && c === '0')) invoer += c;
    padRender();
  }
  function padOpen() { invoer = ''; padRender(); $('overlayPad').className = 'overlay'; }
  function padSluit(ok) {
    $('overlayPad').className = 'overlay hidden';
    if (ok && int(invoer, 0) >= 1) nieuwGetal(int(invoer, 0));
  }

  // ---------- Opstarten ----------
  function on(id, fn) { $(id).addEventListener('click', fn, false); }
  function init() {
    var segs = $('totSeg').getElementsByTagName('button');
    for (var i = 0; i < segs.length; i++) (function (b) {
      b.addEventListener('click', function () { setTot(int(b.getAttribute('data-k'), 4)); }, false);
    })(segs[i]);
    on('btnToon', function () { state.toon = !state.toon; prefSet('toon', state.toon ? '1' : '0'); render(); });
    on('btnMagneet', function () { state.magneet = !state.magneet; prefSet('magneet', state.magneet ? '1' : '0'); render(); });
    on('btnLetters', function () { state.letters = !state.letters; prefSet('letters', state.letters ? '1' : '0'); change(); });
    on('btnRandom', function () {
      var n = willekeurig(), t = 0;
      while (n === state.getal && t++ < 10) n = willekeurig();
      nieuwGetal(n);
    });
    on('btnEigen', padOpen);
    on('btnLeg', legGetal);
    on('btnReset', opnieuw);
    var pad = $('pad').getElementsByTagName('button');
    for (var j = 0; j < pad.length; j++) (function (b) {
      b.addEventListener('click', function () { padTyp(b.getAttribute('data-c')); }, false);
    })(pad[j]);
    on('padOk', function () { padSluit(true); });
    on('padAnnuleer', function () { padSluit(false); });
    document.addEventListener('keydown', function (e) {
      if ($('overlayPad').className.indexOf('hidden') >= 0) return;
      var c = e.keyCode;
      if (c >= 48 && c <= 57) padTyp(String(c - 48));
      else if (c >= 96 && c <= 105) padTyp(String(c - 96));
      else if (c === 8) { e.preventDefault(); padTyp('wis'); }
      else if (c === 13) padSluit(true);
      else if (c === 27) padSluit(false);
    }, false);
    on('btnTip', function () { $('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { $('overlayTip').className = 'overlay hidden'; });
    bindPointer();
    window.addEventListener('resize', function () { layout(); change(); }, false);
    layout();
    change();
  }

  window.__getalkaarten = { state: state, render: render, geo: function () { return g; }, legGetal: legGetal, som: som, willekeurig: willekeurig };
  init();
})();
