/* core.js — Kegel PWA
   Pure, side-effect-free logic. Usable in the browser (window.KegelCore)
   and in Node (require) so it can be unit-tested. No DOM, no storage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KegelCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }

  // Local calendar-day key 'YYYY-MM-DD' (no timezone drift).
  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Parse 'YYYY-MM-DD' into a local Date at midnight.
  function parseKey(key) {
    var p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  // Total seconds for one guided session given a plan.
  // plan: { holdTime, relaxTime, slowReps, restBetween, fastSqueeze, fastRelax, fastReps }
  function sessionDuration(plan) {
    var slow = plan.slowReps * (plan.holdTime + plan.relaxTime);
    var fast = plan.fastReps * (plan.fastSqueeze + plan.fastRelax);
    var rest = (plan.slowReps > 0 && plan.fastReps > 0) ? plan.restBetween : 0;
    return slow + rest + fast;
  }

  // Ordered list of phases the player walks through.
  function buildPhases(plan) {
    var phases = [];
    for (var i = 0; i < plan.slowReps; i++) {
      phases.push({ kind: 'squeeze', group: 'slow', label: 'Aprieta y sube', dur: plan.holdTime });
      phases.push({ kind: 'release', group: 'slow', label: 'Suelta y relaja', dur: plan.relaxTime });
    }
    if (plan.slowReps > 0 && plan.fastReps > 0 && plan.restBetween > 0) {
      phases.push({ kind: 'rest', group: 'rest', label: 'Descansa', dur: plan.restBetween });
    }
    for (var j = 0; j < plan.fastReps; j++) {
      phases.push({ kind: 'squeeze', group: 'fast', label: 'Aprieta', dur: plan.fastSqueeze });
      phases.push({ kind: 'release', group: 'fast', label: 'Suelta', dur: plan.fastRelax });
    }
    return phases;
  }

  // Consecutive days meeting the goal, ending today (or yesterday as grace).
  // completedDays: array/Set of 'YYYY-MM-DD' that met the daily goal.
  function computeStreak(completedDays, todayKey) {
    var set = completedDays instanceof Set ? completedDays : new Set(completedDays);
    var cursor = parseKey(todayKey);
    if (!set.has(dateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1); // grace: yesterday still counts
      if (!set.has(dateKey(cursor))) return 0;
    }
    var count = 0;
    while (set.has(dateKey(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  // Adherence as a clamped, rounded percentage. Safe when target is 0.
  function adherence(completed, target) {
    if (!target || target <= 0) return 0;
    var pct = (completed / target) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  function icsStamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  // Build a VCALENDAR with one daily-recurring VEVENT (+ VALARM) per time.
  // times: ['HH:MM', ...]; opts: { summary, description, startDate, uidSeed }
  function generateICS(times, opts) {
    opts = opts || {};
    var summary = opts.summary || 'Ejercicios de Kegel';
    var description = opts.description || 'Recordatorio de ejercicios de suelo pelvico.';
    var start = opts.startDate || new Date();
    var seed = opts.uidSeed || 'kegel';
    var L = [];
    L.push('BEGIN:VCALENDAR');
    L.push('VERSION:2.0');
    L.push('PRODID:-//Kegel PWA//ES//EN');
    L.push('CALSCALE:GREGORIAN');
    times.forEach(function (t, i) {
      var hm = t.split(':').map(Number);
      var dt = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hm[0], hm[1], 0);
      L.push('BEGIN:VEVENT');
      L.push('UID:' + seed + '-' + i + '-' + dt.getTime() + '@kegel.local');
      L.push('DTSTAMP:' + icsStamp(new Date()));
      L.push('DTSTART:' + icsStamp(dt));
      L.push('DURATION:PT5M');
      L.push('RRULE:FREQ=DAILY');
      L.push('SUMMARY:' + summary);
      L.push('DESCRIPTION:' + description);
      L.push('BEGIN:VALARM');
      L.push('ACTION:DISPLAY');
      L.push('DESCRIPTION:' + summary);
      L.push('TRIGGER:PT0M');
      L.push('END:VALARM');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n');
  }

  return {
    dateKey: dateKey,
    parseKey: parseKey,
    sessionDuration: sessionDuration,
    buildPhases: buildPhases,
    computeStreak: computeStreak,
    adherence: adherence,
    generateICS: generateICS
  };
});
