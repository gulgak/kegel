/* app.js — Kegel PWA UI. Depends on KegelCore (core.js). Data lives in localStorage. */
(function () {
  'use strict';
  var C = window.KegelCore;
  var KEY = 'kegel.state.v1';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function today() { return C.dateKey(new Date()); }

  /* ---------- Programs ---------- */
  var PRESETS = {
    beginner: { id: 'beginner', name: 'Principiante', desc: 'Aprende la técnica. Mantén 3–5 s.', holdTime: 3, relaxTime: 3, slowReps: 6, restBetween: 30, fastSqueeze: 1, fastRelax: 1, fastReps: 6, sessionsPerDay: 3 },
    strength: { id: 'strength', name: 'Fuerza', desc: 'Mantén hasta 10 s · 10 + 10 por sesión.', holdTime: 10, relaxTime: 10, slowReps: 10, restBetween: 30, fastSqueeze: 1, fastRelax: 1, fastReps: 10, sessionsPerDay: 3 },
    maintenance: { id: 'maintenance', name: 'Mantenimiento', desc: 'Conserva la fuerza · 1 sesión al día.', holdTime: 10, relaxTime: 10, slowReps: 10, restBetween: 30, fastSqueeze: 1, fastRelax: 1, fastReps: 10, sessionsPerDay: 1 }
  };
  var DEFAULT_TIMES = ['09:00', '14:00', '21:00', '12:00', '17:00', '08:00'];
  var BOUNDS = { holdTime: [1, 15, 1], relaxTime: [1, 15, 1], slowReps: [1, 20, 1], fastReps: [0, 20, 1], restBetween: [0, 120, 5], sessionsPerDay: [1, 6, 1] };

  /* ---------- State ---------- */
  var state;
  function defaults() {
    var b = PRESETS.beginner;
    return {
      planId: 'beginner',
      custom: { holdTime: b.holdTime, relaxTime: b.relaxTime, slowReps: b.slowReps, restBetween: b.restBetween, fastSqueeze: 1, fastRelax: 1, fastReps: b.fastReps, sessionsPerDay: b.sessionsPerDay },
      schedule: ['09:00', '14:00', '21:00'],
      settings: { sound: true, voice: true, vibrate: true },
      sessions: [],
      journal: []
    };
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : defaults(); }
    catch (e) { state = defaults(); }
    state = Object.assign(defaults(), state);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('No se pudo guardar (almacenamiento bloqueado)'); } }

  function activePlan() {
    if (state.planId === 'custom') return Object.assign({ id: 'custom', name: 'Personalizado', desc: 'Tu plan a medida.' }, state.custom);
    return PRESETS[state.planId] || PRESETS.beginner;
  }
  function currentParams() {
    var p = activePlan();
    return { holdTime: p.holdTime, relaxTime: p.relaxTime, slowReps: p.slowReps, fastReps: p.fastReps, restBetween: p.restBetween, sessionsPerDay: p.sessionsPerDay, fastSqueeze: p.fastSqueeze, fastRelax: p.fastRelax };
  }
  function syncSchedule() {
    var n = activePlan().sessionsPerDay;
    var s = state.schedule.slice(0, n);
    while (s.length < n) s.push(DEFAULT_TIMES[s.length] || '12:00');
    state.schedule = s;
  }

  /* ---------- Derived stats ---------- */
  function sessionsOn(day) { return state.sessions.filter(function (s) { return s.day === day; }).length; }
  function completedDays() {
    var goal = activePlan().sessionsPerDay, counts = {};
    state.sessions.forEach(function (s) { counts[s.day] = (counts[s.day] || 0) + 1; });
    var set = new Set();
    Object.keys(counts).forEach(function (d) { if (counts[d] >= goal) set.add(d); });
    return set;
  }
  function streak() { return C.computeStreak(completedDays(), today()); }
  function lastNDays(n) {
    var out = [], d = new Date();
    for (var i = n - 1; i >= 0; i--) { var x = new Date(d); x.setDate(d.getDate() - i); out.push(C.dateKey(x)); }
    return out;
  }
  function adherence7() {
    var goal = activePlan().sessionsPerDay, completed = 0;
    lastNDays(7).forEach(function (d) { completed += Math.min(sessionsOn(d), goal); });
    return C.adherence(completed, goal * 7);
  }

  /* ---------- Cues: sound / voice / vibration ---------- */
  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur) {
    if (!state.settings.sound || !audioCtx) return;
    try {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime;
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { }
  }
  function say(text) {
    if (!state.settings.voice || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'es-ES'; u.rate = 1; speechSynthesis.speak(u); } catch (e) { }
  }
  function buzz(ms) { if (state.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } } }
  function cue(phase) {
    if (phase.kind === 'squeeze') { beep(620, 0.18); buzz(60); say(phase.label); }
    else if (phase.kind === 'release') { beep(360, 0.16); buzz(30); say(phase.label); }
    else { beep(300, 0.2); say(phase.label); }
  }

  /* ---------- Navigation ---------- */
  function switchScreen(name) {
    var arr = document.querySelectorAll('.screen');
    for (var i = 0; i < arr.length; i++) arr[i].classList.remove('is-active');
    $('screen-' + name).classList.add('is-active');
    var tabs = document.querySelectorAll('.tab');
    for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('is-active', tabs[j].dataset.screen === name);
    render(name);
    window.scrollTo(0, 0);
  }
  function render(name) {
    ({ today: renderToday, train: renderTrain, progress: renderProgress, journal: renderJournal, info: renderInfo, settings: renderSettings }[name] || function () { })();
  }

  /* ---------- Screen: Today ---------- */
  function fmtDur(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
  function planSummary(p) {
    return 'Lentas ' + p.slowReps + '×' + p.holdTime + 's · Rápidas ' + p.fastReps + ' · ' + p.sessionsPerDay + (p.sessionsPerDay === 1 ? ' sesión/día' : ' sesiones/día');
  }
  function renderToday() {
    var p = activePlan(), done = sessionsOn(today()), goal = p.sessionsPerDay;
    var dt = new Date(), dayName = dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    $('screen-today').innerHTML =
      '<p class="eyebrow">' + esc(dayName) + '</p>' +
      '<div class="card center">' +
      '  <div class="ringwrap"><div class="ring dayring" data-phase="release">' +
      '    <div class="ring__halo"></div><div class="ring__disc"></div>' +
      '    <div class="ring__core"><div class="ring__count">' + done + '<small>/' + goal + '</small></div>' +
      '    <div class="muted tiny">sesiones de hoy</div></div>' +
      '  </div></div>' +
      '  <button class="btn" id="startToday">' + (done >= goal ? 'Sesión extra' : 'Empezar sesión') + '</button>' +
      '  <p class="tiny muted" style="margin:12px 0 0">' + esc(p.name) + ' · ' + esc(planSummary(p)) + ' · ' + fmtDur(C.sessionDuration(p)) + ' min</p>' +
      '</div>' +
      '<div class="stats" style="margin-top:14px">' +
      '  <div class="stat"><div class="stat__num accent">' + streak() + '</div><div class="stat__lbl">racha (días)</div></div>' +
      '  <div class="stat"><div class="stat__num">' + done + '/' + goal + '</div><div class="stat__lbl">hoy</div></div>' +
      '  <div class="stat"><div class="stat__num">' + adherence7() + '%</div><div class="stat__lbl">adherencia 7d</div></div>' +
      '</div>';
    $('startToday').addEventListener('click', startSession);
  }

  /* ---------- Screen: Train ---------- */
  function stepperRow(label, sub, key, val) {
    return '<div class="field"><div class="field__l">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
      '<div class="stepper"><button data-step="' + key + '" data-dir="-1" aria-label="menos">−</button>' +
      '<span class="stepper__v" id="v-' + key + '">' + val + '</span>' +
      '<button data-step="' + key + '" data-dir="1" aria-label="más">+</button></div></div>';
  }
  function renderTrain() {
    var p = activePlan(), cp = currentParams();
    var presets = ['beginner', 'strength', 'maintenance'].map(function (id) {
      var pr = PRESETS[id], on = state.planId === id;
      return '<button class="choice' + (on ? ' is-active' : '') + '" data-preset="' + id + '">' +
        '<span><span class="choice__t">' + esc(pr.name) + '</span><span class="choice__d">' + esc(pr.desc) + '</span></span>' +
        '<svg class="choice__tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12l4 4 10-10"/></svg></button>';
    }).join('');
    var customOn = state.planId === 'custom';
    $('screen-train').innerHTML =
      '<h1 class="h1">Entrenar</h1>' +
      '<div class="card"><p class="eyebrow">Programa</p><div class="choices">' + presets +
      '<button class="choice' + (customOn ? ' is-active' : '') + '" data-preset="custom">' +
      '<span><span class="choice__t">Personalizado</span><span class="choice__d">Ajusta los valores abajo.</span></span>' +
      '<svg class="choice__tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12l4 4 10-10"/></svg></button>' +
      '</div></div>' +
      '<div class="card"><p class="eyebrow">Ajustar plan</p>' +
      stepperRow('Mantener (lentas)', 'segundos de contracción', 'holdTime', cp.holdTime) +
      stepperRow('Descanso (lentas)', 'segundos entre lentas', 'relaxTime', cp.relaxTime) +
      stepperRow('Repeticiones lentas', '', 'slowReps', cp.slowReps) +
      stepperRow('Repeticiones rápidas', 'aprieta y suelta', 'fastReps', cp.fastReps) +
      stepperRow('Descanso entre bloques', 'segundos', 'restBetween', cp.restBetween) +
      stepperRow('Sesiones al día', 'objetivo diario', 'sessionsPerDay', cp.sessionsPerDay) +
      '<p class="tiny muted" style="margin:12px 0 0">Duración por sesión: <strong>' + fmtDur(C.sessionDuration(activePlan())) + '</strong> min</p>' +
      '</div>' +
      '<div class="spacer"></div><button class="btn" id="startTrain">Empezar sesión</button>';

    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
      b.addEventListener('click', function () { state.planId = b.dataset.preset; syncSchedule(); save(); renderTrain(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-step]'), function (b) {
      b.addEventListener('click', function () { adjustParam(b.dataset.step, parseInt(b.dataset.dir, 10)); });
    });
    $('startTrain').addEventListener('click', startSession);
  }
  function adjustParam(key, dir) {
    var b = BOUNDS[key], cur = currentParams();
    cur[key] = Math.max(b[0], Math.min(b[1], cur[key] + dir * b[2]));
    state.custom = cur; state.planId = 'custom';
    syncSchedule(); save(); renderTrain();
  }

  /* ---------- Screen: Progress ---------- */
  function renderProgress() {
    var goal = activePlan().sessionsPerDay;
    // weekly bars
    var days = lastNDays(7);
    var maxV = Math.max(goal, days.reduce(function (m, d) { return Math.max(m, sessionsOn(d)); }, 1));
    var bars = days.map(function (d) {
      var v = sessionsOn(d), h = Math.round((v / maxV) * 100);
      var lbl = C.parseKey(d).toLocaleDateString('es-ES', { weekday: 'narrow' });
      return '<div class="bar"><div class="bar__fill ' + (v >= goal ? 'goal' : 'under') + '" style="height:' + h + '%"></div><span class="bar__lbl">' + esc(lbl) + '</span></div>';
    }).join('');
    // monthly calendar
    var now = new Date(), y = now.getFullYear(), mo = now.getMonth();
    var first = new Date(y, mo, 1), startDow = (first.getDay() + 6) % 7; // Monday-first
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var done = completedDays();
    var dows = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(function (x) { return '<div class="cal__dow">' + x + '</div>'; }).join('');
    var cells = '';
    for (var i = 0; i < startDow; i++) cells += '<div class="cal__cell empty"></div>';
    for (var dnum = 1; dnum <= daysInMonth; dnum++) {
      var key = C.dateKey(new Date(y, mo, dnum)), n = 0;
      state.sessions.forEach(function (s) { if (s.day === key) n++; });
      var cls = 'cal__cell';
      if (done.has(key)) cls += ' full'; else if (n > 0) cls += ' part';
      if (key === today()) cls += ' today';
      cells += '<div class="' + cls + '">' + dnum + '</div>';
    }
    var totalMin = Math.round(state.sessions.reduce(function (s, x) { return s + (x.planned || 0); }, 0) / 60);
    $('screen-progress').innerHTML =
      '<h1 class="h1">Progreso</h1>' +
      '<div class="stats">' +
      '<div class="stat"><div class="stat__num accent">' + streak() + '</div><div class="stat__lbl">racha</div></div>' +
      '<div class="stat"><div class="stat__num">' + adherence7() + '%</div><div class="stat__lbl">adherencia 7d</div></div>' +
      '<div class="stat"><div class="stat__num">' + state.sessions.length + '</div><div class="stat__lbl">sesiones</div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><p class="eyebrow">Últimos 7 días</p><div class="bars">' + bars + '</div></div>' +
      '<div class="card"><p class="eyebrow">' + esc(now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })) + '</p>' +
      '<div class="cal">' + dows + cells + '</div>' +
      '<p class="tiny muted" style="margin:12px 0 0">Verde = objetivo del día cumplido · ' + totalMin + ' min entrenados en total</p></div>';
  }

  /* ---------- Screen: Journal ---------- */
  var draft = { type: 'leak', severity: 2, note: '' };
  var TYPE_META = { leak: { t: 'Escape', c: '#E5837B' }, urgency: { t: 'Urgencia', c: '#F0A36B' }, note: { t: 'Nota', c: '#5FD0B6' } };
  function renderJournal() {
    var seg = Object.keys(TYPE_META).map(function (k) {
      return '<button data-jtype="' + k + '" class="' + (draft.type === k ? 'is-active' : '') + '">' + TYPE_META[k].t + '</button>';
    }).join('');
    var sevRow = draft.type === 'note' ? '' :
      '<div class="field"><div class="field__l">Intensidad</div><div class="seg" id="sevSeg">' +
      [1, 2, 3].map(function (n) { return '<button data-sev="' + n + '" class="' + (draft.severity === n ? 'is-active' : '') + '">' + ['Leve', 'Media', 'Fuerte'][n - 1] + '</button>'; }).join('') +
      '</div></div>';
    var entries = state.journal.slice().sort(function (a, b) { return b.ts - a.ts; }).map(function (e, idx) {
      var m = TYPE_META[e.type] || TYPE_META.note;
      var when = new Date(e.ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      var sev = (e.type !== 'note' && e.severity) ? ' · ' + ['Leve', 'Media', 'Fuerte'][e.severity - 1] : '';
      return '<div class="entry"><span class="entry__dot" style="background:' + m.c + '"></span>' +
        '<div><div class="entry__txt">' + esc(m.t) + sev + '</div>' +
        (e.note ? '<div class="entry__txt muted">' + esc(e.note) + '</div>' : '') +
        '<div class="entry__meta">' + esc(when) + '</div></div>' +
        '<button class="entry__del" data-del="' + e.ts + '">Borrar</button></div>';
    }).join('') || '<p class="muted tiny">Aún no hay entradas. Anota un escape, una urgencia o una nota para seguir tu evolución.</p>';

    $('screen-journal').innerHTML =
      '<h1 class="h1">Diario</h1>' +
      '<div class="card"><p class="eyebrow">Nueva entrada</p>' +
      '<div class="field"><div class="field__l">Tipo</div><div class="seg" id="typeSeg">' + seg + '</div></div>' +
      sevRow +
      '<textarea id="jNote" placeholder="Nota (opcional): contexto, desencadenante…">' + esc(draft.note) + '</textarea>' +
      '<div class="spacer"></div><button class="btn btn--sm" id="jSave">Guardar entrada</button></div>' +
      '<div class="card"><p class="eyebrow">Historial</p>' + entries + '</div>' +
      '<p class="src" style="margin-top:10px">Diario adaptado del “bladder diary” de Squeezy: registro privado para detectar patrones y compartir con tu fisio si lo deseas.</p>';

    Array.prototype.forEach.call(document.querySelectorAll('[data-jtype]'), function (b) {
      b.addEventListener('click', function () { draft.type = b.dataset.jtype; renderJournal(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sev]'), function (b) {
      b.addEventListener('click', function () { draft.severity = parseInt(b.dataset.sev, 10); renderJournal(); });
    });
    $('jNote').addEventListener('input', function (e) { draft.note = e.target.value; });
    $('jSave').addEventListener('click', function () {
      var now = new Date();
      state.journal.push({ ts: now.getTime(), day: C.dateKey(now), type: draft.type, severity: draft.type === 'note' ? null : draft.severity, note: draft.note.trim() });
      draft = { type: 'leak', severity: 2, note: '' }; save(); renderJournal(); toast('Entrada guardada');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        var ts = Number(b.dataset.del);
        state.journal = state.journal.filter(function (e) { return e.ts !== ts; });
        save(); renderJournal();
      });
    });
  }

  /* ---------- Screen: Info ---------- */
  function renderInfo() {
    $('screen-info').innerHTML =
      '<h1 class="h1">Cómo hacerlo bien</h1>' +
      '<div class="card info">' +
      '<h3>Encuentra el músculo</h3>' +
      '<p>Sentado, con muslos, glúteos y abdomen relajados: imagina que cortas el chorro de orina y a la vez aguantas un gas. Es una sensación de “apretar y subir” hacia dentro, delante y detrás.</p>' +
      '<h3>Comprueba que es correcto</h3>' +
      '<p>Pon las yemas en el perineo (entre escroto y ano): debe elevarse. Frente a un espejo, el pene y los testículos suben ligeramente.</p>' +
      '<h3>Dos tipos, los dos importan</h3>' +
      '<p>Lentas (resistencia): aprieta, sube y mantén. Rápidas (potencia): aprieta y suelta de inmediato. La app te guía con ambas.</p>' +
      '</div>' +
      '<div class="card"><p class="eyebrow">Errores a evitar</p>' +
      '<div class="dont"><span class="dont__x">✕</span><div>Apretar glúteos, muslos o meter tripa con fuerza.</div></div>' +
      '<div class="dont"><span class="dont__x">✕</span><div>Aguantar la respiración. Respira con normalidad.</div></div>' +
      '<div class="dont"><span class="dont__x">✕</span><div>Empujar hacia abajo en vez de apretar y subir.</div></div>' +
      '<div class="dont"><span class="dont__x">✕</span><div>Cortar el chorro de orina como ejercicio habitual (solo como comprobación, máx. cada 2 semanas).</div></div>' +
      '</div>' +
      '<div class="card info"><h3>Qué esperar</h3><p>La fuerza tarda 3–6 meses en mejorar de forma regular; puede notarse algo en 3–6 semanas. La constancia es lo que cuenta.</p></div>' +
      '<div class="disclaimer">Esta app no es una herramienta diagnóstica. Si los ejercicios causan dolor o empeoran los síntomas, detente y consulta. Ante dudas, busca a un fisioterapeuta de suelo pélvico.</div>' +
      '<p class="src" style="margin-top:12px">Fuentes: guías de fisioterapia del NHS (North Bristol, University Hospitals Sussex, North Tees &amp; Hartlepool, Cambridge University Hospitals) e instrucciones de uso de Squeezy.</p>';
  }

  /* ---------- Screen: Settings ---------- */
  var deferredInstall = null;
  function renderSettings() {
    syncSchedule();
    var times = state.schedule.map(function (t, i) {
      return '<input type="time" value="' + esc(t) + '" data-time="' + i + '" aria-label="Hora sesión ' + (i + 1) + '">';
    }).join('');
    function toggle(id, label, on) {
      return '<div class="field"><div class="field__l">' + label + '</div>' +
        '<label class="toggle"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '>' +
        '<span class="toggle__track"><span class="toggle__dot"></span></span></label></div>';
    }
    $('screen-settings').innerHTML =
      '<h1 class="h1">Ajustes</h1>' +
      '<div class="card"><p class="eyebrow">Recordatorios</p>' +
      '<p class="tiny muted" style="margin:0 0 10px">Una hora por cada sesión diaria (' + state.schedule.length + '). Expórtalas a tu calendario para que el sistema te avise.</p>' +
      '<div class="timegrid">' + times + '</div>' +
      '<div class="spacer"></div><button class="btn btn--sm btn--ghost" id="exportIcs">Exportar al calendario (.ics)</button></div>' +
      '<div class="card"><p class="eyebrow">Guía durante la sesión</p>' +
      toggle('setSound', 'Sonido', state.settings.sound) +
      toggle('setVoice', 'Voz (español)', state.settings.voice) +
      toggle('setVibrate', 'Vibración', state.settings.vibrate) +
      '</div>' +
      '<div class="card"><p class="eyebrow">Tus datos</p>' +
      '<p class="tiny muted" style="margin:0 0 10px">Todo se guarda solo en este dispositivo. Haz copias o cambia de móvil con export/import.</p>' +
      '<div class="btnrow"><button class="btn btn--sm btn--ghost" id="exportJson">Exportar copia</button>' +
      '<button class="btn btn--sm btn--ghost" id="importJson">Importar copia</button></div>' +
      '<input type="file" id="importFile" accept="application/json" style="display:none">' +
      '<div class="spacer"></div><button class="btn btn--sm btn--danger" id="resetAll">Borrar todos los datos</button></div>' +
      (deferredInstall ? '<div class="card"><p class="eyebrow">Instalar</p><button class="btn btn--sm" id="installApp">Añadir a la pantalla de inicio</button></div>' : '') +
      '<p class="src center" style="margin-top:12px">Kegel · PWA offline · v1</p>';

    Array.prototype.forEach.call(document.querySelectorAll('[data-time]'), function (inp) {
      inp.addEventListener('change', function () { state.schedule[parseInt(inp.dataset.time, 10)] = inp.value; save(); });
    });
    $('setSound').addEventListener('change', function (e) { state.settings.sound = e.target.checked; save(); if (e.target.checked) { ensureAudio(); beep(620, 0.15); } });
    $('setVoice').addEventListener('change', function (e) { state.settings.voice = e.target.checked; save(); if (e.target.checked) say('Voz activada'); });
    $('setVibrate').addEventListener('change', function (e) { state.settings.vibrate = e.target.checked; save(); if (e.target.checked) buzz(60); });
    $('exportIcs').addEventListener('click', function () {
      var ics = C.generateICS(state.schedule, { summary: 'Ejercicios de Kegel', description: 'Sesión de suelo pélvico.' });
      download('kegel-recordatorios.ics', ics, 'text/calendar');
      toast('Calendario exportado · ábrelo para añadir los avisos');
    });
    $('exportJson').addEventListener('click', function () { download('kegel-backup.json', JSON.stringify(state, null, 2), 'application/json'); toast('Copia exportada'); });
    $('importJson').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try { var data = JSON.parse(r.result); state = Object.assign(defaults(), data); save(); toast('Copia importada'); switchScreen('today'); }
        catch (err) { toast('Archivo no válido'); }
      };
      r.readAsText(f);
    });
    $('resetAll').addEventListener('click', function () {
      if (confirm('¿Borrar todo el historial, el diario y los ajustes? No se puede deshacer.')) { state = defaults(); save(); switchScreen('today'); toast('Datos borrados'); }
    });
    if (deferredInstall && $('installApp')) $('installApp').addEventListener('click', function () { deferredInstall.prompt(); deferredInstall = null; });
  }

  /* ---------- Player (guided session) ---------- */
  // Player state. The clock is ALWAYS the requestAnimationFrame timestamp — never
  // performance.now() — so the two can never disagree and freeze the countdown.
  var P = { phases: [], idx: 0, total: 0, cum: 0, fromScale: 0.62, toScale: 0.62, phaseStart: null, raf: 0, paused: false, pendingResume: false, pauseAt: 0, lastNow: 0, lastRem: -1, planned: 0, done: false };

  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
  function buildTimeline(plan) {
    var raw = C.buildPhases(plan), slowN = 0, fastN = 0;
    return raw.map(function (p) {
      var groupLabel = 'Descanso', repText = '—';
      if (p.group === 'slow') { if (p.kind === 'squeeze') slowN++; groupLabel = 'Lentas'; repText = slowN + ' / ' + plan.slowReps; }
      else if (p.group === 'fast') { if (p.kind === 'squeeze') fastN++; groupLabel = 'Rápidas'; repText = fastN + ' / ' + plan.fastReps; }
      return Object.assign({}, p, { groupLabel: groupLabel, repText: repText });
    });
  }
  function startSession() {
    ensureAudio();
    var plan = activePlan();
    P.phases = buildTimeline(plan);
    if (!P.phases.length) { toast('Configura al menos una repetición'); return; }
    P.idx = 0; P.cum = 0; P.total = C.sessionDuration(plan); P.planned = P.total;
    P.paused = false; P.pendingResume = false; P.done = false; P.fromScale = 0.62;
    P.phaseStart = null; // fixed on the first animation frame, from the rAF clock
    $('player').classList.add('is-open'); $('player').setAttribute('aria-hidden', 'false');
    setText('plPause', 'Pausa'); var bar0 = $('plBar'); if (bar0) bar0.style.width = '0%';
    enterPhaseMeta(0);
    cancelAnimationFrame(P.raf); P.raf = requestAnimationFrame(loop);
  }
  // Update DOM/labels/cues for a phase. Does NOT touch the clock.
  function enterPhaseMeta(i) {
    var p = P.phases[i];
    P.idx = i; P.lastRem = -1;
    var ring = $('plRing');
    P.fromScale = ring ? (parseFloat(ring.style.getPropertyValue('--scale')) || 0.62) : 0.62;
    P.toScale = p.kind === 'squeeze' ? 1.0 : 0.62;
    if (ring) ring.setAttribute('data-phase', p.kind);
    setText('plGroup', p.groupLabel);
    setText('plRep', p.repText);
    setText('plPhase', p.label);
    cue(p);
  }
  function loop(now) {
    if (P.done) return;
    try {
      P.lastNow = now;
      if (P.phaseStart == null) P.phaseStart = now;             // base = first rAF timestamp
      if (P.pendingResume) { P.phaseStart += now - P.pauseAt; P.pendingResume = false; } // discount paused time
      if (P.paused) { P.raf = requestAnimationFrame(loop); return; }
      var p = P.phases[P.idx];
      var t = (now - P.phaseStart) / 1000;
      if (t < 0) t = 0;                                          // safety net: never freeze
      var ramp = p.kind === 'squeeze' ? Math.min(1.0, p.dur * 0.5) : Math.min(1.2, p.dur * 0.7);
      var frac = ramp > 0 ? Math.min(t / ramp, 1) : 1;
      var e = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
      var scale = P.fromScale + (P.toScale - P.fromScale) * e;
      var ring = $('plRing'); if (ring) ring.style.setProperty('--scale', scale.toFixed(3));
      var rem = Math.max(0, Math.ceil(p.dur - t));
      if (rem !== P.lastRem) { P.lastRem = rem; var c = $('plCount'); if (c) c.innerHTML = rem + '<small>s</small>'; }
      var prog = (P.cum + Math.min(t, p.dur)) / P.total;
      var bar = $('plBar'); if (bar) bar.style.width = (Math.min(prog, 1) * 100).toFixed(1) + '%';
      if (t >= p.dur) {
        P.cum += p.dur;
        if (P.idx + 1 < P.phases.length) { enterPhaseMeta(P.idx + 1); P.phaseStart += p.dur * 1000; P.raf = requestAnimationFrame(loop); }
        else { finishSession(); return; }
      } else {
        P.raf = requestAnimationFrame(loop);
      }
    } catch (err) {
      diag('loop: ' + (err && err.message ? err.message : err));
      if (!P.done) P.raf = requestAnimationFrame(loop); // keep animating instead of freezing forever
    }
  }
  function finishSession() {
    P.done = true; cancelAnimationFrame(P.raf);
    buzz([60, 40, 120]); beep(540, 0.18); setTimeout(function () { beep(720, 0.22); }, 180); say('Sesión completada');
    var now = new Date();
    var entry = { ts: now.getTime(), day: C.dateKey(now), planned: P.planned, note: '' };
    state.sessions.push(entry); save();
    showCompletion(entry);
  }
  function showCompletion(entry) {
    var mid = document.querySelector('.player__mid');
    if (!mid) { closePlayer(); return; }
    mid.innerHTML =
      '<div class="center">' +
      '<div class="ring dayring" data-phase="release" style="margin:0 auto 18px"><div class="ring__halo"></div><div class="ring__disc"></div>' +
      '<div class="ring__core"><svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#5FD0B6" stroke-width="2.4"><path d="M5 12l4 4 10-10"/></svg></div></div>' +
      '<div class="h2">Sesión completada</div>' +
      '<p class="tiny muted">Racha: ' + streak() + ' · ' + sessionsOn(today()) + '/' + activePlan().sessionsPerDay + ' hoy</p>' +
      '<textarea id="plNote" placeholder="Nota (opcional)…" style="margin-top:12px"></textarea>' +
      '</div>';
    var bar = $('plBar'); if (bar) bar.style.width = '100%';
    var pp = $('plPause'); if (pp) pp.style.display = 'none';
    setText('plSkip', 'Listo');
    $('plSkip').onclick = function () {
      var n = $('plNote') ? $('plNote').value.trim() : '';
      if (n) { entry.note = n; save(); }
      closePlayer();
    };
  }
  function closePlayer() {
    cancelAnimationFrame(P.raf); P.done = true; P.paused = false; P.pendingResume = false; P.phaseStart = null;
    try { speechSynthesis.cancel(); } catch (e) { }
    var pl = $('player'); pl.classList.remove('is-open'); pl.setAttribute('aria-hidden', 'true');
    var pp = $('plPause'); if (pp) { pp.style.display = ''; pp.textContent = 'Pausa'; }
    var ps = $('plSkip'); if (ps) { ps.textContent = 'Saltar'; ps.onclick = skipPhase; }
    var mid = document.querySelector('.player__mid');
    if (mid) mid.innerHTML =
      '<div class="ring" id="plRing" data-phase="release"><div class="ring__halo"></div><div class="ring__disc"></div>' +
      '<div class="ring__core"><div class="ring__phase" id="plPhase">Prepárate</div><div class="ring__count" id="plCount">3<small>s</small></div></div></div>';
    var bar = $('plBar'); if (bar) bar.style.width = '0%';
    switchScreen('today');
  }
  function togglePause() {
    if (P.done) return;
    if (!P.paused) { P.paused = true; P.pauseAt = P.lastNow; setText('plPause', 'Reanudar'); try { speechSynthesis.cancel(); } catch (e) { } }
    else { P.paused = false; P.pendingResume = true; setText('plPause', 'Pausa'); } // resume handled on next frame
  }
  function skipPhase() {
    if (P.done || P.paused) return;
    var p = P.phases[P.idx]; P.cum += p.dur;
    if (P.idx + 1 < P.phases.length) { enterPhaseMeta(P.idx + 1); P.phaseStart = P.lastNow; }
    else finishSession();
  }

  /* ---------- Utilities ---------- */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2300); }

  // Visible error banner — only appears if something actually goes wrong, so a
  // problem on the phone is readable instead of a silent freeze.
  function diag(msg) {
    try {
      var d = document.getElementById('diag');
      if (!d) {
        d = document.createElement('div'); d.id = 'diag';
        d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;background:#3a1414;color:#ffd9d3;border:1px solid #E5837B;border-radius:10px;padding:10px 12px;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap';
        d.addEventListener('click', function () { d.remove(); });
        document.body.appendChild(d);
      }
      d.textContent = '⚠ ' + msg + '  (toca para cerrar)';
    } catch (e) { }
  }

  /* ---------- Boot ---------- */
  function boot() {
    window.addEventListener('error', function (e) { diag((e.message || 'error') + (e.filename ? (' @ ' + e.filename.split('/').pop() + ':' + e.lineno) : '')); });
    window.addEventListener('unhandledrejection', function (e) { diag('promesa: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); });
    load(); syncSchedule();
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () { switchScreen(tab.dataset.screen); });
    });
    $('goSettings').addEventListener('click', function () { switchScreen('settings'); });
    $('plPause').addEventListener('click', togglePause);
    $('plSkip').addEventListener('click', skipPhase);
    $('plClose').addEventListener('click', function () {
      if (P.done) { closePlayer(); return; }
      if (confirm('¿Salir de la sesión? No se guardará.')) closePlayer();
    });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; });
    renderToday();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () { }); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
