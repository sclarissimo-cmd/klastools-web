/* Klok – OpenBoard-widget
 * Analoge en digitale klok samen, met de tijd in (Vlaamse) woorden.
 * Tijd verzetten: wijzers slepen, pijltjes, of de digitale cijfers intikken.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var INK = '#18212f', MUTED = '#667085';
  var HOUR_COLOR = '#1f5fbf', MIN_COLOR = '#e5484d';
  var R = 240; // straal van de wijzerplaat (SVG-eenheden)

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: time (minuten na middernacht, '0'..'1439'), step ('1'|'5'),
  // analog, digital, words, voorOver, labels, minNums, h24 ('0'|'1'),
  // wordsTop ('1' = woorden boven de klok i.p.v. eronder), ring24 ('1' = binnenring 13-24 op de wijzerklok).
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
    try { var l = localStorage.getItem('klok.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('klok.' + k, String(v)); } catch (e) {}
  }
  function flag(k, d) { return prefGet(k, d) === '1'; }

  var t0 = parseInt(prefGet('time', '195'), 10); // standaard 3.15 u
  var state = {
    time: t0 >= 0 && t0 < 1440 ? t0 : 195,
    step: prefGet('step', '5') === '1' ? 1 : 5,
    analog: flag('analog', '1'),
    digital: flag('digital', '1'),
    words: flag('words', '0'),
    voorOver: flag('voorOver', '0'),
    labels: flag('labels', '0'),
    minNums: flag('minNums', '0'),
    h24: flag('h24', '0'),
    wordsTop: flag('wordsTop', '0'),
    ring24: flag('ring24', '0')
  };
  var TOGGLES = ['analog', 'digital', 'words', 'voorOver', 'labels', 'minNums', 'h24', 'wordsTop', 'ring24'];

  function save() {
    prefSet('time', state.time);
    prefSet('step', state.step);
    for (var i = 0; i < TOGGLES.length; i++) prefSet(TOGGLES[i], state[TOGGLES[i]] ? '1' : '0');
  }

  // ---------- Woorden (Vlaams) ----------
  var ONES = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien',
    'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien'];
  var TENS = ['', '', 'twintig', 'dertig', 'veertig', 'vijftig'];
  function num(n) {
    if (n < 20) return ONES[n];
    var t = TENS[Math.floor(n / 10)], o = n % 10;
    if (!o) return t;
    var w = o === 1 ? 'een' : ONES[o];
    // twee + en -> tweeën, drie + en -> drieën
    return w + (w.charAt(w.length - 1) === 'e' ? 'ën' : 'en') + t;
  }
  function hourWord(h) { var x = h % 12; return num(x === 0 ? 12 : x); }
  // Minuten als woord: veelvouden van 5 zonder "minuten" ("vijf over"), anders "zeven minuten over".
  function mins(n) {
    if (n === 15) return 'kwart';
    if (n % 5 === 0) return num(n);
    return num(n) + (n === 1 ? ' minuut' : ' minuten');
  }

  // Geeft een lijst stukken [{t: tekst, c: 'min'|'uur'|''}]:
  // 3.00 drie uur | 3.05 vijf over drie | 3.15 kwart over drie | 3.20 twintig over drie |
  // 3.25 vijfentwintig over drie | 3.30 half vier | 3.35 vijfentwintig voor vier | 3.40 twintig voor vier |
  // 3.45 kwart voor vier | 3.55 vijf voor vier.
  // Zo zeggen de nieuwe Vlaamse minimumdoelen het (vroeger: "vijf voor half vier", "vijf over half vier").
  function speak(time) {
    var h = Math.floor(time / 60), m = time % 60;
    var cur = hourWord(h), next = hourWord(h + 1);
    if (m === 0) return [{ t: cur, c: 'uur' }, { t: ' uur', c: '' }];
    if (m < 30) return [{ t: mins(m) + ' over ', c: 'min' }, { t: cur, c: 'uur' }];
    if (m === 30) return [{ t: 'half ', c: 'min' }, { t: next, c: 'uur' }];
    return [{ t: mins(60 - m) + ' voor ', c: 'min' }, { t: next, c: 'uur' }];
  }
  function dagdeel(time) {
    var h = Math.floor(time / 60);
    if (h < 6) return '\'s nachts';
    if (h < 12) return '\'s morgens';
    if (h < 14) return '\'s middags';
    if (h < 18) return '\'s namiddags';
    return '\'s avonds';
  }
  // Zoals op de radio of een uurrooster: "vijftien uur twintig".
  function formal(time) {
    var h = Math.floor(time / 60), m = time % 60;
    return num(h) + ' uur' + (m ? ' ' + num(m) : '');
  }
  function plain(parts) {
    var s = '';
    for (var i = 0; i < parts.length; i++) s += parts[i].t;
    return s;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function digitalText(time) {
    var h = Math.floor(time / 60), m = time % 60;
    if (!state.h24) { h = h % 12; if (h === 0) h = 12; }
    return pad(h) + ':' + pad(m); // altijd twee cijfers voor het uur: 03:35
  }

  // ---------- Tijd veranderen ----------
  function setTime(t, keep) {
    state.time = ((Math.round(t) % 1440) + 1440) % 1440;
    if (!keep) save();
    render();
  }
  function addMinutes(d) { setTime(state.time + d); }

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
  // Punt op afstand r bij hoek a (graden, 0 = 12 uur, met de klok mee).
  function pt(a, r) {
    var rad = (a - 90) * Math.PI / 180;
    return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
  }

  var LABELS = ['uur', 'vijf over', 'tien over', 'kwart over', 'twintig over', 'vijfentwintig over', 'half',
    'vijfentwintig voor', 'twintig voor', 'kwart voor', 'tien voor', 'vijf voor'];

  function renderClock() {
    var svg = document.getElementById('clock');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var ext = R + 20;
    if (state.minNums) ext = R + 62;
    if (state.labels) ext = R + (state.minNums ? 250 : 205);
    var extY = state.labels ? (state.minNums ? R + 110 : R + 70) : ext;
    svg.setAttribute('viewBox', (-ext) + ' ' + (-extY) + ' ' + (2 * ext) + ' ' + (2 * extY));

    el('circle', { cx: 0, cy: 0, r: R, fill: '#ffffff' }, svg);
    if (state.voorOver) {
      el('path', { d: 'M 0 ' + (-R) + ' A ' + R + ' ' + R + ' 0 0 1 0 ' + R + ' Z', fill: '#c9f0da' }, svg);
      el('path', { d: 'M 0 ' + R + ' A ' + R + ' ' + R + ' 0 0 1 0 ' + (-R) + ' Z', fill: '#fbd0d1' }, svg);
      text('OVER', { x: 68, y: 66, 'font-size': 24, 'font-weight': 800, fill: '#157a4f', 'letter-spacing': 2 }, svg);
      text('VOOR', { x: -68, y: 66, 'font-size': 24, 'font-weight': 800, fill: '#b4292e', 'letter-spacing': 2 }, svg);
      el('line', { x1: 0, y1: -R, x2: 0, y2: R, stroke: '#9aa4b5', 'stroke-width': 3, 'stroke-dasharray': '10 8' }, svg);
    }
    // streepjes
    for (var i = 0; i < 60; i++) {
      var big = i % 5 === 0;
      var a = pt(i * 6, R - 8), b = pt(i * 6, R - (big ? 34 : 20));
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: INK, 'stroke-width': big ? 6 : 2.5, 'stroke-linecap': 'round' }, svg);
    }
    el('circle', { cx: 0, cy: 0, r: R, fill: 'none', stroke: INK, 'stroke-width': 10 }, svg);
    // uren
    for (var hr = 1; hr <= 12; hr++) {
      var p = pt(hr * 30, R - 72);
      text(String(hr), { x: p.x, y: p.y + 17, 'font-size': 50, 'font-weight': 700, fill: INK }, svg);
    }
    // binnenring 13-24: in de namiddag/avond blauw en vet, anders grijs
    if (state.ring24) {
      var pm = state.time >= 720;
      for (var hh = 1; hh <= 12; hh++) {
        var rp = pt(hh * 30, R - 128);
        text(String(hh + 12), { x: rp.x, y: rp.y + 10, 'font-size': 28, 'font-weight': pm ? 800 : 600,
          fill: pm ? HOUR_COLOR : '#98a2b3', 'class': 'ring24' }, svg);
      }
    }
    // minuten rond de klok (05, 10, ... 00)
    if (state.minNums) {
      for (var k = 0; k < 12; k++) {
        var q = pt(k * 30, R + 36);
        text(pad(k * 5), { x: q.x, y: q.y + 10, 'font-size': 28, 'font-weight': 600, fill: MIN_COLOR, 'class': 'minnum' }, svg);
      }
    }
    // woorden rond de klok
    if (state.labels) {
      var lr = R + (state.minNums ? 80 : 40);
      for (var j = 0; j < 12; j++) {
        var s = pt(j * 30, lr);
        var anchor = j === 0 || j === 6 ? 'middle' : (j < 6 ? 'start' : 'end');
        var dy = j === 0 ? -6 : (j === 6 ? 30 : 9);
        text(LABELS[j], { x: s.x, y: s.y + dy, 'font-size': 26, 'font-weight': 600, fill: MUTED, 'text-anchor': anchor, 'class': 'lbl' }, svg);
      }
    }

    // wijzers: de korte loopt mee met de minuten, zoals bij een echte klok
    var m = state.time % 60;
    var hourAngle = (state.time % 720) / 2; // 720 minuten = 360 graden
    hand(svg, 'hour', hourAngle, 135, 18, HOUR_COLOR);
    hand(svg, 'min', m * 6, 205, 10, MIN_COLOR);
    el('circle', { cx: 0, cy: 0, r: 14, fill: INK }, svg);
  }
  function hand(svg, name, angle, len, width, color) {
    var g = el('g', { 'class': 'hand', 'data-hand': name }, svg);
    var tip = pt(angle, len), back = pt(angle + 180, 24);
    // brede onzichtbare lijn zodat de wijzer makkelijk te pakken is (ook met een vinger)
    el('line', { x1: back.x, y1: back.y, x2: tip.x, y2: tip.y, stroke: '#ffffff', 'stroke-opacity': 0.01, 'stroke-width': 56, 'stroke-linecap': 'round' }, g);
    el('line', { x1: back.x, y1: back.y, x2: tip.x, y2: tip.y, stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' }, g);
  }

  function renderDigital() {
    var h = Math.floor(state.time / 60), m = state.time % 60;
    var inH = document.getElementById('inH'), inM = document.getElementById('inM');
    if (!state.h24) { h = h % 12; if (h === 0) h = 12; }
    if (document.activeElement !== inH) inH.value = pad(h);
    if (document.activeElement !== inM) inM.value = pad(m);
  }

  function renderWords() {
    var w1 = document.getElementById('w1'), w2 = document.getElementById('w2');
    var parts = speak(state.time);
    w1.innerHTML = '';
    for (var i = 0; i < parts.length; i++) {
      var span = document.createElement('span');
      if (parts[i].c) span.className = parts[i].c;
      span.appendChild(document.createTextNode(parts[i].t));
      w1.appendChild(span);
    }
    if (state.h24) {
      var d = document.createElement('span');
      d.className = 'dag';
      d.appendChild(document.createTextNode(' ' + dagdeel(state.time)));
      w1.appendChild(d);
      w2.textContent = digitalText(state.time).replace(':', '.') + ' u: ' + formal(state.time);
      w2.style.display = '';
    } else {
      w2.textContent = '';
      w2.style.display = 'none';
    }
  }

  // Plaatst de onderdelen; hoogte in % werkt niet in de oude engine, dus alles in pixels.
  function layout() {
    var stage = document.getElementById('stageIn');
    var W = stage.clientWidth, H = stage.clientHeight;
    var a = document.getElementById('analogPane'), d = document.getElementById('digitalPane'), w = document.getElementById('wordsPane');
    a.style.display = state.analog ? '' : 'none';
    d.style.display = state.digital ? '' : 'none';
    w.style.display = state.words ? '' : 'none';
    var top = state.analog || state.digital;
    var wordsH = state.words ? (top ? Math.round(Math.max(80, H * (state.h24 ? 0.26 : 0.2))) : H) : 0;
    var topH = H - wordsH;
    var split = state.analog && state.digital ? Math.round(W * 0.56) : W;
    // woorden boven of onder; de klokken nemen de rest van de hoogte
    var up = state.wordsTop;
    a.style.top = d.style.top = (up ? wordsH : 0) + 'px';
    a.style.bottom = d.style.bottom = (up ? 0 : wordsH) + 'px';
    a.style.right = (state.digital ? W - split : 0) + 'px';
    d.style.left = (state.analog ? split : 0) + 'px';
    w.style.top = up ? '0px' : 'auto';
    w.style.bottom = up ? 'auto' : '0px';
    w.style.height = wordsH + 'px';
    var dw = state.analog ? W - split : W;
    document.getElementById('digital').style.fontSize = Math.max(24, Math.min(dw / 4.3, topH / 2.7, 190)) + 'px';
    var len = plain(speak(state.time)).length + (state.h24 ? 14 : 0);
    var ws = Math.min(W * 0.92 / (len * 0.55), wordsH / (state.h24 ? 2.4 : 1.6), 120);
    w.getElementsByTagName('div')[0].style.fontSize = Math.max(16, ws) + 'px';
  }

  function render() {
    if (state.analog) renderClock();
    renderDigital();
    renderWords();
    renderControls();
    layout();
    window.__klok.time = state.time;
  }

  function renderControls() {
    var ids = { analog: 'tAnalog', digital: 'tDigital', words: 'tWords', voorOver: 'tVoorOver', labels: 'tLabels', minNums: 'tMinNums', h24: 'tH24', ring24: 'tRing24' };
    for (var k in ids) {
      if (!ids.hasOwnProperty(k)) continue;
      var b = document.getElementById(ids[k]);
      b.className = 'btn' + (k === 'analog' || k === 'digital' || k === 'words' ? ' small' : '') + (state[k] ? ' on' : '');
    }
    var pos = document.getElementById('tWordsPos');
    pos.style.display = state.words ? '' : 'none';
    pos.innerHTML = state.wordsTop ? '&#9660; onder' : '&#9650; boven';
    pos.setAttribute('title', state.wordsTop ? 'Woorden onder de klok zetten' : 'Woorden boven de klok zetten');
    var seg = document.getElementById('stepSeg').getElementsByTagName('button');
    for (var i = 0; i < seg.length; i++) seg[i].className = +seg[i].getAttribute('data-step') === state.step ? 'on' : '';
  }

  // ---------- Wijzers slepen ----------
  var drag = null;
  function angleAt(clientX, clientY) {
    var svg = document.getElementById('clock');
    var p = svg.createSVGPoint();
    p.x = clientX; p.y = clientY;
    p = p.matrixTransform(svg.getScreenCTM().inverse());
    var a = Math.atan2(p.x, -p.y) * 180 / Math.PI;
    return a < 0 ? a + 360 : a;
  }
  // De tijd schuift met het kortste verschil, zodat over 12 heen draaien het uur doet verspringen.
  function dragTo(clientX, clientY) {
    var a = angleAt(clientX, clientY), diff;
    if (drag === 'min') {
      var m = (Math.round(a / 6 / state.step) * state.step) % 60;
      diff = m - state.time % 60;
      if (diff > 30) diff -= 60;
      if (diff <= -30) diff += 60;
    } else {
      var t12 = (Math.round(a * 2 / state.step) * state.step) % 720;
      diff = t12 - state.time % 720;
      if (diff > 360) diff -= 720;
      if (diff <= -360) diff += 720;
    }
    if (diff) setTime(state.time + diff, true);
  }
  function handOf(n) {
    while (n && n.getAttribute && n.getAttribute('data-hand') === null) n = n.parentNode;
    return n && n.getAttribute ? n.getAttribute('data-hand') : null;
  }
  function startDrag(e, target) {
    var h = handOf(target);
    if (!h) return false;
    drag = h;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation(); // niet de hele widget verslepen
    return true;
  }
  function endDrag() { if (drag) { drag = null; save(); } }

  // ---------- Intikken ----------
  function applyInput() {
    var hs = document.getElementById('inH').value.replace(/\D/g, '');
    var ms = document.getElementById('inM').value.replace(/\D/g, '');
    var h = hs === '' ? NaN : parseInt(hs, 10), m = ms === '' ? NaN : parseInt(ms, 10);
    var curH = Math.floor(state.time / 60);
    if (isNaN(h)) h = curH;
    if (isNaN(m)) m = state.time % 60;
    if (m > 59) m = 59;
    if (state.h24) {
      if (h > 23) h = 23;
    } else {
      // 12 uur: voormiddag/namiddag blijft zoals hij was
      if (h > 12) h = h % 12; // wie toch 15 tikt, krijgt 3 u
      h = h % 12 + (curH >= 12 ? 12 : 0);
    }
    setTime(h * 60 + m);
  }

  // ---------- Gebeurtenissen ----------
  function on(id, fn, ev) { document.getElementById(id).addEventListener(ev || 'click', fn, false); }
  function toggle(key) { return function () { state[key] = !state[key]; save(); render(); }; }

  function init() {
    window.__klok = { state: state, time: state.time, speak: function (t) { return plain(speak(t)); },
      formal: formal, dagdeel: dagdeel };

    var svg = document.getElementById('clock');
    svg.addEventListener('mousedown', function (e) { startDrag(e, e.target); }, false);
    document.addEventListener('mousemove', function (e) { if (drag) { e.preventDefault(); dragTo(e.clientX, e.clientY); } }, false);
    document.addEventListener('mouseup', endDrag, false);
    // Aanraken: de browser stuurt alle vingerbewegingen naar het element dat eerst aangeraakt werd, ook als
    // dat ondertussen opnieuw getekend (en dus uit de pagina gehaald) is. Daarom luisteren we op dat element zelf.
    svg.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || !startDrag(e, e.target)) return;
      var tgt = e.target;
      function move(ev) { if (drag && ev.touches.length) { ev.preventDefault(); dragTo(ev.touches[0].clientX, ev.touches[0].clientY); } }
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

    on('hUp', function () { addMinutes(60); });
    on('hDown', function () { addMinutes(-60); });
    on('mUp', function () { addMinutes(state.step); });
    on('mDown', function () { addMinutes(-state.step); });
    var ins = ['inH', 'inM'];
    for (var i = 0; i < ins.length; i++) {
      on(ins[i], function () { this.select(); }, 'focus');
      on(ins[i], function () { applyInput(); }, 'change');
      on(ins[i], function (e) {
        if (e.keyCode === 13) { applyInput(); this.blur(); }
      }, 'keydown');
    }
    // na twee cijfers in het uur meteen naar de minuten
    on('inH', function () { if (this.value.replace(/\D/g, '').length === 2) document.getElementById('inM').focus(); }, 'input');
    on('inM', function () { renderDigital(); }, 'blur');
    on('inH', function () { renderDigital(); }, 'blur');

    on('tAnalog', toggle('analog'));
    on('tDigital', toggle('digital'));
    on('tWords', toggle('words'));
    on('tWordsPos', toggle('wordsTop'));
    on('tVoorOver', toggle('voorOver'));
    on('tLabels', toggle('labels'));
    on('tMinNums', toggle('minNums'));
    on('tH24', toggle('h24'));
    on('tRing24', toggle('ring24'));
    document.getElementById('stepSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-step');
      if (v) { state.step = +v; save(); renderControls(); }
    }, false);
    on('btnRandom', function () {
      var t;
      do { t = Math.floor(Math.random() * (1440 / state.step)) * state.step; } while (t === state.time);
      setTime(t);
    });
    on('btnNow', function () { var d = new Date(); setTime(d.getHours() * 60 + d.getMinutes()); });
    on('btnTip', function () { document.getElementById('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { document.getElementById('overlayTip').className = 'overlay hidden'; });
    window.addEventListener('resize', layout, false);

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
