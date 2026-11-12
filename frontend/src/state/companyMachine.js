export const COMPANY_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

export function createCompanyFallbackState(companyId = null) {
  return {
    companyId,
    status: COMPANY_STATUS.IDLE,
    company: null,
    financials: [],
    filings: [],
    error: null,
  };
}

export function companyFallbackReducer(state, action) {
  switch (action.type) {
    case 'start':
      return {
        ...createCompanyFallbackState(action.companyId),
        status: COMPANY_STATUS.LOADING,
      };
    case 'succeed':
      if (action.companyId !== state.companyId) return state;
      return {
        ...state,
        status: COMPANY_STATUS.READY,
        company: action.company,
        financials: action.financials || [],
        filings: action.filings || [],
        error: null,
      };
    case 'fail':
      if (action.companyId !== state.companyId) return state;
      return {
        ...state,
        status: COMPANY_STATUS.ERROR,
        error: action.error || 'Company not available',
      };
    case 'reset':
      return createCompanyFallbackState(action.companyId ?? state.companyId);
    default:
      return state;
  }
}

export const companySelectors = {
  isLoading: (state) =>
    state.status === COMPANY_STATUS.IDLE || state.status === COMPANY_STATUS.LOADING,
  isReady: (state) => state.status === COMPANY_STATUS.READY && Boolean(state.company),
  hasError: (state) => state.status === COMPANY_STATUS.ERROR,
};

export const MEMO_STATUS = Object.freeze({
  IDLE: 'idle',
  GENERATING: 'generating',
  SUCCESS: 'success',
  ERROR: 'error',
});

export function createMemoState() {
  return {
    status: MEMO_STATUS.IDLE,
    error: null,
  };
}

export function memoReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { status: MEMO_STATUS.GENERATING, error: null };
    case 'succeed':
      return { status: MEMO_STATUS.SUCCESS, error: null };
    case 'fail':
      return {
        status: MEMO_STATUS.ERROR,
        error: action.error || 'Memo generation failed',
      };
    case 'reset':
      return createMemoState();
    default:
      return state;
  }
}
