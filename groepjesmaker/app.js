/* Groepjesmaker – OpenBoard-widget
 * De leerlingen (voornamen of klasnummers) in groepjes verdelen: automatisch (willekeurig) of zelf.
 * Daarna leerlingen verslepen of tikken-en-tikken naar een ander groepje, naar "Nog te verdelen" of "Afwezig".
 * Privacy: de namen staan enkel in de widgetvoorkeuren (OpenBoard: in het document; browser: localStorage).
 */
(function () {
  'use strict';

  var KLEUREN = ['#d62828', '#1f5fbf', '#1f8a55', '#e67700', '#7b2cbf', '#d6336c', '#0f8b8d', '#8b5a2b',
    '#4361ee', '#6a994e', '#b5179e', '#5c677d'];
  var MAX_AANTAL = 40, MAX_PER = 10;

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
  // Sleutels: bron ('nummers'|'namen'), namen (JSON-lijst van voornamen), aantal (klasnummers 1..aantal),
  // per (kinderen per groepje), wijze ('auto'|'manueel'),
  // groepen (JSON-lijst van groepjes, elk een lijst van leerling-nummers = plaats in de lijst, vanaf 0),
  // afwezig (leerling-nummers met komma's).
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
    try { var l = localStorage.getItem('groepjesmaker.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('groepjesmaker.' + k, String(v)); } catch (e) {}
  }
  function int(s, d) { var n = parseInt(s, 10); return isNaN(n) ? d : n; }
  function json(s, d) { try { var v = JSON.parse(s); return v; } catch (e) { return d; } }

  var state = { bron: 'nummers', namen: [], aantal: 20, per: 4, wijze: 'auto', groepen: [], afwezig: [], sel: -1 };

  function totaal() { return state.bron === 'namen' ? state.namen.length : state.aantal; }
  function label(id) { return state.bron === 'namen' ? state.namen[id] : String(id + 1); }

  // Houdt groepen en afwezig geldig: elke leerling hoogstens één keer, enkel bestaande nummers.
  function opschonen() {
    var n = totaal(), gezien = {}, i, j;
    var gr = [];
    for (i = 0; i < state.groepen.length; i++) {
      var g = state.groepen[i], ng = [];
      if (!(g instanceof Array)) g = [];
      for (j = 0; j < g.length; j++) {
        var x = int(g[j], -1);
        if (x >= 0 && x < n && !gezien[x]) { gezien[x] = true; ng.push(x); }
      }
      gr.push(ng);
    }
    state.groepen = gr;
    var af = [];
    for (i = 0; i < state.afwezig.length; i++) {
      var y = int(state.afwezig[i], -1);
      if (y >= 0 && y < n && !gezien[y]) { gezien[y] = true; af.push(y); }
    }
    state.afwezig = af;
  }

  (function load() {
    state.bron = prefGet('bron', 'nummers') === 'namen' ? 'namen' : 'nummers';
    var nm = json(prefGet('namen', '[]'), []);
    state.namen = [];
    if (nm instanceof Array) for (var i = 0; i < nm.length; i++) if (String(nm[i]).replace(/\s+/g, '') !== '') state.namen.push(String(nm[i]));
    state.aantal = Math.max(1, Math.min(MAX_AANTAL, int(prefGet('aantal', '20'), 20)));
    state.per = Math.max(2, Math.min(MAX_PER, int(prefGet('per', '4'), 4)));
    state.wijze = prefGet('wijze', 'auto') === 'manueel' ? 'manueel' : 'auto';
    var gr = json(prefGet('groepen', '[]'), []);
    state.groepen = gr instanceof Array ? gr : [];
    var af = prefGet('afwezig', '');
    state.afwezig = af === '' ? [] : af.split(',');
    opschonen();
  })();

  function bewaarVerdeling() {
    prefSet('groepen', JSON.stringify(state.groepen));
    prefSet('afwezig', state.afwezig.join(','));
  }

  // Leerlingen die nog niet in een groepje zitten en niet afwezig zijn.
  function pool() {
    var in_ = {}, i, j, p = [];
    for (i = 0; i < state.groepen.length; i++) for (j = 0; j < state.groepen[i].length; j++) in_[state.groepen[i][j]] = true;
    for (i = 0; i < state.afwezig.length; i++) in_[state.afwezig[i]] = true;
    for (i = 0; i < totaal(); i++) if (!in_[i]) p.push(i);
    return p;
  }
  function aanwezig() {
    var af = {}, p = [];
    for (var i = 0; i < state.afwezig.length; i++) af[state.afwezig[i]] = true;
    for (var j = 0; j < totaal(); j++) if (!af[j]) p.push(j);
    return p;
  }
  // Aantal groepjes voor n kinderen: zo dicht mogelijk bij "per" kinderen per groepje.
  function aantalGroepen(n) { return Math.max(1, Math.round(n / state.per)); }

  function schud(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- Acties ----------
  function maak() {
    var lln = aanwezig(), g = aantalGroepen(lln.length), i;
    state.groepen = [];
    for (i = 0; i < g; i++) state.groepen.push([]);
    if (state.wijze === 'auto') {
      schud(lln);
      for (i = 0; i < lln.length; i++) state.groepen[i % g].push(lln[i]);
    }
    state.sel = -1;
    bewaarVerdeling();
    render();
  }
  function allesTerug() {
    for (var i = 0; i < state.groepen.length; i++) state.groepen[i] = [];
    state.sel = -1;
    bewaarVerdeling();
    render();
  }
  function groepBij() {
    if (state.groepen.length >= 20) return;
    state.groepen.push([]);
    bewaarVerdeling();
    render();
  }
  function groepWeg() {
    if (!state.groepen.length) return;
    state.groepen.pop();
    state.sel = -1;
    bewaarVerdeling();
    render();
  }
  // Leerling id naar doel: 'pool', 'afw' of 'g<nummer>'.
  function verplaats(id, doel) {
    var i, k;
    for (i = 0; i < state.groepen.length; i++) {
      k = state.groepen[i].indexOf(id);
      if (k >= 0) state.groepen[i].splice(k, 1);
    }
    k = state.afwezig.indexOf(id);
    if (k >= 0) state.afwezig.splice(k, 1);
    if (doel === 'afw') state.afwezig.push(id);
    else if (doel.charAt(0) === 'g') {
      var g = int(doel.substr(1), -1);
      if (g >= 0 && g < state.groepen.length) state.groepen[g].push(id);
    }
    state.sel = -1;
    bewaarVerdeling();
    render();
  }

  // ---------- Tekenen ----------
  function $(id) { return document.getElementById(id); }
  function chip(id, kleur) {
    var d = document.createElement('div');
    d.className = 'chip' + (state.sel === id ? ' sel' : '');
    d.setAttribute('data-id', String(id));
    if (kleur) d.style.borderLeftColor = kleur;
    d.appendChild(document.createTextNode(label(id)));
    return d;
  }
  function langsteNaam(ids) {
    var m = 2;
    for (var i = 0; i < ids.length; i++) m = Math.max(m, label(ids[i]).length);
    return m;
  }

  function render() {
    var n = totaal(), p = pool(), i, j;
    var stage = $('stageIn'), W = stage.clientWidth, H = stage.clientHeight;
    $('perVal').textContent = String(state.per);
    $('btnMin').disabled = state.per <= 2;
    $('btnPlus').disabled = state.per >= MAX_PER;
    var aanw = n - state.afwezig.length;
    $('info').textContent = n ? '→ ' + aantalGroepen(aanw) + (aantalGroepen(aanw) === 1 ? ' groepje' : ' groepjes') : '';
    $('info').title = aanw + ' leerlingen aanwezig';
    $('btnLln').textContent = 'Leerlingen (' + n + ')';
    var segs = $('wijzeSeg').getElementsByTagName('button');
    for (i = 0; i < segs.length; i++) segs[i].className = segs[i].getAttribute('data-wijze') === state.wijze ? 'on' : '';
    $('btnGrPlus').className = 'btn' + (state.wijze === 'manueel' ? '' : ' hidden');
    $('btnGrMin').className = 'btn' + (state.wijze === 'manueel' ? '' : ' hidden');
    $('btnGrMin').disabled = !state.groepen.length;
    $('btnTerug').disabled = !state.groepen.length || p.length + state.afwezig.length === n;
    $('btnMaak').textContent = state.groepen.length && state.wijze === 'auto' ? 'Nieuwe groepjes' : 'Maak groepjes';
    $('btnMaak').disabled = !n;
    $('leegmelding').className = 'leegmelding' + (n ? ' hidden' : '');

    // onderaan: "Nog te verdelen" en "Afwezig"
    var poolIn = $('poolIn'), afwIn = $('afwIn'), onder = $('onder');
    poolIn.innerHTML = ''; afwIn.innerHTML = '';
    for (i = 0; i < p.length; i++) poolIn.appendChild(chip(p[i]));
    for (i = 0; i < state.afwezig.length; i++) afwIn.appendChild(chip(state.afwezig[i]));
    var heeftGroepen = state.groepen.length > 0;
    onder.style.display = n ? '' : 'none';
    onder.className = heeftGroepen ? 'klein' : 'groot';
    var oh = 0;
    if (n) {
      onder.style.width = W + 'px';
      if (heeftGroepen) {
        onder.style.top = 'auto';
        onder.style.bottom = '0px';
        onder.style.height = 'auto';
        $('pool').style.height = 'auto'; $('afw').style.height = 'auto';
        var h = Math.max($('pool').offsetHeight, $('afw').offsetHeight);
        h = Math.min(Math.max(h, 64), Math.round(H * 0.42));
        $('pool').style.height = h + 'px'; $('afw').style.height = h + 'px';
        onder.style.height = h + 'px';
        oh = h + 12;
      } else {
        onder.style.top = '0px';
        onder.style.height = H + 'px';
        $('pool').style.height = H + 'px'; $('afw').style.height = H + 'px';
      }
    }

    // groepjes: kies het aantal kolommen dat de grootste letters geeft
    var box = $('groepen');
    box.innerHTML = '';
    var g = state.groepen.length;
    box.style.display = g ? '' : 'none';
    if (!g) return;
    var GH = H - oh, M = 12, maxLeden = 1, alle = [];
    for (i = 0; i < g; i++) { maxLeden = Math.max(maxLeden, state.groepen[i].length); alle = alle.concat(state.groepen[i]); }
    if (state.wijze === 'manueel') maxLeden = Math.max(maxLeden, Math.min(state.per, aanw));
    var lang = langsteNaam(alle.length ? alle : p);
    var best = null;
    for (var c = 1; c <= g; c++) {
      var r = Math.ceil(g / c);
      var cw = (W - (c - 1) * M) / c, ch = (GH - (r - 1) * M) / r;
      var kop = Math.min(40, ch * 0.22);
      var f = Math.min((ch - kop - 26) / (maxLeden * 1.75 + 0.1), (cw - 34) / (lang * 0.62 + 0.4), 46);
      if (!best || f > best.f) best = { c: c, r: r, cw: cw, ch: ch, kop: kop, f: f };
    }
    box.style.height = GH + 'px';
    var fs = Math.max(11, Math.floor(best.f));
    for (i = 0; i < g; i++) {
      var col = i % best.c, row = Math.floor(i / best.c), kleur = KLEUREN[i % KLEUREN.length];
      var kaart = document.createElement('div');
      kaart.className = 'groep';
      kaart.setAttribute('data-drop', 'g' + i);
      kaart.style.left = Math.round(col * (best.cw + M)) + 'px';
      kaart.style.top = Math.round(row * (best.ch + M)) + 'px';
      kaart.style.width = Math.floor(best.cw) + 'px';
      kaart.style.height = Math.floor(best.ch) + 'px';
      kaart.style.borderColor = kleur;
      var kopEl = document.createElement('div');
      kopEl.className = 'groep-kop';
      kopEl.style.background = kleur;
      kopEl.style.fontSize = Math.max(13, Math.round(best.kop * 0.6)) + 'px';
      kopEl.style.height = Math.round(best.kop) + 'px';
      kopEl.style.lineHeight = Math.round(best.kop) + 'px';
      kopEl.appendChild(document.createTextNode('Groep ' + (i + 1)));
      var tel = document.createElement('span');
      tel.className = 'tel';
      tel.appendChild(document.createTextNode(String(state.groepen[i].length)));
      kopEl.appendChild(tel);
      kaart.appendChild(kopEl);
      var lijst = document.createElement('div');
      lijst.className = 'groep-in';
      lijst.style.fontSize = fs + 'px';
      for (j = 0; j < state.groepen[i].length; j++) lijst.appendChild(chip(state.groepen[i][j], kleur));
      kaart.appendChild(lijst);
      box.appendChild(kaart);
    }
  }

  // ---------- Slepen en tikken ----------
  // Tik op een leerling = kiezen (geel); tik dan op een groepje of vak = verplaatsen. Of meteen slepen.
  var drag = null;
  function vindOmhoog(n, attr) {
    while (n && n.nodeType === 1) { if (n.getAttribute(attr) !== null) return n; n = n.parentNode; }
    return null;
  }
  function doelOp(x, y) {
    var el = document.elementFromPoint(x, y);
    var d = vindOmhoog(el, 'data-drop');
    return d ? d.getAttribute('data-drop') : null;
  }
  function down(target, x, y) {
    var c = vindOmhoog(target, 'data-id');
    if (c) { drag = { id: int(c.getAttribute('data-id'), -1), el: c, x0: x, y0: y, ghost: null }; return true; }
    var d = vindOmhoog(target, 'data-drop');
    if (d && state.sel >= 0) { drag = { drop: d.getAttribute('data-drop') }; return true; }
    return false;
  }
  function move(x, y) {
    if (!drag || drag.drop) return;
    if (!drag.ghost) {
      if (Math.abs(x - drag.x0) + Math.abs(y - drag.y0) < 12) return;
      var r = drag.el.getBoundingClientRect();
      var gh = drag.el.cloneNode(true);
      gh.className = 'chip ghost';
      gh.style.width = r.width + 'px';
      gh.style.fontSize = window.getComputedStyle(drag.el, null).fontSize;
      document.body.appendChild(gh);
      drag.ghost = gh; drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
      drag.el.style.opacity = '0.3';
    }
    drag.ghost.style.left = (x - drag.dx) + 'px';
    drag.ghost.style.top = (y - drag.dy) + 'px';
    var doel = doelOp(x, y), kaarten = document.querySelectorAll('[data-drop]');
    for (var i = 0; i < kaarten.length; i++) {
      var k = kaarten[i], on = k.getAttribute('data-drop') === doel;
      if (on && k.className.indexOf(' over') < 0) k.className += ' over';
      if (!on) k.className = k.className.replace(' over', '');
    }
  }
  function up(x, y) {
    var d = drag; drag = null;
    if (!d) return;
    if (d.drop) { verplaats(state.sel, d.drop); return; }
    if (d.ghost) {
      d.ghost.parentNode.removeChild(d.ghost);
      var doel = doelOp(x, y);
      if (doel) verplaats(d.id, doel); else render();
      return;
    }
    state.sel = state.sel === d.id ? -1 : d.id;
    render();
  }
  function luister(el) {
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || !down(e.target, e.clientX, e.clientY)) return;
      e.preventDefault(); e.stopPropagation();
      function mv(ev) { move(ev.clientX, ev.clientY); }
      function u(ev) { document.removeEventListener('mousemove', mv, false); document.removeEventListener('mouseup', u, false); up(ev.clientX, ev.clientY); }
      document.addEventListener('mousemove', mv, false);
      document.addEventListener('mouseup', u, false);
    }, false);
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || !down(e.target, e.touches[0].clientX, e.touches[0].clientY)) return;
      e.preventDefault(); e.stopPropagation();
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

  // ---------- Venster Leerlingen ----------
  var dlg = { bron: 'nummers', aantal: 20 };
  function dlgNamen() {
    var regels = $('namenIn').value.split(/\r?\n/), uit = [];
    for (var i = 0; i < regels.length; i++) {
      var s = regels[i].replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
      if (s !== '') uit.push(s.substr(0, 40));
    }
    return uit.slice(0, 60);
  }
  function dlgRender() {
    var b = $('bronSeg').getElementsByTagName('button');
    for (var i = 0; i < b.length; i++) b[i].className = b[i].getAttribute('data-bron') === dlg.bron ? 'on' : '';
    $('paneNamen').className = dlg.bron === 'namen' ? '' : 'hidden';
    $('paneNummers').className = dlg.bron === 'nummers' ? '' : 'hidden';
    var k = dlgNamen().length;
    $('namenTel').textContent = k + (k === 1 ? ' naam' : ' namen');
    $('aantalVal').textContent = String(dlg.aantal);
    $('aantalTot').textContent = String(dlg.aantal);
    $('btnAMin').disabled = dlg.aantal <= 1;
    $('btnAPlus').disabled = dlg.aantal >= MAX_AANTAL;
  }
  function openLln() {
    dlg.bron = state.bron; dlg.aantal = state.aantal;
    $('namenIn').value = state.namen.join('\n');
    dlgRender();
    $('overlayLln').className = 'overlay';
  }
  // Nieuwe lijst: groepjes zoveel mogelijk behouden (op naam), wie weg is valt eruit.
  function sluitLln() {
    var oudBron = state.bron, oudNamen = state.namen.slice(), oud = [];
    var namen = dlgNamen(), i, j;
    for (i = 0; i < oudNamen.length; i++) oud.push(oudNamen[i]);
    state.bron = dlg.bron; state.aantal = dlg.aantal; state.namen = namen;
    prefSet('bron', state.bron);
    prefSet('aantal', state.aantal);
    prefSet('namen', JSON.stringify(state.namen));
    if (oudBron !== state.bron) { state.groepen = []; state.afwezig = []; }
    else if (state.bron === 'namen') {
      // oud nummer -> nieuw nummer via de naam (bij dubbele namen: de eerste vrije)
      var vrij = {}, map = {};
      for (i = 0; i < namen.length; i++) { if (!vrij[namen[i]]) vrij[namen[i]] = []; vrij[namen[i]].push(i); }
      for (i = 0; i < oud.length; i++) if (vrij[oud[i]] && vrij[oud[i]].length) map[i] = vrij[oud[i]].shift();
      for (i = 0; i < state.groepen.length; i++) {
        var ng = [];
        for (j = 0; j < state.groepen[i].length; j++) if (map[state.groepen[i][j]] !== undefined) ng.push(map[state.groepen[i][j]]);
        state.groepen[i] = ng;
      }
      var na = [];
      for (i = 0; i < state.afwezig.length; i++) if (map[state.afwezig[i]] !== undefined) na.push(map[state.afwezig[i]]);
      state.afwezig = na;
    }
    state.sel = -1;
    opschonen();
    bewaarVerdeling();
    $('overlayLln').className = 'overlay hidden';
    render();
  }

  // ---------- Opstarten ----------
  function on(id, fn) { $(id).addEventListener('click', fn, false); }
  function init() {
    if (!HAS_SANKORE) {
      $('privacy').textContent = 'De namen blijven in deze browser op dit toestel. Ze worden nergens anders naartoe gestuurd. ' +
        'Werk je op een gedeelde computer? Wis ze dan na de les met "Alle namen wissen".';
    } else {
      $('privacy').textContent = 'De namen worden bewaard in deze OpenBoard-les, op dit toestel. Ze worden nergens anders naartoe gestuurd.';
    }
    on('btnMin', function () { if (state.per > 2) { state.per--; prefSet('per', state.per); render(); } });
    on('btnPlus', function () { if (state.per < MAX_PER) { state.per++; prefSet('per', state.per); render(); } });
    on('btnMaak', maak);
    on('btnTerug', allesTerug);
    on('btnGrPlus', groepBij);
    on('btnGrMin', groepWeg);
    var segs = $('wijzeSeg').getElementsByTagName('button');
    for (var i = 0; i < segs.length; i++) (function (b) {
      b.addEventListener('click', function () {
        state.wijze = b.getAttribute('data-wijze');
        prefSet('wijze', state.wijze);
        render();
      }, false);
    })(segs[i]);
    on('btnLln', openLln);
    on('btnLlnKlaar', sluitLln);
    var bs = $('bronSeg').getElementsByTagName('button');
    for (var k = 0; k < bs.length; k++) (function (b) {
      b.addEventListener('click', function () { dlg.bron = b.getAttribute('data-bron'); dlgRender(); }, false);
    })(bs[k]);
    on('btnAMin', function () { if (dlg.aantal > 1) { dlg.aantal--; dlgRender(); } });
    on('btnAPlus', function () { if (dlg.aantal < MAX_AANTAL) { dlg.aantal++; dlgRender(); } });
    on('btnWisNamen', function () { $('namenIn').value = ''; dlgRender(); $('namenIn').focus(); });
    $('namenIn').addEventListener('input', dlgRender, false);
    $('namenIn').addEventListener('keyup', dlgRender, false);
    on('btnTip', function () { $('overlayTip').className = 'overlay'; });
    on('btnTipClose', function () { $('overlayTip').className = 'overlay hidden'; });
    luister($('stageIn'));
    window.addEventListener('resize', render, false);
    render();
  }

  window.__groepjesmaker = { state: state, render: render, maak: maak, verplaats: verplaats, pool: pool, aantalGroepen: aantalGroepen };
  init();
})();
