// Enkel in de webversie: de build voegt dit script toe aan elke tool (niet in OpenBoard).
// Zet links in de topbalk een knop "Alle tools" en rechts een knop "Volledig scherm". ES5.
(function () {
  'use strict';
  var bar = document.querySelector('.topbar');
  if (!bar) return;
  document.documentElement.className += ' web';

  var home = document.createElement('a');
  home.className = 'web-home';
  home.href = '../';
  home.title = 'Terug naar alle tools';
  home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 L12 3 L21 11 M6 9 V20 H18 V9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Alle tools</span>';
  bar.insertBefore(home, bar.firstChild);

  var d = document, de = d.documentElement;
  var req = de.requestFullscreen || de.webkitRequestFullscreen || de.msRequestFullscreen;
  if (!req) return;
  function isFull() { return !!(d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement); }
  var fs = document.createElement('button');
  fs.className = 'icon-btn web-fs';
  fs.type = 'button';
  function label() {
    var t = isFull() ? 'Volledig scherm verlaten' : 'Volledig scherm';
    fs.title = t;
    fs.setAttribute('aria-label', t);
    fs.innerHTML = isFull()
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 V9 H3 M15 3 V9 H21 M9 21 V15 H3 M15 21 V15 H21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9 V3 H9 M21 9 V3 H15 M3 15 V21 H9 M21 15 V21 H15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  fs.onclick = function () {
    if (isFull()) (d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen).call(d);
    else req.call(de);
  };
  d.addEventListener('fullscreenchange', label, false);
  d.addEventListener('webkitfullscreenchange', label, false);
  label();
  bar.appendChild(fs);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    try { navigator.serviceWorker.register('../sw.js'); } catch (e) {}
  }
})();
