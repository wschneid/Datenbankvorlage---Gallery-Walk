/* Gallery Walk 1.1: Galerierundgang mit Peer-Feedback in einer Moodle-Datenbank
 * Die Datenbank dient als Speicher. Gelesen wird über die Listenansicht,
 * geschrieben über das normale Eingabeformular (edit.php). Moodle prüft alle Rechte.
 * Aufgabe, Dateitypen und Feedbackformular stellt der Lehrer in der Galerie ein.
 */
(function () {
  'use strict';

  /* Link für den Button „Zurück zum Kurs“. Bleibt der Platzhalter stehen,
     wird der Kurs automatisch ermittelt. */
  var KURS_LINK = 'LINK-ZUM-KURS';

  var MAX_ITEMS = 6;
  var PHASEN = {
    1: { name: 'Hochladen', info: 'Die Schüler laden ihre Arbeiten hoch. Die Galerie ist noch geschlossen.' },
    2: { name: 'Rundgang', info: 'Die Schüler sehen ihre Stationen und geben Feedback.' },
    3: { name: 'Ausstellung', info: 'Feedback ist geschlossen. Alle freigegebenen Rückmeldungen sind für alle sichtbar.' }
  };

  /* Vorlagen für das Feedbackformular. Feldtypen: text, skala */
  var VORLAGEN = {
    sterne: {
      name: 'Zwei Sterne und ein Wunsch',
      items: [
        { typ: 'text', label: '★ Das ist gut gelungen', hinweis: 'Mir gefällt, dass …' },
        { typ: 'text', label: '★ Das ist auch gut gelungen', hinweis: 'Besonders überzeugend finde ich …' },
        { typ: 'text', label: 'Wunsch: Das könnte noch besser werden', hinweis: 'Ich würde mir wünschen, dass …' },
        { typ: 'text', label: 'Frage an den Autor', hinweis: 'Wie …? Warum …? Was …?', antworten: true }
      ]
    },
    kriterien: {
      name: 'Kriterien mit Skala',
      items: [
        { typ: 'skala', label: 'Inhalt: fachlich richtig und vollständig', stufen: 4, links: 'trifft nicht zu', rechts: 'trifft voll zu' },
        { typ: 'skala', label: 'Gestaltung: übersichtlich und ansprechend', stufen: 4, links: 'trifft nicht zu', rechts: 'trifft voll zu' },
        { typ: 'skala', label: 'Verständlichkeit: gut nachvollziehbar', stufen: 4, links: 'trifft nicht zu', rechts: 'trifft voll zu' },
        { typ: 'text', label: 'Begründung und Tipp', hinweis: 'Am meisten überzeugt mich …, verbessern würde ich …' }
      ]
    },
    stw: {
      name: 'Ich sehe – ich denke – ich frage mich',
      items: [
        { typ: 'text', label: 'Ich sehe …', hinweis: 'Beschreibe, was dir auffällt.' },
        { typ: 'text', label: 'Ich denke …', hinweis: 'Deute: Was bedeutet das, was folgt daraus?' },
        { typ: 'text', label: 'Ich frage mich …', hinweis: 'Welche Frage bleibt offen?', antworten: true }
      ]
    },
    pmi: {
      name: 'Plus – Minus – Interessant',
      items: [
        { typ: 'text', label: 'Plus: Das ist überzeugend', hinweis: '' },
        { typ: 'text', label: 'Minus: Das überzeugt mich noch nicht', hinweis: '' },
        { typ: 'text', label: 'Interessant: Darüber möchte ich mehr wissen', hinweis: '' }
      ]
    },
    kommentar: {
      name: 'Freier Kommentar',
      items: [
        { typ: 'text', label: 'Dein Kommentar', hinweis: 'Was fällt dir auf? Was gefällt dir, was würdest du ändern?' }
      ]
    }
  };

  var DEFAULT_CFG = {
    v: 1, phase: 1, anzahl: 3, reihenfolge: [],
    titel: 'Gallery Walk',
    auftragHochladen: '',
    auftragRundgang: 'Schau dir jede Arbeit genau an und gib Feedback. Beziehe dich auf konkrete Stellen.',
    labelTitel: 'Titel deiner Arbeit',
    labelName: 'Dein Name (bei Gruppenarbeit: alle Namen)',
    namenZeigen: true,
    datei: true,
    typen: 'pdf, jpg, jpeg, png, gif, webp, html, htm, mp4, webm, mov, mp3, m4a, txt',
    link: false,
    text: false,
    js: false,
    fremdesFeedback: false,
    minlen: 10,
    items: VORLAGEN.sterne.items
  };

  var KINDS = {
    html: ['html', 'htm'], pdf: ['pdf'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic'],
    video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
    audio: ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac'],
    text: ['txt', 'md', 'csv']
  };

  /* Öffnungsparameter für den PDF-Betrachter des Browsers: auf Seitenbreite zoomen,
     keine Seitenleiste. view=FitH verstehen Chrome, Edge und Acrobat,
     zoom=page-width und pagemode=none versteht Firefox. Unbekannte Angaben werden ignoriert. */
  var PDF_OPEN = '#view=FitH&zoom=page-width&pagemode=none&navpanes=0';

  var ROOT = '', QS = '', COURSE = '';

  /* ---------- Hilfsfunktionen ---------- */
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escBr(s) { return esc(s).replace(/\n/g, '<br>'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function store(kind, k, v) {
    try {
      var st = kind === 'local' ? window.localStorage : window.sessionStorage;
      if (v === undefined) return st.getItem(k);
      if (v === null) st.removeItem(k); else st.setItem(k, v);
    } catch (e) { /* Speicher nicht verfügbar */ }
    return null;
  }
  function num(a, b) { return Number(a) - Number(b); }
  function hash(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function abs(u) { try { return new URL(u, location.href).href; } catch (e) { return u; } }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function ext(name) { var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
  function kindOf(name) {
    var e = ext(name);
    for (var k in KINDS) if (KINDS[k].indexOf(e) >= 0) return k;
    return 'other';
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : ''; }
  function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
  function typenList(cfg) {
    return String(cfg.typen || '').toLowerCase().split(/[\s,;]+/).map(function (x) { return x.replace(/^\./, ''); }).filter(Boolean);
  }
  function fmtNum(x) { return (Math.round(x * 10) / 10).toString().replace('.', ','); }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function setupIds() {
    ROOT = (window.M && M.cfg && M.cfg.wwwroot) || location.href.split('/mod/data/')[0];
    var sp = new URLSearchParams(location.search);
    var id = sp.get('id'), d = sp.get('d');
    if (!id && !d && window.M && M.cfg && M.cfg.contextInstanceId) id = String(M.cfg.contextInstanceId);
    if (!id && !d) {
      var inp = document.querySelector('form input[name="d"]');
      if (inp && inp.value) d = inp.value;
    }
    if (!id && !d) {
      var a = document.querySelector('a[href*="/mod/data/view.php?d="], a[href*="/mod/data/view.php?id="]');
      var m = a && a.getAttribute('href').match(/[?&](d|id)=(\d+)/);
      if (m) { if (m[1] === 'd') d = m[2]; else id = m[2]; }
    }
    QS = id ? 'id=' + id : (d ? 'd=' + d : '');
    var cm = document.body.className.match(/\bcourse-(\d+)\b/);
    COURSE = cm ? cm[1] : '';
  }
  function kursLink() {
    if (KURS_LINK.indexOf('LINK-ZUM') !== 0) return KURS_LINK;
    return COURSE ? ROOT + '/course/view.php?id=' + COURSE : ROOT + '/my/';
  }
  function galerieLink() { return ROOT + '/mod/data/view.php?' + QS; }
  function addLink() { return ROOT + '/mod/data/edit.php?' + QS; }
  function isTeacherPage(doc) {
    return !!(doc || document).querySelector('a[href*="/mod/data/field.php"], a[href*="/mod/data/templates.php"]');
  }

  /* ---------- Konfiguration ---------- */
  function parseCfg(s) {
    var cfg = clone(DEFAULT_CFG);
    s = String(s || '').trim();
    if (s.indexOf('cfg:') === 0) {
      try {
        var o = JSON.parse(b64decode(s.slice(4)));
        Object.keys(o).forEach(function (k) { if (k in cfg) cfg[k] = o[k]; });
      } catch (e) { /* defekte Einstellung: Standard verwenden */ }
    }
    cfg.phase = [1, 2, 3].indexOf(+cfg.phase) >= 0 ? +cfg.phase : 1;
    cfg.anzahl = Math.min(8, Math.max(1, parseInt(cfg.anzahl, 10) || 3));
    cfg.minlen = Math.min(200, Math.max(0, parseInt(cfg.minlen, 10) || 0));
    cfg.reihenfolge = (cfg.reihenfolge || []).map(String).filter(function (x) { return /^\d+$/.test(x); });
    cfg.items = (Array.isArray(cfg.items) && cfg.items.length ? cfg.items : clone(VORLAGEN.sterne.items)).slice(0, MAX_ITEMS).map(normItem);
    var seen = false;
    cfg.items.forEach(function (it) { if (it.antworten) { if (seen || it.typ !== 'text') it.antworten = false; else seen = true; } });
    return cfg;
  }
  function normItem(it) {
    it = it || {};
    var o = { typ: it.typ === 'skala' ? 'skala' : 'text', label: String(it.label || '').slice(0, 200) };
    if (o.typ === 'text') {
      o.hinweis = String(it.hinweis || '').slice(0, 200);
      o.antworten = !!it.antworten;
    } else {
      o.stufen = Math.min(10, Math.max(2, parseInt(it.stufen, 10) || 4));
      o.links = String(it.links || '').slice(0, 60);
      o.rechts = String(it.rechts || '').slice(0, 60);
    }
    return o;
  }
  function serializeCfg(cfg) { return 'cfg:' + b64encode(JSON.stringify(cfg)); }
  function answerIndex(cfg) {
    for (var i = 0; i < cfg.items.length; i++) if (cfg.items[i].antworten) return i;
    return -1;
  }

  /* ---------- Zugriff auf die Datenbank ---------- */
  function get(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Der Server meldet einen Fehler (' + r.status + ').');
      return r;
    });
  }

  function parseRows(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var rows = [], seen = {};
    doc.querySelectorAll('.gw-row').forEach(function (el) {
      var id = (el.getAttribute('data-id') || '').trim();
      if (!/^\d+$/.test(id) || seen[id]) return;
      seen[id] = true;
      function box(k) { return el.querySelector('[data-k="' + k + '"]'); }
      function t(k) { var e = box(k); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }
      function link(k) { var e = el.querySelector('[data-k="' + k + '"] a[href]'); return e ? abs(e.getAttribute('href')) : ''; }
      var fa = el.querySelector('[data-k="datei"] a[href]');
      var tb = box('text');
      var status = t('status');
      var r = {
        id: id, typ: t('typ'), titel: t('titel'), name: t('name'),
        fileUrl: fa ? abs(fa.getAttribute('href')) : '',
        fileName: fa ? fa.textContent.trim() : '',
        link: t('link'),
        textHtml: tb && tb.textContent.trim() ? tb.innerHTML.trim() : '',
        bezug: t('bezug'), antwort: t('antwort'), einstellung: t('einstellung'),
        f: [],
        status: status, pending: status === 'notapproved',
        added: t('added'), modified: t('modified'),
        editUrl: link('edit'), deleteUrl: link('delete'),
        approveUrl: link('approve'), disapproveUrl: link('disapprove')
      };
      for (var i = 1; i <= MAX_ITEMS; i++) r.f.push(t('f' + i));
      rows.push(r);
    });
    var dl = doc.querySelector('.gw-row a[href*="d="]');
    var dm = dl && dl.getAttribute('href').match(/[?&]d=(\d+)/);
    return { rows: rows, dataId: dm ? dm[1] : '', teacherNav: isTeacherPage(doc) };
  }

  function loadRows() {
    var url = ROOT + '/mod/data/view.php?' + QS + '&mode=list&perpage=1000&page=0&advanced=0&_=' + Date.now();
    return get(url).then(function (r) { return r.text(); }).then(parseRows);
  }
  function latestCfgRow(rows) {
    return rows.filter(function (r) { return r.typ === 'Steuerung' && !r.pending; }).sort(function (a, b) { return num(b.id, a.id); })[0] || null;
  }

  /* Speichert einen Eintrag über das normale Moodle-Formular.
     values: { Feldname: Wert }, rid: vorhandener Eintrag oder leer */
  function save(values, rid) {
    var url = ROOT + '/mod/data/edit.php?' + QS + (rid ? '&rid=' + rid : '') + '&_=' + Date.now();
    return get(url).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var form = null;
      doc.querySelectorAll('form').forEach(function (f) {
        if (!form && f.querySelector('input[name="sesskey"]') && f.querySelector('#gw-add')) form = f;
      });
      if (!form) throw new Error('Das Eingabeformular wurde nicht gefunden. Bist du noch in Moodle angemeldet?');
      var fd = new FormData();
      form.querySelectorAll('input, textarea, select').forEach(function (el) {
        if (!el.name || el.disabled) return;
        var tp = (el.getAttribute('type') || '').toLowerCase();
        if (['submit', 'button', 'file', 'image', 'reset'].indexOf(tp) >= 0) return;
        if ((tp === 'checkbox' || tp === 'radio') && !el.checked) return;
        if (el.tagName === 'SELECT' && el.multiple) {
          Array.prototype.forEach.call(el.options, function (o) { if (o.selected) fd.append(el.name, o.value); });
          return;
        }
        fd.append(el.name, el.value);
      });
      Object.keys(values).forEach(function (key) {
        var wrap = form.querySelector('[data-gw-field="' + key + '"]');
        var inp = wrap && wrap.querySelector('input[type="text"], input:not([type])');
        if (!inp || !inp.name) throw new Error('Das Feld „' + key + '“ fehlt in der Datenbank.');
        fd.set(inp.name, values[key]);
      });
      fd.set('saveandview', 'Speichern');
      return fetch(ROOT + '/mod/data/edit.php', { method: 'POST', body: fd, credentials: 'same-origin' });
    }).then(function (res) {
      if (res.ok && /\/mod\/data\/view\.php/.test(res.url)) {
        var m = res.url.match(/[?&]rid=(\d+)/);
        return m ? m[1] : (rid || '');
      }
      return res.text().then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var cont = doc.querySelector('meta[http-equiv="refresh"][content*="view.php"], .continuebutton a[href*="/mod/data/view.php"]');
        if (cont && res.ok) {
          var m2 = (cont.getAttribute('content') || cont.getAttribute('href') || '').match(/[?&](?:amp;)?rid=(\d+)/);
          return m2 ? m2[1] : (rid || '');
        }
        var e = doc.querySelector('.alert-danger, .notifyproblem, .error, .invalid-feedback');
        throw new Error(e && e.textContent.trim() ? e.textContent.trim() : 'Speichern hat nicht geklappt. Bitte versuche es noch einmal.');
      });
    });
  }

  function runLimited(items, limit, fn) {
    var i = 0, done = 0, errors = 0;
    return new Promise(function (resolve) {
      if (!items.length) { resolve({ done: 0, errors: 0 }); return; }
      function next() {
        if (i >= items.length) return;
        var item = items[i++];
        Promise.resolve().then(function () { return fn(item); })
          .catch(function () { errors++; })
          .then(function () {
            done++;
            if (done === items.length) resolve({ done: done, errors: errors });
            else next();
          });
      }
      for (var k = 0; k < Math.min(limit, items.length); k++) next();
    });
  }

  /* ---------- Zustand ---------- */
  var S = {
    rows: [], teacher: false, preview: false, loaded: false, error: '',
    tab: null, open: null, drafts: {}, editing: {}, confirmDel: null, busy: {},
    pages: {}, approvalOn: null, draft: null, showNative: false, blobUrl: null,
    full: false, nativeFull: false, panelHidden: false
  };
  var app, toastTimer, refreshTimer;

  function studentMode() { return !S.teacher || S.preview; }

  function derive() {
    var rows = S.rows, student = studentMode();
    S.byId = {};
    rows.forEach(function (r) { r.own = !S.teacher && !!r.editUrl; S.byId[r.id] = r; });
    S.stRow = latestCfgRow(rows);
    S.cfg = parseCfg(S.stRow ? S.stRow.einstellung : '');
    S.exponate = rows.filter(function (r) { return r.typ === 'Exponat' && !r.pending; });
    // Die festgelegte Reihenfolge bleibt stabil, auch wenn eine Arbeit vorübergehend nicht sichtbar ist.
    var ids = S.exponate.map(function (r) { return r.id; });
    var fixed = S.cfg.reihenfolge.slice();
    var rest = ids.filter(function (id) { return fixed.indexOf(id) < 0; }).sort(num);
    S.orderAll = fixed.concat(rest);
    S.order = S.orderAll.filter(function (id) { return ids.indexOf(id) >= 0; });
    S.nr = {};
    S.orderAll.forEach(function (id, i) { S.nr[id] = i + 1; });
    S.feedback = rows.filter(function (r) { return r.typ === 'Feedback'; });
    S.antworten = rows.filter(function (r) { return r.typ === 'Antwort'; });
    S.approvalOn = rows.length ? rows.some(function (r) { return !!r.status; }) : null;
    S.ownExps = student ? rows.filter(function (r) { return r.typ === 'Exponat' && r.own; }).sort(function (a, b) { return num(a.id, b.id); }) : [];
    S.ownExp = S.ownExps.length ? S.ownExps[S.ownExps.length - 1] : null;
  }

  function myUid() {
    var a = document.querySelector('.logininfo a[href*="profile.php?id="], #user-action-menu a[href*="profile.php?id="], .usermenu a[href*="profile.php?id="]');
    var m = a && a.getAttribute('href').match(/[?&]id=(\d+)/);
    if (m) return 'u' + m[1];
    var v = store('local', 'gw-uid');
    if (!v) { v = 'r' + Math.floor(Math.random() * 1e9); store('local', 'gw-uid', v); }
    return v;
  }
  function skipKey() { return 'gw-skip-' + QS + '-' + myUid(); }
  function skipList() { try { return JSON.parse(store('local', skipKey()) || '[]'); } catch (e) { return []; } }
  function setSkip(id, on) {
    var l = skipList().filter(function (x) { return x !== id; });
    if (on) l.push(id);
    store('local', skipKey(), JSON.stringify(l));
  }
  function isOwnWork(id) {
    return S.ownExps.some(function (r) { return r.id === id; }) || skipList().indexOf(id) >= 0;
  }

  /* Rotationsprinzip: Wer eine Arbeit hat, bekommt die nächsten k Arbeiten der Reihenfolge.
     So erhält jede Arbeit gleich viele Rückmeldungen. */
  function zuteilung() {
    var all = S.orderAll, n = all.length, k = S.cfg.anzahl, res = [];
    if (!S.order.length) return res;
    var ownIdx = S.ownExp ? all.indexOf(S.ownExp.id) : -1;
    var start = ownIdx >= 0 ? ownIdx : hash(myUid() + QS) % n;
    for (var j = ownIdx >= 0 ? 1 : 0; j < n && res.length < k; j++) {
      var id = all[(start + j) % n];
      if (isOwnWork(id)) continue;
      if (S.order.indexOf(id) < 0) continue;
      res.push(id);
    }
    return res;
  }
  function myFeedbackFor(expId) {
    return S.feedback.filter(function (f) { return f.own && f.bezug === expId; }).sort(function (a, b) { return num(b.id, a.id); })[0] || null;
  }
  function feedbackFor(expId) {
    return S.feedback.filter(function (f) { return f.bezug === expId; }).sort(function (a, b) { return num(a.id, b.id); });
  }
  function antwortenFor(fbId) {
    return S.antworten.filter(function (a) { return a.bezug === fbId; }).sort(function (a, b) { return num(b.id, a.id); });
  }
  function scaleAvg(expId, idx, withPending) {
    var vals = feedbackFor(expId).filter(function (f) { return withPending || !f.pending; })
      .map(function (f) { return parseInt(f.f[idx], 10); }).filter(function (v) { return v > 0; });
    if (!vals.length) return null;
    return { avg: vals.reduce(function (a, b) { return a + b; }, 0) / vals.length, n: vals.length };
  }
  function expTitle(r) {
    return (S.nr[r.id] ? 'Nr. ' + S.nr[r.id] + ' · ' : '') + (r.titel || 'Ohne Titel');
  }
  function showNames() { return !studentMode() || S.cfg.namenZeigen; }

  /* ---------- Darstellung: Grundgerüst ---------- */
  function mount() {
    var anchor = document.getElementById('gw-mount');
    app = document.createElement('div');
    app.id = 'gw-app';
    var main = document.querySelector('[role="main"]') || document.getElementById('region-main') || document.body;
    main.insertBefore(app, main.firstChild);
    if (anchor) anchor.innerHTML = '';
    app.addEventListener('click', onClick);
    app.addEventListener('input', onInput);
    app.addEventListener('change', onInput);
    app.addEventListener('submit', function (e) { e.preventDefault(); });
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        var fe = document.fullscreenElement || document.webkitFullscreenElement;
        if (fe === app) S.nativeFull = true;
        else if (S.nativeFull) { S.nativeFull = false; if (S.full) setFull(false); }
      });
    });
    window.addEventListener('resize', refitPdf);
    document.addEventListener('keydown', function (e) {
      if (!S.full) return;
      var t = e.target, typing = t && /TEXTAREA|INPUT|SELECT/.test(t.tagName);
      if (e.key === 'Escape' && !S.nativeFull) { setFull(false); return; }
      if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
      var nav = e.key === 'ArrowLeft' ? 'prev' : e.key === 'ArrowRight' ? 'next' : '';
      var b = nav && app.querySelector('[data-nav="' + nav + '"]');
      if (b) { e.preventDefault(); b.click(); }
    });
    app.innerHTML = '<div class="gw-loading">Die Galerie wird geladen …</div>';
  }
  function hideNative(hide) {
    Array.prototype.forEach.call(app.parentNode.children, function (c) {
      if (c !== app) c.classList.toggle('gw-native-hidden', !!hide);
    });
  }

  function tabsFor() {
    if (!studentMode()) {
      var pend = pendingItems().length;
      return [['steuerung', 'Steuerung'], ['aufgabe', 'Aufgabe'], ['freigaben', 'Freigaben' + (pend ? ' (' + pend + ')' : '')], ['uebersicht', 'Übersicht']];
    }
    var p = S.cfg.phase;
    if (p === 1) return [['meine', 'Meine Arbeit']];
    if (p === 2) return [['rundgang', 'Rundgang'], ['meine', 'Meine Arbeit']];
    return [['ausstellung', 'Ausstellung'], ['meine', 'Meine Arbeit']];
  }

  function render() {
    if (!app) return;
    if (!S.loaded) {
      app.innerHTML = S.error
        ? '<div class="gw-card gw-err"><p>' + esc(S.error) + '</p><p><button type="button" class="gw-btn" data-act="reload">Erneut versuchen</button></p></div>'
        : '<div class="gw-loading">Die Galerie wird geladen …</div>';
      return;
    }
    var tabs = tabsFor();
    if (!S.tab || !tabs.some(function (t) { return t[0] === S.tab; })) S.tab = tabs[0][0];

    var viewer = app.querySelector('.gw-viewer');
    if (S.open && viewer && viewer.getAttribute('data-id') === S.open) {
      renderHeader();
      renderPanel();
      return;
    }
    releaseBlob();
    app.innerHTML = '<div class="gw-head"></div><div class="gw-body"></div><div class="gw-toast" role="status" aria-live="polite"></div>';
    renderHeader();
    var body = app.querySelector('.gw-body');
    if (S.open && S.byId[S.open]) {
      body.innerHTML = viewerHtml(S.byId[S.open]);
      loadStage(S.byId[S.open]);
      renderPanel();
      updateFullUi();
      return;
    }
    S.open = null;
    updateFullUi();
    var h;
    if (!studentMode()) {
      if (S.tab === 'steuerung') h = teacherSteuerung();
      else if (S.tab === 'aufgabe') h = teacherAufgabe();
      else if (S.tab === 'freigaben') h = teacherFreigaben();
      else h = teacherUebersicht();
    } else {
      if (S.tab === 'meine') h = studentMeine();
      else if (S.tab === 'rundgang') h = studentRundgang();
      else h = studentAusstellung();
    }
    body.innerHTML = h;
  }

  function renderHeader() {
    var head = app.querySelector('.gw-head');
    if (!head) return;
    var p = S.cfg.phase, tabs = tabsFor();
    var h = '<div class="gw-top">' +
      '<div class="gw-title"><h2>' + esc(S.cfg.titel || 'Gallery Walk') + '</h2><span class="gw-phase gw-phase-' + p + '">Phase ' + p + ': ' + esc(PHASEN[p].name) + '</span>' +
      (S.preview ? '<span class="gw-phase gw-phase-preview">Schüleransicht (Vorschau)</span>' : '') + '</div>' +
      '<div class="gw-actions">' +
      '<button type="button" class="gw-btn" data-act="full" title="Vollbild (Esc zum Beenden)">' + (S.full ? 'Vollbild beenden' : 'Vollbild') + '</button>' +
      (S.teacher ? '<button type="button" class="gw-btn" data-act="preview">' + (S.preview ? 'Zur Lehreransicht' : 'Schüleransicht') + '</button>' : '') +
      '<button type="button" class="gw-btn" data-act="reload">Aktualisieren</button>' +
      '<a class="gw-btn" href="' + esc(kursLink()) + '">Zurück zum Kurs</a>' +
      '</div></div>';
    if (!S.open) {
      h += '<nav class="gw-tabs" role="tablist">' + tabs.map(function (t) {
        return '<button type="button" role="tab" class="gw-tab' + (t[0] === S.tab ? ' on' : '') + '" aria-selected="' + (t[0] === S.tab) + '" data-act="tab" data-v="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join('') + '</nav>';
    }
    head.innerHTML = h;
  }

  function toast(msg, kind) {
    var t = app && app.querySelector('.gw-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'gw-toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'gw-toast'; }, kind === 'err' ? 7000 : 3500);
  }
  function chip(text, kind) { return '<span class="gw-chip' + (kind ? ' ' + kind : '') + '">' + esc(text) + '</span>'; }

  var KIND_LABEL = { html: 'Webseite', pdf: 'PDF', image: 'Bild', video: 'Video', audio: 'Audio', text: 'Text', other: 'Datei' };
  function workKind(r) {
    if (r.fileUrl) return KIND_LABEL[kindOf(r.fileName)];
    if (r.textHtml) return 'Text';
    if (r.link) return 'Link';
    return '';
  }
  function expCard(r, extra) {
    var sub = [showNames() ? r.name : '', workKind(r)].filter(Boolean).join(' · ');
    return '<button type="button" class="gw-exp" data-act="open" data-id="' + r.id + '">' +
      '<span class="gw-exp-nr">' + (S.nr[r.id] || '–') + '</span>' +
      '<span class="gw-exp-main"><span class="gw-exp-titel">' + esc(r.titel || 'Ohne Titel') + '</span>' +
      '<span class="gw-exp-name">' + esc(sub) + '</span></span>' +
      (extra ? '<span class="gw-exp-extra">' + extra + '</span>' : '') + '</button>';
  }

  /* ---------- Schüleransicht ---------- */
  function studentMeine() {
    var p = S.cfg.phase, h = '';
    if (!S.ownExps.length) {
      return '<section class="gw-card"><h3>Deine Arbeit ist noch nicht in der Galerie</h3>' +
        (S.cfg.auftragHochladen ? '<div class="gw-auftrag">' + escBr(S.cfg.auftragHochladen) + '</div>' : '') +
        '<ol class="gw-steps"><li>Klicke auf „Arbeit hochladen“.</li><li>Fülle die Felder aus und füge deine Arbeit hinzu.</li><li>Klicke auf „Speichern“. Dein Lehrer gibt die Arbeit danach frei.</li></ol>' +
        '<p class="gw-muted">Bei Gruppenarbeit lädt nur ein Gruppenmitglied hoch und trägt alle Namen ein.</p>' +
        (S.preview ? '<p class="gw-muted">Vorschau: Hochladen ist hier deaktiviert.</p>' : '<p><a class="gw-btn primary" href="' + esc(addLink()) + '">Arbeit hochladen</a></p>') +
        '</section>';
    }
    S.ownExps.forEach(function (own) {
      h += '<section class="gw-card gw-own">' +
        '<div class="gw-own-head"><div><div class="gw-kicker">Deine Arbeit' + (workKind(own) ? ' · ' + esc(workKind(own)) : '') + '</div><h3>' + esc(own.titel || 'Ohne Titel') + '</h3>' +
        '<div class="gw-muted">' + esc(own.name) + (S.nr[own.id] ? ' · Nr. ' + S.nr[own.id] + ' in der Galerie' : '') + '</div></div>' +
        (own.pending ? chip('Wartet auf Freigabe', 'wait') : chip('In der Galerie', 'ok')) + '</div>' +
        (own.pending ? '<p>Dein Lehrer schaut sich die Arbeit an und gibt sie dann frei. Erst danach können die anderen sie sehen.</p>' : '') +
        '<p class="gw-row-btns"><button type="button" class="gw-btn" data-act="open" data-id="' + own.id + '">Ansehen</button>' +
        (own.editUrl ? '<a class="gw-btn" href="' + esc(own.editUrl) + '">Bearbeiten</a>' : '') + '</p>';
      if (p > 1) {
        var fbs = feedbackFor(own.id).filter(function (f) { return !f.own && !f.pending; });
        h += '<h3 class="gw-sub">Feedback zu deiner Arbeit</h3>';
        if (!fbs.length) h += '<p class="gw-muted">Noch kein Feedback freigegeben. Schau später noch einmal vorbei.</p>';
        else {
          h += summaryHtml(own.id, false);
          if (answerIndex(S.cfg) >= 0) h += '<p class="gw-muted">Beantworte die Frage in jedem Feedback. Deine Antwort wird nach der Freigabe für alle sichtbar.</p>';
          fbs.forEach(function (f, i) { h += feedbackBlock(f, i + 1, { answerable: true }); });
        }
      }
      h += '</section>';
    });
    if (p === 1) h += '<section class="gw-card"><p class="gw-muted">Der Rundgang hat noch nicht begonnen. Sobald es Feedback zu deiner Arbeit gibt, erscheint es hier.</p></section>';
    else if (!S.preview) h += '<p><a class="gw-btn" href="' + esc(addLink()) + '">Weitere Arbeit hochladen</a></p>';
    return h;
  }

  function studentRundgang() {
    if (!S.order.length) return '<section class="gw-card"><p class="gw-muted">Noch sind keine Arbeiten freigegeben.</p></section>';
    var mine = zuteilung();
    var doneCount = mine.filter(function (id) { return !!myFeedbackFor(id); }).length;
    var pct = mine.length ? Math.round(doneCount / mine.length * 100) : 0;
    var h = '<section class="gw-card"><h3>Deine Stationen</h3>' +
      (S.cfg.auftragRundgang ? '<div class="gw-auftrag">' + escBr(S.cfg.auftragRundgang) + '</div>' : '') +
      '<div class="gw-progress" aria-label="Fortschritt"><div class="gw-progress-bar" style="width:' + pct + '%"></div></div>' +
      '<p class="gw-muted">' + doneCount + ' von ' + mine.length + ' erledigt' + (doneCount === mine.length && mine.length ? '. Wenn du Zeit hast, gib noch weiteren Arbeiten Feedback.' : '') + '</p>' +
      '<div class="gw-grid">' + mine.map(function (id) { return expCard(S.byId[id], statusChipFor(id)); }).join('') + '</div></section>';
    var others = S.order.filter(function (id) { return mine.indexOf(id) < 0 && !isOwnWork(id); });
    if (others.length) {
      h += '<section class="gw-card"><h3>Weitere Arbeiten</h3><div class="gw-grid">' +
        others.map(function (id) { return expCard(S.byId[id], statusChipFor(id, true)); }).join('') + '</div></section>';
    }
    return h;
  }
  function statusChipFor(id, quiet) {
    var f = myFeedbackFor(id);
    if (!f) return quiet ? '' : chip('offen', 'open');
    return f.pending ? chip('abgegeben', 'wait') : chip('freigegeben', 'ok');
  }

  function studentAusstellung() {
    if (!S.order.length) return '<section class="gw-card"><p class="gw-muted">Noch sind keine Arbeiten freigegeben.</p></section>';
    return '<section class="gw-card"><h3>Alle Arbeiten</h3><p class="gw-muted">Öffne eine Arbeit, um sie zusammen mit dem Feedback zu sehen.</p>' +
      '<div class="gw-grid">' + S.order.map(function (id) {
        var n = feedbackFor(id).filter(function (f) { return !f.pending; }).length;
        return expCard(S.byId[id], chip(plural(n, 'Feedback', 'Feedbacks'), n ? 'ok' : 'open'));
      }).join('') + '</div></section>';
  }

  /* Mittelwerte der Skalen */
  function summaryHtml(expId, withPending) {
    var parts = [];
    S.cfg.items.forEach(function (it, i) {
      if (it.typ !== 'skala') return;
      var a = scaleAvg(expId, i, withPending);
      parts.push('<div class="gw-sum-row"><span class="gw-sum-l">' + esc(it.label) + '</span><span class="gw-sum-v">' +
        (a ? scaleBar(a.avg, it.stufen) + ' <b>' + fmtNum(a.avg) + '</b> von ' + it.stufen + ' <span class="gw-muted">(' + a.n + ')</span>' : '<span class="gw-muted">–</span>') + '</span></div>');
    });
    return parts.length ? '<div class="gw-summary"><div class="gw-kicker">Durchschnitt</div>' + parts.join('') + '</div>' : '';
  }
  function scaleBar(v, max) {
    return '<span class="gw-bar"><span style="width:' + Math.round(v / max * 100) + '%"></span></span>';
  }
  function scaleDots(v, max) {
    var h = '<span class="gw-dots" aria-label="' + v + ' von ' + max + '">';
    for (var i = 1; i <= max; i++) h += '<span' + (i <= v ? ' class="on"' : '') + '></span>';
    return h + '</span> ' + v + ' von ' + max;
  }

  /* Ein Feedback mit Antwortbereich */
  function feedbackBlock(f, n, opt) {
    opt = opt || {};
    var teacher = !studentMode();
    var ai = answerIndex(S.cfg);
    var h = '<article class="gw-fb' + (f.pending ? ' pending' : '') + '">' +
      '<div class="gw-fb-head"><b>Feedback' + (n ? ' ' + n : '') + '</b>' +
      (f.own ? chip('von dir', 'mine') : '') +
      (f.pending ? chip('wartet auf Freigabe', 'wait') : '') +
      (teacher && f.added && f.modified && f.added !== f.modified ? chip('nachträglich geändert', 'warn') : '') +
      '</div><dl class="gw-fb-list">';
    S.cfg.items.forEach(function (it, i) {
      var v = f.f[i] || '';
      if (it.typ === 'skala') {
        var nv = parseInt(v, 10);
        h += '<dt>' + esc(it.label) + '</dt><dd>' + (nv > 0 ? scaleDots(Math.min(nv, it.stufen), it.stufen) : '<span class="gw-muted">–</span>') + '</dd>';
      } else {
        h += '<dt>' + esc(it.label) + '</dt><dd>' + (v ? esc(v) : '<span class="gw-muted">–</span>') + '</dd>';
      }
    });
    h += '</dl>';
    if (teacher) h += teacherItemActions(f);
    if (ai >= 0) {
      var ans = antwortenFor(f.id);
      var myAns = ans.filter(function (a) { return a.own; })[0];
      var visible = ans.filter(function (a) { return teacher || !a.pending || a.own; });
      var key = 'an-' + f.id;
      if (opt.answerable && !S.preview && (!myAns || S.editing[key])) {
        var val = S.drafts[key] != null ? S.drafts[key] : (myAns ? myAns.antwort : '');
        h += '<div class="gw-answer-form"><label class="gw-lbl" for="gw-' + key + '">Deine Antwort auf: ' + esc(S.cfg.items[ai].label) + '</label>' +
          '<textarea id="gw-' + key + '" rows="2" data-draft="' + key + '">' + esc(val) + '</textarea>' +
          '<div class="gw-row-btns"><button type="button" class="gw-btn primary" data-act="answer" data-id="' + f.id + '"' + (S.busy[key] ? ' disabled' : '') + '>' + (S.busy[key] ? 'Speichert …' : 'Antwort speichern') + '</button>' +
          (myAns ? '<button type="button" class="gw-btn ghost" data-act="cancel-edit" data-v="' + key + '">Abbrechen</button>' : '') + '</div></div>';
      } else if (visible.length) {
        visible.forEach(function (a) {
          h += '<div class="gw-answer"><div class="gw-answer-l">Antwort des Autors' + (a.pending ? ' ' + chip('wartet auf Freigabe', 'wait') : '') +
            (teacher && a.added !== a.modified ? ' ' + chip('nachträglich geändert', 'warn') : '') + '</div><p>' + esc(a.antwort) + '</p>' +
            (a.own && opt.answerable && !S.preview ? '<button type="button" class="gw-linkbtn" data-act="edit" data-v="' + key + '">Antwort ändern</button>' : '') +
            (teacher ? teacherItemActions(a) : '') + '</div>';
        });
      } else if (!opt.answerable && S.cfg.phase === 3) {
        h += '<div class="gw-answer gw-muted">Noch keine Antwort.</div>';
      }
    }
    return h + '</article>';
  }

  /* ---------- Ansicht einer Arbeit ---------- */
  function viewerHtml(r) {
    var list = studentMode() && S.cfg.phase === 2 ? zuteilung() : S.order;
    var idx = list.indexOf(r.id);
    var prev = idx > 0 ? list[idx - 1] : null;
    var next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
    return '<div class="gw-viewer" data-id="' + r.id + '">' +
      '<div class="gw-viewer-bar"><button type="button" class="gw-btn" data-act="close">← Zur Übersicht</button>' +
      '<div class="gw-viewer-title"><b>' + esc(expTitle(r)) + '</b>' + (showNames() && r.name ? '<span class="gw-muted"> · ' + esc(r.name) + '</span>' : '') + '</div>' +
      '<div class="gw-viewer-nav">' +
      '<button type="button" class="gw-btn small gw-panel-btn" data-act="panel-toggle"></button>' +
      '<button type="button" class="gw-btn small" data-act="full" title="Vollbild (Esc zum Beenden)"></button>' +
      (prev ? '<button type="button" class="gw-btn small" data-act="open" data-nav="prev" data-id="' + prev + '">← Vorherige</button>' : '') +
      (next ? '<button type="button" class="gw-btn small" data-act="open" data-nav="next" data-id="' + next + '">Nächste →</button>' : '') +
      '</div></div>' +
      '<div class="gw-viewer-main"><div class="gw-stage">' + stageHtml(r) + '</div><aside class="gw-panel" id="gw-panel"></aside></div></div>';
  }

  function stageHtml(r) {
    var h = '';
    if (r.fileUrl) {
      var k = kindOf(r.fileName), u = esc(r.fileUrl);
      if (k === 'html' || k === 'pdf' || k === 'text') {
        h += '<div class="gw-frame-wrap" data-kind="' + k + '"><div class="gw-frame-msg">Wird geladen … Auf dem Handy kann das einige Sekunden dauern.</div></div>';
      } else if (k === 'image') {
        h += '<div class="gw-media"><img class="gw-img" src="' + u + '" alt="' + esc(r.titel) + '"></div>';
      } else if (k === 'video') {
        h += '<div class="gw-media"><video controls playsinline preload="metadata" src="' + u + '"></video></div>';
      } else if (k === 'audio') {
        h += '<div class="gw-media gw-audio"><audio controls preload="metadata" src="' + u + '"></audio></div>';
      } else {
        h += '<div class="gw-filecard"><div class="gw-filecard-ico">' + esc(ext(r.fileName).toUpperCase() || 'DATEI') + '</div>' +
          '<div><b>' + esc(r.fileName) + '</b><p class="gw-muted">Diese Datei kann im Browser nicht angezeigt werden. Lade sie herunter und öffne sie mit dem passenden Programm.</p></div></div>';
      }
      h += '<div class="gw-row-btns gw-stage-btns"><a class="gw-btn small" href="' + u + '">Datei herunterladen</a>' +
        (k === 'pdf' ? '<button type="button" class="gw-btn small" data-act="pdf-tab" disabled>PDF in neuem Tab öffnen</button>' : '') + '</div>';
    }
    if (r.textHtml) h += '<div class="gw-extext">' + r.textHtml + '</div>';
    var lu = safeUrl(r.link);
    if (lu) {
      h += '<div class="gw-linkcard"><div><div class="gw-kicker">Link</div><b>' + esc(hostOf(lu)) + '</b><div class="gw-small gw-break">' + esc(lu) + '</div></div>' +
        '<a class="gw-btn primary" href="' + esc(lu) + '" target="_blank" rel="noopener noreferrer">Link öffnen</a></div>';
    }
    if (!h) h = '<div class="gw-filecard"><p class="gw-muted">Diese Arbeit enthält weder Datei noch Text noch Link.</p></div>';
    return h;
  }

  function releaseBlob() {
    if (S.blobUrl) { try { URL.revokeObjectURL(S.blobUrl); } catch (e) { /* egal */ } S.blobUrl = null; }
  }

  function loadStage(r) {
    var img = app.querySelector('.gw-img');
    if (img) img.addEventListener('error', function () {
      img.parentNode.innerHTML = '<p class="gw-muted gw-pad">Dieses Bild kann der Browser nicht anzeigen (z. B. HEIC vom iPhone). Nutze „Datei herunterladen“.</p>';
    });
    var wrap = app.querySelector('.gw-frame-wrap');
    if (!wrap || !r.fileUrl) return;
    var k = wrap.getAttribute('data-kind'), msg = wrap.querySelector('.gw-frame-msg');
    var fail = function (e) { if (msg) msg.textContent = 'Die Datei konnte nicht geladen werden. ' + (e && e.message ? e.message : ''); };
    if (k === 'pdf') {
      get(r.fileUrl).then(function (res) { return res.arrayBuffer(); }).then(function (buf) {
        if (!app.contains(wrap)) return;
        releaseBlob();
        S.blobUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        var fr = document.createElement('iframe');
        fr.className = 'gw-frame';
        fr.title = r.titel || 'PDF';
        fr.src = S.blobUrl + PDF_OPEN;
        wrap.appendChild(fr);
        wrap.classList.add('ready');
        S.pdfWidth = fr.clientWidth;
        var b = app.querySelector('[data-act="pdf-tab"]');
        if (b) b.disabled = false;
      }).catch(fail);
      return;
    }
    var show = function (txt) {
      if (!app.contains(wrap)) return;
      var fr = document.createElement('iframe');
      fr.className = 'gw-frame';
      fr.title = r.titel || 'Arbeit';
      fr.setAttribute('referrerpolicy', 'no-referrer');
      if (k === 'html') {
        // Abgeschottet: kein Zugriff auf Moodle. Skripte nur, wenn der Lehrer sie erlaubt.
        fr.setAttribute('sandbox', S.cfg.js ? 'allow-scripts' : '');
        if (studentMode()) {
          var css = '<style>details.protokoll{display:none!important}</style>';
          txt = /<\/head>/i.test(txt) ? txt.replace(/<\/head>/i, css + '</head>') : css + txt;
        }
        fr.srcdoc = txt;
      } else {
        fr.setAttribute('sandbox', '');
        fr.srcdoc = '<!DOCTYPE html><meta charset="utf-8"><style>body{font:15px/1.55 system-ui,sans-serif;margin:20px;color:#1e1e20}pre{white-space:pre-wrap;word-wrap:break-word;font:inherit}</style><pre>' + esc(txt) + '</pre>';
      }
      wrap.appendChild(fr);
      wrap.classList.add('ready');
    };
    if (S.pages[r.fileUrl] != null) { show(S.pages[r.fileUrl]); return; }
    get(r.fileUrl).then(function (res) { return res.text(); }).then(function (txt) { S.pages[r.fileUrl] = txt; show(txt); }).catch(fail);
  }

  function renderPanel() {
    var panel = app.querySelector('#gw-panel');
    var r = S.byId[S.open];
    if (!panel || !r) return;
    var h = '', teacher = !studentMode(), p = S.cfg.phase;
    var isOwn = S.ownExps.some(function (x) { return x.id === r.id; });
    if (teacher) {
      h += '<h3>Arbeit</h3>' + (r.pending ? '<p>' + chip('wartet auf Freigabe', 'wait') + '</p>' : '') +
        (r.added !== r.modified ? '<p>' + chip('nachträglich geändert', 'warn') + '</p>' : '') +
        '<p class="gw-small">' + esc(r.name) + (r.fileName ? ' · ' + esc(r.fileName) : '') + '</p>' + teacherItemActions(r);
      var all = feedbackFor(r.id);
      h += '<h3>Feedback (' + all.length + ')</h3>' + summaryHtml(r.id, true);
      h += all.length ? all.map(function (f, i) { return feedbackBlock(f, i + 1); }).join('') : '<p class="gw-muted">Noch kein Feedback.</p>';
    } else if (isOwn) {
      h += '<h3>Deine Arbeit</h3><p class="gw-muted">Das Feedback zu deiner Arbeit findest du unter „Meine Arbeit“.</p>' +
        '<button type="button" class="gw-btn" data-act="goto-meine">Zu „Meine Arbeit“</button>';
    } else if (p === 2) {
      h += feedbackFormHtml(r);
      if (S.cfg.fremdesFeedback) {
        var others = feedbackFor(r.id).filter(function (f) { return !f.own && !f.pending; });
        if (others.length) h += '<h3 class="gw-sub">Feedback der anderen (' + others.length + ')</h3>' + others.map(function (f, i) { return feedbackBlock(f, i + 1); }).join('');
      }
    } else if (p === 3) {
      var vis = feedbackFor(r.id).filter(function (f) { return !f.pending || f.own; });
      h += '<h3>Feedback (' + vis.length + ')</h3>' + summaryHtml(r.id, false);
      h += vis.length ? vis.map(function (f, i) { return feedbackBlock(f, i + 1); }).join('') : '<p class="gw-muted">Zu dieser Arbeit gibt es noch kein freigegebenes Feedback.</p>';
    } else {
      h += '<p class="gw-muted">Der Rundgang hat noch nicht begonnen.</p>';
    }
    panel.innerHTML = '<button type="button" class="gw-panel-close" data-act="panel-toggle" title="Feedback-Leiste ausblenden" aria-label="Feedback-Leiste ausblenden">×</button>' + h;
  }

  function feedbackFormHtml(r) {
    var mine = myFeedbackFor(r.id), key = 'fb-' + r.id;
    var skipped = skipList().indexOf(r.id) >= 0;
    var assigned = zuteilung().indexOf(r.id) >= 0;
    var h = '<h3>Dein Feedback</h3>';
    if (skipped) {
      return h + '<p>Du hast diese Arbeit als eigene Arbeit oder als Arbeit deiner Gruppe markiert. Sie wird bei deinen Stationen übersprungen.</p>' +
        '<button type="button" class="gw-btn" data-act="unskip" data-id="' + r.id + '">Markierung aufheben</button>';
    }
    if (mine && !S.editing[key]) {
      return h + '<p>' + (mine.pending ? chip('abgegeben, wartet auf Freigabe', 'wait') : chip('freigegeben', 'ok')) + '</p>' +
        feedbackBlock(mine, 0) +
        '<p class="gw-row-btns"><button type="button" class="gw-btn" data-act="edit" data-v="' + key + '">Feedback ändern</button></p>' +
        (mine.pending || S.approvalOn === false ? '' : '<p class="gw-muted">Wenn du dein Feedback änderst, muss es erneut freigegeben werden.</p>');
    }
    h += '<p class="gw-muted">' + (assigned ? 'Diese Arbeit ist eine deiner Stationen.' : 'Diese Arbeit gehört nicht zu deinen Stationen. Du kannst trotzdem Feedback geben.') + '</p>' +
      '<p class="gw-hint">Schreibe freundlich und sachlich. Deine Mitschüler sehen nicht, von wem das Feedback kommt. Dein Lehrer kann es sehen.</p>';
    S.cfg.items.forEach(function (it, i) {
      var dk = key + '-' + i;
      var val = S.drafts[dk] != null ? S.drafts[dk] : (mine ? mine.f[i] : '');
      if (it.typ === 'skala') {
        h += '<fieldset class="gw-f gw-scale"><legend class="gw-lbl">' + esc(it.label) + '</legend><div class="gw-scale-row">' +
          (it.links ? '<span class="gw-scale-end">' + esc(it.links) + '</span>' : '') + '<span class="gw-scale-opts">';
        for (var s = 1; s <= it.stufen; s++) {
          h += '<label class="gw-scale-opt"><input type="radio" name="gw-' + dk + '" value="' + s + '" data-draft="' + dk + '"' + (String(val) === String(s) ? ' checked' : '') + '><span>' + s + '</span></label>';
        }
        h += '</span>' + (it.rechts ? '<span class="gw-scale-end">' + esc(it.rechts) + '</span>' : '') + '</div></fieldset>';
      } else {
        h += '<div class="gw-f"><label class="gw-lbl" for="gw-' + dk + '">' + esc(it.label) + '</label>' +
          '<textarea id="gw-' + dk + '" rows="2" data-draft="' + dk + '" placeholder="' + esc(it.hinweis || '') + '">' + esc(val) + '</textarea>' +
          (it.antworten ? '<span class="gw-small">Formuliere eine Frage. Der Autor beantwortet sie.</span>' : '') + '</div>';
      }
    });
    var busy = S.busy[key];
    h += '<div class="gw-row-btns">' +
      (S.preview ? '<span class="gw-muted">Vorschau: Absenden ist deaktiviert.</span>' :
        '<button type="button" class="gw-btn primary" data-act="send-fb" data-id="' + r.id + '"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Wird gesendet …' : 'Feedback abschicken') + '</button>') +
      (mine ? '<button type="button" class="gw-btn ghost" data-act="cancel-edit" data-v="' + key + '">Abbrechen</button>' : '') +
      '</div><div class="gw-form-err" role="alert"></div>';
    if (!mine) h += '<p class="gw-skip"><button type="button" class="gw-linkbtn" data-act="skip" data-id="' + r.id + '">Das ist meine eigene Arbeit oder die meiner Gruppe</button></p>';
    return h;
  }

  /* ---------- Lehreransicht ---------- */
  function pendingItems() { return S.rows.filter(function (r) { return r.pending; }); }

  function teacherItemActions(r, before) {
    var h = '<div class="gw-row-btns gw-tactions">' + (before || '');
    if (r.approveUrl) h += '<button type="button" class="gw-btn small primary" data-act="approve" data-id="' + r.id + '">Freigeben</button>';
    if (r.disapproveUrl && r.typ !== 'Steuerung') h += '<button type="button" class="gw-btn small" data-act="disapprove" data-id="' + r.id + '">Freigabe zurücknehmen</button>';
    if (r.deleteUrl) {
      h += S.confirmDel === r.id
        ? '<button type="button" class="gw-btn small danger-fill" data-act="delete" data-id="' + r.id + '">Wirklich löschen?</button>'
        : '<button type="button" class="gw-btn small danger" data-act="ask-delete" data-id="' + r.id + '">' + (r.typ === 'Exponat' ? 'Arbeit löschen' : 'Löschen') + '</button>';
    }
    return h + '</div>';
  }

  function teacherSteuerung() {
    var c = S.cfg, p = c.phase;
    var pendExp = S.rows.filter(function (r) { return r.typ === 'Exponat' && r.pending; }).length;
    var fbApproved = S.feedback.filter(function (f) { return !f.pending; }).length;
    var fbPending = S.feedback.length - fbApproved;
    var h = '';
    if (S.approvalOn === false) {
      h += '<section class="gw-card gw-infobox"><b>Hinweis:</b> „Freigabe erforderlich“ ist in den Einstellungen dieser Datenbank ausgeschaltet. Arbeiten und Feedback sind deshalb sofort für alle sichtbar. Wenn du moderieren möchtest, schalte die Freigabe in den Einstellungen der Aktivität ein.</section>';
    }
    if (!S.stRow) {
      h += '<section class="gw-card gw-infobox">Noch keine Einstellungen gespeichert. Lege zuerst unter „Aufgabe“ fest, was hochgeladen wird und wie das Feedback aussieht. Die Galerie startet in Phase 1.</section>';
    }
    h += '<section class="gw-card"><h3>Phase</h3><div class="gw-phases">';
    [1, 2, 3].forEach(function (n) {
      h += '<button type="button" class="gw-phasebtn' + (n === p ? ' on' : '') + '" data-act="phase" data-v="' + n + '"' + (S.busy.settings ? ' disabled' : '') + '>' +
        '<span class="gw-phasebtn-n">' + n + '</span><span><b>' + esc(PHASEN[n].name) + '</b><span class="gw-small">' + esc(PHASEN[n].info) + '</span></span></button>';
    });
    h += '</div><div class="gw-f gw-inline"><label class="gw-lbl" for="gw-anzahl">Stationen pro Schüler</label>' +
      '<select id="gw-anzahl" data-act-change="anzahl"' + (S.busy.settings ? ' disabled' : '') + '>' +
      [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return '<option value="' + n + '"' + (n === c.anzahl ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
      '</select><span class="gw-small">Wer eine Arbeit hochgeladen hat, bekommt die nächsten Arbeiten der Reihenfolge zugeteilt. So erhält jede Arbeit gleich viel Feedback. Die Reihenfolge wird beim Start des Rundgangs festgelegt; später freigegebene Arbeiten werden hinten angehängt.</span></div></section>';
    h += '<section class="gw-card"><h3>Stand</h3><div class="gw-stats">' +
      stat(S.exponate.length, 'Arbeiten in der Galerie', pendExp ? pendExp + ' warten auf Freigabe' : '') +
      stat(fbApproved, 'Feedbacks freigegeben', fbPending ? fbPending + ' warten auf Freigabe' : '');
    if (answerIndex(c) >= 0) {
      var qa = S.feedback.filter(function (f) { return !f.pending; });
      h += stat(qa.filter(function (f) { return antwortenFor(f.id).length; }).length + '/' + qa.length, 'Fragen beantwortet', '');
    }
    h += '</div>' + (pendingItems().length ? '<p class="gw-row-btns"><button type="button" class="gw-btn primary" data-act="tab" data-v="freigaben">Zu den Freigaben</button></p>' : '') + '</section>';
    h += '<section class="gw-card"><h3>Auswertung</h3><p class="gw-row-btns">' +
      '<button type="button" class="gw-btn" data-act="print">Feedback-Übersicht drucken</button>' +
      (S.dataId ? '<a class="gw-btn" href="' + esc(ROOT + '/mod/data/export.php?d=' + S.dataId) + '">Export öffnen</a>' : '') +
      '<button type="button" class="gw-btn" data-act="native">' + (S.showNative ? 'Moodle-Ansicht ausblenden' : 'Moodle-Ansicht einblenden') + '</button></p>' +
      '<p class="gw-small">Wer welches Feedback geschrieben hat, wird hier bewusst nicht angezeigt. Du findest es im Export der Datenbank (mit Benutzerdaten) oder in den Logs. Ob alle ihre Stationen erledigt haben, zeigt der Aktivitätsabschluss, wenn du ihn auf eine Mindestzahl an Einträgen einstellst.</p></section>';
    return h;
  }
  function stat(n, label, sub) {
    return '<div class="gw-stat"><div class="gw-stat-n">' + esc(n) + '</div><div class="gw-stat-l">' + esc(label) + '</div>' + (sub ? '<div class="gw-small gw-warntext">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* Aufgabe und Feedbackformular einstellen */
  function teacherAufgabe() {
    if (!S.draft) S.draft = clone(S.cfg);
    var d = S.draft, fbCount = S.feedback.length;
    function inp(key, label, hint, ph) {
      return '<div class="gw-f"><label class="gw-lbl" for="gw-c-' + key + '">' + esc(label) + '</label>' +
        '<input type="text" id="gw-c-' + key + '" data-cfg="' + key + '" value="' + esc(d[key]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>' +
        (hint ? '<span class="gw-small">' + esc(hint) + '</span>' : '') + '</div>';
    }
    function area(key, label, hint) {
      return '<div class="gw-f"><label class="gw-lbl" for="gw-c-' + key + '">' + esc(label) + '</label>' +
        '<textarea id="gw-c-' + key + '" rows="3" data-cfg="' + key + '">' + esc(d[key]) + '</textarea>' +
        (hint ? '<span class="gw-small">' + esc(hint) + '</span>' : '') + '</div>';
    }
    function check(key, label, hint) {
      return '<label class="gw-check"><input type="checkbox" data-cfg="' + key + '"' + (d[key] ? ' checked' : '') + '><span><b>' + esc(label) + '</b>' + (hint ? '<span class="gw-small">' + esc(hint) + '</span>' : '') + '</span></label>';
    }
    var h = '<section class="gw-card"><h3>Aufgabe</h3>' +
      inp('titel', 'Titel des Gallery Walks', '', 'z. B. Plakate zur Industrialisierung') +
      area('auftragHochladen', 'Arbeitsauftrag beim Hochladen', 'Erscheint beim Hochladen und unter „Meine Arbeit“.') +
      area('auftragRundgang', 'Arbeitsauftrag für den Rundgang', 'Erscheint über den Stationen.') +
      '</section>';
    h += '<section class="gw-card"><h3>Was die Schüler hochladen</h3>' +
      inp('labelTitel', 'Beschriftung für den Titel', '') +
      inp('labelName', 'Beschriftung für den Namen', '') +
      check('namenZeigen', 'Namen in der Galerie anzeigen', 'Ausgeschaltet sehen die Mitschüler nicht, von wem eine Arbeit stammt. Der Name steht dann nur noch im Quelltext der Seite.') +
      '<div class="gw-sep"></div>' +
      check('datei', 'Datei hochladen', 'PDF, Bilder, Videos, Audio, Textdateien und HTML-Seiten werden direkt angezeigt, andere Dateien zum Herunterladen angeboten.') +
      (d.datei ? inp('typen', 'Erlaubte Dateitypen', 'Endungen mit Komma getrennt. Leer lassen, um alle Typen zu erlauben.', 'pdf, jpg, png, mp4') : '') +
      (d.datei ? check('js', 'JavaScript in HTML-Dateien ausführen', 'Für interaktive Webseiten der Schüler. Die Seiten laufen abgeschottet und haben keinen Zugriff auf Moodle.') : '') +
      check('link', 'Link angeben', 'Für Arbeiten auf anderen Plattformen, z. B. ein Scratch-Projekt oder ein Video.') +
      check('text', 'Text schreiben', 'Die Schüler schreiben direkt im Editor, z. B. eine Kurzbeschreibung oder einen eigenen Text.') +
      '</section>';
    h += '<section class="gw-card"><h3>Feedbackformular</h3>' +
      '<div class="gw-f gw-inline"><label class="gw-lbl" for="gw-vorlage">Vorlage übernehmen</label><div class="gw-row-btns gw-nomt">' +
      '<select id="gw-vorlage">' + Object.keys(VORLAGEN).map(function (k) { return '<option value="' + k + '">' + esc(VORLAGEN[k].name) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="gw-btn" data-act="cfg-vorlage">Übernehmen</button></div>' +
      '<span class="gw-small">Ersetzt die Felder unten. Du kannst sie danach anpassen, z. B. mit Kriterien, die die Klasse selbst erarbeitet hat.</span></div>';
    if (fbCount) h += '<p class="gw-warnbox gw-pad">Es gibt schon ' + plural(fbCount, 'Feedback', 'Feedbacks') + '. Wenn du Felder hinzufügst, löschst oder verschiebst, passen die bisherigen Antworten nicht mehr zu den Beschriftungen. Texte ändern ist unproblematisch.</p>';
    h += '<div class="gw-items">';
    d.items.forEach(function (it, i) {
      h += '<div class="gw-item-ed"><div class="gw-item-ed-head"><b>Feld ' + (i + 1) + '</b>' +
        '<select data-item="' + i + '" data-prop="typ"><option value="text"' + (it.typ === 'text' ? ' selected' : '') + '>Textantwort</option><option value="skala"' + (it.typ === 'skala' ? ' selected' : '') + '>Skala</option></select>' +
        '<span class="gw-item-ed-tools">' +
        (i > 0 ? '<button type="button" class="gw-btn small" data-act="item-up" data-v="' + i + '" title="nach oben">↑</button>' : '') +
        (i < d.items.length - 1 ? '<button type="button" class="gw-btn small" data-act="item-down" data-v="' + i + '" title="nach unten">↓</button>' : '') +
        (d.items.length > 1 ? '<button type="button" class="gw-btn small danger" data-act="item-del" data-v="' + i + '">Entfernen</button>' : '') +
        '</span></div>' +
        '<div class="gw-f"><label class="gw-lbl">Beschriftung</label><input type="text" data-item="' + i + '" data-prop="label" value="' + esc(it.label) + '"></div>';
      if (it.typ === 'skala') {
        h += '<div class="gw-item-ed-grid"><div class="gw-f"><label class="gw-lbl">Stufen</label><select data-item="' + i + '" data-prop="stufen">' +
          [2, 3, 4, 5, 6, 7, 10].map(function (n) { return '<option value="' + n + '"' + (n === it.stufen ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
          '<div class="gw-f"><label class="gw-lbl">Text links (1)</label><input type="text" data-item="' + i + '" data-prop="links" value="' + esc(it.links) + '"></div>' +
          '<div class="gw-f"><label class="gw-lbl">Text rechts (' + it.stufen + ')</label><input type="text" data-item="' + i + '" data-prop="rechts" value="' + esc(it.rechts) + '"></div></div>';
      } else {
        h += '<div class="gw-f"><label class="gw-lbl">Hilfe im Eingabefeld</label><input type="text" data-item="' + i + '" data-prop="hinweis" value="' + esc(it.hinweis) + '" placeholder="z. B. Mir gefällt, dass …"></div>' +
          '<label class="gw-check"><input type="checkbox" data-item="' + i + '" data-prop="antworten"' + (it.antworten ? ' checked' : '') + '><span><b>Frage an den Autor</b><span class="gw-small">Der Autor beantwortet dieses Feld. Höchstens ein Feld.</span></span></label>';
      }
      h += '</div>';
    });
    h += '</div>' + (d.items.length < MAX_ITEMS ? '<p class="gw-row-btns"><button type="button" class="gw-btn" data-act="item-add">Feld hinzufügen</button></p>' : '') +
      '<div class="gw-f gw-inline"><label class="gw-lbl" for="gw-c-minlen">Mindestlänge für Textantworten (Zeichen)</label><input type="number" min="0" max="200" id="gw-c-minlen" data-cfg="minlen" value="' + esc(d.minlen) + '" class="gw-num"></div>' +
      check('fremdesFeedback', 'Feedback der anderen während des Rundgangs zeigen', 'Ausgeschaltet schreibt jeder sein Feedback, ohne die Rückmeldungen der anderen zu kennen.') +
      '</section>';
    h += '<section class="gw-card gw-savebar"><button type="button" class="gw-btn primary" data-act="cfg-save"' + (S.busy.settings ? ' disabled' : '') + '>' + (S.busy.settings ? 'Speichert …' : 'Aufgabe speichern') + '</button>' +
      '<button type="button" class="gw-btn ghost" data-act="cfg-reset">Änderungen verwerfen</button>' +
      '<span class="gw-small gw-dirty">' + (JSON.stringify(aufgabeTeil(d)) !== JSON.stringify(aufgabeTeil(S.cfg)) ? 'Ungespeicherte Änderungen' : '') + '</span></section>';
    return h;
  }
  var AUFGABE_KEYS = ['titel', 'auftragHochladen', 'auftragRundgang', 'labelTitel', 'labelName', 'namenZeigen', 'datei', 'typen', 'link', 'text', 'js', 'fremdesFeedback', 'minlen', 'items'];
  function aufgabeTeil(c) { var o = {}; AUFGABE_KEYS.forEach(function (k) { o[k] = c[k]; }); return o; }

  function teacherFreigaben() {
    var pend = pendingItems();
    if (!pend.length) return '<section class="gw-card"><p class="gw-muted">' + (S.approvalOn === false ? 'Die Freigabe ist ausgeschaltet. Alles ist sofort sichtbar.' : 'Alles freigegeben. Neue Einträge erscheinen hier automatisch.') + '</p></section>';
    var h = '';
    [['Exponat', 'Arbeiten'], ['Feedback', 'Feedback'], ['Antwort', 'Antworten']].forEach(function (g) {
      var items = pend.filter(function (r) { return r.typ === g[0]; });
      if (!items.length) return;
      h += '<section class="gw-card"><div class="gw-sec-head"><h3>' + g[1] + ' (' + items.length + ')</h3>' +
        (g[0] !== 'Exponat' && items.length > 1 ? '<button type="button" class="gw-btn small primary" data-act="approve-all" data-v="' + g[0] + '"' + (S.busy.bulk ? ' disabled' : '') + '>' + (S.busy.bulk ? 'Gibt frei …' : 'Alle freigeben') + '</button>' : '') + '</div>';
      items.forEach(function (r) {
        if (r.typ === 'Exponat') {
          h += '<div class="gw-item"><div><b>' + esc(r.titel || 'Ohne Titel') + '</b> · ' + esc(r.name) +
            '<div class="gw-small">' + esc([workKind(r), r.fileName].filter(Boolean).join(' · ') || 'leer') + (r.added !== r.modified ? ' · geändert' : '') + '</div></div>' +
            teacherItemActions(r, '<button type="button" class="gw-btn small" data-act="open" data-id="' + r.id + '">Ansehen</button>') + '</div>';
        } else if (r.typ === 'Feedback') {
          var e = S.byId[r.bezug];
          h += '<div class="gw-item"><div class="gw-small">zu ' + (e ? esc(expTitle(e)) + ' · ' + esc(e.name) : 'unbekannter Arbeit') + '</div>' + feedbackBlock(r, 0) + '</div>';
        } else {
          var fb = S.byId[r.bezug], ai = answerIndex(S.cfg);
          h += '<div class="gw-item"><div class="gw-small">Frage: ' + esc(fb && ai >= 0 ? fb.f[ai] : '–') + '</div><p class="gw-item-text">' + esc(r.antwort) + '</p>' + teacherItemActions(r) + '</div>';
        }
      });
      h += '</section>';
    });
    var other = pend.filter(function (r) { return ['Exponat', 'Feedback', 'Antwort'].indexOf(r.typ) < 0; });
    if (other.length) {
      h += '<section class="gw-card"><h3>Sonstige Einträge (' + other.length + ')</h3><p class="gw-small">Diese Einträge passen zu keinem Typ der Galerie und sollten gelöscht werden.</p>';
      other.forEach(function (r) { h += '<div class="gw-item">Typ: ' + esc(r.typ || '–') + teacherItemActions(r) + '</div>'; });
      h += '</section>';
    }
    return h;
  }

  function teacherUebersicht() {
    var pendExp = S.rows.filter(function (r) { return r.typ === 'Exponat' && r.pending; });
    if (!S.order.length && !pendExp.length) return '<section class="gw-card"><p class="gw-muted">Noch hat niemand eine Arbeit hochgeladen.</p></section>';
    var scales = [];
    S.cfg.items.forEach(function (it, i) { if (it.typ === 'skala') scales.push(i); });
    var ai = answerIndex(S.cfg);
    var h = '<section class="gw-card"><h3>Arbeiten und Feedback</h3><div class="gw-tablewrap"><table class="gw-table"><thead><tr>' +
      '<th>Nr.</th><th>Name</th><th>Titel</th><th>Feedback</th>' +
      scales.map(function (i) { return '<th title="' + esc(S.cfg.items[i].label) + '">' + esc(S.cfg.items[i].label.split(':')[0].slice(0, 24)) + ' Ø</th>'; }).join('') +
      (ai >= 0 ? '<th>Fragen beantwortet</th>' : '') + '<th></th></tr></thead><tbody>';
    S.order.concat(pendExp.map(function (r) { return r.id; })).forEach(function (id) {
      var r = S.byId[id];
      var fbs = feedbackFor(id), fa = fbs.filter(function (f) { return !f.pending; });
      h += '<tr><td>' + (S.nr[id] || '–') + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.titel) + (r.pending ? ' ' + chip('wartet', 'wait') : '') + '</td>' +
        '<td>' + fa.length + (fbs.length > fa.length ? ' <span class="gw-small gw-warntext">+' + (fbs.length - fa.length) + ' wartend</span>' : '') + '</td>' +
        scales.map(function (i) { var a = scaleAvg(id, i, false); return '<td>' + (a ? fmtNum(a.avg) : '–') + '</td>'; }).join('') +
        (ai >= 0 ? '<td>' + (fa.length ? fa.filter(function (f) { return antwortenFor(f.id).length; }).length + ' von ' + fa.length : '–') + '</td>' : '') +
        '<td><button type="button" class="gw-btn small" data-act="open" data-id="' + id + '">Öffnen</button></td></tr>';
    });
    h += '</tbody></table></div>' + (scales.length ? '<p class="gw-small">Ø = Durchschnitt des freigegebenen Feedbacks.</p>' : '') + '</section>';
    return h;
  }

  function printOverview() {
    var w = window.open('', '_blank');
    if (!w) { toast('Bitte erlaube Popups für Moodle, um die Übersicht zu drucken.', 'err'); return; }
    var c = S.cfg, ai = answerIndex(c);
    var h = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>' + esc(c.titel) + ' – Feedback-Übersicht</title><style>' +
      'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1e1e20;margin:24px;font-size:14px;line-height:1.45}' +
      'h2{font-size:17px;margin:0 0 2px}.page{break-after:page;padding-bottom:16px}.meta{color:#6a6a70;margin-bottom:12px}' +
      '.fb{border:1px solid #e1e1de;border-radius:8px;padding:10px 12px;margin:10px 0;break-inside:avoid}' +
      'dl{display:grid;grid-template-columns:minmax(120px,32%) 1fr;gap:4px 12px;margin:0}dt{color:#6a6a70}dd{margin:0}' +
      '.ans{margin-top:8px;padding-top:8px;border-top:1px dashed #e1e1de}.wait{color:#c2620a;font-size:12px}.avg{margin:6px 0 10px}' +
      '.noprint{margin-bottom:16px}@media print{.noprint{display:none}body{margin:0}}</style></head><body><div class="noprint"><button onclick="window.print()">Drucken</button></div>';
    S.order.forEach(function (id) {
      var r = S.byId[id], fbs = feedbackFor(id);
      h += '<div class="page"><h2>Nr. ' + S.nr[id] + ' · ' + esc(r.titel) + '</h2><div class="meta">' + esc(r.name) + ' · ' + plural(fbs.length, 'Feedback', 'Feedbacks') + '</div>';
      c.items.forEach(function (it, i) {
        if (it.typ !== 'skala') return;
        var a = scaleAvg(id, i, false);
        h += '<div class="avg">' + esc(it.label) + ': <b>' + (a ? fmtNum(a.avg) + '</b> von ' + it.stufen : '–</b>') + '</div>';
      });
      fbs.forEach(function (f, n) {
        h += '<div class="fb"><b>Feedback ' + (n + 1) + '</b>' + (f.pending ? ' <span class="wait">(noch nicht freigegeben)</span>' : '') + '<dl>';
        c.items.forEach(function (it, i) { h += '<dt>' + esc(it.label) + '</dt><dd>' + esc(it.typ === 'skala' ? (f.f[i] ? f.f[i] + ' von ' + it.stufen : '–') : (f.f[i] || '–')) + '</dd>'; });
        h += '</dl>';
        if (ai >= 0) { var a = antwortenFor(f.id)[0]; h += '<div class="ans"><b>Antwort:</b> ' + (a ? esc(a.antwort) + (a.pending ? ' <span class="wait">(noch nicht freigegeben)</span>' : '') : '–') + '</div>'; }
        h += '</div>';
      });
      if (!fbs.length) h += '<p>Kein Feedback.</p>';
      h += '</div>';
    });
    w.document.open(); w.document.write(h + '</body></html>'); w.document.close();
  }

  /* PDF-Betrachter berechnen den Zoom nur beim Öffnen. Ändert sich die Breite deutlich
     (Vollbild, Kommentarleiste, Drehen des Geräts), wird das PDF neu geladen. */
  var pdfTimer = null;
  function refitPdf() {
    clearTimeout(pdfTimer);
    pdfTimer = setTimeout(function () {
      var fr = app && app.querySelector('.gw-frame-wrap[data-kind="pdf"] iframe');
      if (!fr || !S.blobUrl) return;
      var w = fr.clientWidth;
      if (!w || (S.pdfWidth && Math.abs(w - S.pdfWidth) < 40)) return;
      S.pdfWidth = w;
      var nf = document.createElement('iframe');
      nf.className = fr.className;
      nf.title = fr.title;
      nf.src = S.blobUrl + PDF_OPEN;
      fr.parentNode.replaceChild(nf, fr);
    }, 400);
  }

  /* ---------- Vollbild ---------- */
  /* Die ganze Galerie (#gw-app) geht in den Vollbildmodus. So bleibt er beim Blättern
     zwischen den Arbeiten erhalten. Wo der Browser kein echtes Vollbild kann (iPhone),
     füllt die Galerie das Browserfenster. */
  function setFull(on) {
    S.full = !!on;
    // Auf schmalen Geräten im Hochformat ist die Feedback-Leiste im Vollbild eine Schublade.
    // Sie startet eingeklappt, damit zuerst die Arbeit in voller Größe zu sehen ist.
    // Nach dem Verlassen des Vollbilds gilt wieder die vorherige Einstellung.
    if (S.full && window.matchMedia && window.matchMedia('(orientation: portrait) and (max-width: 980px)').matches) {
      S.panelBeforeFull = S.panelHidden;
      S.panelHidden = true;
    } else if (!S.full && S.panelBeforeFull != null) {
      S.panelHidden = S.panelBeforeFull;
      S.panelBeforeFull = null;
    }
    app.classList.toggle('gw-full', S.full);
    document.documentElement.classList.toggle('gw-full-lock', S.full);
    var d = document, fe = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (S.full && !fe) {
        var req = app.requestFullscreen || app.webkitRequestFullscreen;
        var pr = req ? req.call(app) : null;
        if (pr && pr.catch) pr.catch(function () { /* nur Fenstermodus */ });
      } else if (!S.full && fe) {
        var ex = d.exitFullscreen || d.webkitExitFullscreen;
        var pe = ex ? ex.call(d) : null;
        if (pe && pe.catch) pe.catch(function () { /* egal */ });
      }
    } catch (e) { /* Vollbild nicht erlaubt: Fenstermodus genügt */ }
    if (!S.full) S.nativeFull = false;
    updateFullUi();
    refitPdf();
  }
  function updateFullUi() {
    if (!app) return;
    app.classList.toggle('gw-full', S.full);
    app.classList.toggle('gw-viewing', !!(S.open && app.querySelector('.gw-viewer')));
    app.classList.toggle('gw-panel-hidden', !!S.panelHidden);
    app.querySelectorAll('[data-act="full"]').forEach(function (b) { b.textContent = S.full ? 'Vollbild beenden' : 'Vollbild'; });
    app.querySelectorAll('.gw-panel-btn').forEach(function (t) {
      t.textContent = S.panelHidden ? 'Feedback einblenden' : 'Feedback ausblenden';
      t.title = S.panelHidden ? 'Feedback-Leiste wieder anzeigen' : 'Feedback-Leiste ausblenden, damit die Arbeit die volle Breite bekommt';
      t.classList.toggle('on', !!S.panelHidden);
    });
  }

  /* ---------- Ereignisse ---------- */
  function onInput(e) {
    var t = e.target;
    if (t.getAttribute('data-draft')) {
      S.drafts[t.getAttribute('data-draft')] = t.value;
      var fe = app.querySelector('.gw-form-err');
      if (fe) fe.textContent = '';
    }
    if (e.type === 'change' && t.getAttribute('data-act-change') === 'anzahl') {
      var o = clone(S.cfg); o.anzahl = parseInt(t.value, 10) || 3;
      saveCfg(o, 'Stationen pro Schüler: ' + o.anzahl);
    }
    if (S.draft && t.hasAttribute('data-cfg')) {
      var k = t.getAttribute('data-cfg');
      S.draft[k] = t.type === 'checkbox' ? t.checked : (t.type === 'number' ? parseInt(t.value, 10) || 0 : t.value);
      if (e.type === 'change' && t.type === 'checkbox' && k === 'datei') render();
      markDirty();
    }
    if (S.draft && t.hasAttribute('data-item')) {
      var it = S.draft.items[+t.getAttribute('data-item')], prop = t.getAttribute('data-prop');
      if (!it) return;
      if (prop === 'antworten') {
        S.draft.items.forEach(function (x) { x.antworten = false; });
        it.antworten = t.checked;
        render();
      } else if (prop === 'typ') {
        if (e.type !== 'change') return;
        S.draft.items[+t.getAttribute('data-item')] = normItem({ typ: t.value, label: it.label, stufen: 4, links: 'trifft nicht zu', rechts: 'trifft voll zu' });
        render();
      } else if (prop === 'stufen') {
        if (e.type !== 'change') return;
        it.stufen = parseInt(t.value, 10) || 4;
        render();
      } else {
        it[prop] = t.value;
      }
      markDirty();
    }
  }
  function markDirty() {
    var el = app.querySelector('.gw-dirty');
    if (el && S.draft) el.textContent = JSON.stringify(aufgabeTeil(S.draft)) !== JSON.stringify(aufgabeTeil(S.cfg)) ? 'Ungespeicherte Änderungen' : '';
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !app.contains(b) || b.tagName === 'A') return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
    e.preventDefault();
    if (act !== 'delete') S.confirmDel = null;
    switch (act) {
      case 'reload': refresh(true); break;
      case 'tab': S.tab = v; S.open = null; store('session', 'gw-tab-' + QS, v); render(); break;
      case 'preview': S.preview = !S.preview; S.tab = null; S.open = null; derive(); hideNative(studentMode() || !S.showNative); render(); break;
      case 'native': S.showNative = !S.showNative; hideNative(!S.showNative); render(); break;
      case 'open': S.open = id; render(); window.scrollTo(0, app.getBoundingClientRect().top + window.pageYOffset - 70); break;
      case 'close': S.open = null; render(); break;
      case 'full': setFull(!S.full); break;
      case 'panel-toggle': S.panelHidden = !S.panelHidden; updateFullUi(); refitPdf(); break;
      case 'goto-meine': S.open = null; S.tab = 'meine'; render(); break;
      case 'edit': S.editing[v] = true; render(); break;
      case 'cancel-edit': delete S.editing[v]; clearDrafts(v); render(); break;
      case 'send-fb': sendFeedback(id); break;
      case 'answer': sendAnswer(id); break;
      case 'skip': setSkip(id, true); render(); toast('Diese Arbeit wird bei deinen Stationen übersprungen.'); break;
      case 'unskip': setSkip(id, false); render(); break;
      case 'pdf-tab': if (S.blobUrl) window.open(S.blobUrl + PDF_OPEN, '_blank'); break;
      case 'phase': setPhase(parseInt(v, 10)); break;
      case 'approve': rowAction(id, 'approve'); break;
      case 'disapprove': rowAction(id, 'disapprove'); break;
      case 'ask-delete': S.confirmDel = id; render(); break;
      case 'delete': S.confirmDel = null; rowAction(id, 'delete'); break;
      case 'approve-all': approveAll(v); break;
      case 'print': printOverview(); break;
      case 'cfg-vorlage': {
        var sel = app.querySelector('#gw-vorlage');
        if (sel && VORLAGEN[sel.value]) { S.draft.items = clone(VORLAGEN[sel.value].items).map(normItem); render(); toast('Vorlage übernommen. Zum Übernehmen „Aufgabe speichern“ klicken.'); }
        break;
      }
      case 'item-add': S.draft.items.push(normItem({ typ: 'text', label: 'Neues Feld' })); render(); break;
      case 'item-del': S.draft.items.splice(+v, 1); render(); break;
      case 'item-up': moveItem(+v, -1); break;
      case 'item-down': moveItem(+v, 1); break;
      case 'cfg-save': saveAufgabe(); break;
      case 'cfg-reset': S.draft = null; render(); break;
    }
  }
  function moveItem(i, dir) {
    var a = S.draft.items, j = i + dir;
    if (j < 0 || j >= a.length) return;
    var t = a[i]; a[i] = a[j]; a[j] = t;
    render();
  }
  function clearDrafts(prefix) {
    Object.keys(S.drafts).forEach(function (k) { if (k === prefix || k.indexOf(prefix + '-') === 0) delete S.drafts[k]; });
  }
  function formError(msg) {
    var el = app.querySelector('.gw-form-err');
    if (el) el.textContent = msg;
    toast(msg, 'err');
  }
  function focusDraft(k) { var el = app.querySelector('[data-draft="' + k + '"]'); if (el) el.focus(); }

  function sendFeedback(expId) {
    var key = 'fb-' + expId, mine = myFeedbackFor(expId), vals = {}, c = S.cfg;
    for (var i = 0; i < c.items.length; i++) {
      var it = c.items[i], dk = key + '-' + i;
      var val = String(S.drafts[dk] != null ? S.drafts[dk] : (mine ? mine.f[i] : '')).replace(/\s+/g, ' ').trim();
      if (it.typ === 'skala') {
        if (!(parseInt(val, 10) >= 1)) { formError('Bitte wähle bei „' + it.label + '“ eine Stufe aus.'); return; }
      } else {
        if (val.length < Math.max(1, c.minlen)) { formError('Bitte fülle „' + it.label + '“ aus' + (c.minlen > 1 ? ' (mindestens ' + c.minlen + ' Zeichen).' : '.')); focusDraft(dk); return; }
        if (it.antworten && val.indexOf('?') < 0) { formError('„' + it.label + '“ braucht eine Frage mit Fragezeichen.'); focusDraft(dk); return; }
      }
      vals['F' + (i + 1)] = val;
    }
    for (var j = c.items.length; j < MAX_ITEMS; j++) vals['F' + (j + 1)] = '';
    vals.Typ = 'Feedback';
    vals.Bezug = expId;
    S.busy[key] = true; renderPanel();
    save(vals, mine ? mine.id : null).then(function () {
      delete S.editing[key]; clearDrafts(key);
      toast(S.approvalOn === false ? 'Danke! Dein Feedback ist gespeichert.' : 'Danke! Dein Feedback ist abgegeben. Es wird sichtbar, sobald dein Lehrer es freigibt.', 'ok');
      return refresh();
    }).catch(function (e) { formError(e.message); }).then(function () { delete S.busy[key]; render(); });
  }

  function sendAnswer(fbId) {
    var key = 'an-' + fbId;
    var myAns = antwortenFor(fbId).filter(function (a) { return a.own; })[0];
    var val = String(S.drafts[key] != null ? S.drafts[key] : (myAns ? myAns.antwort : '')).replace(/\s+/g, ' ').trim();
    if (val.length < Math.max(1, S.cfg.minlen)) { toast('Bitte antworte mit mindestens einem ganzen Satz.', 'err'); focusDraft(key); return; }
    S.busy[key] = true; render();
    save({ Typ: 'Antwort', Bezug: fbId, Antwort: val }, myAns ? myAns.id : null).then(function () {
      delete S.editing[key]; clearDrafts(key);
      toast('Antwort gespeichert.', 'ok');
      return refresh();
    }).catch(function (e) { toast(e.message, 'err'); }).then(function () { delete S.busy[key]; render(); });
  }

  function saveCfg(o, msg) {
    S.busy.settings = true; render();
    return save({ Typ: 'Steuerung', Einstellung: serializeCfg(o) }, S.stRow && S.stRow.editUrl ? S.stRow.id : null)
      .then(function () { toast(msg || 'Gespeichert.', 'ok'); return refresh(); })
      .then(function () { return true; })
      .catch(function (e) { toast(e.message, 'err'); return false; })
      .then(function (ok) { delete S.busy.settings; render(); return ok; });
  }
  function setPhase(n) {
    var o = clone(S.cfg); o.phase = n;
    if (n >= 2 && !o.reihenfolge.length) o.reihenfolge = S.order.slice();
    saveCfg(o, 'Phase ' + n + ' (' + PHASEN[n].name + ') ist aktiv.');
  }
  function saveAufgabe() {
    var d = S.draft;
    if (!d) return;
    var probs = [];
    if (!d.datei && !d.link && !d.text) probs.push('Wähle mindestens eine Form aus: Datei, Link oder Text.');
    if (!d.items.length) probs.push('Das Feedbackformular braucht mindestens ein Feld.');
    d.items.forEach(function (it, i) { if (!String(it.label).trim()) probs.push('Feld ' + (i + 1) + ' braucht eine Beschriftung.'); });
    if (probs.length) { toast(probs[0], 'err'); return; }
    var o = clone(S.cfg);
    AUFGABE_KEYS.forEach(function (k) { o[k] = clone(d[k]); });
    o.items = o.items.map(normItem);
    saveCfg(o, 'Aufgabe gespeichert.').then(function (ok) { if (ok) { S.draft = null; render(); } });
  }

  function rowAction(id, kind) {
    var r = S.byId[id];
    if (!r) return;
    var url = kind === 'approve' ? r.approveUrl : kind === 'disapprove' ? r.disapproveUrl : r.deleteUrl;
    if (!url) return;
    if (kind === 'delete') url += '&confirm=1';
    url += '&perpage=2';
    get(url).then(function () {
      toast(kind === 'approve' ? 'Freigegeben.' : kind === 'disapprove' ? 'Freigabe zurückgenommen.' : 'Gelöscht.', 'ok');
      if (kind === 'delete' && S.open === id) S.open = null;
      return refresh();
    }).catch(function (e) { toast(e.message, 'err'); });
  }
  function approveAll(typ) {
    var items = pendingItems().filter(function (r) { return r.typ === typ && r.approveUrl; });
    S.busy.bulk = true; render();
    runLimited(items, 4, function (r) { return get(r.approveUrl + '&perpage=2'); }).then(function (res) {
      toast(res.errors ? res.errors + ' Einträge konnten nicht freigegeben werden.' : plural(res.done, 'Eintrag', 'Einträge') + ' freigegeben.', res.errors ? 'err' : 'ok');
      return refresh();
    }).then(function () { delete S.busy.bulk; render(); });
  }

  function refresh(manual) {
    return loadRows().then(function (res) {
      S.rows = res.rows;
      if (res.dataId) S.dataId = res.dataId;
      S.teacher = res.teacherNav || isTeacherPage() || res.rows.some(function (r) { return r.approveUrl || r.disapproveUrl; });
      S.loaded = true; S.error = '';
      derive();
      if (S.open && !S.byId[S.open]) S.open = null;
      hideNative(studentMode() || !S.showNative);
      // Beim Bearbeiten der Aufgabe nicht neu zeichnen, sonst gehen Eingaben verloren
      if (!(S.tab === 'aufgabe' && S.draft && !manual && !studentMode())) render();
      if (manual) toast('Aktualisiert.');
    }).catch(function (e) {
      if (!S.loaded) { S.error = 'Die Galerie konnte nicht geladen werden. ' + e.message; render(); }
      else toast('Aktualisieren hat nicht geklappt. ' + e.message, 'err');
    });
  }
  function autoRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (document.hidden) return;
      var a = document.activeElement;
      if (a && app.contains(a) && /TEXTAREA|INPUT|SELECT/.test(a.tagName)) return;
      if (Object.keys(S.busy).length) return;
      if (S.open || (S.tab === 'aufgabe' && !studentMode())) return; // beim Lesen oder Einstellen nicht stören
      refresh();
    }, studentMode() ? 90000 : 30000);
  }

  /* ---------- Eingabeformular (Arbeit hochladen) ---------- */
  function setupAddForm() {
    var add = document.getElementById('gw-add');
    if (!add) return;
    document.body.classList.add('gw-addpage');
    var typInput = add.querySelector('[data-gw-field="Typ"] input');
    var typ = typInput ? typInput.value.trim() : '';
    if (!typ && typInput) { typ = 'Exponat'; typInput.value = 'Exponat'; }
    add.querySelectorAll('a[href="LINK-ZUM-KURS"]').forEach(function (a) { a.href = kursLink(); });
    add.querySelectorAll('[data-gw-gallerylink]').forEach(function (a) { a.href = galerieLink(); });
    var teacher = isTeacherPage();
    var cfg = clone(DEFAULT_CFG);
    var show = { Titel: 1, Name: 1, Datei: 1, Link: 0, Text: 0 };

    function setLabel(field, text, hint) {
      var w = add.querySelector('[data-gw-field="' + field + '"]');
      if (!w) return;
      if (text) w.querySelector('.gw-f-l').textContent = text;
      w.querySelector('.gw-f-hint').textContent = hint || '';
    }
    function apply(all) {
      add.querySelectorAll('.gw-f').forEach(function (f) {
        var name = f.getAttribute('data-gw-field');
        var forList = (f.getAttribute('data-gw-for') || '').split(' ');
        var vis = all || forList.indexOf(typ) >= 0;
        if (vis && !all && typ === 'Exponat' && name in show) vis = !!show[name];
        f.style.display = vis ? '' : 'none';
      });
      add.querySelectorAll('[data-gw-intro]').forEach(function (el) {
        el.style.display = el.getAttribute('data-gw-intro').split(' ').indexOf(typ) >= 0 ? '' : 'none';
      });
    }
    function applyCfg() {
      show = { Titel: 1, Name: 1, Datei: cfg.datei ? 1 : 0, Link: cfg.link ? 1 : 0, Text: cfg.text ? 1 : 0 };
      // Vorhandene Inhalte bleiben sichtbar, auch wenn die Form inzwischen abgeschaltet ist
      var linkInp = add.querySelector('[data-gw-field="Link"] input');
      if (linkInp && linkInp.value.trim()) show.Link = 1;
      var fn = add.querySelector('[data-gw-field="Datei"] .filepicker-filename');
      if (fn && fn.textContent.trim()) show.Datei = 1;
      setLabel('Titel', cfg.labelTitel, '');
      setLabel('Name', cfg.labelName, cfg.namenZeigen ? '' : 'Der Name wird den Mitschülern nicht angezeigt.');
      var typen = typenList(cfg);
      setLabel('Datei', 'Datei', typen.length ? 'Erlaubt: ' + typen.join(', ') : '');
      setLabel('Link', 'Link', 'Vollständige Adresse, beginnt mit https://');
      setLabel('Text', 'Text', '');
      var auf = add.querySelector('.gw-add-auftrag');
      if (auf) auf.innerHTML = cfg.auftragHochladen ? '<p>' + escBr(cfg.auftragHochladen) + '</p>' : '';
      var gh = add.querySelector('.gw-add-hint');
      if (gh && S.approvalOn === false) gh.style.display = 'none';
      apply(false);
    }
    apply(false);
    if (typ === 'Exponat') {
      loadRows().then(function (res) {
        var st = latestCfgRow(res.rows);
        cfg = parseCfg(st ? st.einstellung : '');
        S.approvalOn = res.rows.length ? res.rows.some(function (r) { return !!r.status; }) : null;
        applyCfg();
      }).catch(function () { applyCfg(); });
    }
    var showAll = add.querySelector('[data-gw-showall]');
    if (showAll) {
      if (!teacher) showAll.parentNode.style.display = 'none';
      showAll.addEventListener('click', function () { apply(true); showAll.parentNode.style.display = 'none'; });
    }
    var form = add.closest('form');
    if (form && typ === 'Exponat') {
      form.addEventListener('submit', function (e) {
        var msgs = [];
        var val = function (f) { var i = add.querySelector('[data-gw-field="' + f + '"] input[type="text"], [data-gw-field="' + f + '"] input:not([type])'); return i ? i.value.trim() : ''; };
        if (!val('Titel')) msgs.push('Trage einen Titel ein.');
        if (!val('Name')) msgs.push('Trage deinen Namen ein.');
        var hasFile = false, hasLink = false, hasText = false;
        var fn = add.querySelector('[data-gw-field="Datei"] .filepicker-filename');
        var fname = fn ? fn.textContent.trim() : '';
        if (fname) {
          hasFile = true;
          var typen = typenList(cfg);
          if (typen.length && typen.indexOf(ext(fname)) < 0) msgs.push('Dateien vom Typ „.' + (ext(fname) || '?') + '“ sind hier nicht erlaubt. Erlaubt: ' + typen.join(', ') + '.');
        }
        var l = val('Link');
        if (l) { hasLink = true; if (!safeUrl(l)) msgs.push('Der Link muss mit https:// oder http:// beginnen.'); }
        var ta = add.querySelector('[data-gw-field="Text"] textarea');
        if (ta) {
          var content = ta.value;
          try { if (window.tinymce && tinymce.get(ta.id)) content = tinymce.get(ta.id).getContent(); } catch (err) { /* Editor nicht erreichbar */ }
          hasText = String(content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
        }
        if (fn && !hasFile && !hasLink && !hasText) {
          var forms = [cfg.datei ? 'eine Datei' : '', cfg.link ? 'einen Link' : '', cfg.text ? 'einen Text' : ''].filter(Boolean);
          msgs.push('Füge ' + (forms.length ? forms.join(' oder ') : 'deine Arbeit') + ' hinzu.');
        }
        var box = add.querySelector('.gw-add-err');
        if (!box) { box = document.createElement('div'); box.className = 'gw-add-err'; box.setAttribute('role', 'alert'); add.appendChild(box); }
        box.innerHTML = msgs.map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('');
        if (msgs.length) { e.preventDefault(); e.stopPropagation(); box.scrollIntoView({ block: 'center' }); }
      }, true);
    }
  }

  /* ---------- Start ---------- */
  ready(function () {
    setupIds();
    if (!QS) return;
    var path = location.pathname;
    if (/\/mod\/data\/edit\.php$/.test(path)) { setupAddForm(); return; }
    if (!/\/mod\/data\/view\.php$/.test(path)) return;
    var sp = new URLSearchParams(location.search);
    if (sp.get('mode') === 'asearch') return;
    mount();
    var saved = store('session', 'gw-tab-' + QS);
    if (saved) S.tab = saved;
    refresh().then(function () {
      var rid = sp.get('rid');
      if (rid && S.byId[rid] && studentMode() && S.byId[rid].typ === 'Exponat') { S.tab = 'meine'; render(); }
      autoRefresh();
    });
  });
})();
