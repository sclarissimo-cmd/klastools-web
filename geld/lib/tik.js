/* tik.js – vlot bedienen met de vinger op het digibord (gedeeld door alle widgets; ES5).
 *
 * Probleem: een gewone "click" komt pas als je drukt en loslaat zonder te bewegen. Op een digibord schuift
 * de vinger bijna altijd een beetje, en OpenBoard maakt van een aanraking een muis. Gevolg: tikken die
 * verloren gaan of twee keer tikken.
 *
 * Oplossing, voor knoppen (<button>) en elementen met het attribuut data-tik:
 *  - muis (ook OpenBoard): de knop werkt meteen bij het indrukken (mousedown);
 *  - aanraken in de browser: de knop werkt bij het loslaten (touchend), ook als de vinger tot 40 pixels
 *    verschoof. touchend telt voor de browser als echte gebruikersactie (nodig om geluid te mogen starten).
 *  - de gewone click die de browser daarna nog stuurt, wordt genegeerd (anders telt het dubbel).
 * data-tik="area" (bv. een SVG-bord): de klik gaat naar het aangeraakte onderdeel zelf (bv. een vakje).
 * Invoervelden, labels en keuzelijsten blijven gewoon werken zoals altijd.
 * De widget-code luistert gewoon naar 'click'; daar verandert niets aan.
 */
(function () {
  'use strict';
  if (window.__tik) return;
  var MOVE_MAX = 40, SUPPRESS_MS = 800;
  var last = null;       // laatst geactiveerd element { el, t }
  var touch = null;      // lopende aanraking { el, dst, x, y }
  var lastTouchT = 0;
  var api = window.__tik = { fired: 0 };

  function now() { return new Date().getTime(); }

  function findTarget(n) {
    while (n && n.nodeType === 1) {
      var tag = String(n.tagName).toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'label' || tag === 'option') return null;
      var t = n.getAttribute('data-tik');
      if (t === 'area') return { el: n, area: true };
      if (tag === 'button' || t !== null) return n.disabled ? null : { el: n, area: false };
      n = n.parentNode;
    }
    return null;
  }

  function flash(el) {
    var c = ' tik-down';
    if (el.className && typeof el.className === 'string' && el.className.indexOf(c) < 0) {
      el.className += c;
      setTimeout(function () { el.className = String(el.className).replace(c, ''); }, 160);
    }
  }

  function fire(dst, el, x, y) {
    last = { el: el, t: now() };
    var ev = document.createEvent('MouseEvents');
    ev.initMouseEvent('click', true, true, window, 1, x, y, x, y, false, false, false, false, 0, null);
    ev.__tik = true;
    api.fired++;
    dst.dispatchEvent(ev);
  }

  function related(a, b) {
    return a === b || (a.contains && a.contains(b)) || (b.contains && b.contains(a));
  }

  // muis (en OpenBoard): meteen bij het indrukken
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || now() - lastTouchT < SUPPRESS_MS) return; // nagebootste muis na een aanraking
    var t = findTarget(e.target);
    if (!t) return;
    if (!t.area) flash(t.el);
    fire(t.area ? e.target : t.el, t.el, e.clientX, e.clientY);
  }, true);

  // aanraken in de browser: bij het loslaten, met speling voor een verschuivende vinger
  var opts = { capture: true, passive: false };
  document.addEventListener('touchstart', function (e) {
    lastTouchT = now();
    touch = null;
    if (e.touches.length !== 1) return;
    var t = findTarget(e.target);
    if (!t) return;
    var p = e.touches[0];
    touch = { el: t.el, dst: t.area ? e.target : t.el, x: p.clientX, y: p.clientY, cx: p.clientX, cy: p.clientY };
    if (!t.area) flash(t.el);
  }, opts);
  document.addEventListener('touchmove', function (e) {
    if (touch && e.touches.length) { touch.cx = e.touches[0].clientX; touch.cy = e.touches[0].clientY; }
  }, opts);
  document.addEventListener('touchend', function (e) {
    lastTouchT = now();
    var t = touch;
    touch = null;
    if (!t) return;
    if (Math.abs(t.cx - t.x) > MOVE_MAX || Math.abs(t.cy - t.y) > MOVE_MAX) return; // dat was slepen
    if (e.cancelable) e.preventDefault(); // geen nagebootste muis en click meer
    fire(t.dst, t.el, t.cx, t.cy);
  }, opts);
  document.addEventListener('touchcancel', function () { touch = null; }, opts);

  // de gewone click van de browser na een tik die al gewerkt heeft: negeren
  document.addEventListener('click', function (e) {
    if (e.__tik || !last || now() - last.t > SUPPRESS_MS) return;
    if (related(last.el, e.target)) {
      if (e.stopPropagation) e.stopPropagation();
      if (e.preventDefault) e.preventDefault();
    }
  }, true);

  // zichtbaar indrukken
  var st = document.createElement('style');
  st.appendChild(document.createTextNode('.tik-down{opacity:.7;-webkit-transform:scale(.96);transform:scale(.96);}'));
  (document.head || document.documentElement).appendChild(st);
})();
