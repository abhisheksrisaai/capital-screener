import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseScreenerState,
  writeScreenerState,
} from '../src/state/screenerState.js';

test('empty params produce the default view', () => {
  const state = parseScreenerState(new URLSearchParams());

  assert.deepEqual(state, {
    query: '',
    sector: '',
    risk: '',
    minGrowth: '',
    sortKey: 'score',
    sortDir: 'desc',
  });
});

test('valid URL state round-trips', () => {
  const params = new URLSearchParams(
    'q=forge&sector=Industrials&risk=HIGH&min=5&sort=latest_revenue&dir=asc',
  );
  const state = parseScreenerState(params);
  const written = writeScreenerState(new URLSearchParams(), state);

  assert.equal(state.query, 'forge');
  assert.equal(state.sector, 'Industrials');
  assert.equal(state.risk, 'HIGH');
  assert.equal(state.minGrowth, '5');
  assert.equal(state.sortKey, 'latest_revenue');
  assert.equal(state.sortDir, 'asc');
  assert.deepEqual(parseScreenerState(written), state);
});

test('invalid sort and risk values fall back safely', () => {
  const state = parseScreenerState(
    new URLSearchParams('risk=CRITICAL&sort=market_cap&dir=sideways'),
  );

  assert.equal(state.risk, '');
  assert.equal(state.sortKey, 'score');
  assert.equal(state.sortDir, 'desc');
});

test('default sort options are omitted from the URL', () => {
  const written = writeScreenerState(
    new URLSearchParams('utm_source=agent'),
    parseScreenerState(new URLSearchParams('sort=score&dir=desc&q=risk')),
  );

  assert.equal(written.get('sort'), null);
  assert.equal(written.get('dir'), null);
  assert.equal(written.get('q'), 'risk');
  assert.equal(written.get('utm_source'), 'agent');
});
