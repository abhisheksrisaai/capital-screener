import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  RESOURCE_STATUS,
  createResourceState,
  resourceReducer,
} from '../state/resourceMachine';

export function useResource(loader, { immediate = true } = {}) {
  const [state, dispatch] = useReducer(
    resourceReducer,
    immediate,
    (startImmediately) =>
      createResourceState({
        status: startImmediately ? RESOURCE_STATUS.LOADING : RESOURCE_STATUS.IDLE,
      }),
  );
  const loaderRef = useRef(loader);
  const requestRef = useRef(0);
  const controllerRef = useRef(null);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const cancel = useCallback(() => {
    requestRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const reload = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    dispatch({ type: 'start', requestId });

    try {
      const data = await loaderRef.current({ signal: controller.signal });
      if (requestRef.current !== requestId) return;
      dispatch({ type: 'succeed', requestId, data });
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== requestId) return;
      dispatch({
        type: 'fail',
        requestId,
        error: error?.message || 'Request failed',
      });
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    dispatch({ type: 'reset' });
  }, [cancel]);

  useEffect(() => {
    if (immediate) reload();
    return cancel;
  }, [cancel, immediate, reload]);

  return { state, reload, reset, cancel };
}
