import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import { OverviewProvider } from './context/OverviewContext';
import AnalyticsPage from './pages/AnalyticsPage';
import AskPage from './pages/AskPage';
import CompanyDetail from './pages/CompanyDetail';
import DataPage from './pages/DataPage';
import ScreenerPage from './pages/ScreenerPage';

const PAGE_TITLES = {
  '/': 'Market overview',
  '/screener': 'Screener',
  '/data': 'Data room',
  '/ask': 'Ask Capital',
};

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  return null;
}

function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith('/company/')) return;
    document.title = `${PAGE_TITLES[pathname] || 'Market overview'} — Capital Screener`;
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <OverviewProvider>
      <AppShell>
        <ScrollToTop />
        <RouteTitle />
        <Routes>
          <Route path="/" element={<AnalyticsPage />} />
          <Route path="/screener" element={<ScreenerPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/company/:id" element={<CompanyDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </OverviewProvider>
  );
}
