/* World Cup 2026 — bracket data + scoring engine.
 * Pure, dependency-free. Works in the browser (window.WC) and in Node (module.exports).
 * The data (groups / R32 seeding rules / knockout tree) was extracted from the
 * original interactive bracket file. */
(function (root) {
  'use strict';

  // ---- Tournament data -----------------------------------------------------
  var groups = {
    A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
    B: ['Canada', 'Bosnia & Herzegovina', 'Qatar', 'Switzerland'],
    C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
    D: ['United States', 'Paraguay', 'Australia', 'Türkiye'],
    E: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'],
    F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
    G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
    H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
    I: ['France', 'Senegal', 'Iraq', 'Norway'],
    J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
    K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
    L: ['England', 'Croatia', 'Ghana', 'Panama']
  };

  var iso = {
    'Mexico': 'mx', 'South Africa': 'za', 'South Korea': 'kr', 'Czechia': 'cz',
    'Canada': 'ca', 'Bosnia & Herzegovina': 'ba', 'Qatar': 'qa', 'Switzerland': 'ch',
    'Brazil': 'br', 'Morocco': 'ma', 'Haiti': 'ht', 'Scotland': 'gb-sct',
    'United States': 'us', 'Paraguay': 'py', 'Australia': 'au', 'Türkiye': 'tr',
    'Germany': 'de', 'Curaçao': 'cw', 'Ivory Coast': 'ci', 'Ecuador': 'ec',
    'Netherlands': 'nl', 'Japan': 'jp', 'Sweden': 'se', 'Tunisia': 'tn',
    'Belgium': 'be', 'Egypt': 'eg', 'Iran': 'ir', 'New Zealand': 'nz',
    'Spain': 'es', 'Cape Verde': 'cv', 'Saudi Arabia': 'sa', 'Uruguay': 'uy',
    'France': 'fr', 'Senegal': 'sn', 'Iraq': 'iq', 'Norway': 'no',
    'Argentina': 'ar', 'Algeria': 'dz', 'Austria': 'at', 'Jordan': 'jo',
    'Portugal': 'pt', 'DR Congo': 'cd', 'Uzbekistan': 'uz', 'Colombia': 'co',
    'England': 'gb-eng', 'Croatia': 'hr', 'Ghana': 'gh', 'Panama': 'pa'
  };

  var groupLetters = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  // Round of 32 (matches 73–88). slot kinds: rank{g,r} | third{allowed:[groups]}
  var r32 = [
    { id: 73, a: { kind:'rank', g:'A', r:2 }, b: { kind:'rank', g:'B', r:2 }, next: 90 },
    { id: 74, a: { kind:'rank', g:'E', r:1 }, b: { kind:'third', allowed:['A','B','C','D','F'] }, next: 89 },
    { id: 75, a: { kind:'rank', g:'F', r:1 }, b: { kind:'rank', g:'C', r:2 }, next: 90 },
    { id: 76, a: { kind:'rank', g:'C', r:1 }, b: { kind:'rank', g:'F', r:2 }, next: 91 },
    { id: 77, a: { kind:'rank', g:'I', r:1 }, b: { kind:'third', allowed:['C','D','F','G','H'] }, next: 89 },
    { id: 78, a: { kind:'rank', g:'E', r:2 }, b: { kind:'rank', g:'I', r:2 }, next: 91 },
    { id: 79, a: { kind:'rank', g:'A', r:1 }, b: { kind:'third', allowed:['C','E','F','H','I'] }, next: 92 },
    { id: 80, a: { kind:'rank', g:'L', r:1 }, b: { kind:'third', allowed:['E','H','I','J','K'] }, next: 92 },
    { id: 81, a: { kind:'rank', g:'D', r:1 }, b: { kind:'third', allowed:['B','E','F','I','J'] }, next: 94 },
    { id: 82, a: { kind:'rank', g:'G', r:1 }, b: { kind:'third', allowed:['A','E','H','I','J'] }, next: 94 },
    { id: 83, a: { kind:'rank', g:'K', r:2 }, b: { kind:'rank', g:'L', r:2 }, next: 93 },
    { id: 84, a: { kind:'rank', g:'H', r:1 }, b: { kind:'rank', g:'J', r:2 }, next: 93 },
    { id: 85, a: { kind:'rank', g:'B', r:1 }, b: { kind:'third', allowed:['E','F','G','I','J'] }, next: 96 },
    { id: 86, a: { kind:'rank', g:'J', r:1 }, b: { kind:'rank', g:'H', r:2 }, next: 95 },
    { id: 87, a: { kind:'rank', g:'K', r:1 }, b: { kind:'third', allowed:['D','E','I','J','L'] }, next: 96 },
    { id: 88, a: { kind:'rank', g:'D', r:2 }, b: { kind:'rank', g:'G', r:2 }, next: 95 }
  ];
var r16 = [
  { id: 89, from:[74,77], next:97 }, { id: 90, from:[73,75], next:97 },
  { id: 91, from:[76,78], next:99 }, { id: 92, from:[79,80], next:99 },
  { id: 93, from:[83,84], next:98 }, { id: 94, from:[81,82], next:98 },
  { id: 95, from:[86,88], next:100 }, { id: 96, from:[85,87], next:100 }
];
var qf = [
  { id: 97, from:[89,90], next:101 }, { id: 98, from:[93,94], next:101 },
  { id: 99, from:[91,92], next:102 }, { id: 100, from:[95,96], next:102 }
];
  var sf = [ { id: 101, from:[97,98], next:103 }, { id: 102, from:[99,100], next:103 } ];
  var finalMatch = { id: 103, from:[101,102] };
  var thirdPlace = { id: 104, from:[101,102], loserOf:true }; // SF losers meet here

  // The 8 R32 matches that contain a "best third-placed team" slot:
  var thirdSlots = r32.filter(function (m) { return m.a.kind === 'third' || m.b.kind === 'third'; })
                       .map(function (m) { return m.id; }); // [74,77,79,80,81,82,85,87]

  // Points per round for a correctly-predicted PARTICIPANT of that round.
  var POINTS = {
    r32: 1,        // reached Round of 32
    r16: 2,        // reached Round of 16
    qf: 3.5,       // reached Quarter-finals
    sf: 5,         // reached Semi-finals
    bronze: 6,     // played the 3rd-place match (SF losers)
    final: 6,      // played the Final (SF winners)
    champion: 7.5  // won the tournament
  };

  // ---- Helpers -------------------------------------------------------------
  function emptyPicks() {
    return { groups: {}, thirds: {}, winners: {} };
  }
  function byId(arr) { var o = {}; arr.forEach(function (m) { o[m.id] = m; }); return o; }
  var R16 = byId(r16), QF = byId(qf), R32 = byId(r32);

  // Team currently sitting in a given slot, based on the user's picks.
  function rankTeam(picks, g, r) {
    var ord = picks.groups && picks.groups[g];
    return (ord && ord[r - 1]) || null;
  }
  function slotTeam(picks, matchId, side) {
    var m = R32[matchId]; var slot = m[side];
    if (slot.kind === 'rank') return rankTeam(picks, slot.g, slot.r);
    return (picks.thirds && picks.thirds[matchId]) || null; // third slot
  }

  // Winner of a match given picks; null if not decided / not yet resolvable.
  function winnerOf(picks, matchId) {
    return (picks.winners && picks.winners[matchId]) || null;
  }
  // The two teams contesting a match (R32 from seeding, later rounds from winners;
  // match 104 from the two SF losers).
  function teamsOf(picks, matchId) {
    if (R32[matchId]) return [slotTeam(picks, matchId, 'a'), slotTeam(picks, matchId, 'b')];
    if (matchId === 104) {
      return [101, 102].map(function (sfId) {
        var t = teamsOf(picks, sfId), w = winnerOf(picks, sfId);
        if (!w) return null;
        return t[0] === w ? t[1] : t[0]; // the loser
      });
    }
    var m = R16[matchId] || QF[matchId] ||
            (matchId === 101 || matchId === 102 ? sf.filter(function (x){return x.id===matchId;})[0]
            : (matchId === 103 ? finalMatch : null));
    if (!m) return [null, null];
    return m.from.map(function (src) { return winnerOf(picks, src); });
  }

  // Sets of teams the user predicts to REACH each round.
  function predictedSets(picks) {
    var sets = { r32:new Set(), r16:new Set(), qf:new Set(), sf:new Set(),
                 bronze:new Set(), final:new Set(), champion:new Set() };
    r32.forEach(function (m) {
      ['a','b'].forEach(function (s){ var t = slotTeam(picks, m.id, s); if (t) sets.r32.add(t); });
      var w = winnerOf(picks, m.id); if (w) sets.r16.add(w);
    });
    r16.forEach(function (m){ var w = winnerOf(picks, m.id); if (w) sets.qf.add(w); });
    qf.forEach(function (m){ var w = winnerOf(picks, m.id); if (w) sets.sf.add(w); });
    sf.forEach(function (m){
      var t = teamsOf(picks, m.id), w = winnerOf(picks, m.id);
      if (w) sets.final.add(w);                       // finalists = SF winners
      if (w && t[0] && t[1]) sets.bronze.add(t[0] === w ? t[1] : t[0]); // SF losers
    });
    var champ = winnerOf(picks, 103); if (champ) sets.champion.add(champ);
    return sets;
  }

  function inter(a, b) { var n = 0; a.forEach(function (x){ if (b.has(x)) n++; }); return n; }

  // Score `picks` against the official `actual` bracket (same shape).
  // Returns { total, breakdown:{r32,r16,qf,sf,bronze,final,champion} }.
  function score(picks, actual) {
    var P = predictedSets(picks), A = predictedSets(actual);
    var bd = {
      r32:     inter(P.r32, A.r32)         * POINTS.r32,
      r16:     inter(P.r16, A.r16)         * POINTS.r16,
      qf:      inter(P.qf, A.qf)           * POINTS.qf,
      sf:      inter(P.sf, A.sf)           * POINTS.sf,
      bronze:  inter(P.bronze, A.bronze)   * POINTS.bronze,
      final:   inter(P.final, A.final)     * POINTS.final,
      champion:inter(P.champion, A.champion) * POINTS.champion
    };
    var total = 0; for (var k in bd) total += bd[k];
    return { total: Math.round(total * 100) / 100, breakdown: bd };
  }

  // Is the bracket fully filled (every group ranked, 8 thirds set, every match decided)?
  function isComplete(picks) {
    for (var i = 0; i < groupLetters.length; i++) {
      var ord = picks.groups[groupLetters[i]];
      if (!ord || ord.length !== 4) return false;
    }
    for (var t = 0; t < thirdSlots.length; t++) if (!picks.thirds[thirdSlots[t]]) return false;
    var ids = r32.map(function(m){return m.id;})
      .concat(r16.map(function(m){return m.id;}))
      .concat(qf.map(function(m){return m.id;}))
      .concat([101,102,103,104]);
    for (var j = 0; j < ids.length; j++) if (!picks.winners[ids[j]]) return false;
    return true;
  }

  var WC = {
    groups: groups, iso: iso, groupLetters: groupLetters,
    r32: r32, r16: r16, qf: qf, sf: sf, finalMatch: finalMatch, thirdPlace: thirdPlace,
    thirdSlots: thirdSlots, POINTS: POINTS, byId: byId, R32: R32, R16: R16, QF: QF,
    emptyPicks: emptyPicks, rankTeam: rankTeam, slotTeam: slotTeam, winnerOf: winnerOf,
    teamsOf: teamsOf, predictedSets: predictedSets, score: score, isComplete: isComplete
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = WC;
  root.WC = WC;
})(typeof window !== 'undefined' ? window : globalThis);
