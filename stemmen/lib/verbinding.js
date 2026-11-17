/* Kleine, ES5-compatibele laag rond Eclipse Paho (MQTT over WebSocket).
 * Werkt ook in de oudere browser-engine die OpenBoard gebruikt.
 *
 *   var net = StemNet.connect({
 *     url: 'wss://broker.hivemq.com:8884/mqtt',
 *     clientId: 'abc',
 *     will: { topic: 't', payload: '...', retain: true },   // optioneel
 *     subscribe: ['t1', 't2'],
 *     onStatus: function (state, text) {},                 // 'wait' | 'ok' | 'err'
 *     onConnect: function () {},
 *     onMessage: function (topic, text) {}
 *   });
 *   net.publish(topic, text, qos, retain, onDelivered);
 *   net.reconnect();   // direct opnieuw verbinden
 *   net.end();
 */
(function (root) {
  'use strict';

  function connect(o) {
    var stopped = false, client = null, timer = null, pending = [];

    function status(s, t) { if (!stopped && o.onStatus) o.onStatus(s, t); }

    function schedule(ms) {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(attempt, ms);
    }

    function attempt() {
      if (stopped) return;
      if (!root.Paho || !root.Paho.Client) { status('err', 'MQTT-bibliotheek niet geladen'); return; }
      status('wait', 'Verbinden…');
      var c, url = String(o.url || '').replace(/^\s+|\s+$/g, '');
      if (/^wss?:\/\/[^\/]+$/i.test(url)) url += '/';
      try {
        c = new root.Paho.Client(url, o.clientId + '_' + Math.random().toString(36).slice(2, 6));
      } catch (e) {
        status('err', 'Ongeldig adres stemdienst');
        return;
      }
      client = c;
      c.onConnectionLost = function () {
        if (c !== client || stopped) return;
        status('err', 'Verbinding verbroken – opnieuw proberen…');
        schedule(3000);
      };
      c.onMessageArrived = function (m) {
        if (c !== client || stopped) return;
        var txt;
        try { txt = m.payloadString; } catch (e) { return; }
        if (o.onMessage) o.onMessage(m.destinationName, txt);
      };
      c.onMessageDelivered = function (m) {
        for (var i = 0; i < pending.length; i++) {
          if (pending[i].m === m) { var cb = pending[i].cb; pending.splice(i, 1); try { cb(); } catch (e) {} return; }
        }
      };
      var opts = {
        timeout: 10,
        keepAliveInterval: o.keepAlive || 30,
        cleanSession: true,
        mqttVersion: 4,
        onSuccess: function () {
          if (c !== client || stopped) return;
          status('ok', 'Verbonden');
          var subs = o.subscribe || [];
          for (var i = 0; i < subs.length; i++) { try { c.subscribe(subs[i], { qos: 1 }); } catch (e) {} }
          if (o.onConnect) o.onConnect();
        },
        onFailure: function (r) {
          if (c !== client || stopped) return;
          status('err', 'Kan stemdienst niet bereiken – opnieuw proberen…');
          schedule(4000);
        }
      };
      if (o.will) {
        var w = new root.Paho.Message(o.will.payload);
        w.destinationName = o.will.topic;
        w.qos = 1;
        w.retained = !!o.will.retain;
        opts.willMessage = w;
      }
      try { c.connect(opts); } catch (e) { status('err', 'Verbindingsfout'); schedule(4000); }
    }

    attempt();

    return {
      connected: function () { try { return !!client && client.isConnected(); } catch (e) { return false; } },
      publish: function (topic, text, qos, retain, cb) {
        if (!this.connected()) return false;
        var m = new root.Paho.Message(text);
        m.destinationName = topic;
        m.qos = qos || 0;
        m.retained = !!retain;
        if (cb) {
          if (m.qos === 0) setTimeout(cb, 0);
          else pending.push({ m: m, cb: cb });
        }
        try { client.send(m); } catch (e) { return false; }
        return true;
      },
      // Meteen opnieuw verbinden (bv. als een gsm uit de slaapstand komt en
      // de oude verbinding stilletjes dood is).
      reconnect: function () {
        if (stopped) return;
        var old = client;
        client = null;
        clearTimeout(timer);
        try { if (old && old.isConnected()) old.disconnect(); } catch (e) {}
        attempt();
      },
      end: function () {
        stopped = true;
        clearTimeout(timer);
        try { if (client && client.isConnected()) client.disconnect(); } catch (e) {}
        client = null;
      }
    };
  }

  root.StemNet = { connect: connect };
})(this);
