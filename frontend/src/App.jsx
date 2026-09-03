import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ScreenerPage from './pages/ScreenerPage';
import CompanyDetail from './pages/CompanyDetail';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="font-semibold text-lg">Capital Screener</a>
            <span className="text-xs text-slate-500">Internal Research Tool</span>
          </div>
        </header>
        <Routes>
          <Route path="/" element={<ScreenerPage />} />
          <Route path="/company/:id" element={<CompanyDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
