/* Geluidsmeter – OpenBoard-widget
 * De microfoon meet hoe luid het in de klas is; een verkeerslicht toont groen, oranje of rood.
 * De leerkracht stelt de grens voor rood in (oranje begint wat lager). Het geluid wordt alleen gemeten:
 * niets wordt opgenomen, bewaard of verstuurd. De schaal 0..100 komt overeen met -60..0 dB van de
 * microfoon (geen echte decibel van de ruimte: elke microfoon is anders).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ORANJE_ONDER = 12;     // oranje begint zoveel punten onder de grens voor rood
  var OMLAAG_NA = 1500;      // ms onder de drempel voor het licht terugspringt (geen geflikker)
  var SIGNAAL_NA = 3000;     // ms rood voor het signaaltje klinkt
  var SIGNAAL_OPNIEUW = 15000; // blijft het rood, dan ten vroegste opnieuw na deze tijd
  var DOOF_NA_SIGNAAL = 1500; // ms niet meten na het signaaltje (anders meet de microfoon het eigen geluid)

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: grens ('5'..'95', grens voor rood), sound ('0'|'1', signaaltje), rood (aantal keer rood, teller).
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
    try { var l = localStorage.getItem('geluidsmeter.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('geluidsmeter.' + k, String(v)); } catch (e) {}
  }
  function int(k, d) { var n = parseInt(prefGet(k, ''), 10); return isNaN(n) ? d : n; }

  // api: alleen voor de tests (tijd vooruitzetten, een geluidsniveau opleggen)
  var api = { offset: 0, fake: null, chimes: 0 };
  function now() { return new Date().getTime() + api.offset; }

  var g0 = int('grens', 60);
  var state = {
    grens: g0 >= 5 && g0 <= 95 ? g0 : 60,
    sound: prefGet('sound', '1') === '1',
    rood: Math.max(0, int('rood', 0)),
    mic: 'uit',          // uit | vragen | aan | fout
    fout: '',
    level: 0,            // wat de balk toont (snel omhoog, trager omlaag)
    avg: 0,              // gemiddelde over ongeveer een halve seconde: dit stuurt het licht
    zone: 0,             // 0 = groen, 1 = oranje, 2 = rood
    zoneSince: 0,        // sinds wanneer in deze zone
    belowSince: 0,       // sinds wanneer het gemiddelde onder de drempel van de huidige zone zit
    rustigSince: 0,      // sinds wanneer niet meer rood
    lastChime: 0,
    deafUntil: 0,
    lastTick: 0
  };
  function oranje() { return Math.max(0, state.grens - ORANJE_ONDER); }
  function zoneOf(v) { return v >= state.grens ? 2 : v >= oranje() ? 1 : 0; }

  function $(id) { return document.getElementById(id); }
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- Microfoon ----------
  var actx = null, stream = null, analyser = null, buf = null;
  function audioCtx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { actx = new AC(); } catch (e) { actx = null; } }
    }
    if (actx && actx.state === 'suspended' && actx.resume) { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  function getMic(ok, fail) {
    // Geen automatische versterking of ruisonderdrukking: die zouden luid en stil gelijk maken.
    var c = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    var md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      md.getUserMedia(c).then(ok, function (e) {
        if (e && (e.name === 'OverconstrainedError' || e.name === 'TypeError')) md.getUserMedia({ audio: true }).then(ok, fail);
        else fail(e);
      });
      return;
    }
    var old = navigator.getUserMedia || navigator.webkitGetUserMedia;
    if (old) { old.call(navigator, { audio: true }, ok, fail); return; }
    fail({ name: 'NotSupported' });
  }
  function foutTekst(e) {
    var n = (e && e.name) || '';
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') {
      return '<b>De microfoon mag niet gebruikt worden.</b>' +
        '<small>In OpenBoard: klik op <b>Yes</b> als gevraagd wordt of de microfoon mag. ' +
        'In de browser: klik op het slotje of microfoon-icoontje in de adresbalk en sta de microfoon toe. ' +
        'In Windows: Instellingen &gt; Privacy en beveiliging &gt; Microfoon (ook voor bureaublad-apps aanzetten).</small>';
    }
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') {
      return '<b>Geen microfoon gevonden.</b><small>Sluit een microfoon of een webcam met microfoon aan en tik opnieuw op Start.</small>';
    }
    if (n === 'NotReadableError' || n === 'TrackStartError') {
      return '<b>De microfoon is bezet.</b><small>Een ander programma gebruikt de microfoon misschien al. Sluit dat en tik opnieuw op Start.</small>';
    }
    if (n === 'NotSupported') {
      return '<b>Deze browser laat geen microfoon toe.</b><small>Gebruik Chrome of Edge, of een recente OpenBoard.</small>';
    }
    return '<b>De microfoon kon niet starten.</b><small>(' + (n || 'onbekende fout') + ') Tik opnieuw op Start.</small>';
  }

  function start() {
    if (state.mic === 'aan' || state.mic === 'vragen') { stop(); return; }
    var ctx = audioCtx();
    if (api.fake !== null) { begin(); return; } // tests: zonder microfoon
    if (!ctx || !ctx.createAnalyser) { fail({ name: 'NotSupported' }); return; }
    state.mic = 'vragen';
    render();
    getMic(function (s) {
      if (state.mic !== 'vragen') { stopTracks(s); return; } // intussen op Stop getikt
      stream = s;
      try {
        var src = ctx.createMediaStreamSource(s);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        buf = new Uint8Array(analyser.fftSize);
        src.connect(analyser); // niet naar de luidsprekers: we luisteren alleen
      } catch (e) { stopTracks(s); stream = null; fail({ name: 'Analyser' }); return; }
      begin();
    }, fail);
  }
  function fail(e) {
    state.mic = 'fout';
    state.fout = foutTekst(e);
    api.lastError = (e && e.name) || '';
    render();
  }
  function begin() {
    var t = now();
    state.mic = 'aan';
    state.level = 0; state.avg = 0; state.zone = 0;
    state.zoneSince = t; state.belowSince = 0; state.rustigSince = t; state.lastTick = t;
    state.deafUntil = 0;
    render();
  }
  function stopTracks(s) {
    try { var tr = s.getTracks(); for (var i = 0; i < tr.length; i++) tr[i].stop(); } catch (e) {}
  }
  function stop() {
    if (stream) stopTracks(stream);
    stream = null; analyser = null;
    state.mic = 'uit';
    state.level = 0; state.avg = 0; state.zone = 0;
    render();
  }

  // Luidheid van het laatste stukje geluid, 0..100.
  function measure() {
    if (api.fake !== null) return api.fake;
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(buf);
    var sum = 0;
    for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
    var rms = Math.sqrt(sum / buf.length);
    var db = 20 * Math.log(rms + 1e-9) / Math.LN10;
    return Math.max(0, Math.min(100, (db + 60) / 60 * 100));
  }

  function tick() {
    if (state.mic !== 'aan') return;
    var t = now();
    var dt = Math.max(0, Math.min(200, t - state.lastTick));
    state.lastTick = t;
    if (t < state.deafUntil) { renderLive(t); return; } // eigen signaaltje niet meten
    var v = measure();
    api.raw = v;
    state.level += (v - state.level) * (v > state.level ? Math.min(1, dt / 40) : 1 - Math.exp(-dt / 250));
    state.avg += (v - state.avg) * (1 - Math.exp(-dt / 400));

    var z = zoneOf(state.avg);
    if (z > state.zone) {
      setZone(z, t);
    } else if (z < state.zone) {
      // pas terug omlaag als het een tijdje stiller is
      if (!state.belowSince) state.belowSince = t;
      if (t - state.belowSince >= OMLAAG_NA) setZone(z, t);
    } else {
      state.belowSince = 0;
    }
    if (state.zone === 2 && state.sound && t - state.zoneSince >= SIGNAAL_NA &&
        (state.lastChime < state.zoneSince || t - state.lastChime >= SIGNAAL_OPNIEUW)) {
      state.lastChime = t;
      signaal();
      state.deafUntil = t + DOOF_NA_SIGNAAL;
    }
    renderLive(t);
  }
  function setZone(z, t) {
    if (z === 2 && state.zone !== 2) {
      state.rood++;
      prefSet('rood', state.rood);
    }
    if (state.zone === 2 && z !== 2) state.rustigSince = t;
    state.zone = z;
    state.zoneSince = t;
    state.belowSince = 0;
    renderZone();
    renderCount();
  }

  // ---------- Signaaltje: twee zachte tonen, zonder geluidsbestand ----------
  function signaal() {
    api.chimes++;
    var ctx = audioCtx();
    if (!ctx || !ctx.createOscillator) return;
    try {
      var t0 = ctx.currentTime;
      var tones = [[880, 0], [660, 0.35]];
      for (var i = 0; i < tones.length; i++) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = tones[i][0];
        var s = t0 + tones[i][1];
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6);
        o.connect(g); g.connect(ctx.destination);
        o.start(s); o.stop(s + 0.65);
      }
    } catch (e) {}
  }

  // ---------- Tekenen ----------
  // Verkeerslicht links, meter in het midden, teller rechts (viewBox 1000 x 600).
  var MX = 470, MY = 40, MW = 110, MH = 520;
  var LIGHTS = [
    { on: '#e5484d', off: '#4a2427', cy: 125 },
    { on: '#f59f00', off: '#4a3a1a', cy: 300 },
    { on: '#22a06b', off: '#1d3a2d', cy: 475 }
  ];
  var ZONE_COL = ['#22a06b', '#f59f00', '#e5484d'];
  var nodes = {};
  function yOf(v) { return MY + MH * (1 - v / 100); }

  function build() {
    var svg = $('board');
    // verkeerslicht
    el('rect', { x: 268, y: 560, width: 24, height: 40, fill: '#5b6472' }, svg);
    el('rect', { x: 150, y: 20, width: 260, height: 560, rx: 46, fill: '#18212f' }, svg);
    nodes.lights = [];
    for (var i = 0; i < 3; i++) {
      el('path', { d: 'M180 ' + (LIGHTS[i].cy - 82) + ' h200 l-24 34 h-152 z', fill: '#2b3648' }, svg);
      var c = el('circle', { cx: 280, cy: LIGHTS[i].cy, r: 72, fill: LIGHTS[i].off, stroke: '#0d131c', 'stroke-width': 6 }, svg);
      var h = el('ellipse', { cx: 258, cy: LIGHTS[i].cy - 30, rx: 30, ry: 18, fill: '#ffffff', opacity: 0 }, svg);
      nodes.lights.push({ c: c, h: h });
    }
    // meter: zones, balk, grens
    el('rect', { x: MX - 6, y: MY - 6, width: MW + 12, height: MH + 12, rx: 14, fill: '#ffffff', stroke: '#d9dee8', 'stroke-width': 3 }, svg);
    nodes.zRed = el('rect', { x: MX, width: MW, fill: ZONE_COL[2], opacity: 0.16 }, svg);
    nodes.zOra = el('rect', { x: MX, width: MW, fill: ZONE_COL[1], opacity: 0.16 }, svg);
    nodes.zGreen = el('rect', { x: MX, width: MW, fill: ZONE_COL[0], opacity: 0.16 }, svg);
    nodes.bar = el('rect', { x: MX + 14, width: MW - 28, y: MY + MH, height: 0, rx: 8, fill: ZONE_COL[0] }, svg);
    nodes.oraLine = el('line', { x1: MX, x2: MX + MW, stroke: '#f59f00', 'stroke-width': 3, 'stroke-dasharray': '10 8' }, svg);
    nodes.grens = el('g', {}, svg);
    el('line', { x1: MX - 14, x2: MX + MW + 8, y1: 0, y2: 0, stroke: '#e5484d', 'stroke-width': 7, 'stroke-linecap': 'round' }, nodes.grens);
    el('path', { d: 'M' + (MX + MW + 6) + ' 0 l22 -30 h98 a12 12 0 0 1 12 12 v36 a12 12 0 0 1 -12 12 h-98 z', fill: '#e5484d' }, nodes.grens);
    nodes.grensTxt = el('text', { x: MX + MW + 82, y: 11, 'text-anchor': 'middle', 'font-size': 32, 'font-weight': 700, fill: '#ffffff',
      'font-family': 'Segoe UI, Arial, sans-serif' }, nodes.grens);
    // onzichtbaar vlak om de grens met muis of vinger te verslepen
    nodes.hit = el('rect', { x: MX - 30, y: MY - 40, width: MW + 180, height: MH + 80, fill: '#ffffff', 'fill-opacity': 0, cursor: 'ns-resize' }, svg);
    // teller
    var F = 'Segoe UI, Arial, sans-serif';
    el('text', { x: 860, y: 150, 'text-anchor': 'middle', 'font-size': 34, fill: '#667085', 'font-family': F }, svg).textContent = 'Keer rood';
    nodes.count = el('text', { x: 860, y: 270, 'text-anchor': 'middle', 'font-size': 120, 'font-weight': 700, fill: '#e5484d', 'font-family': F }, svg);
    el('text', { x: 860, y: 390, 'text-anchor': 'middle', 'font-size': 34, fill: '#667085', 'font-family': F }, svg).textContent = 'Al rustig';
    nodes.rustig = el('text', { x: 860, y: 480, 'text-anchor': 'middle', 'font-size': 76, 'font-weight': 700, fill: '#22a06b', 'font-family': F }, svg);
  }

  function renderGrens() {
    var yr = yOf(state.grens), yo = yOf(oranje());
    nodes.zRed.setAttribute('y', MY); nodes.zRed.setAttribute('height', yr - MY);
    nodes.zOra.setAttribute('y', yr); nodes.zOra.setAttribute('height', yo - yr);
    nodes.zGreen.setAttribute('y', yo); nodes.zGreen.setAttribute('height', MY + MH - yo);
    nodes.oraLine.setAttribute('y1', yo); nodes.oraLine.setAttribute('y2', yo);
    nodes.grens.setAttribute('transform', 'translate(0,' + yr + ')');
    nodes.grensTxt.textContent = state.grens;
    $('grensVal').textContent = state.grens;
    $('btnDown').disabled = state.grens <= 5;
    $('btnUp').disabled = state.grens >= 95;
  }
  function renderZone() {
    var aan = state.mic === 'aan';
    for (var i = 0; i < 3; i++) {
      var lit = aan && 2 - i === state.zone;
      nodes.lights[i].c.setAttribute('fill', lit ? LIGHTS[i].on : LIGHTS[i].off);
      nodes.lights[i].h.setAttribute('opacity', lit ? 0.35 : 0);
    }
    api.zone = aan ? ['groen', 'oranje', 'rood'][state.zone] : 'uit';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function renderCount() {
    nodes.count.textContent = state.rood;
    $('btnCount').disabled = state.rood === 0;
  }
  function renderLive(t) {
    var v = state.mic === 'aan' ? state.level : 0;
    var y = yOf(v);
    nodes.bar.setAttribute('y', y);
    nodes.bar.setAttribute('height', MY + MH - y);
    nodes.bar.setAttribute('fill', ZONE_COL[zoneOf(v)]);
    var txt = '–';
    if (state.mic === 'aan' && state.zone !== 2) {
      var s = Math.floor((t - state.rustigSince) / 1000);
      txt = Math.floor(s / 60) + ':' + pad(s % 60);
    }
    if (nodes.rustig.textContent !== txt) nodes.rustig.textContent = txt;
    api.rustig = txt;
  }
  function render() {
    var b = $('btnStart'), m = $('msg');
    var aan = state.mic === 'aan' || state.mic === 'vragen';
    b.textContent = aan ? 'Stop' : 'Start';
    b.className = 'btn start ' + (aan ? 'stop' : 'primary');
    $('btnSound').textContent = state.sound ? 'Signaal aan' : 'Signaal uit';
    $('btnSound').className = 'btn small' + (state.sound ? ' on' : '');
    if (state.mic === 'aan') m.className = 'msg hidden';
    else if (state.mic === 'vragen') { m.className = 'msg'; m.innerHTML = 'Even wachten: mag de microfoon gebruikt worden?<small>Klik op <b>Yes</b> of <b>Toestaan</b>.</small>'; }
    else if (state.mic === 'fout') { m.className = 'msg fout'; m.innerHTML = state.fout; }
    else { m.className = 'msg'; m.innerHTML = 'Tik op <b>Start</b> om te meten<small>Het geluid wordt alleen gemeten, nooit opgenomen.</small>'; }
    api.mic = state.mic;
    renderGrens();
    renderZone();
    renderCount();
    renderLive(now());
  }

  function setGrens(v) {
    v = Math.max(5, Math.min(95, Math.round(v)));
    if (v === state.grens) return;
    state.grens = v;
    prefSet('grens', v);
    renderGrens();
    renderLive(now());
  }

  // ---------- Grens verslepen (muis en vinger) ----------
  function levelAt(clientY) {
    var svg = $('board'), r = svg.getBoundingClientRect();
    var s = Math.min(r.width / 1000, r.height / 600);
    var top = r.top + (r.height - 600 * s) / 2;
    var y = (clientY - top) / s;
    return (MY + MH - y) / MH * 100;
  }
  function bindDrag() {
    var hit = nodes.hit;
    hit.addEventListener('mousedown', function (e) {
      e.preventDefault();
      setGrens(levelAt(e.clientY));
      function move(ev) { setGrens(levelAt(ev.clientY)); }
      function up() { document.removeEventListener('mousemove', move, false); document.removeEventListener('mouseup', up, false); }
      document.addEventListener('mousemove', move, false);
      document.addEventListener('mouseup', up, false);
    }, false);
    // Vinger: luisteren op het aangeraakte element zelf (zie docs/OPENBOARD.md).
    hit.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      var tgt = e.target;
      setGrens(levelAt(e.touches[0].clientY));
      function move(ev) { if (ev.touches.length) { ev.preventDefault(); setGrens(levelAt(ev.touches[0].clientY)); } }
      function up() { tgt.removeEventListener('touchmove', move, false); tgt.removeEventListener('touchend', up, false); tgt.removeEventListener('touchcancel', up, false); }
      tgt.addEventListener('touchmove', move, false);
      tgt.addEventListener('touchend', up, false);
      tgt.addEventListener('touchcancel', up, false);
    }, false);
  }

  function on(id, fn) { $(id).addEventListener('click', fn, false); }
  function init() {
    api.state = state;
    api.tick = tick;
    api.setGrens = setGrens;
    window.__geluidsmeter = api;
    build();
    bindDrag();
    on('btnStart', start);
    on('msg', function () { if (state.mic === 'uit' || state.mic === 'fout') start(); });
    on('btnDown', function () { setGrens(Math.ceil(state.grens / 5) * 5 - 5); });
    on('btnUp', function () { setGrens(Math.floor(state.grens / 5) * 5 + 5); });
    on('btnSound', function () {
      state.sound = !state.sound;
      prefSet('sound', state.sound ? '1' : '0');
      if (state.sound) signaal(); // even laten horen
      render();
    });
    on('btnCount', function () {
      state.rood = 0;
      prefSet('rood', 0);
      state.rustigSince = now();
      renderCount();
    });
    on('btnTip', function () { $('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { $('overlayTip').className = 'overlay hidden'; });
    render();
    setInterval(tick, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();
