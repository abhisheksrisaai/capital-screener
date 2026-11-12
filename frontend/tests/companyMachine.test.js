import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPANY_STATUS,
  MEMO_STATUS,
  companyFallbackReducer,
  createCompanyFallbackState,
  createMemoState,
  memoReducer,
} from '../src/state/companyMachine.js';

test('starting a new company clears the previous fallback immediately', () => {
  const ready = companyFallbackReducer(createCompanyFallbackState('hpl'), {
    type: 'succeed',
    companyId: 'hpl',
    company: { id: 'hpl', name: 'HPL' },
    financials: [{ revenue: 10 }],
    filings: [{ id: 'f1' }],
  });
  const loading = companyFallbackReducer(ready, {
    type: 'start',
    companyId: 'macpower',
  });

  assert.equal(loading.status, COMPANY_STATUS.LOADING);
  assert.equal(loading.companyId, 'macpower');
  assert.equal(loading.company, null);
  assert.equal(loading.financials.length, 0);
  assert.equal(loading.filings.length, 0);
});

test('a response for the previous company cannot overwrite the current one', () => {
  const loading = companyFallbackReducer(createCompanyFallbackState('hpl'), {
    type: 'start',
    companyId: 'macpower',
  });
  const late = companyFallbackReducer(loading, {
    type: 'succeed',
    companyId: 'hpl',
    company: { id: 'hpl' },
  });

  assert.equal(late, loading);
});

test('company fallback exposes a blocking error', () => {
  const state = companyFallbackReducer(
    companyFallbackReducer(createCompanyFallbackState('missing'), {
      type: 'start',
      companyId: 'missing',
    }),
    { type: 'fail', companyId: 'missing', error: 'Company not found' },
  );

  assert.equal(state.status, COMPANY_STATUS.ERROR);
  assert.equal(state.error, 'Company not found');
});

test('memo generation has explicit success and failure states', () => {
  const generating = memoReducer(createMemoState(), { type: 'start' });
  assert.equal(generating.status, MEMO_STATUS.GENERATING);

  const success = memoReducer(generating, { type: 'succeed' });
  assert.equal(success.status, MEMO_STATUS.SUCCESS);

  const failed = memoReducer(generating, {
    type: 'fail',
    error: 'Memo service unavailable',
  });
  assert.equal(failed.status, MEMO_STATUS.ERROR);
  assert.equal(failed.error, 'Memo service unavailable');
});
