export const RESOURCE_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  REFRESHING: 'refreshing',
  STALE: 'stale',
  ERROR: 'error',
});

export function createResourceState(overrides = {}) {
  return {
    status: RESOURCE_STATUS.IDLE,
    data: null,
    error: null,
    requestId: 0,
    ...overrides,
  };
}

export function resourceReducer(state, action) {
  switch (action.type) {
    case 'start':
      return {
        ...state,
        status:
          state.data === null || state.data === undefined
            ? RESOURCE_STATUS.LOADING
            : RESOURCE_STATUS.REFRESHING,
        error: null,
        requestId: action.requestId ?? state.requestId,
      };
    case 'succeed':
      if (action.requestId !== undefined && action.requestId !== state.requestId) return state;
      return {
        ...state,
        status: RESOURCE_STATUS.READY,
        data: action.data,
        error: null,
      };
    case 'fail':
      if (action.requestId !== undefined && action.requestId !== state.requestId) return state;
      return {
        ...state,
        status:
          state.data === null || state.data === undefined
            ? RESOURCE_STATUS.ERROR
            : RESOURCE_STATUS.STALE,
        error: action.error || 'Request failed',
      };
    case 'reset':
      return createResourceState();
    default:
      return state;
  }
}

export const resourceSelectors = {
  hasData: (state) => state.data !== null && state.data !== undefined,
  isInitialLoading: (state) =>
    state.data === null &&
    (state.status === RESOURCE_STATUS.IDLE || state.status === RESOURCE_STATUS.LOADING),
  isRefreshing: (state) => state.status === RESOURCE_STATUS.REFRESHING,
  isStale: (state) => state.status === RESOURCE_STATUS.STALE,
  isBusy: (state) =>
    state.status === RESOURCE_STATUS.LOADING || state.status === RESOURCE_STATUS.REFRESHING,
  showBlockingError: (state) =>
    state.data === null && state.status === RESOURCE_STATUS.ERROR,
};
