import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESOURCE_STATUS,
  createResourceState,
  resourceReducer,
  resourceSelectors,
} from '../src/state/resourceMachine.js';

test('a first load moves idle to loading', () => {
  const state = resourceReducer(createResourceState(), {
    type: 'start',
    requestId: 1,
  });

  assert.equal(state.status, RESOURCE_STATUS.LOADING);
  assert.equal(resourceSelectors.isInitialLoading(state), true);
});

test('refreshing keeps the previous data visible', () => {
  const data = { kpis: { companies: 18 } };
  const state = resourceReducer(
    createResourceState({ status: RESOURCE_STATUS.READY, data, requestId: 1 }),
    { type: 'start', requestId: 2 },
  );

  assert.equal(state.status, RESOURCE_STATUS.REFRESHING);
  assert.deepEqual(state.data, data);
  assert.equal(resourceSelectors.isRefreshing(state), true);
  assert.equal(resourceSelectors.isInitialLoading(state), false);
});

test('a successful refresh returns to ready', () => {
  const next = { kpis: { companies: 19 } };
  const state = resourceReducer(
    createResourceState({
      status: RESOURCE_STATUS.REFRESHING,
      data: { kpis: { companies: 18 } },
      requestId: 2,
    }),
    { type: 'succeed', requestId: 2, data: next },
  );

  assert.equal(state.status, RESOURCE_STATUS.READY);
  assert.deepEqual(state.data, next);
  assert.equal(state.error, null);
});

test('a failed refresh becomes stale instead of blanking the view', () => {
  const data = { kpis: { companies: 18 } };
  const state = resourceReducer(
    createResourceState({
      status: RESOURCE_STATUS.REFRESHING,
      data,
      requestId: 2,
    }),
    { type: 'fail', requestId: 2, error: 'The API is busy' },
  );

  assert.equal(state.status, RESOURCE_STATUS.STALE);
  assert.deepEqual(state.data, data);
  assert.equal(state.error, 'The API is busy');
  assert.equal(resourceSelectors.isStale(state), true);
});

test('a failed first load is a blocking error', () => {
  const state = resourceReducer(
    createResourceState({ status: RESOURCE_STATUS.LOADING, requestId: 1 }),
    { type: 'fail', requestId: 1, error: 'Network error' },
  );

  assert.equal(state.status, RESOURCE_STATUS.ERROR);
  assert.equal(resourceSelectors.showBlockingError(state), true);
});

test('late responses from an old request are ignored', () => {
  const refreshing = createResourceState({
    status: RESOURCE_STATUS.REFRESHING,
    data: { version: 1 },
    requestId: 2,
  });
  const stale = resourceReducer(refreshing, {
    type: 'succeed',
    requestId: 1,
    data: { version: 0 },
  });

  assert.equal(stale, refreshing);
});

test('reset returns the machine to idle', () => {
  const state = resourceReducer(
    createResourceState({ status: RESOURCE_STATUS.ERROR, error: 'Failed' }),
    { type: 'reset' },
  );

  assert.equal(state.status, RESOURCE_STATUS.IDLE);
  assert.equal(state.error, null);
});
