export const CHAT_STATUS = Object.freeze({
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  READY: 'ready',
  ERROR: 'error',
});

export function createChatState(scopeKey = 'universe') {
  return {
    scopeKey,
    status: CHAT_STATUS.IDLE,
    messages: [],
    draft: '',
    error: null,
    pending: null,
    failedText: null,
  };
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'scope':
      if (action.scopeKey === state.scopeKey) return state;
      return createChatState(action.scopeKey);
    case 'draft':
      return { ...state, draft: action.value };
    case 'submit': {
      if (state.status === CHAT_STATUS.SUBMITTING) return state;
      const text = String(action.text || '').trim();
      if (!text) return state;
      const userMessage = {
        id: action.userMessageId,
        role: 'user',
        content: text,
      };
      return {
        ...state,
        status: CHAT_STATUS.SUBMITTING,
        draft: '',
        error: null,
        failedText: null,
        pending: { requestId: action.requestId, text },
        messages: [...state.messages, userMessage],
      };
    }
    case 'retry':
      if (
        state.status === CHAT_STATUS.SUBMITTING ||
        !state.failedText
      ) {
        return state;
      }
      return {
        ...state,
        status: CHAT_STATUS.SUBMITTING,
        error: null,
        pending: { requestId: action.requestId, text: state.failedText },
        failedText: null,
      };
    case 'succeed':
      if (!state.pending || state.pending.requestId !== action.requestId) return state;
      return {
        ...state,
        status: CHAT_STATUS.READY,
        pending: null,
        error: null,
        failedText: null,
        messages: [...state.messages, action.message],
      };
    case 'fail':
      if (!state.pending || state.pending.requestId !== action.requestId) return state;
      return {
        ...state,
        status: CHAT_STATUS.ERROR,
        pending: null,
        error: action.error || 'Could not get an answer.',
        failedText: state.pending.text,
      };
    case 'clear':
      return createChatState(state.scopeKey);
    default:
      return state;
  }
}

export const chatSelectors = {
  isEmpty: (state) => state.messages.length === 0,
  isSubmitting: (state) => state.status === CHAT_STATUS.SUBMITTING,
  canSubmit: (state) =>
    state.status !== CHAT_STATUS.SUBMITTING && Boolean(state.draft.trim()),
  canRetry: (state) =>
    state.status === CHAT_STATUS.ERROR && Boolean(state.failedText),
};
