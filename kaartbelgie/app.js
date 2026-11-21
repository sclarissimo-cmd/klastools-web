/* Kaart van België – OpenBoard-widget
 * Provincies in kleur (tik op de provincie = naam), hoofdsteden met een sterretje (tik = naam), gewesten als laag,
 * rivieren discreet (tik = duidelijk blauw met naam). Per laag alle namen tonen of verbergen.
 * Kaartgegevens in kaart.js (gemaakt door scripts/kaart_belgie.py).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FONT = '"Segoe UI", Arial, sans-serif';
  var KLEUR = { wvl: '#f7b2b7', ovl: '#ffd08a', ant: '#c9b6e6', lim: '#b5e48c', vbr: '#ffe680', bru: '#ff8f8f',
    wbr: '#9fd8c8', hen: '#cfe6a8', nam: '#eab6dc', lui: '#ffbf94', lux: '#c4d6b4' };
  var RAND = { wvl: '#c2185b', ovl: '#c26a00', ant: '#6a40b0', lim: '#3b7d18', vbr: '#9a7b00', bru: '#c62828',
    wbr: '#1d7d68', hen: '#5b7f1f', nam: '#9c3f86', lui: '#c2561a', lux: '#4f6b3a' };
  var GEWESTEN = {
    vl: { naam: 'Vlaams Gewest', rand: '#b88a00', tint: '#ffd43b', groot: 24, plek: [[3.62, 51.28], [4.75, 51.32], [3.4, 51.0], [5.0, 51.05]] },
    wa: { naam: 'Waals Gewest', rand: '#c62828', tint: '#ff6b6b', groot: 24, plek: [[4.9, 50.08], [4.4, 50.2], [5.3, 50.2], [5.6, 49.9]] },
    bru: { naam: 'Brussels Hoofdstedelijk Gewest', rand: '#1f5fbf', tint: '#4c8dff', groot: 17, plek: [[4.35, 50.93], [4.35, 50.77], [4.0, 50.9], [4.7, 50.8]] }
  };
  // provincies in tinten van hun gewest (met Gewesten aan)
  var GKLEUR = { wvl: '#ffe48a', ovl: '#ffd043', ant: '#ffe48a', vbr: '#fff0b8', lim: '#ffd043', bru: '#8fb8ff',
    hen: '#ffb3b3', wbr: '#ff9090', nam: '#ffd2d2', lui: '#ff9a9a', lux: '#ffb3b3' };
  var GEWEST_VAN = { wvl: 'vl', ovl: 'vl', ant: 'vl', lim: 'vl', vbr: 'vl', bru: 'bru', wbr: 'wa', hen: 'wa', nam: 'wa', lui: 'wa', lux: 'wa' };
  var STER = '#b3261e', RIVIER = '#5b9bd5', RIVIER_AAN = '#1257b8', INK = '#18212f';
  var BUURLANDEN = [
    { t: 'Noordzee', lon: 2.72, lat: 51.47, zee: true }, { t: 'Nederland', lon: 6.42, lat: 51.38, a: 'end' },
    { t: 'Duitsland', lon: 6.42, lat: 50.98, a: 'end' }, { t: 'Groothertogdom', t2: 'Luxemburg', lon: 6.16, lat: 49.88 },
    { t: 'Frankrijk', lon: 3.55, lat: 49.92 }
  ];

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: kleur ('1'|'0': provincies in kleur), prov / stad / riv ('1'|'0': laag tonen),
  // (prov = bolletjes van de provincies; sinds 0.2 zijn er geen bolletjes meer en wordt prov niet meer gelezen),
  // gewest ('1'|'0': gewesten tonen, sinds 0.2),
  // pnamen / snamen (provincie-id's met zichtbare naam, komma's), rnamen (namen van aangeklikte rivieren, komma's).
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
    try { var l = localStorage.getItem('kaartbelgie.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('kaartbelgie.' + k, String(v)); } catch (e) {}
  }
  function lijst(s) { var o = {}, a = s ? s.split(',') : []; for (var i = 0; i < a.length; i++) if (a[i]) o[a[i]] = true; return o; }
  function tekst(o) { var a = []; for (var k in o) if (o.hasOwnProperty(k) && o[k]) a.push(k); return a.join(','); }

  var K = KAART;
  var state = {
    kleur: prefGet('kleur', '1') !== '0', gewest: prefGet('gewest', '0') === '1', stad: prefGet('stad', '1') !== '0',
    riv: prefGet('riv', '1') !== '0', pnamen: lijst(prefGet('pnamen', '')), snamen: lijst(prefGet('snamen', '')),
    rnamen: lijst(prefGet('rnamen', ''))
  };
  function bewaar() {
    prefSet('pnamen', tekst(state.pnamen));
    prefSet('snamen', tekst(state.snamen));
    prefSet('rnamen', tekst(state.rnamen));
  }

  // ---------- SVG ----------
  function $(id) { return document.getElementById(id); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  // tekst met witte rand (twee keer tekenen: oude engines kennen paint-order niet)
  function label(parent, x, y, s, size, kleur, attrs, schuin) {
    var g = el('g', attrs || {}, parent), a = { x: x, y: y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 700, 'font-family': FONT };
    var halo = el('text', a, g);
    halo.setAttribute('stroke', '#ffffff'); halo.setAttribute('stroke-width', Math.round(size * 0.32)); halo.setAttribute('stroke-linejoin', 'round');
    halo.setAttribute('fill', '#ffffff'); halo.textContent = s;
    var t = el('text', a, g);
    t.setAttribute('fill', kleur); t.textContent = s;
    if (schuin) { halo.setAttribute('font-style', 'italic'); t.setAttribute('font-style', 'italic'); }
    return g;
  }
  function proj(lon, lat) {
    var COS = Math.cos(50.5 * Math.PI / 180);
    return { x: (lon - 2.5) * COS * 406, y: (51.55 - lat) * 406 };
  }
  function ster(parent, x, y, r, attrs) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      pts.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1));
    }
    attrs.points = pts.join(' ');
    return el('polygon', attrs, parent);
  }

  function render() {
    var svg = $('board'), i, p;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var x0 = K.x0 - 20, y0 = K.y0 - 20, w = K.w - x0 + 20, h = K.h - y0 + 30;
    svg.setAttribute('viewBox', x0 + ' ' + y0 + ' ' + w + ' ' + h);

    // buurlanden en zee
    for (i = 0; i < BUURLANDEN.length; i++) {
      var b = BUURLANDEN[i], q = proj(b.lon, b.lat);
      var t = el('text', { x: q.x, y: q.y, 'text-anchor': b.a || 'middle', 'font-size': 18, 'font-style': 'italic', 'font-family': FONT,
        fill: b.zee ? '#6f9fcf' : '#98a2b3', 'letter-spacing': 1 }, svg);
      t.textContent = b.t;
      if (b.t2) { var t2 = el('text', { x: q.x, y: q.y + 21, 'text-anchor': 'middle', 'font-size': 18, 'font-style': 'italic', 'font-family': FONT, fill: '#98a2b3', 'letter-spacing': 1 }, svg); t2.textContent = b.t2; }
    }

    // provincies: eerst een donkere rand rond het land, dan de vlakken met witte grenzen
    var land = el('g', {}, svg);
    for (i = 0; i < K.provincies.length; i++) el('path', { d: K.provincies[i].d, fill: '#5c677d', stroke: '#5c677d', 'stroke-width': 3.2, 'stroke-linejoin': 'round' }, land);
    for (i = 0; i < K.provincies.length; i++) {
      p = K.provincies[i];
      el('path', { d: p.d, fill: state.kleur ? (state.gewest ? GKLEUR[p.id] : KLEUR[p.id]) : '#f4f1ea', stroke: '#ffffff', 'stroke-width': state.kleur ? 1.6 : 1.2,
        'stroke-linejoin': 'round', 'data-role': 'prov', 'data-id': p.id, style: 'cursor:pointer' }, land);
    }
    if (!state.kleur) {
      for (i = 0; i < K.provincies.length; i++) el('path', { d: K.provincies[i].d, fill: 'none', stroke: '#9aa4b5', 'stroke-width': 1.2, 'pointer-events': 'none' }, land);
    }

    // gewesten: lichte kleur erover en een dikke rand
    if (state.gewest) {
      var gl = el('g', { 'pointer-events': 'none' }, svg), gw;
      if (!state.kleur) { // blinde kaart: een lichte kleur per gewest
        for (i = 0; i < K.provincies.length; i++) {
          gw = GEWEST_VAN[K.provincies[i].id];
          el('path', { d: K.provincies[i].d, fill: GEWESTEN[gw].tint, 'fill-opacity': 0.3, stroke: 'none' }, gl);
        }
      }
      for (gw in GEWESTEN) if (GEWESTEN.hasOwnProperty(gw)) {
        el('path', { d: K.gewesten[gw], fill: 'none', stroke: '#ffffff', 'stroke-width': 8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, gl);
      }
      for (gw in GEWESTEN) if (GEWESTEN.hasOwnProperty(gw)) {
        el('path', { d: K.gewesten[gw], fill: 'none', stroke: GEWESTEN[gw].rand, 'stroke-width': 4.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-gewest': gw }, gl);
      }
    }

    // rivieren
    if (state.riv) {
      var rl = el('g', {}, svg);
      for (i = 0; i < K.rivieren.length; i++) {
        var r = K.rivieren[i], aan = !!state.rnamen[r.naam];
        el('path', { d: r.d, fill: 'none', stroke: aan ? RIVIER_AAN : RIVIER, 'stroke-width': aan ? 4.2 : 1.7, 'stroke-opacity': aan ? 1 : 0.8,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none', 'data-rivier': r.naam }, rl);
      }
      // brede onzichtbare lijn om makkelijk te raken
      for (i = 0; i < K.rivieren.length; i++) {
        el('path', { d: K.rivieren[i].d, fill: 'none', stroke: '#000000', 'stroke-opacity': 0.004, 'stroke-width': 16,
          'stroke-linecap': 'round', 'data-role': 'riv', 'data-id': K.rivieren[i].naam, style: 'cursor:pointer' }, rl);
      }
    }

    // sterren
    if (state.stad) {
      for (i = 0; i < K.provincies.length; i++) {
        p = K.provincies[i];
        var groot = p.id === 'bru', sg = el('g', { 'data-role': 'stad', 'data-id': p.id, style: 'cursor:pointer' }, svg);
        el('circle', { cx: p.sx, cy: p.sy, r: 17, fill: '#ffffff', 'fill-opacity': 0.01 }, sg);
        ster(sg, p.sx, p.sy, groot ? 15 : 11, { fill: groot ? '#f2b705' : STER, stroke: '#ffffff', 'stroke-width': 2, 'stroke-linejoin': 'round', 'class': 'ster' });
      }
    }

    // namen: elk zoekt een vrije plek (eerst provincies, dan hoofdsteden, dan rivieren)
    var nl = el('g', { 'pointer-events': 'none' }, svg), bezet = [], j;
    for (i = 0; i < K.provincies.length; i++) {
      p = K.provincies[i];
      if (state.stad) bezet.push(vak(p.sx, p.sy, p.id === 'bru' ? 15 : 11));
    }
    if (state.gewest) {
      for (var gn in GEWESTEN) if (GEWESTEN.hasOwnProperty(gn)) {
        var G = GEWESTEN[gn], gc = [];
        for (j = 0; j < G.plek.length; j++) { var q2 = proj(G.plek[j][0], G.plek[j][1]); gc.push([q2.x, q2.y]); }
        zet(nl, bezet, G.naam, G.groot, G.rand, gc, { 'data-naam': 'gewest:' + gn }, false);
      }
    }
    for (i = 0; i < K.provincies.length; i++) {
      p = K.provincies[i];
      if (!state.pnamen[p.id]) continue;
      var bru = p.id === 'bru', naam = bru ? 'Brussels Gewest' : p.naam, fp = bru ? 15 : 20;
      // eerst in het midden van de provincie, anders er rond
      var pc = bru ? rondom(p.sx, p.sy, 16, naam, fp) : [[p.x, p.y + 7]].concat(rondom(p.x, p.y, 10, naam, fp));
      zet(nl, bezet, naam, fp, INK, pc, { 'data-naam': 'prov:' + p.id }, false);
    }
    if (state.stad) {
      for (i = 0; i < K.provincies.length; i++) {
        p = K.provincies[i];
        if (!state.snamen[p.id]) continue;
        var fs = p.id === 'bru' ? 18 : 16;
        zet(nl, bezet, p.stad, fs, STER, rondom(p.sx, p.sy, p.id === 'bru' ? 16 : 12, p.stad, fs), { 'data-naam': 'stad:' + p.id }, false);
      }
    }
    if (state.riv) {
      for (i = 0; i < K.rivieren.length; i++) {
        var rv = K.rivieren[i];
        if (!state.rnamen[rv.naam]) continue;
        var c = [], pp = rv.p || [[rv.x, rv.y]];
        for (j = 0; j < pp.length; j++) {
          var hw = rv.naam.length * 17 * 0.3 + 10;
          c.push([pp[j][0], pp[j][1] - 9]); c.push([pp[j][0], pp[j][1] + 21]);
          c.push([pp[j][0] + hw, pp[j][1] + 6]); c.push([pp[j][0] - hw, pp[j][1] + 6]);
        }
        for (var f = 1; f <= 3; f++) {
          for (j = 0; j < pp.length; j++) {
            c.push([pp[j][0], pp[j][1] - 9 - 17 * f]); c.push([pp[j][0], pp[j][1] + 21 + 17 * f]);
            c.push([pp[j][0] + hw + 18 * f, pp[j][1] + 6]); c.push([pp[j][0] - hw - 18 * f, pp[j][1] + 6]);
            c.push([pp[j][0] + hw + 12 * f, pp[j][1] - 10 - 10 * f]); c.push([pp[j][0] - hw - 12 * f, pp[j][1] + 22 + 10 * f]);
          }
        }
        zet(nl, bezet, rv.naam, 17, RIVIER_AAN, c, { 'data-naam': 'riv:' + rv.naam }, true);
      }
    }

    // schaal, noorden en bronnen
    var sx = K.w - 200, sy = K.h + 4;
    el('rect', { x: sx, y: sy, width: 91.5, height: 6, fill: '#5c677d' }, svg);
    el('rect', { x: sx + 91.5, y: sy, width: 91.5, height: 6, fill: '#ffffff', stroke: '#5c677d', 'stroke-width': 1 }, svg);
    var sk = el('text', { x: sx, y: sy - 6, 'font-size': 13, 'font-family': FONT, fill: '#667085' }, svg); sk.textContent = '0';
    sk = el('text', { x: sx + 183, y: sy - 6, 'font-size': 13, 'font-family': FONT, fill: '#667085', 'text-anchor': 'end' }, svg); sk.textContent = '50 km';
    var nx = K.w - 20, ny = K.y0 + 20;
    el('polygon', { points: nx + ',' + (ny - 22) + ' ' + (nx + 10) + ',' + (ny + 8) + ' ' + nx + ',' + ny + ' ' + (nx - 10) + ',' + (ny + 8), fill: '#5c677d' }, svg);
    var nt = el('text', { x: nx, y: ny + 28, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, 'font-family': FONT, fill: '#5c677d' }, svg); nt.textContent = 'N';
    var bron = el('text', { x: x0 + 8, y: y0 + h - 8, 'font-size': 10, 'font-family': FONT, fill: '#98a2b3' }, svg);
    bron.textContent = 'Grenzen: Statbel via geoBoundaries (ODbL) · Rivieren: © OpenStreetMap-bijdragers (ODbL)';

    // knoppen
    $('btnKleur').className = 'btn small toggle' + (state.kleur ? ' on' : '');
    mapsKnop();
    $('btnLaagGewest').className = 'btn small toggle' + (state.gewest ? ' on' : '');
    $('btnLaagStad').className = 'btn small toggle' + (state.stad ? ' on' : '');
    $('btnLaagRiv').className = 'btn small toggle' + (state.riv ? ' on' : '');
    $('btnAlleStad').disabled = !state.stad;
    $('btnAlleRiv').disabled = !state.riv;
    $('btnAlleProv').textContent = alle(state.pnamen, K.provincies, 'id') ? 'Provincies verbergen' : 'Alle provincies';
    $('btnAlleStad').textContent = alle(state.snamen, K.provincies, 'id') ? 'Hoofdsteden verbergen' : 'Alle hoofdsteden';
    $('btnAlleRiv').textContent = alle(state.rnamen, K.rivieren, 'naam') ? 'Rivieren verbergen' : 'Alle rivieren';
  }
  // ---------- Namen plaatsen zonder overlap ----------
  // Een naam is een rechthoek rond (x = midden, y = basislijn); de eerste kandidaat die niets raakt, wint.
  function vak(x, y, r) { return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }; }
  function tekstVak(x, y, s, size) {
    var w = s.length * size * 0.6 + 8;
    return { x0: x - w / 2, y0: y - size * 0.9, x1: x + w / 2, y1: y + size * 0.3 };
  }
  // totale overlap met de bezette vakken (0 = vrij)
  function raakt(a, l) {
    var t = 0;
    for (var i = 0; i < l.length; i++) {
      var ox = Math.min(a.x1, l[i].x1) - Math.max(a.x0, l[i].x0), oy = Math.min(a.y1, l[i].y1) - Math.max(a.y0, l[i].y0);
      if (ox > 0 && oy > 0) t += ox * oy;
    }
    return t;
  }
  // kandidaten rond een punt: boven, onder, rechts, links, en dan wat verder
  function rondom(x, y, r, s, size) {
    var w = s.length * size * 0.6 + 8, c = [];
    for (var f = 1; f <= 2; f++) {
      c.push([x, y - r * f - 4]);
      c.push([x, y + r * f + size * 0.9]);
      c.push([x + r * f + w / 2 + 2, y + size * 0.32]);
      c.push([x - r * f - w / 2 - 2, y + size * 0.32]);
    }
    return c;
  }
  // De echte maat van de tekst meten (getBBox) en de kandidaat met de minste overlap houden.
  function zet(parent, bezet, s, size, kleur, cand, attrs, schuin) {
    var g = label(parent, cand[0][0], cand[0][1], s, size, kleur, attrs, schuin), t = g.getElementsByTagName('text');
    function naar(x, y) { for (var j = 0; j < t.length; j++) { t[j].setAttribute('x', x); t[j].setAttribute('y', y); } }
    function maat() {
      var bb;
      try { bb = t[1].getBBox(); } catch (e) { bb = null; }
      if (!bb || !bb.width) return tekstVak(+t[1].getAttribute('x'), +t[1].getAttribute('y'), s, size);
      return { x0: bb.x - 3, y0: bb.y - 2, x1: bb.x + bb.width + 3, y1: bb.y + bb.height + 2 };
    }
    var k = 0, best = -1;
    for (var i = 0; i < cand.length; i++) {
      naar(cand[i][0], cand[i][1]);
      var o = raakt(maat(), bezet);
      if (best < 0 || o < best) { best = o; k = i; }
      if (o === 0) break;
    }
    naar(cand[k][0], cand[k][1]);
    bezet.push(maat());
    return g;
  }

  function alle(o, l, k) {
    for (var i = 0; i < l.length; i++) if (!o[l[i][k]]) return false;
    return true;
  }
  function wissel(o, l, k) {
    var a = alle(o, l, k), i;
    for (i = 0; i < l.length; i++) o[l[i][k]] = !a;
  }

  // ---------- Tikken ----------
  function roleOf(n) {
    var svg = $('board');
    while (n && n !== svg) {
      if (n.getAttribute && n.getAttribute('data-role')) return n;
      n = n.parentNode;
    }
    return null;
  }
  function tik(n) {
    var role = n.getAttribute('data-role'), id = n.getAttribute('data-id');
    var o = role === 'prov' ? state.pnamen : role === 'stad' ? state.snamen : state.rnamen;
    o[id] = !o[id];
    if (o[id]) laatste = { role: role, id: id };
    bewaar();
    render();
  }
  var press = null;
  function bindPointer() {
    var svg = $('board');
    svg.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var n = roleOf(e.target);
      if (!n) return;
      e.preventDefault();
      press = { n: n, x: e.clientX, y: e.clientY };
      function u(ev) {
        document.removeEventListener('mouseup', u, false);
        var pr = press; press = null;
        if (pr && Math.abs(ev.clientX - pr.x) + Math.abs(ev.clientY - pr.y) < 14) tik(pr.n);
      }
      document.addEventListener('mouseup', u, false);
    }, false);
    svg.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var n = roleOf(e.target);
      if (!n) return;
      e.preventDefault();
      var tgt = e.target, x = e.touches[0].clientX, y = e.touches[0].clientY, last = { x: x, y: y };
      function mv(ev) { if (ev.touches.length) { last.x = ev.touches[0].clientX; last.y = ev.touches[0].clientY; } }
      function u() {
        tgt.removeEventListener('touchmove', mv, false); tgt.removeEventListener('touchend', u, false); tgt.removeEventListener('touchcancel', u, false);
        if (Math.abs(last.x - x) + Math.abs(last.y - y) < 30) tik(n);
      }
      tgt.addEventListener('touchmove', mv, false);
      tgt.addEventListener('touchend', u, false);
      tgt.addEventListener('touchcancel', u, false);
    }, false);
  }

  var laatste = null; // laatst aangetikte plaats (voor Google Maps)
  function mapsVraag() {
    if (!laatste) return 'België';
    var i, p = null;
    for (i = 0; i < K.provincies.length; i++) if (K.provincies[i].id === laatste.id) p = K.provincies[i];
    if (laatste.role === 'riv') return laatste.id + ' (rivier), België';
    if (!p) return 'België';
    if (laatste.role === 'stad') return p.stad + ', België';
    return p.id === 'bru' ? 'Brussels Hoofdstedelijk Gewest' : 'Provincie ' + p.naam + ', België';
  }

  // ---------- Google Maps (enkel in de webversie: de knop heeft class alleen-web) ----------
  // Opent de plaats die het laatst aangetikt werd; er gaat pas iets naar Google als de leerkracht op de knop tikt.
  function mapsOpen() {
    var q = mapsVraag();
    try { window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), '_blank'); } catch (e) {}
  }
  function mapsKnop() {
    var b = $('btnMaps');
    if (b) b.title = 'Bekijk ' + mapsVraag() + ' in Google Maps (opent een nieuw tabblad)';
  }

  // ---------- Opstarten ----------
  function on(id, fn) { $(id).addEventListener('click', fn, false); }
  function laag(k, id) {
    on(id, function () { state[k] = !state[k]; prefSet(k, state[k] ? '1' : '0'); render(); });
  }
  function init() {
    on('btnKleur', function () { state.kleur = !state.kleur; prefSet('kleur', state.kleur ? '1' : '0'); render(); });
    laag('gewest', 'btnLaagGewest');
    laag('stad', 'btnLaagStad');
    laag('riv', 'btnLaagRiv');
    on('btnAlleProv', function () { wissel(state.pnamen, K.provincies, 'id'); bewaar(); render(); });
    on('btnAlleStad', function () { wissel(state.snamen, K.provincies, 'id'); bewaar(); render(); });
    on('btnAlleRiv', function () { wissel(state.rnamen, K.rivieren, 'naam'); bewaar(); render(); });
    on('btnWis', function () { state.pnamen = {}; state.snamen = {}; state.rnamen = {}; bewaar(); render(); });
    on('btnMaps', mapsOpen);
    on('btnTip', function () { $('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { $('overlayTip').className = 'overlay hidden'; });
    bindPointer();
    render();
  }

  window.__kaartbelgie = { state: state, render: render, kaart: K };
  init();
})();
