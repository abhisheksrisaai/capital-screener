export const SCREENER_SORT_KEYS = Object.freeze([
  'name',
  'sector',
  'latest_revenue',
  'revenue_growth_pct',
  'pat_margin',
  'latest_debt_to_equity',
  'risk_flag',
  'score',
]);

export const SCREENER_RISK_VALUES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

const DEFAULTS = Object.freeze({
  query: '',
  sector: '',
  risk: '',
  minGrowth: '',
  sortKey: 'score',
  sortDir: 'desc',
});

export function createScreenerState(overrides = {}) {
  return { ...DEFAULTS, ...overrides };
}

export function parseScreenerState(params) {
  const get = (key) => params.get(key) || '';
  const sortKey = get('sort');
  const sortDir = get('dir');
  const risk = get('risk');

  return createScreenerState({
    query: get('q'),
    sector: get('sector'),
    risk: SCREENER_RISK_VALUES.includes(risk) ? risk : '',
    minGrowth: get('min'),
    sortKey: SCREENER_SORT_KEYS.includes(sortKey) ? sortKey : DEFAULTS.sortKey,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULTS.sortDir,
  });
}

export function writeScreenerState(params, state) {
  const next = new URLSearchParams(params);
  const entries = [
    ['q', state.query],
    ['sector', state.sector],
    ['risk', state.risk],
    ['min', state.minGrowth],
    ['sort', state.sortKey === DEFAULTS.sortKey ? '' : state.sortKey],
    ['dir', state.sortDir === DEFAULTS.sortDir ? '' : state.sortDir],
  ];

  for (const [key, value] of entries) {
    if (value) next.set(key, value);
    else next.delete(key);
  }

  return next;
}
