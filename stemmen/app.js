/* Stemmen – OpenBoard-widget (bordkant)
 * Leerlingen stemmen via hun toestel (MQTT over WebSocket) of de leraar telt handen.
 */
(function () {
  'use strict';

  var DEFAULT_BROKER = 'wss://broker.hivemq.com:8884/mqtt';
  // Gedeelde leerlingenpagina: werkt voor iedereen, de klascode houdt klassen gescheiden.
  var DEFAULT_STUDENT_URL = 'https://sclarissimo-cmd.github.io/stemmen/';
  var TOPIC_ROOT = 'clarisstem/v1/';
  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  var COLORS = ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
  var ONLINE_WINDOW = 75000; // ms: toestel telt als verbonden als het zo recent iets liet horen

  var TYPES = {
    mc:    { label: 'Meerkeuze', ico: 'ABC' },
    yn:    { label: 'Ja / Nee',  ico: '✔✘',  options: [{ key: 'Ja' }, { key: 'Nee' }, { key: 'Weet niet' }] },
    thumb: { label: 'Duim',      ico: '👍',   options: [{ key: '👍', text: 'Snap ik' }, { key: '🤔', text: 'Twijfel' }, { key: '👎', text: 'Snap ik niet' }] },
    scale: { label: 'Schaal 1–5', ico: '★',  options: [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '4' }, { key: '5' }] },
    word:  { label: 'Woordwolk', ico: '☁' }
  };
  var TYPE_ORDER = ['mc', 'yn', 'thumb', 'scale', 'word'];

  // ---------- Voorkeuren (OpenBoard bewaart ze per widget in het document) ----------
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
    try { var l = localStorage.getItem('stemmen.' + k); if (l !== null) return l; } catch (e) {}
    return d;
  }
  function prefSet(k, v) {
    if (HAS_SANKORE) {
      try { sankore.setPreference(k, String(v)); } catch (e) {}
      return;
    }
    try { localStorage.setItem('stemmen.' + k, String(v)); } catch (e) {}
  }

  // Klascode afgeleid van de documentmap: alle pagina's van hetzelfde OpenBoard-document
  // krijgen zo dezelfde code, en elke (geimporteerde) kopie van een les een andere.
  function hash32(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  function documentCode() {
    var href;
    try { href = decodeURIComponent(String(location.href)); } catch (e) { href = String(location.href); }
    var m = href.match(/^(.*)\/widgets\/[^\/]*\.wgt\//i);
    if (!m) return null;
    var h = hash32(m[1].toLowerCase(), 2166136261), s = '';
    for (var i = 0; i < 6; i++) { s += CODE_CHARS.charAt(h % CODE_CHARS.length); h = Math.floor(h / CODE_CHARS.length); }
    return s;
  }
  function initialCode() {
    if (prefGet('codeManual', '') === '1') return prefGet('code', '') || newCode();
    return documentCode() || prefGet('code', '') || newCode();
  }

  function newCode() {
    var s = '';
    for (var i = 0; i < 6; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    return s;
  }
  function rid() { return Math.random().toString(36).slice(2, 10); }

  // ---------- Toestand ----------
  var S = {
    code: initialCode(),
    broker: prefGet('broker', DEFAULT_BROKER),
    studentUrl: prefGet('studentUrl', '') || DEFAULT_STUDENT_URL,
    mode: prefGet('mode', 'live'),          // live | manual
    type: prefGet('type', 'mc'),
    mcCount: parseInt(prefGet('mcCount', '4'), 10) || 4,
    mcTexts: loadTexts(),
    correct: (function () { var c = prefGet('qCorrect', ''); return c === '' ? null : (parseInt(c, 10) || 0); })(),
    autoReveal: prefGet('autoReveal', '1') === '1',
    running: false,
    q: null,                                // actieve vraag
    open: false,
    revealed: false,
    hideResults: false,
    votes: {},                              // live: stemmerId -> waarde
    manual: [],                             // manueel: aantallen per optie
    manualWords: {},                        // manueel: woord -> aantal
    seen: {}                                // stemmerId -> laatst gezien
  };
  if (!documentCode() || prefGet('codeManual', '') === '1') prefSet('code', S.code);
  if (!TYPES[S.type]) S.type = 'mc';
  if (S.mcCount < 2 || S.mcCount > 6) S.mcCount = 4;
  if (S.correct !== null && S.correct >= S.mcCount) S.correct = null;

  function loadTexts() {
    var t = ['', '', '', '', '', ''];
    try {
      var a = JSON.parse(prefGet('qOptions', '[]'));
      for (var i = 0; i < 6 && i < a.length; i++) t[i] = String(a[i] || '').slice(0, 60);
    } catch (e) {}
    return t;
  }
  function saveDraft() {
    prefSet('qText', $('qText').value);
    prefSet('qOptions', JSON.stringify(S.mcTexts));
    prefSet('qCorrect', S.correct === null ? '' : String(S.correct));
  }

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // ---------- MQTT ----------
  var client = null;
  function base() { return TOPIC_ROOT + S.code; }

  function connect() {
    if (client) { client.end(); client = null; }
    if (!window.StemNet) { setConn('err', 'Bestand lib/verbinding.js ontbreekt'); return; }
    var stemTopic = base() + '/stem', halloTopic = base() + '/hallo', vraagTopic = base() + '/vraag';
    var repubTimer = null;
    client = StemNet.connect({
      url: S.broker,
      clientId: 'bord_' + rid(),
      will: { topic: vraagTopic, payload: JSON.stringify({ v: 1, qid: null, open: false }), retain: true },
      subscribe: [stemTopic, halloTopic, vraagTopic],
      onStatus: setConn,
      onConnect: publishState,
      onMessage: function (topic, text) {
        if (!text || text.length > 8000) return;
        var m;
        try { m = JSON.parse(text); } catch (e) { return; }
        if (topic === vraagTopic) {
          // Een vorige pagina (widget) die wegvalt, laat "geen vraag" achter.
          // Loopt hier een stemming, zet dan onze vraag opnieuw klaar.
          if (m && m.qid === null && S.mode === 'live' && S.running) {
            clearTimeout(repubTimer);
            repubTimer = setTimeout(publishState, 400);
          }
          return;
        }
        if (text.length > 600) return;
        if (!m || typeof m.voter !== 'string' || m.voter.length > 40) return;
        S.seen[m.voter] = Date.now();
        if (topic === stemTopic) onVote(m);
        renderJoinCounts();
      }
    });
  }

  function setConn(state, text) {
    var c = $('conn');
    c.classList.toggle('ok', state === 'ok');
    c.classList.toggle('err', state === 'err');
    $('connText').textContent = text;
  }

  function publishState() {
    if (!client || !client.connected()) return;
    var msg;
    if (S.mode === 'live' && S.running && S.q) {
      msg = {
        v: 1, qid: S.q.qid, type: S.q.type, text: S.q.text, options: S.q.options,
        open: S.open, correct: S.revealed ? S.q.correct : null
      };
    } else {
      msg = { v: 1, qid: null, open: false };
    }
    client.publish(base() + '/vraag', JSON.stringify(msg), 1, true);
  }

  function onVote(m) {
    if (S.mode !== 'live' || !S.running || !S.open || !S.q || m.qid !== S.q.qid) return;
    var v = m.value;
    if (S.q.type === 'word') {
      if (typeof v !== 'string') return;
      v = v.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!v) return;
    } else {
      if (typeof v !== 'number' || v % 1 !== 0 || v < 0 || v >= S.q.options.length) return;
    }
    S.votes[m.voter] = v;
    renderResults();
  }

  function onlineCount() {
    var now = Date.now(), n = 0;
    for (var k in S.seen) if (now - S.seen[k] < ONLINE_WINDOW) n++;
    return n;
  }

  // ---------- Leerlingen-link en QR ----------
  function studentLink() {
    var u = (S.studentUrl || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    var hashFree = u.split('#')[0];
    var link = hashFree + (hashFree.indexOf('?') >= 0 ? '&' : '?') + 'c=' + S.code;
    if (S.broker !== DEFAULT_BROKER) link += '&b=' + encodeURIComponent(S.broker);
    return link;
  }
  function shortUrl() {
    return (S.studentUrl || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
  function qrSvg(text) {
    var q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }

  function fillJoin(container, size) {
    container.innerHTML = '';
    if (size === 'card') container.appendChild(el('h3', null, 'Stem mee!'));
    var link = studentLink();
    if (!link) {
      container.appendChild(el('div', 'join-warn', 'Stel eerst het adres van de leerlingenpagina in.'));
      var b = el('button', 'btn', 'Instellingen openen');
      b.onclick = function (ev) { ev.stopPropagation(); openSettings(); };
      container.appendChild(b);
      return;
    }
    var qr = el('div', 'qr');
    qr.innerHTML = qrSvg(link);
    qr.setAttribute('data-tik', '');
    qr.onclick = openQR;
    container.appendChild(qr);
    container.appendChild(el('div', 'join-url', shortUrl()));
    container.appendChild(el('div', 'join-code', S.code));
    if (size !== 'big') container.appendChild(el('div', 'join-count', ''));
  }
  function renderJoin() {
    if (S.mode === 'live') {
      $('joinCard').classList.remove('hidden');
      fillJoin($('joinCard'), 'card');
      $('joinMini').classList.remove('hidden');
      fillJoin($('joinMini'), 'mini');
    } else {
      $('joinCard').classList.add('hidden');
      $('joinMini').classList.add('hidden');
    }
    renderJoinCounts();
  }
  function renderJoinCounts() {
    var n = onlineCount();
    var t = n === 1 ? '1 toestel verbonden' : n + ' toestellen verbonden';
    var nodes = document.querySelectorAll('.join-count');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t;
  }
  function openQR() {
    var link = studentLink();
    if (!link) return;
    fillJoin($('qrBig'), 'big');
    $('overlayQR').classList.remove('hidden');
  }

  // ---------- Opstelscherm ----------
  function renderTypes() {
    var box = $('types');
    box.innerHTML = '';
    TYPE_ORDER.forEach(function (t) {
      var b = el('button', 'type' + (S.type === t ? ' on' : ''));
      b.appendChild(el('span', 'ico', TYPES[t].ico));
      b.appendChild(document.createTextNode(TYPES[t].label));
      b.onclick = function () { S.type = t; prefSet('type', t); renderTypes(); renderOptEditor(); };
      box.appendChild(b);
    });
  }

  function renderOptEditor() {
    var box = $('optEditor');
    box.innerHTML = '';
    if (S.type === 'mc') {
      box.appendChild(el('div', 'label', 'Aantal antwoorden'));
      var pick = el('div', 'count-pick');
      [2, 3, 4, 5, 6].forEach(function (n) {
        var b = el('button', 'btn' + (S.mcCount === n ? ' on' : ''), String(n));
        b.onclick = function () {
          S.mcCount = n; prefSet('mcCount', n);
          if (S.correct !== null && S.correct >= n) S.correct = null;
          renderOptEditor();
        };
        pick.appendChild(b);
      });
      box.appendChild(pick);
      var lab = el('div', 'label', 'Antwoorden ');
      lab.appendChild(el('span', 'muted', '(tekst optioneel – klik op een letter om het juiste antwoord aan te duiden)'));
      box.appendChild(lab);
      for (var i = 0; i < S.mcCount; i++) (function (i) {
        var row = el('div', 'opt-row');
        var L = el('div', 'letter' + (S.correct === i ? ' correct' : ''), LETTERS[i]);
        L.style.background = COLORS[i];
        L.title = 'Duid aan als juist antwoord';
        L.setAttribute('data-tik', '');
        L.onclick = function () { S.correct = S.correct === i ? null : i; saveDraft(); renderOptEditor(); };
        var inp = el('input', 'text-in');
        inp.maxLength = 60;
        inp.placeholder = 'Antwoord ' + LETTERS[i];
        inp.value = S.mcTexts[i];
        inp.oninput = function () { S.mcTexts[i] = inp.value; saveDraft(); };
        row.appendChild(L); row.appendChild(inp);
        box.appendChild(row);
      })(i);
      box.appendChild(el('p', 'hint', S.correct === null ? 'Geen juist antwoord aangeduid (peiling).' : 'Juist antwoord: ' + LETTERS[S.correct] + '. Leerlingen zien dit pas als jij het toont.'));
      if (S.correct !== null) {
        var lab2 = el('label', 'check');
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = S.autoReveal;
        cb.onchange = function () { S.autoReveal = cb.checked; prefSet('autoReveal', cb.checked ? '1' : '0'); };
        lab2.appendChild(cb);
        lab2.appendChild(document.createTextNode(' Juist antwoord automatisch tonen bij "Stop stemming"'));
        box.appendChild(lab2);
      }
    } else if (S.type === 'word') {
      box.appendChild(el('p', 'hint', 'Leerlingen typen een kort antwoord (max. 40 tekens). Dezelfde antwoorden worden groter in de woordwolk. Vraag geen namen of persoonlijke gegevens.'));
    } else {
      box.appendChild(el('div', 'label', 'Leerlingen kiezen uit'));
      var chips = el('div', 'preview-chips');
      TYPES[S.type].options.forEach(function (o) {
        chips.appendChild(el('span', 'chip', o.key + (o.text ? '  ' + o.text : '')));
      });
      box.appendChild(chips);
    }
  }

  function buildQuestion() {
    var t = S.type, opts;
    if (t === 'mc') {
      opts = [];
      for (var i = 0; i < S.mcCount; i++) opts.push({ key: LETTERS[i], text: (S.mcTexts[i] || '').trim() });
    } else if (t === 'word') {
      opts = [];
    } else {
      opts = TYPES[t].options.map(function (o) { return { key: o.key, text: o.text || '' }; });
    }
    return {
      qid: rid(),
      type: t,
      text: $('qText').value.trim(),
      options: opts,
      correct: t === 'mc' ? S.correct : null
    };
  }

  // ---------- Verloop ----------
  function start() {
    S.q = buildQuestion();
    S.running = true;
    S.open = true;
    S.revealed = false;
    S.votes = {};
    S.manual = S.q.options.map(function () { return 0; });
    S.manualWords = {};
    showScreen('run');
    publishState();
    renderRun();
  }
  function newQuestion() {
    S.running = false;
    S.q = null;
    S.hideResults = false;
    if (prefGet('autoStart', '') !== '1') {
      // gewone widget: leeg formulier; voorbereide lespagina: vraag blijft staan
      $('qText').value = '';
      S.mcTexts = ['', '', '', '', '', ''];
      S.correct = null;
      saveDraft();
    }
    renderOptEditor();
    publishState();
    showScreen('setup');
    try { $('qText').focus(); } catch (e) {}
  }
  function toggleOpen() {
    S.open = !S.open;
    if (!S.open && S.autoReveal && S.q && S.q.type === 'mc' && S.q.correct !== null && S.q.correct !== undefined) {
      S.revealed = true;
      S.hideResults = false;
    }
    publishState();
    renderRun();
  }
  function reveal() {
    S.revealed = !S.revealed;
    if (S.revealed) { S.hideResults = false; }
    publishState();
    renderRun();
  }
  function resetVotes() {
    S.votes = {};
    S.manual = S.q.options.map(function () { return 0; });
    S.manualWords = {};
    S.revealed = false;
    // nieuwe vraag-id zodat toestellen opnieuw kunnen stemmen
    S.q.qid = rid();
    S.open = true;
    publishState();
    renderRun();
  }

  function showScreen(which) {
    $('screenSetup').classList.toggle('hidden', which !== 'setup');
    $('screenRun').classList.toggle('hidden', which !== 'run');
    renderJoin();
  }

  // ---------- Resultaten ----------
  function tally() {
    var q = S.q;
    if (S.mode === 'manual') {
      if (q.type === 'word') return { words: S.manualWords };
      return { counts: S.manual.slice() };
    }
    if (q.type === 'word') {
      var w = {};
      for (var k in S.votes) {
        var key = S.votes[k].toLowerCase();
        if (!w[key]) w[key] = { label: S.votes[k], n: 0 };
        w[key].n++;
      }
      var out = {};
      for (var j in w) out[w[j].label] = w[j].n;
      return { words: out };
    }
    var counts = q.options.map(function () { return 0; });
    for (var v in S.votes) counts[S.votes[v]]++;
    return { counts: counts };
  }

  function renderRun() {
    var q = S.q;
    if (!q) return;
    $('runTitle').textContent = q.text || TYPES[q.type].label;
    $('runTitle').className = 'run-title' + ((q.text || '').length <= 24 ? ' big' : '');
    var pill = $('statusPill');
    pill.textContent = S.open ? 'Open' : 'Gesloten';
    pill.className = 'pill' + (S.open ? '' : ' closed');
    pill.classList.toggle('hidden', S.mode === 'manual');
    $('btnStop').textContent = S.open ? 'Stop stemming' : 'Heropen stemming';
    $('btnStop').classList.toggle('hidden', S.mode === 'manual');
    $('btnHide').textContent = S.hideResults ? 'Toon resultaten' : 'Verberg resultaten';
    $('btnReveal').classList.toggle('hidden', !(q.type === 'mc' && q.correct !== null && q.correct !== undefined));
    $('btnReveal').textContent = S.revealed ? 'Verberg juist antwoord' : 'Toon juist antwoord';
    $('btnReset').textContent = S.mode === 'manual' ? 'Op nul zetten' : 'Wis stemmen';
    $('manualWord').classList.toggle('hidden', !(S.mode === 'manual' && q.type === 'word'));
    renderResults();
  }

  function renderResults() {
    var q = S.q;
    if (!q) return;
    var box = $('results');
    var t = tally();
    var total = 0;
    if (t.counts) t.counts.forEach(function (n) { total += n; });
    else for (var k in t.words) total += t.words[k];
    var label = q.type === 'word' && S.mode === 'live'
      ? (Object.keys(S.votes).length + (Object.keys(S.votes).length === 1 ? ' antwoord' : ' antwoorden'))
      : (total + (total === 1 ? ' stem' : ' stemmen'));
    $('voteCount').textContent = label;

    box.innerHTML = '';
    if (S.hideResults) {
      var h = el('div', 'hidden-res');
      var inner = el('div');
      inner.appendChild(el('div', 'big', String(total)));
      inner.appendChild(el('div', null, 'Resultaten verborgen'));
      h.appendChild(inner);
      box.appendChild(h);
      return;
    }

    if (q.type === 'word') { renderCloud(box, t.words); return; }

    var bars = el('div', 'bars');
    q.options.forEach(function (o, i) {
      var n = t.counts[i];
      var pct = total ? Math.round(100 * n / total) : 0;
      var col = el('div', 'col');
      if (S.revealed && q.correct !== null) col.classList.add(i === q.correct ? 'correct' : 'dim');
      col.appendChild(el('div', 'num', String(n)));
      col.appendChild(el('div', 'pct', pct + '%'));
      var track = el('div', 'track');
      var bar = el('div', 'bar');
      bar.style.height = (total ? Math.max(1, pct) : 0) + '%';
      bar.style.background = q.type === 'mc' ? COLORS[i] : optionColor(q.type, i);
      track.appendChild(bar);
      col.appendChild(track);
      var lab = el('div', 'lab');
      lab.appendChild(el('div', 'key', o.key));
      if (o.text) lab.appendChild(el('div', 'txt' + (o.text.length <= 6 ? ' short' : ''), o.text));
      col.appendChild(lab);
      if (S.mode === 'manual') {
        var pm = el('div', 'pm');
        var minus = el('button', 'btn', '−');
        var plus = el('button', 'btn', '+');
        minus.onclick = function () { if (S.manual[i] > 0) { S.manual[i]--; renderResults(); } };
        plus.onclick = function () { S.manual[i]++; renderResults(); };
        pm.appendChild(minus); pm.appendChild(plus);
        col.appendChild(pm);
      }
      bars.appendChild(col);
    });
    box.appendChild(bars);

    if (q.type === 'scale' && total) {
      var sum = 0;
      t.counts.forEach(function (n, i) { sum += n * (i + 1); });
      var avg = el('div', 'avg');
      avg.appendChild(document.createTextNode('Gemiddelde: '));
      avg.appendChild(el('b', null, (sum / total).toFixed(1).replace('.', ',')));
      avg.appendChild(document.createTextNode(' / 5'));
      box.appendChild(avg);
    }
  }

  function optionColor(type, i) {
    if (type === 'yn') return ['var(--c2)', 'var(--c4)', '#98a2b3'][i];
    if (type === 'thumb') return ['var(--c2)', 'var(--c1)', 'var(--c4)'][i];
    if (type === 'scale') return ['#c9d8f5', '#9dbbef', '#6f9be6', '#3f78d9', '#1f5fbf'][i];
    return COLORS[i % COLORS.length];
  }

  function renderCloud(box, words) {
    var cloud = el('div', 'cloud' + (S.mode === 'manual' ? ' manual' : ''));
    var keys = Object.keys(words);
    if (!keys.length) {
      cloud.appendChild(el('span', 'empty', S.mode === 'manual' ? 'Typ hieronder de antwoorden die je hoort.' : 'Wachten op antwoorden…'));
      box.appendChild(cloud);
      return;
    }
    keys.sort(function (a, b) { return words[b] - words[a] || a.localeCompare(b); });
    var max = words[keys[0]];
    // grootste woord in het midden: afwisselend links/rechts plaatsen
    var arranged = [];
    keys.forEach(function (k, i) { if (i % 2) arranged.push(k); else arranged.unshift(k); });
    arranged.forEach(function (k, i) {
      var size = 18 + Math.round(46 * (max > 1 ? (words[k] - 1) / (max - 1) : 1) * (keys.length === 1 ? 1 : 1));
      if (max === 1) size = 26;
      var s = el('span', null, k);
      s.style.fontSize = size + 'px';
      s.style.color = COLORS[(keys.indexOf(k)) % COLORS.length];
      s.title = words[k] + '×';
      if (S.mode === 'manual') {
        s.title = words[k] + '× – klik om er één af te trekken';
        s.setAttribute('data-tik', '');
        s.onclick = function () { S.manualWords[k]--; if (S.manualWords[k] <= 0) delete S.manualWords[k]; renderResults(); };
      }
      cloud.appendChild(s);
    });
    box.appendChild(cloud);
  }

  function addManualWord() {
    var inp = $('wordInput');
    var v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!v) return;
    var found = null;
    for (var k in S.manualWords) if (k.toLowerCase() === v.toLowerCase()) found = k;
    if (found) S.manualWords[found]++; else S.manualWords[v] = 1;
    inp.value = '';
    renderResults();
  }

  // ---------- Modus ----------
  function setMode(m) {
    S.mode = m;
    prefSet('mode', m);
    var bs = $('modeSeg').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-mode') === m);
    $('conn').classList.toggle('hidden', m !== 'live');
    if (S.running) {
      // bij wisselen van modus gaat de vraag gewoon verder
      if (m === 'manual') S.manual = S.q.options.map(function () { return 0; });
    }
    publishState();
    renderJoin();
    if (S.running) renderRun();
  }

  // ---------- Instellingen ----------
  var pendingCode = null;
  function openSettings() {
    $('setUrl').value = S.studentUrl;
    $('setBroker').value = S.broker;
    pendingCode = S.code;
    $('setCode').textContent = pendingCode;
    $('overlaySettings').classList.remove('hidden');
    var d = $('diag');
    if (d) d.textContent = 'Browser-engine: ' + navigator.userAgent + ' | Locatie: ' + location.href + ' | Documentcode: ' + (documentCode() || 'geen');
    try { $('setUrl').focus(); } catch (e) {}
  }
  function saveSettings() {
    var url = $('setUrl').value.trim() || DEFAULT_STUDENT_URL;
    var broker = $('setBroker').value.trim() || DEFAULT_BROKER;
    var reconnect = broker !== S.broker || pendingCode !== S.code;
    if (reconnect && client && client.connected()) {
      // oude kanaal opruimen
      client.publish(base() + '/vraag', JSON.stringify({ v: 1, qid: null, open: false }), 1, true);
    }
    S.studentUrl = url; prefSet('studentUrl', url);
    S.broker = broker; prefSet('broker', broker);
    if (pendingCode !== S.code) prefSet('codeManual', '1');
    S.code = pendingCode; prefSet('code', S.code);
    $('overlaySettings').classList.add('hidden');
    if (reconnect) { S.seen = {}; setTimeout(connect, 150); }
    renderJoin();
  }

  function isKey(e, name, code) { return e.key === name || e.keyCode === code; }

  // ---------- Koppelingen ----------
  function wire() {
    $('btnStart').onclick = start;
    $('qText').onkeydown = function (e) { if (isKey(e, 'Enter', 13)) start(); };
    $('qText').oninput = function () { prefSet('qText', $('qText').value); };
    $('btnNew').onclick = newQuestion;
    $('btnStop').onclick = toggleOpen;
    $('btnReveal').onclick = reveal;
    $('btnReset').onclick = resetVotes;
    $('btnHide').onclick = function () { S.hideResults = !S.hideResults; renderRun(); };
    $('btnAddWord').onclick = addManualWord;
    $('wordInput').onkeydown = function (e) { if (isKey(e, 'Enter', 13)) addManualWord(); };
    $('joinMini').onclick = openQR;
    $('overlayQR').onclick = function () { $('overlayQR').classList.add('hidden'); };
    $('btnSettings').onclick = openSettings;
    $('btnSetCancel').onclick = function () { $('overlaySettings').classList.add('hidden'); };
    $('btnSetSave').onclick = saveSettings;
    $('btnNewCode').onclick = function () { pendingCode = newCode(); $('setCode').textContent = pendingCode; };
    var bs = $('modeSeg').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) (function (b) { b.onclick = function () { setMode(b.getAttribute('data-mode')); }; })(bs[i]);
    document.addEventListener('keydown', function (e) {
      if (isKey(e, 'Escape', 27)) { $('overlayQR').classList.add('hidden'); $('overlaySettings').classList.add('hidden'); }
    });
    setInterval(renderJoinCounts, 5000);
  }

  // ---------- Actieve pagina opnieuw "opeisen" ----------
  // OpenBoard houdt widgets van recent bekeken pagina's soms in het geheugen.
  // Wordt deze pagina (opnieuw) zichtbaar, dan zetten we onze vraag meteen
  // weer klaar zodat de toestellen direct meeschakelen.
  var lastClaim = 0;
  function reassert() {
    var now = Date.now();
    if (now - lastClaim < 1500) return;
    lastClaim = now;
    if (!client) { connect(); return; }
    if (!client.connected()) { client.reconnect(); return; }   // na verbinden volgt publishState
    publishState();
  }
  function watchActivation() {
    document.addEventListener('visibilitychange', function () { if (!document.hidden) reassert(); });
    window.addEventListener('focus', reassert);
    document.addEventListener('mousedown', reassert, true);
    var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
    if (raf) {
      var last = Date.now();
      var tick = function () {
        var n = Date.now();
        if (n - last > 1500) reassert();   // weergave lag stil: pagina was verborgen
        last = n;
        raf(tick);
      };
      raf(tick);
    }
  }

  wire();
  watchActivation();
  renderTypes();
  renderOptEditor();
  setMode(S.mode === 'manual' ? 'manual' : 'live');
  $('qText').value = prefGet('qText', '');
  showScreen('setup');
  connect();
  // Voorbereide lespagina: stemming start vanzelf bij het openen van de pagina.
  if (prefGet('autoStart', '') === '1' && S.mode === 'live') start();

  // voor testen
  window.__stemmen = S;
})();
