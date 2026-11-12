import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  CHAT_STATUS,
  chatReducer,
  chatSelectors,
  createChatState,
} from '../state/chatMachine';
import { apiErrorMessage, askAnalytics } from '../services/api';

function messageId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useChat({ companyId = null } = {}) {
  const scopeKey = companyId || 'universe';
  const [state, dispatch] = useReducer(chatReducer, scopeKey, createChatState);
  const requestRef = useRef(0);
  const controllerRef = useRef(null);
  const busyRef = useRef(false);

  const cancel = useCallback(() => {
    requestRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    busyRef.current = false;
  }, []);

  useEffect(() => {
    cancel();
    dispatch({ type: 'scope', scopeKey });
  }, [cancel, scopeKey]);

  useEffect(() => cancel, [cancel]);

  const request = useCallback(
    async (text, { retry = false } = {}) => {
      const trimmed = String(text || '').trim();
      if (!trimmed || busyRef.current) return;

      busyRef.current = true;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (retry) {
        dispatch({ type: 'retry', requestId });
      } else {
        dispatch({
          type: 'submit',
          requestId,
          text: trimmed,
          userMessageId: messageId('u'),
        });
      }

      const history = (
        retry
          ? state.messages
          : [...state.messages, { role: 'user', content: trimmed }]
      )
        .slice(-6)
        .map((message) => ({ role: message.role, content: message.content }));

      try {
        const result = await askAnalytics(trimmed, {
          companyId,
          history,
          signal: controller.signal,
        });
        if (requestRef.current !== requestId) return;
        dispatch({
          type: 'succeed',
          requestId,
          message: {
            id: messageId('a'),
            role: 'assistant',
            content: result.answer,
            result,
          },
        });
      } catch (error) {
        if (controller.signal.aborted || requestRef.current !== requestId) return;
        dispatch({
          type: 'fail',
          requestId,
          error: apiErrorMessage(error, 'Could not get an answer. Try again in a moment.'),
        });
      } finally {
        if (requestRef.current === requestId) {
          busyRef.current = false;
          controllerRef.current = null;
        }
      }
    },
    [companyId, state.messages],
  );

  const submit = useCallback(
    (raw) => {
      const text = String(raw ?? state.draft ?? '').trim();
      if (!text || state.status === CHAT_STATUS.SUBMITTING) return;
      request(text);
    },
    [request, state.draft, state.status],
  );

  const retry = useCallback(() => {
    if (!state.failedText || state.status === CHAT_STATUS.SUBMITTING) return;
    request(state.failedText, { retry: true });
  }, [request, state.failedText, state.status]);

  const clear = useCallback(() => {
    cancel();
    dispatch({ type: 'clear' });
  }, [cancel]);

  const setDraft = useCallback((value) => {
    dispatch({ type: 'draft', value });
  }, []);

  return {
    state,
    scopeKey,
    submit,
    retry,
    clear,
    setDraft,
    cancel,
    isEmpty: chatSelectors.isEmpty(state),
    isSubmitting: chatSelectors.isSubmitting(state),
    canSubmit: chatSelectors.canSubmit(state),
    canRetry: chatSelectors.canRetry(state),
  };
}
