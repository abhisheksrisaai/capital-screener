import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  companyFallbackReducer,
  createCompanyFallbackState,
} from '../state/companyMachine';
import { apiErrorMessage, getCompany, getFinancials } from '../services/api';

export function useCompanyFallback(companyId) {
  const [state, dispatch] = useReducer(
    companyFallbackReducer,
    companyId,
    createCompanyFallbackState,
  );
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    dispatch({ type: 'start', companyId });

    Promise.allSettled([
      getCompany(companyId, { signal: controller.signal }),
      getFinancials(companyId, { signal: controller.signal }),
    ]).then(([companyResult, financialsResult]) => {
      if (requestRef.current !== requestId) return;

      if (companyResult.status === 'rejected') {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'fail',
          companyId,
          error: apiErrorMessage(companyResult.reason, 'Company not found'),
        });
        return;
      }

      const company = companyResult.value;
      dispatch({
        type: 'succeed',
        companyId,
        company,
        financials:
          financialsResult.status === 'fulfilled' ? financialsResult.value : [],
        filings: company.filings || [],
      });
    });

    return () => {
      requestRef.current += 1;
      controller.abort();
    };
  }, [companyId, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  return { state, reload };
}
