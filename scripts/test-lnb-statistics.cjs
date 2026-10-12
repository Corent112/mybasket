const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function moduleOf(path, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL, AbortSignal, Date, Map, Number, Error, ...globals });
  return exports;
}
const model = moduleOf('lib/lnb-statistics-model.ts');
// The public API uses these same field names for format=average and format=total.
const average = { person: { external_id: 10669, first_name: 'Keelyan', family_name: 'Nzapakete', dob: '2010-04-09T00:00:00.000Z', age: 16 }, team: { external_id: 1906 }, s_games: 2, s_points_average: 3.5, s_minutes_average: 11.8 };
const total = { ...average, s_points_average: 7, s_minutes_average: 23.6, s_efficiency_average: 8, s_plus_minus_points: 4 };
const roster = { person: average.person, player_role: { shirt_number: '13' } };
const calls = [];
const fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, body });
  const data = url.includes('/api/token') ? { token: 'test-only' } : { status: true, data: url.includes('getDivisionCompetitionByYear') ? [{ external_id: 319, competition_abbrev: 'ESPA', year: '2026', competition_name: 'Espoirs ÉLITE' }] : url.includes('getRoster') ? [roster] : url.includes('getPersonCriterion') ? [body.format === 'total' ? total : average, { ...average, team: { external_id: 999 } }] : { general: { competition: { competition_abbrev: 'ESPA' } }, general_game_log: [{ external_id: 30690 }, { external_id: 30698 }, { external_id: 30708 }] } };
  return { ok: true, json: async () => data };
};
const service = moduleOf('lib/lnb-player-stats.ts', { fetch });
(async () => {
  const data = await service.readLnbPlayerStats('https://lnb.fr/fr/calendar?abbrev=ESPA&yid=2026&tid=1906');
  assert.equal(data.players.length, 1, 'Never include another club');
  const row = data.players[0];
  assert.equal(row.seasonTotals.s_points_average, 7);
  const before = calls.length;
  const detail = await service.readLnbPlayerStats(data.sourceUrl, 10669);
  assert.equal(calls.length - before, 1, 'Reuse season cache for individual details');
  assert.equal(detail.detail.general_game_log.length, 3);
  const empty = { totals: Object.fromEntries(Object.keys(model.lnbFieldMap).map(k => [k, 0])), games: 0, totalMinutes: 0, matches: [] };
  const official = model.combineLnbSeasons(empty, [row]);
  assert.equal(official.games, 2, 'Three game logs must not become three played games');
  assert.equal(official.averages.pts, 3.5);
  assert.equal(official.averageMinutes, 11.8);
  assert.equal(official.evaluationAverage, 4);
  const native = { ...empty, games: 1, totalMinutes: 20, totals: { ...empty.totals, pts: 10 }, matches: [{ present: true, eval: 9, plusMinus: null }] };
  const combined = model.combineLnbSeasons(native, [row]);
  assert.equal(combined.averages.pts, 5.67, 'Weight averages using exact totals and played games');
  assert.equal(combined.games, 3);
  assert.equal(combined.matches.length, 1, 'Season totals are never fake individual matches');
  assert.equal(combined.plusMinusAverage, null, 'Missing plus-minus remains unknown');
  assert(model.isCoveredLnbMatch({ match_category: 'championship', match_date: '2026-10-03' }, { year: 2026 }));
  assert(!model.isCoveredLnbMatch({ match_category: 'friendly', match_date: '2026-10-03' }, { year: 2026 }));
  assert(!model.isCoveredLnbMatch({ match_category: 'championship', match_date: '2025-10-03' }, { year: 2026 }));
  const identity = model.fillLnbIdentity({ num: 0, photo: 'coach.png', dob: '', taille: 'Coach height' }, row);
  assert.equal(identity.num, 0);
  assert.equal(identity.photo, 'coach.png');
  assert.equal(identity.dob, '2010-04-09');
  assert.equal(identity.taille, 'Coach height');
  assert.equal(service.resolveLnbPlayer(row.person, [{ id: 'existing', first_name: 'Coach edit', metadata: { lnbExternalId: 10669 } }], {}), 'existing');
  await assert.rejects(service.readLnbPlayerStats('https://other.invalid/?abbrev=ESPA&yid=2026&tid=1906'));
  console.log('PASS LNB source isolation, season totals, weighted averages, cached details, editable identity, and missing values.');
})().catch(error => { console.error(error); process.exitCode = 1; });
