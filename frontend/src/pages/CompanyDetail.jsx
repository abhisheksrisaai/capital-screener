import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { downloadMemo, getCompany, getFinancials } from '../services/api';
import QAChat from '../components/QAChat';

function RiskBadge({ flag }) {
  const cls = flag === 'LOW' ? 'badge-low' : flag === 'HIGH' ? 'badge-high' : 'badge-medium';
  return <span className={cls}>{flag}</span>;
}

export default function CompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [financials, setFinancials] = useState([]);
  const [memoLoading, setMemoLoading] = useState(false);

  useEffect(() => {
    getCompany(id).then(setCompany).catch(() => {});
    getFinancials(id).then(setFinancials).catch(() => {});
  }, [id]);

  const handleMemo = async () => {
    setMemoLoading(true);
    try {
      const res = await downloadMemo(id);
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}_memo.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Memo generation failed');
    } finally {
      setMemoLoading(false);
    }
  };

  if (!company) return <p className="p-8 text-center text-slate-400">Loading...</p>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link to="/" className="text-slate-400 hover:text-white flex items-center gap-2 mb-6 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to screener
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-slate-400">{company.sector} · BSE {company.bse_code}</p>
        </div>
        <button onClick={handleMemo} disabled={memoLoading} className="btn-primary flex items-center gap-2">
          <Download className="w-4 h-4" />
          {memoLoading ? 'Generating...' : 'Generate Memo PDF'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Revenue', value: `₹${company.latest_revenue?.toFixed(1)} Cr` },
          { label: 'Growth', value: `${company.revenue_growth_pct?.toFixed(1)}%` },
          { label: 'Risk', value: <RiskBadge flag={company.risk_flag} /> },
          { label: 'Ticker', value: company.ticker },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <p className="text-xs text-slate-400">{kpi.label}</p>
            <p className="text-lg font-semibold mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card p-4">
          <h3 className="font-medium mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={financials}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="fiscal_year" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none' }} />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-4">
          <h3 className="font-medium mb-4">PAT Margin Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={financials}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="fiscal_year" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none' }} />
              <Bar dataKey="pat_margin" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {company.filings?.length > 0 && (
        <div className="card p-4 mb-8">
          <h3 className="font-medium flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-blue-400" /> Filings
          </h3>
          <ul className="space-y-2">
            {company.filings.map((f) => (
              <li key={f.id} className="text-sm text-slate-400">
                {f.title} ({f.fiscal_year}) — {f.page_count} pages
              </li>
            ))}
          </ul>
        </div>
      )}

      <QAChat companyId={id} />
    </div>
  );
}
