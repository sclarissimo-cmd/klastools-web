/* Getalbeelden – OpenBoard-widget
 * Eierdozen in tienstructuur (2 rijen van 5) met bollen in vier kleuren.
 * Eén doos voor getallen tot 10, twee dozen voor de brug over 10.
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
  var MAX_BOXES = 2;
  var PER_BOX = 10;

  // Maten in SVG-eenheden; de SVG schaalt mee met de widget.
  var CELL = 100, PAD = 14, BOX_GAP = 64, R = 38;
  var BOX_W = 5 * CELL + 2 * PAD, BOX_H = 2 * CELL + 2 * PAD;
  var NUM_H = 110; // ruimte onder de dozen voor de getallen

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: boxes ('1'|'2'), cells (20 tekens '0'..'4'), color ('1'..'4'), showNum ('0'|'1').
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
    try { var l = localStorage.getItem('getalbeelden.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('getalbeelden.' + k, String(v)); } catch (e) {}
  }

  // ---------- Toestand ----------
  var state = {
    boxes: prefGet('boxes', '1') === '2' ? 2 : 1,
    cells: parseCells(prefGet('cells', '')),
    color: clampColor(prefGet('color', '1')),
    showNum: prefGet('showNum', '0') === '1'
  };

  function parseCells(s) {
    var out = [];
    for (var i = 0; i < MAX_BOXES * PER_BOX; i++) {
      var c = s.charAt(i);
      out.push(c >= '1' && c <= '4' ? +c : 0);
    }
    return out;
  }
  function clampColor(v) { var n = +v; return n >= 1 && n <= 4 ? n : 1; }

  function save() {
    prefSet('boxes', state.boxes);
    prefSet('cells', state.cells.join(''));
    prefSet('color', state.color);
    prefSet('showNum', state.showNum ? '1' : '0');
  }

  function visibleCount() { return state.boxes * PER_BOX; }

  function counts() {
    var total = 0, perBox = [0, 0], perColor = [0, 0, 0, 0, 0];
    for (var i = 0; i < visibleCount(); i++) {
      var c = state.cells[i];
      if (c) { total++; perBox[Math.floor(i / PER_BOX)]++; perColor[c]++; }
    }
    return { total: total, perBox: perBox, perColor: perColor };
  }

  // ---------- Acties ----------
  function clickCell(i) {
    state.cells[i] = state.cells[i] === state.color ? 0 : state.color;
    changed();
  }
  // Vlaamse vulvolgorde: per kolom, eerst boven dan onder (links boven, links onder, tweede boven, ...),
  // dan de volgende doos. `cells` blijft rij per rij bewaard (vakje j = rij * 5 + kolom).
  function fillOrder() {
    var order = [];
    for (var b = 0; b < state.boxes; b++) {
      for (var col = 0; col < 5; col++) order.push(b * PER_BOX + col, b * PER_BOX + 5 + col);
    }
    return order;
  }
  function plusOne() {
    var order = fillOrder();
    for (var k = 0; k < order.length; k++) {
      if (!state.cells[order[k]]) { state.cells[order[k]] = state.color; return changed(); }
    }
  }
  function minusOne() {
    var order = fillOrder();
    for (var k = order.length - 1; k >= 0; k--) {
      if (state.cells[order[k]]) { state.cells[order[k]] = 0; return changed(); }
    }
  }
  function fillAll() {
    for (var i = 0; i < visibleCount(); i++) if (!state.cells[i]) state.cells[i] = state.color;
    changed();
  }
  function clearAll() {
    for (var i = 0; i < state.cells.length; i++) state.cells[i] = 0;
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

    var w = state.boxes * BOX_W + (state.boxes - 1) * BOX_GAP;
    var h = BOX_H + (state.showNum ? NUM_H : 0);
    svg.setAttribute('viewBox', '-10 -10 ' + (w + 20) + ' ' + (h + 20));

    var cnt = counts();
    for (var b = 0; b < state.boxes; b++) {
      var bx = b * (BOX_W + BOX_GAP);
      el('rect', { x: bx, y: 0, width: BOX_W, height: BOX_H, rx: 22, fill: '#ffffff', stroke: '#9aa4b5', 'stroke-width': 4 }, svg);
      // lijn tussen de twee rijen van 5
      el('line', { x1: bx + PAD, y1: PAD + CELL, x2: bx + BOX_W - PAD, y2: PAD + CELL, stroke: '#e3e7ef', 'stroke-width': 3 }, svg);
      for (var j = 0; j < PER_BOX; j++) {
        var i = b * PER_BOX + j;
        var cx = bx + PAD + (j % 5) * CELL + CELL / 2;
        var cy = PAD + Math.floor(j / 5) * CELL + CELL / 2;
        var g = el('g', { 'data-i': i, 'class': 'cell', cursor: 'pointer' }, svg);
        // onzichtbaar vlak zodat het hele vakje klikbaar is
        el('rect', { x: cx - CELL / 2, y: cy - CELL / 2, width: CELL, height: CELL, fill: '#ffffff', 'fill-opacity': 0 }, g);
        el('circle', { cx: cx, cy: cy, r: R, fill: '#eef1f6', stroke: '#d5dbe6', 'stroke-width': 3 }, g);
        var c = state.cells[i];
        if (c) {
          el('circle', { cx: cx, cy: cy, r: R - 2, fill: COLORS[c].fill, stroke: COLORS[c].edge, 'stroke-width': 4, 'class': 'bol', 'data-color': c }, g);
          el('circle', { cx: cx - 12, cy: cy - 13, r: 9, fill: '#ffffff', 'fill-opacity': 0.35 }, g);
        }
      }
      if (state.showNum) {
        text(String(cnt.perBox[b]), { x: bx + BOX_W / 2, y: BOX_H + 62, 'font-size': 56, 'font-weight': 700, fill: '#18212f', 'class': 'boxnum' }, svg);
      }
    }
    if (state.showNum) renderSum(svg, cnt, w);
    renderControls();
    window.__getalbeelden.total = cnt.total;
  }

  // Tussen de dozen het totaal; bij meerdere kleuren ook per kleur een bol met het aantal
  // ("● 8  ● 5  = 13"): zo zie je zowel de brug over 10 als het splitsen van een getal.
  function renderSum(svg, cnt, w) {
    var used = [];
    for (var c = 1; c <= 4; c++) if (cnt.perColor[c]) used.push(c);
    if (used.length < 2) {
      if (state.boxes === 2) {
        text('samen ' + cnt.total, { x: w / 2, y: BOX_H + 62, 'font-size': 34, 'font-weight': 700, fill: '#667085', 'class': 'total' }, svg);
      }
      return;
    }
    var y = BOX_H + 98, itemW = 100;
    var x = w / 2 - (used.length * itemW + 90) / 2;
    var row = el('g', { 'class': 'sum' }, svg);
    for (var k = 0; k < used.length; k++) {
      var col = COLORS[used[k]];
      el('circle', { cx: x + 16, cy: y - 12, r: 15, fill: col.fill, stroke: col.edge, 'stroke-width': 3 }, row);
      text(String(cnt.perColor[used[k]]), { x: x + 40, y: y, 'font-size': 34, 'font-weight': 600, fill: '#18212f', 'text-anchor': 'start' }, row);
      x += itemW;
    }
    text('= ' + cnt.total, { x: x, y: y, 'font-size': 34, 'font-weight': 700, fill: '#18212f', 'text-anchor': 'start', 'class': 'total' }, row);
  }

  function renderControls() {
    var segBtns = document.getElementById('boxSeg').getElementsByTagName('button');
    for (var i = 0; i < segBtns.length; i++) {
      segBtns[i].className = +segBtns[i].getAttribute('data-boxes') === state.boxes ? 'on' : '';
    }
    var sw = document.getElementById('palette').getElementsByTagName('button');
    for (var j = 0; j < sw.length; j++) {
      sw[j].className = 'swatch' + (+sw[j].getAttribute('data-color') === state.color ? ' on' : '');
    }
    var numBtn = document.getElementById('btnNum');
    numBtn.textContent = state.showNum ? 'Verberg getal' : 'Toon getal';
    numBtn.className = 'btn' + (state.showNum ? ' on' : '');
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
  }

  // ---------- Gebeurtenissen ----------
  function on(id, fn) { document.getElementById(id).addEventListener('click', fn, false); }

  function init() {
    window.__getalbeelden = { state: state, total: 0 };
    buildPalette();

    document.getElementById('board').addEventListener('click', function (e) {
      var n = e.target;
      while (n && n.getAttribute && n.getAttribute('data-i') === null) n = n.parentNode;
      if (n && n.getAttribute) clickCell(+n.getAttribute('data-i'));
    }, false);
    document.getElementById('boxSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-boxes');
      if (v) { state.boxes = +v; changed(); }
    }, false);
    document.getElementById('palette').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-color');
      if (v) { state.color = +v; save(); renderControls(); }
    }, false);
    on('btnPlus', plusOne);
    on('btnMin', minusOne);
    on('btnFill', fillAll);
    on('btnClear', clearAll);
    on('btnNum', function () { state.showNum = !state.showNum; changed(); });
    on('btnTip', function () { document.getElementById('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { document.getElementById('overlayTip').className = 'overlay hidden'; });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
