import { createContext, useCallback, useContext, useMemo } from 'react';
import { useResource } from '../hooks/useResource';
import { apiErrorMessage, getAnalyticsOverview } from '../services/api';
import { resourceSelectors } from '../state/resourceMachine';

const OverviewContext = createContext(null);

export function OverviewProvider({ children }) {
  const loadOverview = useCallback(async ({ signal }) => {
    try {
      return await getAnalyticsOverview({ signal });
    } catch (error) {
      throw new Error(
        apiErrorMessage(error, 'Could not load the analytics workspace.'),
      );
    }
  }, []);

  const { state, reload } = useResource(loadOverview);

  const value = useMemo(
    () => ({
      status: state.status,
      data: state.data,
      error: state.error,
      isInitialLoading: resourceSelectors.isInitialLoading(state),
      isRefreshing: resourceSelectors.isRefreshing(state),
      isStale: resourceSelectors.isStale(state),
      isBusy: resourceSelectors.isBusy(state),
      showBlockingError: resourceSelectors.showBlockingError(state),
      reload,
    }),
    [reload, state],
  );

  return <OverviewContext.Provider value={value}>{children}</OverviewContext.Provider>;
}

export function useOverview() {
  const context = useContext(OverviewContext);
  if (!context) throw new Error('useOverview must be used within OverviewProvider');
  return context;
}
