import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, TrendingUp } from 'lucide-react';
import { getCompanies, getRanking, getSectors } from '../services/api';

function RiskBadge({ flag }) {
  const cls = flag === 'LOW' ? 'badge-low' : flag === 'HIGH' ? 'badge-high' : 'badge-medium';
  return <span className={cls}>{flag}</span>;
}

export default function ScreenerPage() {
  const [companies, setCompanies] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [filters, setFilters] = useState({ sector: '', risk_flag: '', min_growth: '', max_growth: '' });
  const [sortKey, setSortKey] = useState('latest_revenue');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSectors().then(setSectors).catch(() => {});
    getRanking().then(setRanking).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.sector) params.sector = filters.sector;
    if (filters.risk_flag) params.risk_flag = filters.risk_flag;
    if (filters.min_growth) params.min_growth = Number(filters.min_growth);
    if (filters.max_growth) params.max_growth = Number(filters.max_growth);
    getCompanies(params)
      .then((d) => setCompanies(d.companies || []))
      .finally(() => setLoading(false));
  }, [filters]);

  const sorted = [...companies].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Capital Screener</h1>
        <p className="text-slate-400 mt-1">Indian SME universe — filter, rank, and drill into filings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="card p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Sector</label>
              <select value={filters.sector} onChange={(e) => setFilters({ ...filters, sector: e.target.value })}>
                <option value="">All</option>
                {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Risk</label>
              <select value={filters.risk_flag} onChange={(e) => setFilters({ ...filters, risk_flag: e.target.value })}>
                <option value="">All</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Min Growth %</label>
              <input type="number" value={filters.min_growth} onChange={(e) => setFilters({ ...filters, min_growth: e.target.value })} className="w-24" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Max Growth %</label>
              <input type="number" value={filters.max_growth} onChange={(e) => setFilters({ ...filters, max_growth: e.target.value })} className="w-24" />
            </div>
          </div>

          <div className="card overflow-hidden">
            {loading ? (
              <p className="p-8 text-center text-slate-400">Loading...</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Sector</th>
                    <th className="cursor-pointer" onClick={() => toggleSort('latest_revenue')}>
                      Revenue (Cr) <ArrowUpDown className="inline w-3 h-3" />
                    </th>
                    <th className="cursor-pointer" onClick={() => toggleSort('revenue_growth_pct')}>
                      Growth % <ArrowUpDown className="inline w-3 h-3" />
                    </th>
                    <th>Risk</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr key={c.id} className="cursor-pointer">
                      <td>
                        <Link to={`/company/${c.id}`} className="text-blue-400 hover:underline font-medium">
                          {c.name}
                        </Link>
                        <span className="text-slate-500 text-xs ml-2">{c.ticker}</span>
                      </td>
                      <td className="text-slate-400">{c.sector}</td>
                      <td>{c.latest_revenue?.toFixed(1)}</td>
                      <td className={c.revenue_growth_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {c.revenue_growth_pct?.toFixed(1)}%
                      </td>
                      <td><RiskBadge flag={c.risk_flag} /></td>
                      <td className="text-xs text-slate-500 uppercase">{c.data_source || 'seed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card p-4 h-fit">
          <h2 className="font-semibold flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Agent Ranking
          </h2>
          <p className="text-xs text-slate-500 mb-4">40% growth + 30% scale + 30% risk</p>
          <div className="space-y-3">
            {ranking.slice(0, 10).map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 w-6 text-sm">#{r.rank}</span>
                  <div className="flex-1 min-w-0">
                    <Link to={`/company/${r.id}`} className="text-sm font-medium hover:text-blue-400 truncate block">
                      {r.name}
                    </Link>
                    <div className="h-1.5 bg-slate-800 rounded-full mt-1">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(r.score, 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{r.score}</span>
                </div>
                {r.breakdown && (
                  <p className="text-[11px] text-slate-500 ml-9 mt-1">
                    G {r.breakdown.growth_contrib} · S {r.breakdown.scale_contrib} · R {r.breakdown.risk_contrib}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
