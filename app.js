/* Jogos da Villa Lux — comptage des points
 * Mode local : sans configuration Firebase, les scores restent dans ce navigateur.
 * Mode en direct : avec firebase-config.js rempli, les scores sont partagés en temps réel
 * (lecture pour tous, saisie réservée aux arbitres qui connaissent le code). */
(function () {
  'use strict';

  /* =====================================================================
     Configuration — modifiez ici les disciplines (cible des matchs, etc.)
     ===================================================================== */
  var BOULE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#8f99a8"/><circle cx="9" cy="8.5" r="4.5" fill="#d9dee6" opacity=".7"/><path d="M4.5 8.5c4 2.2 11 2.2 15 0M4.5 15.5c4-2.2 11-2.2 15 0" fill="none" stroke="#4a5262" stroke-width="1.1"/></svg>';

  var DISCIPLINES = [
    { id: 'apnee', nom: 'Apnée', pt: 'Apneia', icon: '🤿', type: 'mesure', unite: 'longueurs', court: 'long.', meilleur: 'haut', placeholder: 'ex. 2,5',
      aide: 'Nombre de longueurs de piscine parcourues en apnée. Le plus grand nombre l’emporte (les demi-longueurs sont acceptées).' },
    { id: 'petanque', nom: 'Pétanque', pt: 'Petanca', icon: BOULE, type: 'match', cible: 13,
      aide: 'Matchs en 13 points, en tête-à-tête, doublette ou triplette. Classement : victoires, puis différence de points.' },
    { id: 'badminton', nom: 'Badminton', pt: 'Badminton', icon: '🏸', type: 'match', cible: 10,
      aide: 'Matchs en 10 points, en simple ou en double. Classement : victoires, puis différence de points.' },
    { id: 'pingpong', nom: 'Ping-pong', pt: 'Ténis de mesa', icon: '🏓', type: 'match', cible: 10,
      aide: 'Matchs en 10 points, en simple ou en double. Classement : victoires, puis différence de points.' },
    { id: 'anneaux', nom: 'Chasse aux anneaux', pt: 'Caça aos anéis', icon: '💍', type: 'mesure', unite: 'secondes', court: 's', meilleur: 'bas', placeholder: 'ex. 42,3', chrono: true,
      aide: 'Temps pour remonter tous les anneaux du fond de la piscine. Le plus rapide l’emporte.' }
  ];

  var SDK = 'https://www.gstatic.com/firebasejs/13.1.0/';
  var ROOT = 'jogos';                                   // chemin des données dans la Realtime Database
  var LOCAL_KEY = 'villa-lux-jogos:v2';                 // mode local
  var LEGACY_KEY = 'villa-lux-jogos:v1';
  var CACHE_KEY = 'villa-lux-jogos:cache-v2';           // dernier état reçu en mode en direct
  var AVATAR_COLORS = ['#1b4b9b', '#0a6b3c', '#d22f27', '#c8643b', '#1f97c9', '#8a5cc2', '#b8860b', '#2e8b78', '#c2417a', '#4f6d7a'];

  var CFG = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.databaseURL) ? window.FIREBASE_CONFIG : null;
  var REMOTE = !!CFG;

  /* =====================================================================
     Données
     L'état est stocké sous forme d'arbre (même forme qu'en base) :
       players/{id}            : { name, order }
       mesures/{disc}/{id}     : nombre
       matchs/{disc}/{matchId} : { a:[ids], b:[ids], sa, sb, t }
     Toute modification est un ensemble de « chemin → valeur » (null = suppression),
     appliqué localement ou envoyé à Firebase.
     ===================================================================== */
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function vals(o) { return o && typeof o === 'object' ? Object.keys(o).map(function (k) { return o[k]; }) : []; }
  function ids(list) { return (Array.isArray(list) ? list : vals(list)).map(String).filter(Boolean); }

  function fromTree(tree) {
    tree = tree || {};
    var s = { players: [], mesures: {}, matchs: {} };
    var pl = tree.players || {};
    s.players = Object.keys(pl).filter(function (id) { return pl[id] && typeof pl[id].name === 'string'; })
      .map(function (id) { return { id: id, name: pl[id].name.slice(0, 40), order: Number(pl[id].order) || 0 }; })
      .sort(function (a, b) { return a.order - b.order; });
    var known = {}; s.players.forEach(function (p) { known[p.id] = true; });
    DISCIPLINES.forEach(function (d) {
      if (d.type === 'mesure') {
        var src = (tree.mesures && tree.mesures[d.id]) || {}, out = {};
        Object.keys(src).forEach(function (k) { var v = Number(src[k]); if (known[k] && isFinite(v) && v >= 0) out[k] = v; });
        s.mesures[d.id] = out;
      } else {
        var ms = (tree.matchs && tree.matchs[d.id]) || {};
        s.matchs[d.id] = Object.keys(ms).map(function (mid) {
          var m = ms[mid] || {};
          return { id: mid, a: ids(m.a).filter(function (x) { return known[x]; }), b: ids(m.b).filter(function (x) { return known[x]; }),
                   sa: parseInt(m.sa, 10) || 0, sb: parseInt(m.sb, 10) || 0, t: Number(m.t) || 0 };
        }).filter(function (m) { return m.a.length && m.b.length; }).sort(function (x, y) { return x.t - y.t; });
      }
    });
    return s;
  }
  // Ancien format / fichier exporté (listes) → arbre
  function toTree(raw) {
    var tree = { players: {}, mesures: {}, matchs: {} };
    if (!raw || !Array.isArray(raw.players)) return tree;
    raw.players.forEach(function (p, i) { if (p && p.id && typeof p.name === 'string') tree.players[String(p.id)] = { name: p.name.slice(0, 40), order: i }; });
    DISCIPLINES.forEach(function (d) {
      if (d.type === 'mesure') {
        var src = (raw.mesures && raw.mesures[d.id]) || {};
        Object.keys(src).forEach(function (k) {
          var v = Number(src[k]);
          if (tree.players[k] && isFinite(v) && v >= 0) (tree.mesures[d.id] = tree.mesures[d.id] || {})[k] = v;
        });
      } else {
        var list = (raw.matchs && Array.isArray(raw.matchs[d.id])) ? raw.matchs[d.id] : [];
        list.forEach(function (m, i) {
          if (!m || !Array.isArray(m.a) || !Array.isArray(m.b)) return;
          var a = m.a.map(String).filter(function (x) { return tree.players[x]; }), b = m.b.map(String).filter(function (x) { return tree.players[x]; });
          if (!a.length || !b.length) return;
          (tree.matchs[d.id] = tree.matchs[d.id] || {})[String(m.id || uid())] = { a: a, b: b, sa: parseInt(m.sa, 10) || 0, sb: parseInt(m.sb, 10) || 0, t: Number(m.t) || i };
        });
      }
    });
    return tree;
  }
  function exportShape(s) {
    return { version: 2, players: s.players.map(function (p) { return { id: p.id, name: p.name }; }), mesures: s.mesures, matchs: s.matchs };
  }
  function applyUpdates(tree, updates) {
    Object.keys(updates).forEach(function (path) {
      var parts = path.split('/'), node = tree, stack = [];
      for (var i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]] || typeof node[parts[i]] !== 'object') { if (updates[path] === null) return; node[parts[i]] = {}; }
        stack.push([node, parts[i]]); node = node[parts[i]];
      }
      var last = parts[parts.length - 1], v = updates[path];
      if (v === null) delete node[last]; else node[last] = JSON.parse(JSON.stringify(v));
      for (var j = stack.length - 1; j >= 0; j--) {          // élague les branches vides
        var parent = stack[j][0], key = stack[j][1];
        if (parent[key] && typeof parent[key] === 'object' && !Object.keys(parent[key]).length) delete parent[key]; else break;
      }
    });
    return tree;
  }

  function readJSON(key) { try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var tree;
  if (REMOTE) tree = readJSON(CACHE_KEY) || {};
  else {
    tree = readJSON(LOCAL_KEY);
    if (!tree) { var legacy = readJSON(LEGACY_KEY); tree = legacy ? toTree(legacy) : {}; }
  }
  var state = fromTree(tree);

  var conn = {
    status: REMOTE ? 'connecting' : 'local',   // local | connecting | live | error
    online: false,
    arbitre: !REMOTE,
    received: false,
    error: ''
  };
  function canEdit() { return conn.arbitre; }

  var ui = {
    tab: (location.hash || '').slice(1) || 'classement',
    selection: {},
    chrono: { running: false, start: 0, elapsed: 0, raf: 0 },
    chronoPlayer: '',
    busy: false,
    showArb: false
  };

  var fb = null;          // modules Firebase chargés
  var storageWarned = false;

  // Envoie une modification (chemins relatifs à ROOT)
  function commit(updates, okMsg) {
    if (!canEdit()) { toast('Saisie réservée aux arbitres 🔑'); return Promise.resolve(false); }
    if (!REMOTE) {
      applyUpdates(tree, updates);
      if (!writeJSON(LOCAL_KEY, tree) && !storageWarned) { storageWarned = true; toast('Stockage indisponible : pensez à exporter vos données.'); }
      state = fromTree(tree); render();
      if (okMsg) toast(okMsg);
      return Promise.resolve(true);
    }
    if (!fb) { toast('Pas encore connecté, réessayez dans un instant.'); return Promise.resolve(false); }
    // La base déclenche immédiatement l'écouteur local : l'affichage suit sans attendre le serveur.
    var p = fb.update(fb.ref(fb.db, ROOT), updates).then(function () { return true; }, function (e) {
      if (isDenied(e)) { conn.arbitre = false; renderStatus(); render(); toast('Écriture refusée : code arbitre requis 🔑'); }
      else toast('Erreur d’enregistrement : ' + (e && e.message ? e.message : e));
      return false;
    });
    if (okMsg) toast(okMsg + (conn.online ? '' : ' (envoi dès le retour du réseau)'));
    return p;
  }
  function isDenied(e) { return e && /permission[_ ]denied/i.test(String(e.code || '') + ' ' + String(e.message || '')); }

  /* =====================================================================
     Firebase (chargé uniquement en mode en direct)
     ===================================================================== */
  function initRemote() {
    Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-database.js')]).then(function (mods) {
      var appM = mods[0], authM = mods[1], dbM = mods[2];
      var app = appM.initializeApp(CFG);
      var auth = authM.getAuth(app), db = dbM.getDatabase(app);
      var emu = window.FIREBASE_EMULATOR;
      if (emu) { dbM.connectDatabaseEmulator(db, emu.host, emu.db); authM.connectAuthEmulator(auth, 'http://' + emu.host + ':' + emu.auth, { disableWarnings: true }); }
      fb = { auth: auth, db: db, ref: dbM.ref, onValue: dbM.onValue, update: dbM.update, set: dbM.set, remove: dbM.remove,
             signInAnonymously: authM.signInAnonymously, onAuthStateChanged: authM.onAuthStateChanged };

      dbM.onValue(dbM.ref(db, ROOT), function (snap) {
        tree = snap.val() || {};
        writeJSON(CACHE_KEY, tree);
        state = fromTree(tree);
        conn.status = 'live'; conn.received = true; conn.error = '';
        renderStatus(); render();
      }, function (err) {
        conn.status = 'error'; conn.error = isDenied(err) ? 'Lecture refusée : vérifiez les règles de la base.' : (err && err.message) || 'Erreur de connexion';
        renderStatus();
      });
      dbM.onValue(dbM.ref(db, '.info/connected'), function (s) { conn.online = !!s.val(); renderStatus(); });

      var stopWatch = null;
      authM.onAuthStateChanged(auth, function (user) {
        if (stopWatch) { stopWatch(); stopWatch = null; }
        if (!user) { conn.arbitre = false; renderStatus(); render(); return; }
        stopWatch = dbM.onValue(dbM.ref(db, 'arbitres/' + user.uid), function (s) {
          var was = conn.arbitre; conn.arbitre = s.exists();
          if (was !== conn.arbitre) { renderStatus(); render(); }
        }, function () { /* pas encore arbitre */ });
      });
    }).catch(function (e) {
      conn.status = 'error'; conn.error = 'Impossible de charger Firebase (connexion internet ?)';
      renderStatus();
      if (window.console) console.error(e);
    });
  }

  function becomeArbitre(code) {
    if (!fb) { toast('Connexion en cours, réessayez dans un instant.'); return; }
    code = code.trim();
    if (!code) { toast('Saisissez le code arbitre.'); return; }
    ui.busy = true; renderStatus();
    var auth = fb.auth;
    var signIn = auth.currentUser ? Promise.resolve() : fb.signInAnonymously(auth);
    signIn.then(function () {
      var r = fb.ref(fb.db, 'arbitres/' + auth.currentUser.uid);
      return fb.set(r, code).catch(function (e) {
        if (isDenied(e) && /^\d+$/.test(code)) return fb.set(r, Number(code));   // code saisi comme nombre dans la console
        throw e;
      });
    }).then(function () {
      conn.arbitre = true; ui.busy = false; ui.showArb = false;
      renderStatus(); render(); toast('Mode arbitre activé 🔑 Boa sorte !');
    }).catch(function (e) {
      ui.busy = false; renderStatus();
      var c = String(e && e.code || '');
      if (isDenied(e)) toast('Code arbitre incorrect.');
      else if (/operation-not-allowed|admin-restricted/.test(c)) toast('Activez la connexion « Anonyme » dans Firebase Authentication.');
      else if (/unauthorized-domain/.test(c)) toast('Ajoutez ce domaine aux domaines autorisés de Firebase Authentication.');
      else toast('Erreur : ' + (e && e.message ? e.message : e));
    });
  }
  function quitArbitre() {
    if (!fb || !fb.auth.currentUser) { conn.arbitre = false; renderStatus(); render(); return; }
    fb.remove(fb.ref(fb.db, 'arbitres/' + fb.auth.currentUser.uid)).then(function () {
      conn.arbitre = false; renderStatus(); render(); toast('Mode spectateur 👀');
    }, function (e) { toast('Erreur : ' + (e && e.message ? e.message : e)); });
  }

  /* =====================================================================
     Utilitaires
     ===================================================================== */
  function $(sel) { return document.querySelector(sel); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v) { return Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
  function disc(id) { for (var i = 0; i < DISCIPLINES.length; i++) if (DISCIPLINES[i].id === id) return DISCIPLINES[i]; return null; }
  function player(id) { for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return state.players[i]; return null; }
  function pname(id) { var p = player(id); return p ? p.name : '?'; }
  function initials(name) { var parts = name.trim().split(/\s+/); return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase(); }
  function color(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
  function avatar(p) { return '<span class="avatar" style="background:' + color(p.id) + '" aria-hidden="true">' + esc(initials(p.name)) + '</span>'; }
  function who(p) { return '<span class="who">' + avatar(p) + '<span class="name">' + esc(p.name) + '</span></span>'; }
  function medal(place) { return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : ''; }
  function placeBadge(place) { return '<span class="place' + (place <= 3 ? ' p' + place : '') + '">' + place + '</span>'; }
  function sideNames(list) { return list.map(pname).join(' & '); }
  function parseNum(s) { s = String(s).trim().replace(',', '.'); if (s === '') return null; var v = Number(s); return isFinite(v) && v >= 0 ? v : NaN; }
  var toastTimer = 0;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800); }

  /* =====================================================================
     Classements
     Barème : dans chaque discipline, 1er = N points (N = nombre d'inscrits),
     2e = N-1, etc. Les ex æquo partagent la même place. Non classé = 0.
     ===================================================================== */
  function assignPlaces(rows, same) {
    var n = state.players.length;
    rows.forEach(function (r, i) {
      r.place = (i > 0 && same(rows[i - 1], r)) ? rows[i - 1].place : i + 1;
      r.points = Math.max(0, n - r.place + 1);
    });
    return rows;
  }
  function rankMesure(d) {
    var v = state.mesures[d.id];
    var rows = state.players.filter(function (p) { return v[p.id] != null; }).map(function (p) { return { p: p, v: v[p.id] }; });
    rows.sort(function (a, b) { return d.meilleur === 'haut' ? b.v - a.v : a.v - b.v; });
    return assignPlaces(rows, function (a, b) { return a.v === b.v; });
  }
  function rankMatch(d) {
    var st = {};
    function get(id) { return st[id] || (st[id] = { j: 0, v: 0, df: 0, pp: 0, pc: 0 }); }
    state.matchs[d.id].forEach(function (m) {
      var aWin = m.sa > m.sb;
      m.a.forEach(function (id) { var s = get(id); s.j++; if (aWin) s.v++; else s.df++; s.pp += m.sa; s.pc += m.sb; });
      m.b.forEach(function (id) { var s = get(id); s.j++; if (!aWin) s.v++; else s.df++; s.pp += m.sb; s.pc += m.sa; });
    });
    var rows = state.players.filter(function (p) { return st[p.id]; }).map(function (p) {
      var s = st[p.id]; return { p: p, j: s.j, v: s.v, df: s.df, pp: s.pp, pc: s.pc, diff: s.pp - s.pc };
    });
    rows.sort(function (a, b) { return b.v - a.v || b.diff - a.diff || b.pp - a.pp; });
    return assignPlaces(rows, function (a, b) { return a.v === b.v && a.diff === b.diff && a.pp === b.pp; });
  }
  function rank(d) { return d.type === 'mesure' ? rankMesure(d) : rankMatch(d); }
  function rankGeneral() {
    var per = {};
    DISCIPLINES.forEach(function (d) { per[d.id] = {}; rank(d).forEach(function (r) { per[d.id][r.p.id] = r; }); });
    var rows = state.players.map(function (p) {
      var total = 0, ors = 0, det = {};
      DISCIPLINES.forEach(function (d) { var r = per[d.id][p.id] || null; det[d.id] = r; if (r) { total += r.points; if (r.place === 1) ors++; } });
      return { p: p, total: total, ors: ors, det: det };
    });
    rows.sort(function (a, b) { return b.total - a.total || b.ors - a.ors || a.p.name.localeCompare(b.p.name, 'fr'); });
    rows.forEach(function (r, i) { var prev = rows[i - 1]; r.place = (prev && prev.total === r.total && prev.ors === r.ors) ? prev.place : i + 1; });
    return rows;
  }

  /* =====================================================================
     Vues
     ===================================================================== */
  function renderNav() {
    var tabs = [{ id: 'classement', label: 'Classement', icon: '🏆' }, { id: 'inscriptions', label: canEdit() ? 'Inscriptions' : 'Participants', icon: '👥' }]
      .concat(DISCIPLINES.map(function (d) { return { id: d.id, label: d.nom, icon: d.icon }; }));
    $('#tabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab" role="tab" data-tab="' + t.id + '" aria-selected="' + (ui.tab === t.id) + '"><span class="ico">' + t.icon + '</span>' + esc(t.label) + '</button>';
    }).join('');
    var act = $('#tabs .tab[aria-selected="true"]');
    if (act && act.scrollIntoView) { try { act.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
  }
  function renderHeroStats() {
    var nm = 0, nr = 0;
    DISCIPLINES.forEach(function (d) { if (d.type === 'match') nm += state.matchs[d.id].length; else nr += Object.keys(state.mesures[d.id]).length; });
    $('#hero-stats').innerHTML =
      '<span><b>' + state.players.length + '</b>inscrit' + (state.players.length > 1 ? 's' : '') + '</span>' +
      '<span><b>' + DISCIPLINES.length + '</b>disciplines</span>' +
      '<span><b>' + nm + '</b>match' + (nm > 1 ? 's' : '') + ' joué' + (nm > 1 ? 's' : '') + '</span>' +
      '<span><b>' + nr + '</b>performance' + (nr > 1 ? 's' : '') + '</span>';
  }
  function statusHtml() {
    if (!REMOTE) return '<div class="status-inner"><span class="pill">💾 Mode local · scores enregistrés sur cet appareil</span></div>';
    var dot, label;
    if (conn.status === 'error') { dot = 'err'; label = conn.error; }
    else if (conn.status === 'connecting') { dot = 'wait'; label = 'Connexion…'; }
    else if (!conn.online) { dot = 'wait'; label = 'Hors ligne · dernier état connu'; }
    else { dot = 'live'; label = 'En direct'; }
    var left = '<span class="pill"><span class="dot ' + dot + '"></span>' + esc(label) + '</span>';
    var right;
    if (conn.arbitre) {
      right = '<span class="pill ok">🔑 Arbitre</span><button class="btn small-btn ghost" data-action="quit-arbitre">Quitter</button>';
    } else {
      right = ui.showArb
        ? '<form class="arb-form" data-form="arbitre" autocomplete="off">' +
          '<label class="sr-only" for="arb-code">Code arbitre</label><input class="field arb-code" id="arb-code" name="code" type="password" placeholder="Code arbitre" data-fk="arb-code" autocomplete="off">' +
          '<button class="btn small-btn primary" type="submit"' + (ui.busy || !fb ? ' disabled' : '') + '>' + (ui.busy ? '…' : 'OK') + '</button>' +
          '<button class="btn small-btn ghost" type="button" data-action="toggle-arb" aria-label="Annuler">✕</button></form>'
        : '<span class="pill">👀 Spectateur</span><button class="btn small-btn" data-action="toggle-arb">🔑 Arbitrer</button>';
    }
    return '<div class="status-inner">' + left + '<span class="grow"></span>' + right + '</div>';
  }
  function renderStatus() { patch($('#status'), statusHtml()); renderNav(); }

  function pageHead(icon, title, pt, text) {
    return '<div class="page-head"><div class="big-ico">' + icon + '</div><div><h2>' + esc(title) + (pt ? '<span class="pt">' + esc(pt) + '</span>' : '') + '</h2><p>' + text + '</p></div></div>';
  }
  function emptyPlayers() {
    if (REMOTE && !conn.received && conn.status !== 'error') {
      return '<div class="card empty"><div class="big">🌊</div><h3 style="justify-content:center">Connexion aux scores en direct…</h3><p class="muted">Un instant, on va chercher les résultats.</p></div>';
    }
    if (!canEdit()) {
      return '<div class="card empty"><div class="big">🏖️</div><h3 style="justify-content:center">Les inscriptions n’ont pas encore commencé</h3><p class="muted">Les scores apparaîtront ici en direct dès que les arbitres les saisiront.</p></div>';
    }
    return '<div class="card empty"><div class="big">🏖️</div><h3 style="justify-content:center">Personne n’est encore inscrit</h3>' +
      '<p class="muted">Commencez par inscrire les participants à la compétition.</p>' +
      '<button class="btn primary" data-action="goto" data-tab="inscriptions">👥 Inscrire des participants</button></div>';
  }
  function podium(rows, valueFn, mini) {
    if (!rows.length) return '';
    var order = [rows[1], rows[0], rows[2]], cls = ['s2', 's1', 's3'];
    return '<div class="podium' + (mini ? ' mini' : '') + '">' + order.map(function (r, i) {
      if (!r) return '<div class="step ' + cls[i] + '"></div>';
      return '<div class="step ' + cls[i] + '"><div class="medal">' + (medal(r.place) || '🏅') + '</div>' + avatar(r.p) +
        '<div class="pname">' + esc(r.p.name) + '</div><div class="pval">' + valueFn(r) + '</div><div class="block">' + r.place + '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------- Classement général ---------- */
  function vueClassement() {
    var html = pageHead('🏆', 'Classement général', 'Classificação geral',
      'Somme des points obtenus dans chaque discipline. Égalité départagée au nombre de victoires de discipline.');
    if (!state.players.length) return html + emptyPlayers();
    var rows = rankGeneral();
    if (rows.some(function (r) { return r.total > 0; })) {
      html += '<section class="card">' + podium(rows, function (r) { return r.total + ' pts'; }, false) + '</section>';
    } else {
      html += '<div class="card empty"><div class="big">⛱️</div><h3 style="justify-content:center">La compétition n’a pas encore commencé</h3><p class="muted">Les premiers résultats apparaîtront ici.</p></div>';
    }
    html += '<section class="card"><h3>Tableau des points</h3><div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Participant</th>' +
      DISCIPLINES.map(function (d) { return '<th class="c" title="' + esc(d.nom) + '"><span class="ico">' + d.icon + '</span></th>'; }).join('') +
      '<th class="c">Pts</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="c">' + placeBadge(r.place) + '</td><td>' + who(r.p) + '</td>' +
          DISCIPLINES.map(function (d) {
            var x = r.det[d.id];
            return '<td class="c">' + (x ? '<span class="dpts">' + x.points + '</span><span class="dplace">' + x.place + (x.place === 1 ? 'er' : 'e') + '</span>' : '<span class="muted">–</span>') + '</td>';
          }).join('') +
          '<td class="c"><span class="total">' + r.total + '</span></td></tr>';
      }).join('') + '</tbody></table></div></section>';

    html += '<section class="card"><h3>Avancement</h3><div class="progress">' + DISCIPLINES.map(function (d) {
      var n = d.type === 'mesure' ? Object.keys(state.mesures[d.id]).length + '/' + state.players.length + ' résultats' : state.matchs[d.id].length + ' match' + (state.matchs[d.id].length > 1 ? 's' : '');
      return '<span><span class="ico">' + d.icon + '</span>' + esc(d.nom) + ' · <b>' + n + '</b></span>';
    }).join('') + '</div>' +
      '<p class="note" style="margin:14px 0 0">Barème : dans chaque discipline, le 1er marque <b>' + state.players.length + ' pts</b> (= nombre d’inscrits), le 2e un point de moins, etc. Les ex æquo partagent la même place. Pas de résultat = 0 pt.</p></section>';
    return html;
  }

  /* ---------- Inscriptions ---------- */
  function vueInscriptions() {
    var edit = canEdit(), n = state.players.length;
    var html = pageHead('👥', edit ? 'Inscriptions' : 'Participants', 'Inscrições',
      edit ? 'Ajoutez les participants. Vous pouvez en saisir plusieurs d’un coup en les séparant par des virgules.' : 'Les participants inscrits à la compétition.');
    if (edit) {
      html += '<section class="card"><h3>Nouveau participant</h3><form class="row" data-form="add-player" autocomplete="off">' +
        '<label class="sr-only" for="new-name">Nom</label><input class="field" id="new-name" name="name" data-fk="new-name" placeholder="ex. Ana, Rui, Zé" maxlength="200">' +
        '<button class="btn primary" type="submit">➕ Inscrire</button></form></section>';
    }
    html += '<section class="card"><h3>Participants <small>' + n + ' inscrit' + (n > 1 ? 's' : '') + '</small></h3>';
    if (!n) html += '<p class="muted">Aucun participant pour l’instant.</p>';
    else html += '<ul class="player-list">' + state.players.map(function (p) {
      if (!edit) return '<li>' + who(p) + '</li>';
      return '<li>' + avatar(p) + '<label class="sr-only" for="rn-' + p.id + '">Nom</label><input class="field" id="rn-' + p.id + '" value="' + esc(p.name) + '" data-rename="' + p.id + '" data-fk="rn-' + p.id + '" maxlength="40">' +
        '<button class="btn icon danger ghost" data-action="del-player" data-pid="' + p.id + '" aria-label="Retirer ' + esc(p.name) + '" title="Retirer">✕</button></li>';
    }).join('') + '</ul>';
    html += '</section><div class="tile-rule" aria-hidden="true"></div>';
    html += '<section class="card"><h3>💾 Données</h3><p class="muted small" style="margin-top:0">' +
      (REMOTE ? 'Les scores sont partagés en direct. L’export télécharge une copie de sauvegarde.' : 'Tout est enregistré dans ce navigateur. Exportez un fichier pour le sauvegarder ou le transférer, puis importez-le.') +
      '</p><div class="row"><button class="btn" data-action="export">⬇️ Exporter</button>' +
      (edit ? '<label class="btn" for="import-file">⬆️ Importer</label><input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '<button class="btn danger" data-action="reset">🗑️ Tout effacer</button>' : '') + '</div></section>';
    return html;
  }

  /* ---------- Discipline à mesure (apnée, anneaux) ---------- */
  function vueMesure(d) {
    var html = pageHead(d.icon, d.nom, d.pt, esc(d.aide)), edit = canEdit();
    if (!state.players.length) return html + emptyPlayers();
    var rows = rankMesure(d), byId = {};
    rows.forEach(function (r) { byId[r.p.id] = r; });
    var v = state.mesures[d.id];

    if (rows.length) html += '<section class="card"><h3>Podium</h3>' + podium(rows, function (r) { return fmt(r.v) + ' ' + d.court; }, true) + '</section>';
    if (d.chrono && edit) html += vueChrono(d);

    // Arbitre : ordre d'inscription (saisie) ; spectateur : ordre du classement
    var list = edit ? state.players : rows.map(function (r) { return r.p; }).concat(state.players.filter(function (p) { return !byId[p.id]; }));
    html += '<section class="card"><h3>Résultats <small>' + rows.length + '/' + state.players.length + '</small></h3><div class="table-wrap"><table><thead><tr>' +
      '<th>Participant</th><th class="c">' + esc(d.unite) + '</th><th class="c">Place</th><th class="c">Pts</th></tr></thead><tbody>' +
      list.map(function (p) {
        var r = byId[p.id], val = v[p.id];
        var cell = edit
          ? '<input class="field num" inputmode="decimal" autocomplete="off" aria-label="' + esc(d.unite) + ' pour ' + esc(p.name) + '" placeholder="' + esc(d.placeholder) + '" value="' + (val != null ? esc(fmt(val)) : '') + '" data-mesure="' + d.id + '" data-pid="' + p.id + '" data-fk="m-' + d.id + '-' + p.id + '">'
          : (val != null ? '<b>' + fmt(val) + '</b>' : '<span class="muted">–</span>');
        return '<tr><td>' + who(p) + '</td><td class="c">' + cell + '</td>' +
          '<td class="c">' + (r ? placeBadge(r.place) : '<span class="muted">–</span>') + '</td><td class="c"><b>' + (r ? r.points : '') + '</b></td></tr>';
      }).join('') + '</tbody></table></div>' + (edit ? '<p class="muted small" style="margin:10px 0 0">Videz la case pour supprimer un résultat.</p>' : '') + '</section>';
    return html;
  }
  function chronoText(ms) {
    var cs = Math.floor(ms / 10), m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',' + String(c).padStart(2, '0');
  }
  function chronoElapsed() { var c = ui.chrono; return c.running ? c.elapsed + (performance.now() - c.start) : c.elapsed; }
  function vueChrono(d) {
    var c = ui.chrono;
    if (ui.chronoPlayer && !player(ui.chronoPlayer)) ui.chronoPlayer = '';
    return '<section class="card"><h3>⏱️ Chrono</h3>' +
      '<div class="chrono-display' + (c.running ? ' running' : '') + '" id="chrono-display">' + chronoText(chronoElapsed()) + '</div>' +
      '<div class="chrono-btns"><button class="btn big ' + (c.running ? 'sun' : 'primary') + '" data-action="chrono-toggle">' + (c.running ? '⏸ Stop' : (c.elapsed ? '▶ Reprendre' : '▶ Partez !')) + '</button>' +
      '<button class="btn big" data-action="chrono-reset"' + (c.running ? ' disabled' : '') + '>↺ Zéro</button></div>' +
      '<div class="row"><label class="sr-only" for="chrono-player">Participant</label><select class="field" id="chrono-player" data-fk="chrono-player">' +
      '<option value="">— Choisir le participant —</option>' +
      state.players.map(function (p) { return '<option value="' + p.id + '"' + (ui.chronoPlayer === p.id ? ' selected' : '') + '>' + esc(p.name) + (state.mesures[d.id][p.id] != null ? ' (' + fmt(state.mesures[d.id][p.id]) + ' s)' : '') + '</option>'; }).join('') +
      '</select><button class="btn primary" data-action="chrono-save" data-disc="' + d.id + '"' + (c.running ? ' disabled' : '') + '>✓ Enregistrer le temps</button></div></section>';
  }
  function chronoTick() {
    var el = document.getElementById('chrono-display');
    if (el) el.textContent = chronoText(chronoElapsed());
    if (ui.chrono.running) ui.chrono.raf = requestAnimationFrame(chronoTick);
  }

  /* ---------- Discipline à matchs (pétanque, badminton, ping-pong) ---------- */
  function vueMatch(d) {
    var html = pageHead(d.icon, d.nom, d.pt, esc(d.aide)), edit = canEdit();
    if (!state.players.length) return html + emptyPlayers();
    var sel = ui.selection[d.id] || (ui.selection[d.id] = {});
    Object.keys(sel).forEach(function (k) { if (!player(k)) delete sel[k]; });
    var A = state.players.filter(function (p) { return sel[p.id] === 'A'; }).map(function (p) { return p.id; });
    var B = state.players.filter(function (p) { return sel[p.id] === 'B'; }).map(function (p) { return p.id; });
    var rows = rankMatch(d);

    if (rows.length) html += '<section class="card"><h3>Podium</h3>' + podium(rows, function (r) { return r.v + ' V · ' + (r.diff > 0 ? '+' : '') + r.diff; }, true) + '</section>';

    var form = '';
    if (edit) {
      form = '<section class="card"><h3>Nouveau match <small>en ' + d.cible + ' points</small></h3>' +
        '<p class="muted small" style="margin-top:0">Touchez un nom pour le placer en équipe <b>A</b>, une deuxième fois pour l’équipe <b>B</b>, une troisième pour le retirer.</p>' +
        '<div class="chips">' + state.players.map(function (p) {
          var s = sel[p.id] || '';
          return '<button type="button" class="chip side-' + (s || 'none') + '" data-action="toggle-side" data-disc="' + d.id + '" data-pid="' + p.id + '" aria-label="' + esc(p.name) + (s ? ', équipe ' + s : '') + '">' + esc(p.name) + '<span class="side-tag">' + (s || '+') + '</span></button>';
        }).join('') + '</div>' +
        '<form data-form="match" data-disc="' + d.id + '" autocomplete="off"><div class="versus">' +
        '<div class="side-box A"><div class="lbl">Équipe A</div><div class="names">' + (A.length ? esc(sideNames(A)) : '<span class="muted">—</span>') + '</div>' +
        '<label class="sr-only" for="sa-' + d.id + '">Score A</label><input class="field num" id="sa-' + d.id + '" name="sa" inputmode="numeric" placeholder="0" data-fk="sa-' + d.id + '"></div>' +
        '<div class="vs">vs</div>' +
        '<div class="side-box B"><div class="lbl">Équipe B</div><div class="names">' + (B.length ? esc(sideNames(B)) : '<span class="muted">—</span>') + '</div>' +
        '<label class="sr-only" for="sb-' + d.id + '">Score B</label><input class="field num" id="sb-' + d.id + '" name="sb" inputmode="numeric" placeholder="0" data-fk="sb-' + d.id + '"></div>' +
        '</div><div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn primary" type="submit">✓ Enregistrer le match</button></div></form></section>';
    }

    var matchs = state.matchs[d.id].slice().reverse();
    var list = '<section class="card"><h3>Matchs joués <small>' + matchs.length + '</small></h3>';
    if (!matchs.length) list += '<p class="muted">Aucun match pour l’instant.</p>';
    else list += '<ul class="match-list">' + matchs.map(function (m) {
      var aWin = m.sa > m.sb;
      return '<li><div class="m"><span class="' + (aWin ? 'win' : 'lose') + '">' + (aWin ? '<b>' : '') + esc(sideNames(m.a)) + (aWin ? '</b>' : '') + '</span>' +
        ' <span class="muted">vs</span> <span class="' + (!aWin ? 'win' : 'lose') + '">' + (!aWin ? '<b>' : '') + esc(sideNames(m.b)) + (!aWin ? '</b>' : '') + '</span></div>' +
        '<span class="score">' + m.sa + ' – ' + m.sb + '</span>' +
        (edit ? '<button class="btn icon ghost danger" data-action="del-match" data-disc="' + d.id + '" data-mid="' + m.id + '" aria-label="Supprimer ce match" title="Supprimer">✕</button>' : '') + '</li>';
    }).join('') + '</ul>';
    list += '</section>';
    html += edit ? '<div class="grid-2">' + form + list + '</div>' : list;

    html += '<section class="card"><h3>Classement ' + esc(d.nom) + '</h3>';
    if (!rows.length) html += '<p class="muted">Le classement apparaîtra après le premier match.</p>';
    else html += '<div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Participant</th><th class="c">J</th><th class="c">V</th><th class="c hide-sm">D</th><th class="c">+/-</th><th class="c">Pts</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="c">' + placeBadge(r.place) + '</td><td>' + who(r.p) + '</td><td class="c">' + r.j + '</td><td class="c"><b>' + r.v + '</b></td><td class="c hide-sm">' + r.df + '</td><td class="c">' + (r.diff > 0 ? '+' : '') + r.diff + '</td><td class="c"><b>' + r.points + '</b></td></tr>';
      }).join('') + '</tbody></table></div><p class="muted small" style="margin:10px 0 0">J = joués · V = victoires · D = défaites · +/- = points marqués − encaissés · Pts = points pour le classement général.</p>';
    html += '</section>';
    return html;
  }

  /* =====================================================================
     Rendu — conserve la saisie en cours (focus, curseur, texte tapé)
     même quand un autre arbitre met les scores à jour.
     ===================================================================== */
  function patch(container, html) {
    var ae = document.activeElement, focusKey = null, selStart = null, selEnd = null;
    if (ae && container.contains(ae) && ae.dataset) {
      focusKey = ae.dataset.fk || null;
      try { selStart = ae.selectionStart; selEnd = ae.selectionEnd; } catch (e) {}
    }
    var typed = {};
    container.querySelectorAll('input[data-fk]').forEach(function (el) { if (el.value !== el.defaultValue) typed[el.dataset.fk] = el.value; });
    container.innerHTML = html;
    Object.keys(typed).forEach(function (k) { var el = container.querySelector('[data-fk="' + k + '"]'); if (el) el.value = typed[k]; });
    if (focusKey) {
      var el = container.querySelector('[data-fk="' + focusKey + '"]');
      if (el) { el.focus({ preventScroll: true }); if (selStart != null) try { el.setSelectionRange(selStart, selEnd); } catch (e) {} }
    }
  }
  function render() {
    if (ui.tab !== 'classement' && ui.tab !== 'inscriptions' && !disc(ui.tab)) ui.tab = 'classement';
    renderNav();
    renderHeroStats();
    var d = disc(ui.tab), html;
    if (ui.tab === 'inscriptions') html = vueInscriptions();
    else if (d) html = d.type === 'mesure' ? vueMesure(d) : vueMatch(d);
    else html = vueClassement();
    patch($('#main'), html);
    chronoTick();
  }
  function goto(tab) {
    ui.tab = tab;
    if (history.replaceState) history.replaceState(null, '', '#' + tab); else location.hash = tab;
    render();
    window.scrollTo({ top: Math.min(window.scrollY, $('nav.tabs').offsetTop), behavior: 'smooth' });
  }
  // Marque un champ comme « enregistré » pour qu'il ne soit pas conservé tel quel au prochain rendu
  function settle(el, keep) { if (keep) el.defaultValue = el.value; else el.value = el.defaultValue; }

  /* =====================================================================
     Actions
     ===================================================================== */
  function addPlayers(text) {
    var names = text.split(/[,;\n]/).map(function (s) { return s.trim().replace(/\s+/g, ' ').slice(0, 40); }).filter(Boolean);
    if (!names.length) { toast('Saisissez un nom.'); return false; }
    var updates = {}, added = [], dup = [], seen = {};
    state.players.forEach(function (p) { seen[p.name.toLowerCase()] = true; });
    var order = state.players.reduce(function (m, p) { return Math.max(m, p.order || 0); }, 0);
    names.forEach(function (n) {
      if (seen[n.toLowerCase()]) { dup.push(n); return; }
      seen[n.toLowerCase()] = true;
      updates['players/' + uid()] = { name: n, order: ++order };
      added.push(n);
    });
    var msg = added.length ? (added.length === 1 ? 'Bem-vindo ' + added[0] + ' ! 🎉' : added.length + ' participants inscrits 🎉') + (dup.length ? ' (déjà inscrit : ' + dup.join(', ') + ')' : '') : null;
    if (!added.length) { toast('Déjà inscrit : ' + dup.join(', ')); return false; }
    commit(updates, msg);
    return true;
  }
  function deletePlayer(pid) {
    var p = player(pid); if (!p) return;
    if (!confirm('Retirer ' + p.name + ' de la compétition ?\nSes résultats et ses matchs seront supprimés.')) return;
    var u = {}; u['players/' + pid] = null;
    DISCIPLINES.forEach(function (d) {
      if (d.type === 'mesure') { if (state.mesures[d.id][pid] != null) u['mesures/' + d.id + '/' + pid] = null; }
      else {
        state.matchs[d.id].forEach(function (m) {
          if (m.a.indexOf(pid) < 0 && m.b.indexOf(pid) < 0) return;
          var a = m.a.filter(function (x) { return x !== pid; }), b = m.b.filter(function (x) { return x !== pid; });
          u['matchs/' + d.id + '/' + m.id] = (a.length && b.length) ? { a: a, b: b, sa: m.sa, sb: m.sb, t: m.t } : null;
        });
        if (ui.selection[d.id]) delete ui.selection[d.id][pid];
      }
    });
    commit(u, p.name + ' a été retiré.');
  }
  function saveMatch(form) {
    var d = disc(form.dataset.disc), sel = ui.selection[d.id] || {};
    var A = state.players.filter(function (p) { return sel[p.id] === 'A'; }).map(function (p) { return p.id; });
    var B = state.players.filter(function (p) { return sel[p.id] === 'B'; }).map(function (p) { return p.id; });
    if (!A.length || !B.length) { toast('Choisissez au moins un joueur dans chaque équipe.'); return; }
    var sa = form.sa.value.trim(), sb = form.sb.value.trim();
    if (!/^\d{1,3}$/.test(sa) || !/^\d{1,3}$/.test(sb)) { toast('Saisissez les deux scores (nombres entiers).'); return; }
    sa = parseInt(sa, 10); sb = parseInt(sb, 10);
    if (sa === sb) { toast('Pas de match nul : il faut un vainqueur !'); return; }
    if (Math.max(sa, sb) < d.cible) { toast('Le vainqueur doit atteindre ' + d.cible + ' points.'); return; }
    ui.selection[d.id] = {};
    settle(form.sa, false); settle(form.sb, false);
    form.sa.value = ''; form.sb.value = '';
    var u = {}; u['matchs/' + d.id + '/' + uid()] = { a: A, b: B, sa: sa, sb: sb, t: Date.now() };
    commit(u, 'Match enregistré : ' + sideNames(sa > sb ? A : B) + ' gagne ' + Math.max(sa, sb) + '–' + Math.min(sa, sb) + ' 👏');
    render();
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(exportShape(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jogos-villa-lux-' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Export téléchargé 💾');
  }
  function replaceAll(newTree) {
    return commit({ players: newTree.players || null, mesures: newTree.mesures || null, matchs: newTree.matchs || null });
  }
  function importData(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.players)) throw new Error('format');
        if (!confirm('Remplacer toutes les données actuelles par celles du fichier ?' + (REMOTE ? '\n(Tout le monde verra le changement.)' : ''))) return;
        ui.selection = {};
        replaceAll(toTree(data)).then(function (ok) { if (ok) toast('Données importées ✓'); });
      } catch (e) { toast('Fichier invalide.'); }
    };
    r.readAsText(file);
  }

  var actions = {
    'goto': function (b) { goto(b.dataset.tab); },
    'del-player': function (b) { deletePlayer(b.dataset.pid); },
    'toggle-side': function (b) {
      var s = ui.selection[b.dataset.disc] || (ui.selection[b.dataset.disc] = {});
      var cur = s[b.dataset.pid];
      if (!cur) s[b.dataset.pid] = 'A'; else if (cur === 'A') s[b.dataset.pid] = 'B'; else delete s[b.dataset.pid];
      render();
    },
    'del-match': function (b) {
      if (!confirm('Supprimer ce match ?')) return;
      var u = {}; u['matchs/' + b.dataset.disc + '/' + b.dataset.mid] = null;
      commit(u, 'Match supprimé.');
    },
    'chrono-toggle': function () {
      var c = ui.chrono;
      if (c.running) { c.elapsed += performance.now() - c.start; c.running = false; cancelAnimationFrame(c.raf); }
      else { c.start = performance.now(); c.running = true; }
      render();
    },
    'chrono-reset': function () { ui.chrono.elapsed = 0; render(); },
    'chrono-save': function (b) {
      var d = disc(b.dataset.disc), c = ui.chrono;
      if (!ui.chronoPlayer) { toast('Choisissez le participant.'); return; }
      if (!c.elapsed) { toast('Lancez d’abord le chrono.'); return; }
      var secs = Math.round(c.elapsed / 10) / 100, pid = ui.chronoPlayer;
      var prev = state.mesures[d.id][pid];
      if (prev != null && !confirm(pname(pid) + ' a déjà un temps de ' + fmt(prev) + ' s. Le remplacer par ' + fmt(secs) + ' s ?')) return;
      var name = pname(pid);
      c.elapsed = 0; ui.chronoPlayer = '';
      var u = {}; u['mesures/' + d.id + '/' + pid] = secs;
      commit(u, name + ' : ' + fmt(secs) + ' s enregistrées ⏱️');
      render();
    },
    'export': exportData,
    'reset': function () {
      if (!confirm('Effacer TOUS les participants et résultats ?' + (REMOTE ? '\nCela efface les scores pour tout le monde.' : ''))) return;
      if (!confirm('Vraiment ? Cette action est définitive (pensez à exporter avant).')) return;
      ui.selection = {};
      commit({ players: null, mesures: null, matchs: null }, 'Tout a été effacé.');
    },
    'quit-arbitre': quitArbitre,
    'toggle-arb': function () { ui.showArb = !ui.showArb; renderStatus(); var c = document.getElementById('arb-code'); if (c) c.focus(); }
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]');
    if (t && t.classList.contains('tab')) { goto(t.dataset.tab); return; }
    var b = e.target.closest('[data-action]');
    if (b && actions[b.dataset.action]) { e.preventDefault(); actions[b.dataset.action](b, e); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target; e.preventDefault();
    if (f.dataset.form === 'add-player') {
      var input = f.elements.namedItem('name');
      if (addPlayers(input.value)) { input.value = ''; settle(input, true); }
    }
    else if (f.dataset.form === 'match') saveMatch(f);
    else if (f.dataset.form === 'arbitre') {
      var code = f.elements.namedItem('code');
      var v = code.value; code.value = ''; settle(code, true);
      becomeArbitre(v);
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.mesure) {
      var d = t.dataset.mesure, pid = t.dataset.pid, v = parseNum(t.value), u = {};
      if (isNaN(v)) { toast('Valeur invalide : saisissez un nombre.'); settle(t, false); setTimeout(render, 0); return; }
      settle(t, true);
      var cur = state.mesures[d][pid];
      var nv = v === null ? null : Math.round(v * 100) / 100;
      if ((cur == null && nv === null) || cur === nv) { setTimeout(render, 0); return; }
      u['mesures/' + d + '/' + pid] = nv;
      // laisse le focus passer au champ suivant avant de redessiner
      setTimeout(function () { commit(u); }, 0);
    } else if (t.dataset.rename) {
      var p = player(t.dataset.rename), n = t.value.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!p) return;
      if (!n) { toast('Le nom ne peut pas être vide.'); settle(t, false); setTimeout(render, 0); }
      else if (state.players.some(function (x) { return x !== p && x.name.toLowerCase() === n.toLowerCase(); })) { toast('Ce nom est déjà pris.'); settle(t, false); setTimeout(render, 0); }
      else if (n !== p.name) { settle(t, true); var u2 = {}; u2['players/' + p.id + '/name'] = n; setTimeout(function () { commit(u2); }, 0); }
    } else if (t.id === 'chrono-player') {
      ui.chronoPlayer = t.value;
    } else if (t.id === 'import-file') {
      if (t.files && t.files[0]) importData(t.files[0]);
      t.value = '';
    }
  });
  window.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (h && h !== ui.tab) { ui.tab = h; render(); } });
  if (!REMOTE) window.addEventListener('storage', function (e) {
    if (e.key === LOCAL_KEY) { tree = readJSON(LOCAL_KEY) || {}; state = fromTree(tree); render(); }
  });

  renderStatus();
  render();
  if (REMOTE) initRemote();
})();
