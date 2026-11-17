/* Breuken – OpenBoard-widget
 * Chocoladerepen of taarten in gelijke stukken, gekleurd in vier kleuren.
 * Kies het aantal repen/taarten (1-6) en de noemer (1-20), samen of per reep/taart;
 * toon de breuk, het kommagetal en/of het percent (elk apart aan/uit).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  // Index = kleurcode in de voorkeur `cells` ('1'..'4'); '0' is een leeg stuk.
  var COLORS = [
    null,
    { name: 'rood',  fill: '#e5484d', edge: '#b4292e' },
    { name: 'blauw', fill: '#2f6fdb', edge: '#1d4fa6' },
    { name: 'groen', fill: '#22a06b', edge: '#157a4f' },
    { name: 'geel',  fill: '#f5b800', edge: '#b38600' }
  ];
  var MAX_WHOLES = 6;
  var MAX_DEN = 20; // ook het aantal tekens per reep/taart in `cells`
  var INK = '#18212f', MUTED = '#667085';

  // Maten in SVG-eenheden; de SVG schaalt mee met de widget.
  var BAR_W = 900, BAR_H = 130, BAR_GAP = 34;
  var PIE_R = 150, PIE_CELL = 2 * PIE_R + 50;
  var FRAC = 56;      // lettergrootte van breuken en getallen
  var CHAR_W = 0.5;   // geschatte breedte van een teken (x lettergrootte)
  var SUM_H = 150;    // ruimte voor de som onderaan
  var DEN_COL = 200;  // ruimte voor de noemerknopjes links van een reep
  var DEN_ROW = 90;   // ruimte voor de noemerknopjes onder een taart

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: model ('reep'|'taart'), wholes ('1'..'6'), den ('1'..'20': de gemeenschappelijke noemer),
  // dens (6 noemers met komma's, enkel gebruikt als denEach = '1'), denEach ('0'|'1'),
  // cells (120 tekens '0'..'4': reep/taart w, stuk i = teken w*20+i), color ('1'..'4'),
  // showNum, showDec, showPct ('0'|'1': breuk, kommagetal, percent).
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
    try { var l = localStorage.getItem('breuken.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('breuken.' + k, String(v)); } catch (e) {}
  }

  // ---------- Toestand ----------
  function clampInt(v, lo, hi, d) { var n = parseInt(v, 10); return n >= lo && n <= hi ? n : d; }
  function parseCells(s) {
    var out = [];
    for (var i = 0; i < MAX_WHOLES * MAX_DEN; i++) {
      var c = s.charAt(i);
      out.push(c >= '1' && c <= '4' ? +c : 0);
    }
    return out;
  }
  function parseDens(s, d) {
    var parts = s.split(','), out = [];
    for (var w = 0; w < MAX_WHOLES; w++) out.push(clampInt(parts[w], 1, MAX_DEN, d));
    return out;
  }

  var den0 = clampInt(prefGet('den', '4'), 1, MAX_DEN, 4);
  var state = {
    model: prefGet('model', 'reep') === 'taart' ? 'taart' : 'reep',
    wholes: clampInt(prefGet('wholes', '1'), 1, MAX_WHOLES, 1),
    den: den0,
    dens: parseDens(prefGet('dens', ''), den0),
    denEach: prefGet('denEach', '0') === '1',
    cells: parseCells(prefGet('cells', '')),
    color: clampInt(prefGet('color', '1'), 1, 4, 1),
    showNum: prefGet('showNum', '0') === '1',
    showDec: prefGet('showDec', '0') === '1',
    showPct: prefGet('showPct', '0') === '1'
  };

  function save() {
    prefSet('model', state.model);
    prefSet('wholes', state.wholes);
    prefSet('den', state.den);
    prefSet('dens', state.dens.join(','));
    prefSet('denEach', state.denEach ? '1' : '0');
    prefSet('cells', state.cells.join(''));
    prefSet('color', state.color);
    prefSet('showNum', state.showNum ? '1' : '0');
    prefSet('showDec', state.showDec ? '1' : '0');
    prefSet('showPct', state.showPct ? '1' : '0');
  }

  function denOf(w) { return state.denEach ? state.dens[w] : state.den; }

  // Zichtbare stukken in leesvolgorde: eerste reep/taart, dan de volgende.
  function order() {
    var out = [];
    for (var w = 0; w < state.wholes; w++) {
      for (var i = 0; i < denOf(w); i++) out.push(w * MAX_DEN + i);
    }
    return out;
  }

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
  function lcm(a, b) { return a / gcd(a, b) * b; }

  // Een breuk {n, d}: per kleur en samen opgeteld over repen met (misschien) verschillende noemers.
  // De noemer is het kleinste gemene veelvoud van de noemers van de repen waar die kleur in zit,
  // zodat 1/2 + 1/4 als 2/4 + 1/4 = 3/4 verschijnt en gelijke noemers gewoon blijven.
  function counts() {
    var perWhole = [], perColor = [], total, k, w, i, c;
    var colorWholes = [[], [], [], [], []]; // per kleur: [w, aantal]
    var anyWholes = [];
    for (w = 0; w < state.wholes; w++) {
      var n = 0, byColor = [0, 0, 0, 0, 0];
      for (i = 0; i < denOf(w); i++) {
        c = state.cells[w * MAX_DEN + i];
        if (c) { n++; byColor[c]++; }
      }
      perWhole.push({ n: n, d: denOf(w) });
      for (c = 1; c <= 4; c++) if (byColor[c]) colorWholes[c].push([w, byColor[c]]);
      if (n) anyWholes.push([w, n]);
    }
    function sumOf(list) {
      if (!list.length) return { n: 0, d: denOf(0) };
      var L = 1, s = 0;
      for (k = 0; k < list.length; k++) L = lcm(L, denOf(list[k][0]));
      for (k = 0; k < list.length; k++) s += list[k][1] * (L / denOf(list[k][0]));
      return { n: s, d: L };
    }
    for (c = 0; c <= 4; c++) perColor.push(sumOf(colorWholes[c]));
    total = sumOf(anyWholes);
    return { perWhole: perWhole, perColor: perColor, total: total };
  }
  function countPieces() {
    var o = order(), n = 0;
    for (var k = 0; k < o.length; k++) if (state.cells[o[k]]) n++;
    return n;
  }

  // Kommagetal en percent, Vlaams genoteerd (komma). exact = false als er afgerond werd.
  function decimal(n, d) {
    var exact = (n * 1000) % d === 0;
    var v = exact ? n / d : Math.round(n / d * 100) / 100;
    return { text: String(v).replace('.', ','), exact: exact };
  }
  function percent(n, d) {
    var exact = (n * 1000) % d === 0;
    var v = Math.round(n / d * 1000) / 10;
    return { text: String(v).replace('.', ',') + ' %', exact: exact };
  }

  // ---------- Acties ----------
  function clickPiece(i) {
    state.cells[i] = state.cells[i] === state.color ? 0 : state.color;
    changed();
  }
  function plusOne() {
    var o = order();
    for (var k = 0; k < o.length; k++) {
      if (!state.cells[o[k]]) { state.cells[o[k]] = state.color; return changed(); }
    }
  }
  function minusOne() {
    var o = order();
    for (var k = o.length - 1; k >= 0; k--) {
      if (state.cells[o[k]]) { state.cells[o[k]] = 0; return changed(); }
    }
  }
  function fillAll() {
    var o = order();
    for (var k = 0; k < o.length; k++) if (!state.cells[o[k]]) state.cells[o[k]] = state.color;
    changed();
  }
  function clearAll() {
    for (var i = 0; i < state.cells.length; i++) state.cells[i] = 0;
    changed();
  }
  function setWholes(n) {
    if (n < 1 || n > MAX_WHOLES) return;
    state.wholes = n; // verborgen repen/taarten houden hun kleuren (zoals bij Getalbeelden)
    changed();
  }
  // Stukken die bij een kleinere noemer wegvallen worden leeg, zodat ze niet terugkomen
  // als de noemer later weer groter wordt.
  function trim(w) {
    for (var i = denOf(w); i < MAX_DEN; i++) state.cells[w * MAX_DEN + i] = 0;
  }
  function trimAll() { for (var w = 0; w < MAX_WHOLES; w++) trim(w); }
  // De noemer bovenaan geldt voor alle repen/taarten (ook als elk een eigen noemer heeft).
  function setDen(n) {
    if (n < 1 || n > MAX_DEN) return;
    state.den = n;
    for (var w = 0; w < MAX_WHOLES; w++) state.dens[w] = n;
    trimAll();
    changed();
  }
  function setDenOf(w, n) {
    if (n < 1 || n > MAX_DEN) return;
    state.dens[w] = n;
    trim(w);
    changed();
  }
  function toggleDenEach() {
    state.denEach = !state.denEach;
    if (state.denEach) {
      for (var w = 0; w < MAX_WHOLES; w++) state.dens[w] = state.den; // vertrek van de gewone noemer
    }
    trimAll();
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
  function textWidth(str, size) { return str.length * size * CHAR_W; }

  function fracWidth(num, den, size) {
    return Math.max(String(num).length, String(den).length) * size * 0.6 + size * 0.5;
  }
  // Breuk met teller boven en noemer onder een streep; (x, cy) = midden van de streep.
  function drawFrac(parent, x, cy, num, den, size, cls) {
    var g = el('g', { 'class': cls || 'frac', 'data-value': num + '/' + den }, parent);
    var half = fracWidth(num, den, size) / 2;
    text(String(num), { x: x, y: cy - size * 0.2, 'font-size': size, 'font-weight': 700, fill: INK }, g);
    el('line', { x1: x - half, y1: cy, x2: x + half, y2: cy, stroke: INK, 'stroke-width': size / 12, 'stroke-linecap': 'round' }, g);
    text(String(den), { x: x, y: cy + size * 0.85, 'font-size': size, 'font-weight': 700, fill: INK }, g);
    return g;
  }

  // Wat er bij een breuk getoond wordt, als rij onderdelen: "3/4 = 0,75 = 75 %".
  // Bij afronding staat er ≈ in plaats van = ("1/3 ≈ 0,33 ≈ 33,3 %").
  function labelParts(n, d) {
    var parts = [];
    if (state.showNum) parts.push({ frac: true, n: n, d: d, w: fracWidth(n, d, FRAC) });
    if (state.showDec) { var dc = decimal(n, d); parts.push({ text: dc.text, exact: dc.exact, cls: 'dec' }); }
    if (state.showPct) { var pc = percent(n, d); parts.push({ text: pc.text, exact: pc.exact, cls: 'pct' }); }
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      if (p.frac) continue;
      // teken ervoor: = of ≈ tussen onderdelen; ≈ ook vooraan als er afgerond werd
      p.sign = k > 0 ? (p.exact ? '= ' : '≈ ') : (p.exact ? '' : '≈ ');
      p.w = textWidth(p.sign + p.text, FRAC);
    }
    return parts;
  }
  function partsWidth(parts) {
    var w = 0;
    for (var k = 0; k < parts.length; k++) w += parts[k].w + (k ? 26 : 0);
    return w;
  }
  // Tekent de onderdelen vanaf x (links), verticaal gecentreerd rond cy.
  function drawParts(g, parts, x, cy) {
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      if (p.frac) {
        drawFrac(g, x + p.w / 2, cy, p.n, p.d, FRAC);
      } else {
        var t = text(p.sign, { x: x, y: cy + FRAC * 0.35, 'font-size': FRAC, 'font-weight': 600, fill: MUTED, 'text-anchor': 'start' }, g);
        var v = el('tspan', { 'class': p.cls, fill: k === 0 ? INK : MUTED }, t);
        v.appendChild(document.createTextNode(p.text));
      }
      x += p.w + 26;
    }
  }

  function pieceGroup(parent, i) {
    return el('g', { 'data-i': i, 'class': 'piece' + (state.cells[i] ? ' kleur' : ''), 'data-color': state.cells[i], cursor: 'pointer' }, parent);
  }

  // Chocoladereep: één rij gelijke stukjes. Leeg = chocolade, gekleurd = de gekozen kleur.
  function drawBar(svg, w, x, y) {
    var den = denOf(w);
    el('rect', { x: x - 6, y: y - 6, width: BAR_W + 12, height: BAR_H + 12, rx: 16, fill: '#4e2c14' }, svg);
    var pw = BAR_W / den;
    for (var j = 0; j < den; j++) {
      var i = w * MAX_DEN + j, c = state.cells[i];
      var g = pieceGroup(svg, i);
      var px = x + j * pw;
      el('rect', { x: px + 3, y: y + 3, width: pw - 6, height: BAR_H - 6, rx: 8,
        fill: c ? COLORS[c].fill : '#7b4a2b', stroke: c ? COLORS[c].edge : '#5a3218', 'stroke-width': 3 }, g);
      // reliëf van een chocoladeblokje
      var inset = Math.min(14, pw / 6);
      el('rect', { x: px + 3 + inset, y: y + 3 + inset, width: Math.max(1, pw - 6 - 2 * inset), height: BAR_H - 6 - 2 * inset, rx: 5,
        fill: c ? '#ffffff' : '#94603a', 'fill-opacity': c ? 0.22 : 1 }, g);
    }
  }

  function piePoint(cx, cy, r, k, den) {
    var a = -Math.PI / 2 + k * 2 * Math.PI / den;
    return (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
  }
  // Taart: gelijke punten vanaf 12 uur met de klok mee.
  function drawPie(svg, w, cx, cy) {
    var den = denOf(w);
    for (var j = 0; j < den; j++) {
      var i = w * MAX_DEN + j, c = state.cells[i];
      var g = pieceGroup(svg, i);
      var attrs = { fill: c ? COLORS[c].fill : '#f6e2b3', stroke: '#a8752c', 'stroke-width': 4, 'stroke-linejoin': 'round' };
      if (den === 1) {
        attrs.cx = cx; attrs.cy = cy; attrs.r = PIE_R;
        el('circle', attrs, g);
      } else {
        attrs.d = 'M ' + cx + ' ' + cy + ' L ' + piePoint(cx, cy, PIE_R, j, den) +
          ' A ' + PIE_R + ' ' + PIE_R + ' 0 0 1 ' + piePoint(cx, cy, PIE_R, j + 1, den) + ' Z';
        el('path', attrs, g);
      }
    }
    // korst
    el('circle', { cx: cx, cy: cy, r: PIE_R, fill: 'none', stroke: '#d8a650', 'stroke-width': 14, 'pointer-events': 'none' }, svg);
    el('circle', { cx: cx, cy: cy, r: PIE_R + 7, fill: 'none', stroke: '#a8752c', 'stroke-width': 3, 'pointer-events': 'none' }, svg);
  }

  // Knopjes − noemer + voor één reep/taart; (cx, cy) = midden.
  function drawDenButtons(svg, w, cx, cy) {
    var g = el('g', { 'class': 'denctl', 'data-w': w }, svg);
    function btn(x, step, label, enabled) {
      var b = el('g', { 'data-w': w, 'data-step': step, 'class': 'denbtn', cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.35 }, g);
      el('circle', { cx: x, cy: cy, r: 28, fill: '#ffffff', stroke: '#9aa4b5', 'stroke-width': 3 }, b);
      text(label, { x: x, y: cy + 13, 'font-size': 40, 'font-weight': 700, fill: INK }, b);
    }
    var den = denOf(w);
    btn(cx - 70, -1, '−', den > 1);
    text(String(den), { x: cx, y: cy + 15, 'font-size': 44, 'font-weight': 700, fill: INK, 'class': 'denval' }, g);
    btn(cx + 70, 1, '+', den < MAX_DEN);
  }

  function render() {
    var svg = document.getElementById('board');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var cnt = counts();
    var showAny = state.showNum || state.showDec || state.showPct;
    var used = [];
    for (var c = 1; c <= 4; c++) if (cnt.perColor[c].n) used.push(c);
    var showSum = showAny && (state.wholes > 1 || used.length > 1);
    var left = 0, w, h, k, parts, g;

    if (state.model === 'reep') {
      var bx = state.denEach ? DEN_COL : 0;
      var labelW = 0;
      w = bx + BAR_W;
      h = state.wholes * BAR_H + (state.wholes - 1) * BAR_GAP;
      for (k = 0; k < state.wholes; k++) {
        var y = k * (BAR_H + BAR_GAP);
        if (state.denEach) drawDenButtons(svg, k, DEN_COL / 2 - 10, y + BAR_H / 2);
        drawBar(svg, k, bx, y);
        if (showAny) {
          parts = labelParts(cnt.perWhole[k].n, cnt.perWhole[k].d);
          g = el('g', { 'class': 'label' }, svg);
          drawParts(g, parts, bx + BAR_W + 50, y + BAR_H / 2);
          labelW = Math.max(labelW, 50 + partsWidth(parts));
        }
      }
      w += labelW;
    } else {
      var cols = state.wholes <= 3 ? state.wholes : (state.wholes === 4 ? 2 : 3);
      var rows = Math.ceil(state.wholes / cols);
      var below = (state.denEach ? DEN_ROW : 0) + (showAny ? 130 : 0);
      var cellW = PIE_CELL;
      // labels breder dan een taart: kolommen breder maken
      if (showAny) {
        for (k = 0; k < state.wholes; k++) {
          cellW = Math.max(cellW, partsWidth(labelParts(cnt.perWhole[k].n, cnt.perWhole[k].d)) + 50);
        }
      }
      var cellH = PIE_CELL + below;
      w = cols * cellW;
      h = rows * cellH - 50;
      for (k = 0; k < state.wholes; k++) {
        var r = Math.floor(k / cols), col = k % cols;
        // laatste rij centreren als ze niet vol is
        var inRow = r === rows - 1 ? state.wholes - r * cols : cols;
        var cx = (cols - inRow) * cellW / 2 + col * cellW + cellW / 2;
        var cy = r * cellH + PIE_R + 10;
        drawPie(svg, k, cx, cy);
        var ly = cy + PIE_R + 50;
        if (state.denEach) { drawDenButtons(svg, k, cx, ly); ly += DEN_ROW; }
        if (showAny) {
          parts = labelParts(cnt.perWhole[k].n, cnt.perWhole[k].d);
          g = el('g', { 'class': 'label' }, svg);
          drawParts(g, parts, cx - partsWidth(parts) / 2, ly + 20);
        }
      }
    }
    if (showSum) {
      var sw = renderSum(svg, cnt, used, w, h + SUM_H - 40);
      if (sw > w) { left = (w - sw) / 2; w = sw; }
      h += SUM_H;
    }
    svg.setAttribute('viewBox', (left - 20) + ' -20 ' + (w + 40) + ' ' + (h + 40));
    renderControls();
    window.__breuken.total = countPieces();
  }

  // Onderaan: per kleur een bolletje met de breuk (of het eerste getoonde getal), en dan het totaal
  // in alle getoonde vormen ("● 3/4  ● 2/4  = 5/4 = 1,25 = 125 %"). Eén kleur: "samen 5/4".
  // Geeft de breedte terug.
  function renderSum(svg, cnt, used, w, cy) {
    var items = [], k;
    var many = used.length > 1;
    if (many) {
      for (k = 0; k < used.length; k++) {
        var pc = cnt.perColor[used[k]];
        items.push({ color: used[k], parts: labelParts(pc.n, pc.d).slice(0, 1) });
      }
    }
    var totalParts = labelParts(cnt.total.n, cnt.total.d);
    var lead = many ? '=' : 'samen';
    var leadW = many ? 50 : 160;
    var gap = 50, width = leadW + partsWidth(totalParts);
    for (k = 0; k < items.length; k++) width += 44 + partsWidth(items[k].parts) + gap;

    var x = w / 2 - width / 2;
    var row = el('g', { 'class': 'sum' }, svg);
    for (k = 0; k < items.length; k++) {
      var it = items[k];
      el('circle', { cx: x + 16, cy: cy, r: 16, fill: COLORS[it.color].fill, stroke: COLORS[it.color].edge, 'stroke-width': 3 }, row);
      x += 44;
      var g = el('g', { 'class': 'part' }, row);
      drawParts(g, it.parts, x, cy);
      x += partsWidth(it.parts) + gap;
    }
    text(lead, { x: x, y: cy + FRAC * 0.35, 'font-size': FRAC, 'font-weight': 700, fill: many ? INK : MUTED, 'text-anchor': 'start' }, row);
    x += leadW;
    drawParts(el('g', { 'class': 'total' }, row), totalParts, x, cy);
    return width;
  }

  function renderControls() {
    var seg = document.getElementById('modelSeg').getElementsByTagName('button');
    for (var i = 0; i < seg.length; i++) {
      seg[i].className = seg[i].getAttribute('data-model') === state.model ? 'on' : '';
    }
    var reep = state.model === 'reep';
    var name = reep ? (state.wholes === 1 ? 'reep' : 'repen') : (state.wholes === 1 ? 'taart' : 'taarten');
    document.getElementById('wholeVal').innerHTML = '<b>' + state.wholes + '</b> ' + name;
    document.getElementById('denVal').innerHTML = 'noemer <b>' + state.den + '</b>';
    document.getElementById('wholeMin').disabled = state.wholes <= 1;
    document.getElementById('wholePlus').disabled = state.wholes >= MAX_WHOLES;
    document.getElementById('denMin').disabled = state.den <= 1;
    document.getElementById('denPlus').disabled = state.den >= MAX_DEN;
    var each = document.getElementById('btnEach');
    each.className = 'btn small' + (state.denEach ? ' on' : '');
    each.setAttribute('title', state.denEach ? 'Alle ' + (reep ? 'repen' : 'taarten') + ' dezelfde noemer'
      : 'Elke ' + (reep ? 'reep' : 'taart') + ' een eigen noemer (bv. 1/2 en 2/4 vergelijken)');

    var sw = document.getElementById('palette').getElementsByTagName('button');
    for (var j = 0; j < sw.length; j++) {
      sw[j].className = 'swatch' + (+sw[j].getAttribute('data-color') === state.color ? ' on' : '');
    }
    document.getElementById('btnNum').className = 'btn' + (state.showNum ? ' on' : '');
    document.getElementById('btnDec').className = 'btn' + (state.showDec ? ' on' : '');
    document.getElementById('btnPct').className = 'btn' + (state.showPct ? ' on' : '');
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
    window.__breuken = { state: state, total: 0 };
    buildPalette();

    document.getElementById('board').addEventListener('click', function (e) {
      var n = e.target;
      while (n && n.getAttribute && n.getAttribute('data-i') === null && n.getAttribute('data-step') === null) n = n.parentNode;
      if (!n || !n.getAttribute) return;
      if (n.getAttribute('data-step') !== null) {
        var w = +n.getAttribute('data-w');
        setDenOf(w, state.dens[w] + (+n.getAttribute('data-step')));
      } else {
        clickPiece(+n.getAttribute('data-i'));
      }
    }, false);
    document.getElementById('modelSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-model');
      if (v) { state.model = v; changed(); }
    }, false);
    document.getElementById('palette').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-color');
      if (v) { state.color = +v; save(); renderControls(); }
    }, false);
    on('wholeMin', function () { setWholes(state.wholes - 1); });
    on('wholePlus', function () { setWholes(state.wholes + 1); });
    on('denMin', function () { setDen(state.den - 1); });
    on('denPlus', function () { setDen(state.den + 1); });
    on('btnEach', toggleDenEach);
    on('btnPlus', plusOne);
    on('btnMin', minusOne);
    on('btnFill', fillAll);
    on('btnClear', clearAll);
    on('btnNum', function () { state.showNum = !state.showNum; changed(); });
    on('btnDec', function () { state.showDec = !state.showDec; changed(); });
    on('btnPct', function () { state.showPct = !state.showPct; changed(); });
    on('btnTip', function () { document.getElementById('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { document.getElementById('overlayTip').className = 'overlay hidden'; });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
