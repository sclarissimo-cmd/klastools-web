/* Kaart van Europa – OpenBoard-widget
 * Landen in kleur (tik op een land = naam), hoofdsteden met een sterretje (tik = naam), laag "EU" kleurt de
 * lidstaten van de Europese Unie, lagen met de grootste rivieren en gebergten. Alle namen met één knop.
 * Kaartgegevens in kaart.js (gemaakt door scripts/kaart_europa.py, Natural Earth).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FONT = '"Segoe UI", Arial, sans-serif';
  var PAL = ['#f7c59f', '#b8dbb0', '#f4a7b9', '#ffe08a', '#c7b8ea', '#a8d8d0'];
  var ZEE = '#dcebf7', ACHTER = '#ece8df', STER = '#b3261e', INK = '#18212f';
  var RIVIER = '#5b9bd5', RIVIER_AAN = '#1257b8', BERG = '#8d6e4a', BERG_AAN = '#6b4423';
  var EU_KLEUR = '#7fa8ea', EU_RAND = '#1f4fa8', NIET_EU = '#e6e2da';

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: kleur ('1'|'0': landen in kleur), stad ('1'|'0': sterretjes), eu ('1'|'0': EU-lidstaten kleuren),
  // lnamen / snamen (landcodes met zichtbare naam van het land / de hoofdstad, komma's),
  // riv / berg ('1'|'0': rivieren / gebergten tonen, sinds 0.2), rnamen / bnamen (aangetikte rivieren / gebergten).
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
    try { var l = localStorage.getItem('kaarteuropa.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('kaarteuropa.' + k, String(v)); } catch (e) {}
  }
  function lijst(s) { var o = {}, a = s ? s.split(',') : []; for (var i = 0; i < a.length; i++) if (a[i]) o[a[i]] = true; return o; }
  function tekst(o) { var a = []; for (var k in o) if (o.hasOwnProperty(k) && o[k]) a.push(k); return a.join(','); }

  var K = KAART, LANDEN = [];
  for (var li = 0; li < K.landen.length; li++) if (K.landen[li].naam) LANDEN.push(K.landen[li]);
  var state = {
    kleur: prefGet('kleur', '1') !== '0', stad: prefGet('stad', '1') !== '0', eu: prefGet('eu', '0') === '1',
    lnamen: lijst(prefGet('lnamen', '')), snamen: lijst(prefGet('snamen', '')),
    riv: prefGet('riv', '0') === '1', berg: prefGet('berg', '0') === '1',
    rnamen: lijst(prefGet('rnamen', '')), bnamen: lijst(prefGet('bnamen', ''))
  };
  var RIV = K.rivieren || [], BERGEN = K.gebergten || [];
  function bewaar() {
    prefSet('lnamen', tekst(state.lnamen));
    prefSet('snamen', tekst(state.snamen));
    prefSet('rnamen', tekst(state.rnamen));
    prefSet('bnamen', tekst(state.bnamen));
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
  function ster(parent, x, y, r, attrs) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      pts.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1));
    }
    attrs.points = pts.join(' ');
    return el('polygon', attrs, parent);
  }
  function vulling(l) {
    if (!state.kleur) return '#f6f3ec';
    if (state.eu) return l.eu ? EU_KLEUR : NIET_EU;
    return PAL[l.k % PAL.length];
  }

  // ---------- Namen plaatsen zonder overlap ----------
  function vak(x, y, r) { return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }; }
  function raakt(a, l) {
    var t = 0;
    for (var i = 0; i < l.length; i++) {
      var ox = Math.min(a.x1, l[i].x1) - Math.max(a.x0, l[i].x0), oy = Math.min(a.y1, l[i].y1) - Math.max(a.y0, l[i].y0);
      if (ox > 0 && oy > 0) t += ox * oy;
    }
    return t;
  }
  function rondom(x, y, r, s, size) {
    var w = s.length * size * 0.6 + 6, c = [];
    for (var f = 1; f <= 3; f++) {
      c.push([x, y - r * f - 3]);
      c.push([x, y + r * f + size * 0.9]);
      c.push([x + r * f + w / 2 + 2, y + size * 0.32]);
      c.push([x - r * f - w / 2 - 2, y + size * 0.32]);
      c.push([x + r * f + w / 2, y - r * f]);
      c.push([x - r * f - w / 2, y + r * f + size * 0.6]);
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
      var x = +t[1].getAttribute('x'), y = +t[1].getAttribute('y');
      if (!bb || !bb.width) { var w = s.length * size * 0.6 + 6; return { x0: x - w / 2, y0: y - size * 0.9, x1: x + w / 2, y1: y + size * 0.3 }; }
      return { x0: bb.x - 2, y0: bb.y - 1, x1: bb.x + bb.width + 2, y1: bb.y + bb.height + 1 };
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

  function render() {
    var svg = $('board'), i, l;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', K.x0 + ' ' + K.y0 + ' ' + K.w + ' ' + K.h);
    el('rect', { x: K.x0, y: K.y0, width: K.w, height: K.h, fill: ZEE }, svg);

    // landen: eerst de achtergrond (niet aan te tikken), dan de landen van de kaart
    var land = el('g', {}, svg);
    for (i = 0; i < K.landen.length; i++) {
      l = K.landen[i];
      if (l.naam || !l.d) continue;
      el('path', { d: l.d, fill: ACHTER, stroke: '#ffffff', 'stroke-width': 0.8, 'stroke-linejoin': 'round', 'pointer-events': 'none' }, land);
    }
    for (i = 0; i < LANDEN.length; i++) {
      l = LANDEN[i];
      if (!l.d) continue;
      el('path', { d: l.d, fill: vulling(l), stroke: state.kleur ? '#ffffff' : '#9aa4b5', 'stroke-width': state.eu ? 1.4 : 1,
        'stroke-linejoin': 'round', 'data-role': 'land', 'data-id': l.id, style: 'cursor:pointer' }, land);
    }

    // gebergten: bruine vlakken (niet aan te tikken: dan blijven de landen eronder aantikbaar), driehoekje om te tikken
    if (state.berg) {
      var bl = el('g', {}, svg);
      for (i = 0; i < BERGEN.length; i++) {
        var aanB = !!state.bnamen[BERGEN[i].naam];
        el('path', { d: BERGEN[i].d, fill: aanB ? BERG_AAN : BERG, 'fill-opacity': aanB ? 0.55 : 0.32, stroke: aanB ? BERG_AAN : 'none',
          'stroke-width': 1.2, 'pointer-events': 'none', 'data-berg': BERGEN[i].naam }, bl);
      }
      for (i = 0; i < BERGEN.length; i++) {
        var b = BERGEN[i], tg = el('g', { 'data-role': 'berg', 'data-id': b.naam, style: 'cursor:pointer' }, bl);
        el('circle', { cx: b.x, cy: b.y, r: 11, fill: '#ffffff', 'fill-opacity': 0.01 }, tg);
        el('polygon', { points: b.x + ',' + (b.y - 7) + ' ' + (b.x + 7) + ',' + (b.y + 5) + ' ' + (b.x - 7) + ',' + (b.y + 5),
          fill: BERG_AAN, stroke: '#ffffff', 'stroke-width': 1.3, 'stroke-linejoin': 'round', 'class': 'berg' }, tg);
      }
    }
    // rivieren: dun en discreet; aangetikt dik en donkerblauw
    if (state.riv) {
      var rl = el('g', {}, svg);
      for (i = 0; i < RIV.length; i++) {
        var aanR = !!state.rnamen[RIV[i].naam];
        el('path', { d: RIV[i].d, fill: 'none', stroke: aanR ? RIVIER_AAN : RIVIER, 'stroke-width': aanR ? 3.2 : 1.4,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none', 'data-rivier': RIV[i].naam }, rl);
      }
      for (i = 0; i < RIV.length; i++) {
        el('path', { d: RIV[i].d, fill: 'none', stroke: '#000000', 'stroke-opacity': 0.004, 'stroke-width': 12,
          'stroke-linecap': 'round', 'data-role': 'riv', 'data-id': RIV[i].naam, style: 'cursor:pointer' }, rl);
      }
    }

    // kleine landen: een rondje om op te tikken
    for (i = 0; i < LANDEN.length; i++) {
      l = LANDEN[i];
      if (!l.klein) continue;
      var kg = el('g', { 'data-role': 'land', 'data-id': l.id, style: 'cursor:pointer' }, svg);
      el('circle', { cx: l.x, cy: l.y, r: 11, fill: '#ffffff', 'fill-opacity': 0.01 }, kg);
      el('circle', { cx: l.x, cy: l.y, r: 5.5, fill: vulling(l), stroke: state.eu && l.eu ? EU_RAND : '#5c677d', 'stroke-width': 1.6, 'class': 'rondje' }, kg);
    }

    // hoofdsteden (niet bij de kleine landen: daar is het rondje het land)
    if (state.stad) {
      for (i = 0; i < LANDEN.length; i++) {
        l = LANDEN[i];
        if (l.klein) continue;
        var sg = el('g', { 'data-role': 'stad', 'data-id': l.id, style: 'cursor:pointer' }, svg);
        el('circle', { cx: l.sx, cy: l.sy, r: 10, fill: '#ffffff', 'fill-opacity': 0.01 }, sg);
        ster(sg, l.sx, l.sy, 7, { fill: STER, stroke: '#ffffff', 'stroke-width': 1.3, 'stroke-linejoin': 'round', 'class': 'ster' });
      }
    }

    // namen: eerst de landen, dan de hoofdsteden; elk zoekt een vrije plek
    var nl = el('g', { 'pointer-events': 'none' }, svg), bezet = [];
    for (i = 0; i < LANDEN.length; i++) {
      l = LANDEN[i];
      if (state.stad && !l.klein) bezet.push(vak(l.sx, l.sy, 7));
      if (l.klein) bezet.push(vak(l.x, l.y, 6));
    }
    if (state.berg) for (i = 0; i < BERGEN.length; i++) bezet.push(vak(BERGEN[i].x, BERGEN[i].y, 7));
    for (i = 0; i < LANDEN.length; i++) {
      l = LANDEN[i];
      if (!state.lnamen[l.id]) continue;
      var c = l.klein ? rondom(l.x, l.y, 8, l.naam, 16) : [[l.x, l.y + 6]].concat(rondom(l.x, l.y, 8, l.naam, 16));
      zet(nl, bezet, l.naam, 16, INK, c, { 'data-naam': 'land:' + l.id });
    }
    for (i = 0; i < LANDEN.length; i++) {
      l = LANDEN[i];
      if (!state.snamen[l.id] || !state.stad) continue;
      var sx = l.klein ? l.x : l.sx, sy = l.klein ? l.y : l.sy;
      zet(nl, bezet, l.stad, 13, STER, rondom(sx, sy, 7, l.stad, 13), { 'data-naam': 'stad:' + l.id });
    }

    if (state.berg) {
      for (i = 0; i < BERGEN.length; i++) {
        var bg = BERGEN[i];
        if (state.bnamen[bg.naam]) zet(nl, bezet, bg.naam, 14, BERG_AAN, rondom(bg.x, bg.y, 8, bg.naam, 14), { 'data-naam': 'berg:' + bg.naam }, true);
      }
    }
    if (state.riv) {
      for (i = 0; i < RIV.length; i++) {
        var rv = RIV[i], rc = [], j, hw = rv.naam.length * 14 * 0.3 + 8;
        if (!state.rnamen[rv.naam]) continue;
        for (j = 0; j < rv.p.length; j++) {
          rc.push([rv.p[j][0], rv.p[j][1] - 7]); rc.push([rv.p[j][0], rv.p[j][1] + 17]);
          rc.push([rv.p[j][0] + hw, rv.p[j][1] + 5]); rc.push([rv.p[j][0] - hw, rv.p[j][1] + 5]);
        }
        for (j = 0; j < rv.p.length; j++) {
          rc.push([rv.p[j][0], rv.p[j][1] - 22]); rc.push([rv.p[j][0], rv.p[j][1] + 32]);
          rc.push([rv.p[j][0] + hw + 16, rv.p[j][1] + 5]); rc.push([rv.p[j][0] - hw - 16, rv.p[j][1] + 5]);
        }
        zet(nl, bezet, rv.naam, 14, RIVIER_AAN, rc, { 'data-naam': 'riv:' + rv.naam }, true);
      }
    }

    // legende EU, schaal en bron
    var lx = K.x0 + 14, ly = K.y0 + K.h - 70;
    if (state.eu) {
      var lg = el('g', { id: 'legende' }, svg);
      el('rect', { x: lx, y: ly - 46, width: 214, height: 66, rx: 8, ry: 8, fill: '#ffffff', 'fill-opacity': 0.9, stroke: '#d4dae4' }, lg);
      el('rect', { x: lx + 10, y: ly - 36, width: 20, height: 14, rx: 3, ry: 3, fill: state.kleur ? EU_KLEUR : '#f6f3ec', stroke: EU_RAND, 'stroke-width': 1.2 }, lg);
      var t1 = el('text', { x: lx + 38, y: ly - 24, 'font-size': 13, 'font-weight': 700, 'font-family': FONT, fill: EU_RAND }, lg); t1.textContent = 'Lid van de Europese Unie (27)';
      el('rect', { x: lx + 10, y: ly - 12, width: 20, height: 14, rx: 3, ry: 3, fill: state.kleur ? NIET_EU : '#f6f3ec', stroke: '#9aa4b5', 'stroke-width': 1 }, lg);
      var t2 = el('text', { x: lx + 38, y: ly, 'font-size': 13, 'font-family': FONT, fill: '#5c677d' }, lg); t2.textContent = 'Geen lid';
    }
    var km = 500 * K.km, bx = K.x0 + K.w - km - 24, by = K.y0 + K.h - 26;
    el('rect', { x: bx, y: by, width: km / 2, height: 5, fill: '#5c677d' }, svg);
    el('rect', { x: bx + km / 2, y: by, width: km / 2, height: 5, fill: '#ffffff', stroke: '#5c677d', 'stroke-width': 1 }, svg);
    var s0 = el('text', { x: bx, y: by - 5, 'font-size': 12, 'font-family': FONT, fill: '#5c677d' }, svg); s0.textContent = '0';
    var s1 = el('text', { x: bx + km, y: by - 5, 'font-size': 12, 'font-family': FONT, fill: '#5c677d', 'text-anchor': 'end' }, svg); s1.textContent = '500 km';
    var bron = el('text', { x: K.x0 + K.w - 8, y: K.y0 + K.h - 6, 'font-size': 9, 'font-family': FONT, fill: '#8a94a6', 'text-anchor': 'end' }, svg);
    bron.textContent = 'Landsgrenzen: Natural Earth';

    // knoppen
    $('btnLaagStad').className = 'btn small toggle' + (state.stad ? ' on' : '');
    $('btnEU').className = 'btn small toggle' + (state.eu ? ' on' : '');
    $('btnKleur').className = 'btn small toggle' + (state.kleur ? ' on' : '');
    $('btnLaagRiv').className = 'btn small toggle' + (state.riv ? ' on' : '');
    $('btnLaagBerg').className = 'btn small toggle' + (state.berg ? ' on' : '');
    $('btnAlleRiv').disabled = !state.riv;
    $('btnAlleBerg').disabled = !state.berg;
    $('btnAlleRiv').textContent = alleN(state.rnamen, RIV) ? 'Rivieren verbergen' : 'Alle rivieren';
    $('btnAlleBerg').textContent = alleN(state.bnamen, BERGEN) ? 'Gebergten verbergen' : 'Alle gebergten';
    $('btnAlleStad').disabled = !state.stad;
    var al = alle(state.lnamen), as = alle(state.snamen);
    $('btnAlleLand').textContent = al ? 'Landen verbergen' : 'Alle landen';
    $('btnAlleStad').textContent = as ? 'Hoofdsteden verbergen' : 'Alle hoofdsteden';
    $('btnAlles').textContent = allesAan() ? 'Alle namen verbergen' : 'Alle namen';
  }
  function alleN(o, l) {
    for (var i = 0; i < l.length; i++) if (!o[l[i].naam]) return false;
    return true;
  }
  function zetN(o, l, aan) { for (var i = 0; i < l.length; i++) o[l[i].naam] = aan; }
  // alle namen van de zichtbare lagen staan aan
  function allesAan() {
    return alle(state.lnamen) && (alle(state.snamen) || !state.stad) &&
      (alleN(state.rnamen, RIV) || !state.riv) && (alleN(state.bnamen, BERGEN) || !state.berg);
  }
  function alle(o) {
    for (var i = 0; i < LANDEN.length; i++) if (!o[LANDEN[i].id]) return false;
    return true;
  }
  function zetAlle(o, aan) { for (var i = 0; i < LANDEN.length; i++) o[LANDEN[i].id] = aan; }

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
    var r = n.getAttribute('data-role'), id = n.getAttribute('data-id');
    var o = r === 'stad' ? state.snamen : r === 'riv' ? state.rnamen : r === 'berg' ? state.bnamen : state.lnamen;
    o[id] = !o[id];
    bewaar();
    render();
  }
  function bindPointer() {
    var svg = $('board');
    svg.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var n = roleOf(e.target);
      if (!n) return;
      e.preventDefault();
      var x = e.clientX, y = e.clientY;
      function u(ev) {
        document.removeEventListener('mouseup', u, false);
        if (Math.abs(ev.clientX - x) + Math.abs(ev.clientY - y) < 14) tik(n);
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

  // ---------- Opstarten ----------
  function on(id, fn) { $(id).addEventListener('click', fn, false); }
  function knop(k, id) {
    on(id, function () { state[k] = !state[k]; prefSet(k, state[k] ? '1' : '0'); render(); });
  }
  function init() {
    knop('stad', 'btnLaagStad');
    knop('eu', 'btnEU');
    knop('kleur', 'btnKleur');
    on('btnAlleLand', function () { zetAlle(state.lnamen, !alle(state.lnamen)); bewaar(); render(); });
    on('btnAlleStad', function () { zetAlle(state.snamen, !alle(state.snamen)); bewaar(); render(); });
    knop('riv', 'btnLaagRiv');
    knop('berg', 'btnLaagBerg');
    on('btnAlleRiv', function () { zetN(state.rnamen, RIV, !alleN(state.rnamen, RIV)); bewaar(); render(); });
    on('btnAlleBerg', function () { zetN(state.bnamen, BERGEN, !alleN(state.bnamen, BERGEN)); bewaar(); render(); });
    on('btnAlles', function () {
      var aan = !allesAan();
      zetAlle(state.lnamen, aan);
      zetAlle(state.snamen, aan);
      zetN(state.rnamen, RIV, aan);
      zetN(state.bnamen, BERGEN, aan);
      bewaar();
      render();
    });
    on('btnTip', function () { $('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { $('overlayTip').className = 'overlay hidden'; });
    bindPointer();
    render();
  }

  window.__kaarteuropa = { state: state, render: render, kaart: K, landen: LANDEN };
  init();
})();
