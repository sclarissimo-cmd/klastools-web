// Startpagina: toont de tools uit tools.js per rubriek, met een filter per leerjaar (onthouden in de browser).
(function () {
  'use strict';
  var KEY = 'start.jaar';
  var jaar = 0; // 0 = alle leerjaren
  try { jaar = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) {}
  if (jaar < 0 || jaar > 6) jaar = 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.appendChild(document.createTextNode(text));
    return n;
  }
  function past(t) { return !jaar || (t.jaren[0] <= jaar && jaar <= t.jaren[1]); }
  function jarenTekst(j) {
    if (j[0] === 1 && j[1] === 6) return '1e – 6e leerjaar';
    if (j[0] === j[1]) return j[0] + 'e leerjaar';
    return j[0] + 'e – ' + j[1] + 'e leerjaar';
  }

  function chips() {
    var box = document.getElementById('jaren');
    box.innerHTML = '';
    for (var j = 0; j <= 6; j++) {
      var b = el('button', 'chip' + (j === jaar ? ' on' : ''), j ? j + 'e' : 'Alle');
      b.setAttribute('aria-pressed', j === jaar ? 'true' : 'false');
      b.onclick = (function (v) {
        return function () {
          jaar = v;
          try { localStorage.setItem(KEY, String(v)); } catch (e) {}
          chips();
          render();
        };
      })(j);
      box.appendChild(b);
    }
  }

  function render() {
    var main = document.getElementById('rubrieken');
    main.innerHTML = '';
    var totaal = 0;
    for (var r = 0; r < RUBRIEKEN.length; r++) {
      var rub = RUBRIEKEN[r], lijst = [];
      for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].rubriek === rub.id && past(TOOLS[i])) lijst.push(TOOLS[i]);
      if (!lijst.length) continue;
      totaal += lijst.length;
      var sec = el('section', 'rubriek');
      sec.id = 'r-' + rub.id;
      sec.appendChild(el('h2', '', rub.naam));
      sec.appendChild(el('p', 'uitleg', rub.uitleg));
      var kaarten = el('div', 'kaarten');
      for (var k = 0; k < lijst.length; k++) {
        var t = lijst[k];
        var a = el('a', 'kaart');
        a.href = t.map + '/';
        a.setAttribute('data-tool', t.map);
        var img = el('img', 'icoon');
        img.src = t.map + '/icon.svg';
        img.alt = '';
        a.appendChild(img);
        var tx = el('div', 'kaart-tekst');
        tx.appendChild(el('h3', '', t.naam));
        tx.appendChild(el('p', '', t.tekst));
        tx.appendChild(el('span', 'jaren', jarenTekst(t.jaren)));
        a.appendChild(tx);
        kaarten.appendChild(a);
      }
      sec.appendChild(kaarten);
      main.appendChild(sec);
    }
    document.getElementById('leeg').className = 'leeg' + (totaal ? ' hidden' : '');
  }

  var v = document.getElementById('versie');
  if (v && window.KT_VERSIE) v.textContent = 'versie ' + window.KT_VERSIE.datum;

  // blok om fouten en ideeën te melden (Google Formulier), enkel als het adres ingevuld is in tools.js
  if (window.MELDFORMULIER) {
    document.getElementById('meldKnop').href = window.MELDFORMULIER;
    document.getElementById('melden').className = 'melden';
  }

  chips();
  render();

  // Werkt ook zonder internet nadat de pagina één keer geopend is (enkel via https of localhost).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    try { navigator.serviceWorker.register('sw.js'); } catch (e) {}
  }
})();
