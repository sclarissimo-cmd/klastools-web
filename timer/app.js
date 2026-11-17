/* Timer – OpenBoard-widget
 * Aftellen (digitaal of als zandloper) in uren, minuten en seconden, met geluid aan/uit,
 * en een stopwatch. De tijd wordt gemeten met de klok van de computer (niet door te tellen),
 * zodat hij juist blijft, ook als de widget even herladen wordt.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var COLORS = [
    null,
    { name: 'rood',  fill: '#e5484d', edge: '#b4292e' },
    { name: 'blauw', fill: '#2f6fdb', edge: '#1d4fa6' },
    { name: 'groen', fill: '#22a06b', edge: '#157a4f' },
    { name: 'geel',  fill: '#f5b800', edge: '#b38600' }
  ];
  var MAX_DUR = 23 * 3600 + 59 * 60 + 59;

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: mode ('timer'|'stopwatch'), view ('digitaal'|'zandloper'), dur (ingestelde tijd in seconden),
  // sound ('0'|'1'), tone ('bel'|'schoolbel'|'dingdong', sinds 0.2), color ('1'..'4', kleur van het zand), showDigits ('0'|'1', cijfers naast de zandloper),
  // tEnd (tijdstip in ms waarop een lopende timer om is, of ''), tLeft (resterende ms van een gestopte timer),
  // swStart (tijdstip in ms waarop de stopwatch gestart werd, of ''), swAcc (eerder gemeten ms van de stopwatch).
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
    try { var l = localStorage.getItem('timer.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('timer.' + k, String(v)); } catch (e) {}
  }
  function int(k, d) { var n = parseInt(prefGet(k, ''), 10); return isNaN(n) ? d : n; }

  var api = { offset: 0, alarms: 0, chimes: 0 }; // offset: alleen voor de tests (tijd vooruitzetten)
  function now() { return new Date().getTime() + api.offset; }

  var dur0 = int('dur', 300);
  var col0 = int('color', 4);
  var state = {
    mode: prefGet('mode', 'timer') === 'stopwatch' ? 'stopwatch' : 'timer',
    view: prefGet('view', 'digitaal') === 'zandloper' ? 'zandloper' : 'digitaal',
    dur: dur0 >= 1 && dur0 <= MAX_DUR ? dur0 : 300,
    sound: prefGet('sound', '1') === '1',
    tone: prefGet('tone', 'bel'),
    color: col0 >= 1 && col0 <= 4 ? col0 : 4,
    showDigits: prefGet('showDigits', '1') === '1',
    // timer
    running: false, endAt: 0, left: 0, ended: false,
    // stopwatch
    swRunning: false, swStartAt: 0, swAcc: Math.max(0, int('swAcc', 0))
  };
  if (state.tone !== 'schoolbel' && state.tone !== 'dingdong') state.tone = 'bel';
  (function restore() {
    var t = now();
    var end = int('tEnd', 0);
    if (end) {
      if (end > t) { state.running = true; state.endAt = end; }
      else { state.left = 0; state.ended = true; } // de tijd is om terwijl de pagina dicht was
    } else {
      var left = int('tLeft', -1);
      state.left = left >= 0 && left <= state.dur * 1000 ? left : state.dur * 1000;
      if (state.left === 0) state.ended = true;
    }
    var sw = int('swStart', 0);
    if (sw && sw <= t) { state.swRunning = true; state.swStartAt = sw; }
  })();

  function saveSettings() {
    prefSet('mode', state.mode);
    prefSet('view', state.view);
    prefSet('dur', state.dur);
    prefSet('sound', state.sound ? '1' : '0');
    prefSet('tone', state.tone);
    prefSet('color', state.color);
    prefSet('showDigits', state.showDigits ? '1' : '0');
  }
  function saveTimer() {
    prefSet('tEnd', state.running ? state.endAt : '');
    prefSet('tLeft', state.running ? '' : Math.round(state.left));
  }
  function saveStopwatch() {
    prefSet('swStart', state.swRunning ? state.swStartAt : '');
    prefSet('swAcc', Math.round(state.swAcc));
  }

  // ---------- Tijd ----------
  function timeLeft() { return state.running ? Math.max(0, state.endAt - now()) : state.left; }
  function elapsed() { return state.swAcc + (state.swRunning ? now() - state.swStartAt : 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function swText(ms) {
    var t = Math.floor(ms / 100), tenth = t % 10, s = Math.floor(t / 10);
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60) + ',' + tenth;
  }

  function setDur(sec) {
    if (state.running) return;
    state.dur = Math.max(1, Math.min(MAX_DUR, Math.round(sec)));
    state.left = state.dur * 1000;
    state.ended = false;
    stopSound();
    saveSettings(); saveTimer();
    render();
  }

  function start() {
    unlockAudio();
    if (state.sound) setTimeout(function () { samples(state.tone, 3); }, 0); // alarm alvast berekenen
    if (state.mode === 'stopwatch') {
      if (state.swRunning) { state.swAcc = elapsed(); state.swRunning = false; }
      else { state.swStartAt = now(); state.swRunning = true; }
      saveStopwatch();
    } else if (state.running) {
      state.left = timeLeft(); state.running = false; // pauze
      saveTimer();
    } else {
      if (state.ended || state.left <= 0) state.left = state.dur * 1000;
      state.ended = false;
      stopSound();
      state.endAt = now() + state.left; state.running = true;
      saveTimer();
    }
    render();
  }
  function reset() {
    if (state.mode === 'stopwatch') {
      state.swRunning = false; state.swAcc = 0;
      saveStopwatch();
    } else {
      state.running = false; state.ended = false; state.left = state.dur * 1000;
      stopSound();
      saveTimer();
    }
    render();
  }
  function finish() {
    state.running = false; state.left = 0; state.ended = true;
    saveTimer();
    if (state.sound) { api.alarms++; chime(3); }
    render();
  }

  function tick() {
    if (state.running && state.endAt - now() <= 0) { finish(); return; }
    if (state.running || state.swRunning) renderTime();
  }

  // ---------- Geluid (zelf berekend, geen geluidsbestanden nodig) ----------
  // Elk geluid is een reeks "slagen"; een slag is een som van uitdovende tonen (zoals een echte bel).
  // Web Audio speelt de berekende golf af; oudere engines krijgen dezelfde golf als WAV in het geheugen.
  var RATE = 22050;
  var TONES = ['bel', 'schoolbel', 'dingdong'];
  var TONE_NAMES = { bel: 'bel', schoolbel: 'schoolbel', dingdong: 'ding-dong' };
  // boventonen: [verhouding tot de grondtoon, sterkte, uitdooftijd in seconden]
  var HANDBEL = [[1, 1, 1.2], [2.0, 0.45, 0.8], [2.76, 0.35, 0.55], [5.4, 0.2, 0.3], [8.93, 0.1, 0.15]];
  var SCHOOLBEL = [[1, 1, 0.2], [2.32, 0.55, 0.12], [4.25, 0.3, 0.07]];
  var ZUIVER = [[1, 1, 0.16], [2, 0.12, 0.08]];

  function strikes(type, times) {
    var hits = [], t = 0, i, k;
    for (i = 0; i < times; i++) {
      if (type === 'dingdong') {
        hits.push({ t: t, f: 880, p: ZUIVER, a: 0.9 });
        hits.push({ t: t + 0.2, f: 1318.5, p: ZUIVER, a: 0.75 });
        t += 1.2;
      } else if (type === 'schoolbel') {
        // de hamer slaat zo'n 18 keer per seconde tegen de bel
        for (k = 0; k < 29; k++) hits.push({ t: t + k / 18, f: 1480, p: SCHOOLBEL, a: 0.55 + 0.1 * (k % 2) });
        t += 2.3;
      } else {
        hits.push({ t: t, f: 1046.5, p: HANDBEL, a: 1 }); // tafelbel: "ting"
        t += 1.1;
      }
    }
    return { len: t + 0.9, hits: hits };
  }
  function synth(type, times) {
    var s = strikes(type, times), n = Math.ceil(s.len * RATE), i, j;
    var out = window.Float32Array ? new Float32Array(n) : [];
    if (!window.Float32Array) for (i = 0; i < n; i++) out[i] = 0;
    var attack = 0.002 * RATE;
    for (i = 0; i < s.hits.length; i++) {
      var h = s.hits[i], start = Math.round(h.t * RATE);
      for (var p = 0; p < h.p.length; p++) {
        var w = 2 * Math.PI * h.f * h.p[p][0] / RATE, amp = h.a * h.p[p][1], tau = h.p[p][2] * RATE;
        var len = Math.min(n - start, Math.ceil(tau * 5));
        for (j = 0; j < len; j++) {
          out[start + j] += amp * Math.exp(-j / tau) * (j < attack ? j / attack : 1) * Math.sin(w * j);
        }
      }
    }
    var peak = 0;
    for (i = 0; i < n; i++) if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
    if (peak > 0) for (i = 0; i < n; i++) out[i] = out[i] * 0.8 / peak;
    return out;
  }
  var cache = {};
  function samples(type, times) {
    var key = type + times;
    if (!cache[key]) cache[key] = synth(type, times);
    return cache[key];
  }

  var actx = null, voices = [], fallbackAudio = null;
  function unlockAudio() {
    // Browsers laten pas geluid toe na een klik; daarom maken we de geluidsmotor bij een klik aan.
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { actx = new AC(); } catch (e) { actx = null; } }
    }
    if (actx && actx.state === 'suspended' && actx.resume) { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  function play(type, times) {
    api.chimes++;
    api.lastTone = type;
    stopSound();
    var data = samples(type, times), ctx = unlockAudio(), i;
    if (ctx && ctx.createBuffer) {
      try {
        var buf = ctx.createBuffer(1, data.length, RATE), ch = buf.getChannelData(0);
        for (i = 0; i < data.length; i++) ch[i] = data[i];
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        if (src.start) src.start(0); else src.noteOn(0);
        voices.push(src);
        return;
      } catch (e) {}
    }
    try { fallbackAudio = new Audio(wavUri(data)); fallbackAudio.play(); } catch (e2) {}
  }
  function chime(times) { play(state.tone, times); }
  function stopSound() {
    for (var i = 0; i < voices.length; i++) {
      try { if (voices[i].stop) voices[i].stop(0); else voices[i].disconnect(); } catch (e) {}
    }
    voices = [];
    if (fallbackAudio) { try { fallbackAudio.pause(); } catch (e2) {} fallbackAudio = null; }
  }
  function wavUri(data) {
    var n = data.length, parts = [], i;
    function u32(v) { return String.fromCharCode(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); }
    function u16(v) { return String.fromCharCode(v & 255, (v >> 8) & 255); }
    parts.push('RIFF' + u32(36 + n * 2) + 'WAVEfmt ' + u32(16) + u16(1) + u16(1) + u32(RATE) + u32(RATE * 2) + u16(2) + u16(16) + 'data' + u32(n * 2));
    for (i = 0; i < n; i++) {
      var s = Math.max(-32767, Math.min(32767, Math.round(data[i] * 32767)));
      parts.push(u16(s < 0 ? s + 65536 : s));
    }
    return 'data:audio/wav;base64,' + btoa(parts.join(''));
  }
  api.wav = function (type, times) { return wavUri(samples(type, times)); };

  // ---------- Zandloper ----------
  var TOP = 'M 66 46 L 234 46 C 234 120 168 168 156 220 L 144 220 C 132 168 66 120 66 46 Z';
  var BOT = 'M 144 220 L 156 220 C 168 272 234 320 234 394 L 66 394 C 66 320 132 272 144 220 Z';
  var SAND_H = 144; // hoogte van het zand in een volle helft
  var glass = {};
  function el(name, attrs, parent) {
    var e = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function buildGlass() {
    var svg = document.getElementById('glass');
    var defs = el('defs', {}, svg);
    el('path', { d: TOP }, el('clipPath', { id: 'cpTop' }, defs));
    el('path', { d: BOT }, el('clipPath', { id: 'cpBot' }, defs));
    var wood = '#8a5a2b', woodEdge = '#5f3c1a';
    el('rect', { x: 42, y: 40, width: 12, height: 360, rx: 5, fill: wood, stroke: woodEdge, 'stroke-width': 2 }, svg);
    el('rect', { x: 246, y: 40, width: 12, height: 360, rx: 5, fill: wood, stroke: woodEdge, 'stroke-width': 2 }, svg);
    el('path', { d: TOP, fill: '#eef5fb' }, svg);
    el('path', { d: BOT, fill: '#eef5fb' }, svg);
    glass.top = el('rect', { x: 60, width: 180, y: 220, height: 0, 'clip-path': 'url(#cpTop)', 'class': 'sand' }, svg);
    glass.bot = el('rect', { x: 60, width: 180, y: 394, height: 0, 'clip-path': 'url(#cpBot)', 'class': 'sand' }, svg);
    glass.stream = el('line', { x1: 150, y1: 216, x2: 150, y2: 394, 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
    el('path', { d: TOP, fill: 'none', stroke: '#8fa9bf', 'stroke-width': 5, 'stroke-linejoin': 'round' }, svg);
    el('path', { d: BOT, fill: 'none', stroke: '#8fa9bf', 'stroke-width': 5, 'stroke-linejoin': 'round' }, svg);
    el('path', { d: 'M 84 62 C 88 110 112 140 132 170', fill: 'none', stroke: '#ffffff', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.8 }, svg);
    el('rect', { x: 26, y: 16, width: 248, height: 30, rx: 9, fill: wood, stroke: woodEdge, 'stroke-width': 2 }, svg);
    el('rect', { x: 26, y: 394, width: 248, height: 30, rx: 9, fill: wood, stroke: woodEdge, 'stroke-width': 2 }, svg);
  }
  function renderGlass(left) {
    var f = state.dur ? Math.max(0, Math.min(1, left / (state.dur * 1000))) : 0; // deel dat nog boven zit
    // De helften zijn ongeveer driehoeken: hoogte ~ wortel van de hoeveelheid zand.
    var hTop = SAND_H * Math.sqrt(f);
    var hBot = SAND_H * (1 - Math.sqrt(f));
    var c = COLORS[state.color];
    glass.top.setAttribute('y', 220 - hTop);
    glass.top.setAttribute('height', hTop + 2);
    glass.top.setAttribute('fill', c.fill);
    glass.bot.setAttribute('y', 394 - hBot);
    glass.bot.setAttribute('height', hBot);
    glass.bot.setAttribute('fill', c.fill);
    glass.stream.setAttribute('stroke', c.fill);
    glass.stream.setAttribute('y2', 394 - hBot);
    glass.stream.style.display = state.running && f > 0 ? '' : 'none';
  }

  // ---------- Tekenen ----------
  var $ = function (id) { return document.getElementById(id); };

  function renderTime() {
    if (state.mode === 'stopwatch') {
      $('swText').textContent = swText(elapsed());
      api.text = $('swText').textContent;
      return;
    }
    var left = timeLeft();
    var secs = Math.ceil(left / 1000);
    var h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
    var ins = [['inH', String(h)], ['inM', pad(m)], ['inS', pad(s)]];
    for (var i = 0; i < ins.length; i++) {
      var inp = $(ins[i][0]);
      if (document.activeElement !== inp) inp.value = ins[i][1];
    }
    $('colH').className = 'dcol' + (h === 0 ? ' zero' : '');
    $('tdigital').className = 'digital' + (state.running ? ' running' : '') +
      (state.ended ? ' end' : (state.running && secs <= 10 ? ' warn' : ''));
    $('barFill').style.width = (state.dur ? Math.min(100, left / (state.dur * 10)) : 0) + '%';
    api.text = h + ':' + pad(m) + ':' + pad(s);
    if (state.view === 'zandloper') renderGlass(left);
  }

  function renderControls() {
    var sw = state.mode === 'stopwatch';
    var seg = $('modeSeg').getElementsByTagName('button'), i;
    for (i = 0; i < seg.length; i++) seg[i].className = seg[i].getAttribute('data-mode') === state.mode ? 'on' : '';
    seg = $('viewSeg').getElementsByTagName('button');
    for (i = 0; i < seg.length; i++) seg[i].className = seg[i].getAttribute('data-view') === state.view ? 'on' : '';
    $('viewSeg').style.display = sw ? 'none' : '';
    $('presets').style.display = sw ? 'none' : '';
    var glassView = !sw && state.view === 'zandloper';
    $('palette').style.display = glassView ? '' : 'none';
    $('btnDigits').style.display = glassView ? '' : 'none';
    $('btnDigits').className = 'btn' + (state.showDigits ? ' on' : '');
    var pal = $('palette').getElementsByTagName('button');
    for (i = 0; i < pal.length; i++) pal[i].className = 'swatch' + (+pal[i].getAttribute('data-color') === state.color ? ' on' : '');

    var snd = $('btnSound');
    snd.className = 'btn small' + (state.sound ? ' on' : '');
    snd.textContent = state.sound ? 'Geluid aan' : 'Geluid uit';
    snd.setAttribute('title', state.sound ? 'Geluid uitzetten' : 'Geluid aanzetten (je hoort het even)');
    $('btnTone').style.display = state.sound ? '' : 'none';
    $('btnTone').textContent = TONE_NAMES[state.tone];

    var go = $('btnStart'), running = sw ? state.swRunning : state.running;
    var label;
    if (sw) label = state.swRunning ? 'Stop' : (state.swAcc > 0 ? 'Verder' : 'Start');
    else label = state.running ? 'Pauze' : (!state.ended && state.left > 0 && state.left < state.dur * 1000 ? 'Verder' : 'Start');
    go.textContent = label;
    go.className = 'btn start ' + (running ? 'pause' : 'go');
    $('btnReset').textContent = sw ? 'Op nul' : 'Opnieuw';
    $('btnReset').setAttribute('title', sw ? 'Stopwatch op nul zetten' : 'Terug naar de ingestelde tijd');
    var ins = ['inH', 'inM', 'inS'];
    for (i = 0; i < ins.length; i++) $(ins[i]).disabled = state.running;
    var pre = $('presets').getElementsByTagName('button');
    for (i = 0; i < pre.length; i++) {
      pre[i].disabled = state.running;
      pre[i].className = 'btn' + (+pre[i].getAttribute('data-sec') === state.dur ? ' on' : '');
    }
    $('doneMsg').className = 'done' + (!sw && state.ended ? '' : ' hidden');
  }

  // Plaatst de onderdelen; hoogte in % werkt niet in de oude engine, dus alles in pixels.
  function layout() {
    var stage = $('stageIn');
    var W = stage.clientWidth, H = stage.clientHeight;
    var sw = state.mode === 'stopwatch';
    var glassView = !sw && state.view === 'zandloper';
    var digits = !sw && (!glassView || state.showDigits);
    $('swPane').style.display = sw ? '' : 'none';
    $('glassPane').style.display = glassView ? '' : 'none';
    $('timerPane').style.display = digits ? '' : 'none';
    var split = glassView && digits ? Math.round(W * 0.42) : 0;
    $('glassPane').style.right = (digits ? W - split : 0) + 'px';
    $('timerPane').style.left = split + 'px';
    var dw = W - split;
    $('tbox').style.fontSize = Math.max(20, Math.min(dw / 5.3, H / 2.7, 200)) + 'px';
    var len = $('swText').textContent.length;
    $('swText').style.fontSize = Math.max(24, Math.min(W / (len * 0.62 + 0.8), H / 1.5, 240)) + 'px';
  }

  function render() {
    renderControls();
    layout();
    renderTime();
  }

  // ---------- Intikken ----------
  function applyInput() {
    if (state.running) return;
    function val(id) { var v = $(id).value.replace(/\D/g, ''); return v === '' ? 0 : parseInt(v, 10); }
    var h = Math.min(23, val('inH')), m = Math.min(59, val('inM')), s = Math.min(59, val('inS'));
    setDur(h * 3600 + m * 60 + s);
  }
  function step(d) {
    return function () {
      if (state.running) return;
      var cur = state.ended ? state.dur : Math.ceil(timeLeft() / 1000);
      setDur(Math.max(1, cur + d));
    };
  }

  // ---------- Gebeurtenissen ----------
  function on(id, fn, ev) { $(id).addEventListener(ev || 'click', fn, false); }
  function buildPalette() {
    var pal = $('palette');
    for (var c = 1; c <= 4; c++) {
      var b = document.createElement('button');
      b.setAttribute('data-color', c);
      b.setAttribute('title', 'zand ' + COLORS[c].name);
      b.setAttribute('aria-label', 'zand ' + COLORS[c].name);
      b.style.background = COLORS[c].fill;
      b.style.borderColor = COLORS[c].edge;
      pal.appendChild(b);
    }
  }

  function init() {
    api.state = state;
    api.tick = tick;
    api.left = timeLeft;
    api.elapsed = elapsed;
    api.samples = samples;
    window.__timer = api;
    buildGlass();
    buildPalette();

    on('btnStart', start);
    on('btnReset', reset);
    on('doneMsg', reset);
    on('hUp', step(3600)); on('hDown', step(-3600));
    on('mUp', step(60)); on('mDown', step(-60));
    on('sUp', step(5)); on('sDown', step(-5));
    var ins = ['inH', 'inM', 'inS'];
    for (var i = 0; i < ins.length; i++) {
      on(ins[i], function () { this.select(); }, 'focus');
      on(ins[i], function () { applyInput(); }, 'change');
      on(ins[i], function (e) { if (e.keyCode === 13) { applyInput(); this.blur(); } }, 'keydown');
      on(ins[i], function () { renderTime(); }, 'blur');
    }
    // na twee cijfers meteen naar het volgende vakje
    on('inH', function () { if (this.value.replace(/\D/g, '').length === 2) $('inM').focus(); }, 'input');
    on('inM', function () { if (this.value.replace(/\D/g, '').length === 2) $('inS').focus(); }, 'input');
    $('presets').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-sec');
      if (v) setDur(+v);
    }, false);
    $('modeSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-mode');
      if (v) { state.mode = v; saveSettings(); render(); }
    }, false);
    $('viewSeg').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-view');
      if (v) { state.view = v; saveSettings(); render(); }
    }, false);
    $('palette').addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-color');
      if (v) { state.color = +v; saveSettings(); render(); }
    }, false);
    on('btnDigits', function () { state.showDigits = !state.showDigits; saveSettings(); render(); });
    on('btnSound', function () {
      state.sound = !state.sound;
      saveSettings();
      if (state.sound) chime(1); else stopSound(); // even laten horen hoe luid het is
      renderControls();
    });
    on('btnTone', function () {
      state.tone = TONES[(TONES.indexOf(state.tone) + 1) % TONES.length];
      saveSettings();
      chime(1); // meteen laten horen
      renderControls();
    });
    on('btnTip', function () { $('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { $('overlayTip').className = 'overlay hidden'; });
    window.addEventListener('resize', layout, false);

    render();
    setInterval(tick, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
