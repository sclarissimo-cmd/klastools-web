/* Honderdveld – OpenBoard-widget
 * 10 x 10 vakjes (1 tot 100) met bollen in vier kleuren. Een knopje per rij kleurt de hele rij.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  // Index = kleurcode in de voorkeur `cells` ('1'..'4'); '0' is een leeg vakje.
  var COLORS = [
    null,
    { name: 'rood',  fill: '#e5484d', edge: '#b4292e' },
    { name: 'blauw', fill: '#2f6fdb', edge: '#1d4fa6' },
    { name: 'groen', fill: '#22a06b', edge: '#157a4f' },
    { name: 'geel',  fill: '#f5b800', edge: '#b38600' }
  ];
  var N = 10, TOTAL = 100;

  // Maten in SVG-eenheden; de SVG schaalt mee met de widget.
  var CELL = 60, R = 25, HEAD = 56; // HEAD = kolom met de rijknopjes
  var GRID = N * CELL;
  var SUM_W = 250; // ruimte rechts voor de getallen

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: cells (100 tekens '0'..'4', vakje 1 eerst), color ('1'..'4'), showNum ('0'|'1'), digits ('0'|'1'),
  // shown (100 tekens '0'|'1': losse getallen die zichtbaar blijven als digits = '0').
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
    // buiten OpenBoard (testen in een browser)
    try { var l = localStorage.getItem('honderdveld.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('honderdveld.' + k, String(v)); } catch (e) {}
  }

  // ---------- Toestand ----------
  var state = {
    cells: parseCells(prefGet('cells', '')),
    color: clampColor(prefGet('color', '1')),
    showNum: prefGet('showNum', '0') === '1',
    digits: prefGet('digits', '1') === '1',
    shown: parseFlags(prefGet('shown', '')),
    tool: 'bol' // 'bol' = bollen leggen, 'getal' = losse getallen tonen/verbergen (niet bewaard)
  };

  function parseCells(s) {
    var out = [];
    for (var i = 0; i < TOTAL; i++) {
      var c = s.charAt(i);
      out.push(c >= '1' && c <= '4' ? +c : 0);
    }
    return out;
  }
  function parseFlags(s) {
    var out = [];
    for (var i = 0; i < TOTAL; i++) out.push(s.charAt(i) === '1');
    return out;
  }
  function clampColor(v) { var n = +v; return n >= 1 && n <= 4 ? n : 1; }

  function save() {
    prefSet('cells', state.cells.join(''));
    prefSet('color', state.color);
    prefSet('showNum', state.showNum ? '1' : '0');
    prefSet('digits', state.digits ? '1' : '0');
    var f = [];
    for (var i = 0; i < TOTAL; i++) f.push(state.shown[i] ? '1' : '0');
    prefSet('shown', f.join(''));
  }

  function counts() {
    var total = 0, perColor = [0, 0, 0, 0, 0];
    for (var i = 0; i < TOTAL; i++) {
      var c = state.cells[i];
      if (c) { total++; perColor[c]++; }
    }
    return { total: total, perColor: perColor };
  }

  // ---------- Acties ----------
  function clickCell(i) {
    if (state.tool === 'getal') state.shown[i] = !state.shown[i];
    else state.cells[i] = state.cells[i] === state.color ? 0 : state.color;
    changed();
  }
  // Hele rij in de gekozen kleur; was ze dat al helemaal, dan wordt ze leeg.
  function clickRow(r) {
    var full = true, i;
    if (state.tool === 'getal') { // getallen van de hele rij tonen, of verbergen als ze al zichtbaar waren
      for (i = r * N; i < r * N + N; i++) if (!state.shown[i]) full = false;
      for (i = r * N; i < r * N + N; i++) state.shown[i] = !full;
      return changed();
    }
    for (i = r * N; i < r * N + N; i++) if (state.cells[i] !== state.color) full = false;
    for (i = r * N; i < r * N + N; i++) state.cells[i] = full ? 0 : state.color;
    changed();
  }
  // +1 / +10 vullen in leesrichting (1, 2, 3, ...); -1 / -10 halen de laatste bollen weg.
  function add(n) {
    for (var i = 0; i < TOTAL && n > 0; i++) {
      if (!state.cells[i]) { state.cells[i] = state.color; n--; }
    }
    changed();
  }
  function remove(n) {
    for (var i = TOTAL - 1; i >= 0 && n > 0; i--) {
      if (state.cells[i]) { state.cells[i] = 0; n--; }
    }
    changed();
  }
  function clearAll() {
    for (var i = 0; i < TOTAL; i++) state.cells[i] = 0;
    changed();
  }
  function changed() { save(); render(); }

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

  function render() {
    var svg = document.getElementById('board');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var w = HEAD + GRID + (state.showNum ? SUM_W : 0);
    svg.setAttribute('viewBox', '-6 -6 ' + (w + 12) + ' ' + (GRID + 12));

    el('rect', { x: HEAD, y: 0, width: GRID, height: GRID, rx: 10, fill: '#ffffff', stroke: '#9aa4b5', 'stroke-width': 4 }, svg);
    // rasterlijnen; dikker na 5 rijen en na 5 kolommen (vijfstructuur)
    for (var k = 1; k < N; k++) {
      var five = k === 5;
      var lineAttrs = { stroke: five ? '#9aa4b5' : '#e3e7ef', 'stroke-width': five ? 4 : 2 };
      lineAttrs.x1 = HEAD + k * CELL; lineAttrs.x2 = lineAttrs.x1; lineAttrs.y1 = 0; lineAttrs.y2 = GRID;
      el('line', lineAttrs, svg);
      el('line', { x1: HEAD, x2: HEAD + GRID, y1: k * CELL, y2: k * CELL, stroke: lineAttrs.stroke, 'stroke-width': lineAttrs['stroke-width'] }, svg);
    }

    var active = COLORS[state.color];
    for (var r = 0; r < N; r++) {
      // rijknopje: een pijltje in de gekozen kleur
      var rg = el('g', { 'data-row': r, 'class': 'rowbtn', cursor: 'pointer' }, svg);
      el('rect', { x: 0, y: r * CELL + 6, width: HEAD - 10, height: CELL - 12, rx: 10, fill: '#f4f6fa', stroke: '#d5dbe6', 'stroke-width': 2 }, rg);
      var cy0 = r * CELL + CELL / 2;
      if (state.tool === 'getal') {
        text('123', { x: (HEAD - 10) / 2, y: cy0 + 6, 'font-size': 16, 'font-weight': 700, fill: '#18212f' }, rg);
      } else {
        el('path', { d: 'M14 ' + (cy0 - 11) + ' L34 ' + cy0 + ' L14 ' + (cy0 + 11) + ' Z', fill: active.fill, stroke: active.edge, 'stroke-width': 2 }, rg);
      }

      for (var c = 0; c < N; c++) {
        var i = r * N + c;
        var cx = HEAD + c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
        var g = el('g', { 'data-i': i, 'class': 'cell', cursor: 'pointer' }, svg);
        el('rect', { x: cx - CELL / 2, y: cy - CELL / 2, width: CELL, height: CELL, fill: '#ffffff', 'fill-opacity': 0 }, g);
        var col = state.cells[i];
        if (col) {
          el('circle', { cx: cx, cy: cy, r: R, fill: COLORS[col].fill, stroke: COLORS[col].edge, 'stroke-width': 3, 'class': 'bol', 'data-color': col }, g);
        }
        if (state.digits) {
          text(String(i + 1), { x: cx, y: cy + 8, 'font-size': 22, 'font-weight': col ? 700 : 400, fill: col ? '#ffffff' : '#98a2b3' }, g);
        } else if (state.shown[i]) {
          // een los getal in een verborgen veld valt extra op
          text(String(i + 1), { x: cx, y: cy + 9, 'font-size': 26, 'font-weight': 700, fill: col ? '#ffffff' : '#18212f' }, g);
        }
      }
    }

    var cnt = counts();
    if (state.showNum) renderSum(svg, cnt);
    renderControls();
    window.__honderdveld.total = cnt.total;
  }

  // Rechts naast het veld: per kleur een bol met het aantal, en het totaal.
  function renderSum(svg, cnt) {
    var x = HEAD + GRID + 50, y = 70;
    var g = el('g', { 'class': 'sum' }, svg);
    var used = 0;
    for (var c = 1; c <= 4; c++) {
      if (!cnt.perColor[c]) continue;
      used++;
      el('circle', { cx: x + 22, cy: y - 14, r: 20, fill: COLORS[c].fill, stroke: COLORS[c].edge, 'stroke-width': 3 }, g);
      text(String(cnt.perColor[c]), { x: x + 58, y: y, 'font-size': 40, 'font-weight': 600, fill: '#18212f', 'text-anchor': 'start' }, g);
      y += 70;
    }
    if (used > 1) {
      el('line', { x1: x, x2: x + 170, y1: y - 40, y2: y - 40, stroke: '#18212f', 'stroke-width': 3 }, g);
      y += 20;
    }
    text(String(cnt.total), { x: x + 58, y: y + (used > 1 ? 0 : 10), 'font-size': used > 1 ? 56 : 72, 'font-weight': 700, fill: '#18212f', 'text-anchor': 'start', 'class': 'total' }, g);
  }

  function renderControls() {
    var sw = document.getElementById('palette').getElementsByTagName('button');
    for (var j = 0; j < sw.length; j++) {
      var isTool = sw[j].getAttribute('data-tool') !== null;
      var on = isTool ? state.tool === 'getal' : state.tool === 'bol' && +sw[j].getAttribute('data-color') === state.color;
      sw[j].className = 'swatch' + (isTool ? ' tool' : '') + (on ? ' on' : '');
    }
    var numBtn = document.getElementById('btnNum');
    numBtn.textContent = state.showNum ? 'Verberg getal' : 'Toon getal';
    numBtn.className = 'btn' + (state.showNum ? ' on' : '');
    document.getElementById('btnDigits').textContent = state.digits ? 'Verberg getallen' : 'Toon getallen';
  }

  function buildPalette() {
    var pal = document.getElementById('palette');
    for (var c = 1; c <= 4; c++) {
      var b = document.createElement('button');
      b.setAttribute('data-color', c);
      b.setAttribute('title', COLORS[c].name);
      b.setAttribute('aria-label', COLORS[c].name);
      b.style.background = COLORS[c].fill;
      b.style.borderColor = COLORS[c].edge;
      pal.appendChild(b);
    }
    var t = document.createElement('button');
    t.setAttribute('data-tool', 'getal');
    t.setAttribute('title', 'Losse getallen tonen of verbergen');
    t.appendChild(document.createTextNode('123'));
    pal.appendChild(t);
  }

  // ---------- Gebeurtenissen ----------
  function on(id, fn) { document.getElementById(id).addEventListener('click', fn, false); }

  function init() {
    window.__honderdveld = { state: state, total: 0 };
    buildPalette();

    document.getElementById('board').addEventListener('click', function (e) {
      var n = e.target;
      while (n && n.getAttribute) {
        if (n.getAttribute('data-i') !== null) return clickCell(+n.getAttribute('data-i'));
        if (n.getAttribute('data-row') !== null) return clickRow(+n.getAttribute('data-row'));
        n = n.parentNode;
      }
    }, false);
    document.getElementById('palette').addEventListener('click', function (e) {
      if (!e.target.getAttribute) return;
      var v = e.target.getAttribute('data-color');
      if (v) { state.color = +v; state.tool = 'bol'; save(); render(); } // render: de rijknopjes nemen de kleur over
      if (e.target.getAttribute('data-tool') !== null) {
        state.tool = 'getal';
        state.digits = false; // losse getallen kiezen heeft enkel zin in een verborgen veld
        changed();
      }
    }, false);
    on('btnPlus', function () { add(1); });
    on('btnPlus10', function () { add(10); });
    on('btnMin', function () { remove(1); });
    on('btnMin10', function () { remove(10); });
    on('btnClear', clearAll);
    on('btnNum', function () { state.showNum = !state.showNum; changed(); });
    on('btnDigits', function () { state.digits = !state.digits; changed(); });
    on('btnTip', function () { document.getElementById('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { document.getElementById('overlayTip').className = 'overlay hidden'; });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
