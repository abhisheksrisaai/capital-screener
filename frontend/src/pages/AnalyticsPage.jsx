import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Download,
  FileText,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import ChartTooltip from '../components/ChartTooltip';
import ChatPanel from '../components/ChatPanel';
import {
  Delta,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  RiskPill,
  ScoreBar,
  SectionLink,
  Segmented,
  Skeleton,
  SourceBadge,
  StatusDot,
} from '../components/ui';
import { useOverview } from '../context/OverviewContext';
import {
  cn,
  companiesCsv,
  downloadCsv,
  fiscalShort,
  formatCr,
  formatDate,
  formatNumber,
  formatPct,
  formatSignedPct,
  sectorColor,
} from '../lib/format';

const METRICS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'ebitda', label: 'EBITDA' },
  { value: 'pat', label: 'PAT' },
  { value: 'margin', label: 'Margins' },
];

const METRIC_CONFIG = {
  revenue: {
    primaryKey: 'revenue',
    primaryLabel: 'Revenue',
    secondaryKey: 'ebitda',
    secondaryLabel: 'EBITDA',
    unit: 'currency',
    primaryColor: 'var(--chart-green)',
    secondaryColor: 'var(--chart-ochre)',
  },
  ebitda: {
    primaryKey: 'ebitda',
    primaryLabel: 'EBITDA',
    secondaryKey: 'pat',
    secondaryLabel: 'PAT',
    unit: 'currency',
    primaryColor: 'var(--chart-ochre)',
    secondaryColor: 'var(--chart-periwinkle)',
  },
  pat: {
    primaryKey: 'pat',
    primaryLabel: 'PAT',
    secondaryKey: 'ebitda',
    secondaryLabel: 'EBITDA',
    unit: 'currency',
    primaryColor: 'var(--chart-periwinkle)',
    secondaryColor: 'var(--chart-ochre)',
  },
  margin: {
    primaryKey: 'pat_margin',
    primaryLabel: 'PAT margin',
    secondaryKey: 'ebitda_margin',
    secondaryLabel: 'EBITDA margin',
    unit: 'percent',
    primaryColor: 'var(--chart-green)',
    secondaryColor: 'var(--chart-ochre)',
  },
};

function KpiBand({ data }) {
  const kpis = data.kpis;
  const riskCounts = data.risk.counts;
  const totalRisk = Math.max(1, riskCounts.LOW + riskCounts.MEDIUM + riskCounts.HIGH);

  return (
    <Panel className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        <div className="hero-card relative overflow-hidden p-4 md:p-5">
          <p className="label">Tracked revenue</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="numeric text-[clamp(22px,1.85vw,32px)] font-semibold leading-none tracking-tighter text-ink">
              ₹{formatNumber(kpis.tracked_revenue)}
            </span>
            <span className="text-[11px] font-medium text-muted">Cr</span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Delta value={kpis.like_for_like_growth_pct} />
            <span className="text-[10.5px] text-muted">like-for-like</span>
          </div>
        </div>

        <div className="bg-surface p-4 md:p-5">
          <p className="label">Median growth</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="numeric text-[clamp(22px,1.85vw,32px)] font-semibold leading-none tracking-tighter text-ink">
              {formatSignedPct(kpis.median_growth_pct)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[10.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-chart-ochre" />
            {kpis.negative_growth_count} companies shrinking
          </div>
        </div>

        <div className="bg-surface p-4 md:p-5">
          <p className="label">PAT margin</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="numeric text-[clamp(22px,1.85vw,32px)] font-semibold leading-none tracking-tighter text-ink">
              {formatPct(kpis.pat_margin_pct)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[10.5px] text-muted">
            <Delta value={kpis.pat_margin_pct - kpis.pat_margin_first_pct} suffix="vs FY22" />
          </div>
        </div>

        <div className="bg-surface p-4 md:p-5">
          <p className="label">High risk</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="numeric text-[clamp(22px,1.85vw,32px)] font-semibold leading-none tracking-tighter text-ink">
              {kpis.high_risk_count}
            </span>
            <span className="text-[11px] font-medium text-muted">of {kpis.companies}</span>
          </div>
          <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-track-strong">
            <span
              className="bg-brand transition-[width] duration-500"
              style={{ width: `${(riskCounts.LOW / totalRisk) * 100}%` }}
            />
            <span
              className="bg-chart-ochre transition-[width] duration-500"
              style={{ width: `${(riskCounts.MEDIUM / totalRisk) * 100}%` }}
            />
            <span
              className="bg-chart-coral transition-[width] duration-500"
              style={{ width: `${(riskCounts.HIGH / totalRisk) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted">
            {formatPct(kpis.high_risk_pct)} of the universe
          </p>
        </div>
      </div>
    </Panel>
  );
}

function SignalStrip({ signals }) {
  const tone = {
    warning: 'bg-chart-coral',
    positive: 'bg-brand',
    neutral: 'bg-chart-ochre',
  };
  return (
    <div className="grid gap-px overflow-hidden rounded-panel border border-line bg-line min-[1400px]:grid-cols-3">
      {signals.slice(0, 3).map((signal) => (
        <div key={signal.id} className="bg-surface p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone[signal.tone] || tone.neutral)} />
              <p className="truncate text-[12px] font-medium text-ink">{signal.title}</p>
            </div>
            <span className="numeric shrink-0 text-[11px] text-muted">{signal.metric}</span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">{signal.detail}</p>
        </div>
      ))}
    </div>
  );
}

function TrajectoryPanel({ data }) {
  const [metric, setMetric] = useState('revenue');
  const [allReporters, setAllReporters] = useState(false);
  const config = METRIC_CONFIG[metric];
  const kpis = data.kpis;

  const series = useMemo(() => {
    if (allReporters) {
      return data.series.filter((row) => row.companies >= 10);
    }
    return data.balanced_series;
  }, [allReporters, data.balanced_series, data.series]);

  const tickFormatter = (value) =>
    config.unit === 'percent' ? `${Math.round(value)}%` : `₹${(value / 1000).toFixed(value >= 1000 ? 1 : 0)}k`;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Universe trajectory"
        description={
          allReporters
            ? 'All reporters with at least 10 companies per year. Coverage varies by year.'
            : `Balanced panel · ${kpis.balanced_companies} companies with all five years of data.`
        }
        actions={<Segmented options={METRICS} value={metric} onChange={setMetric} label="Chart metric" />}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 px-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_190px]">
        <div>
          <div className="mb-3 flex items-center gap-4 text-[10.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: config.primaryColor }} />
              {config.primaryLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: config.secondaryColor }} />
              {config.secondaryLabel}
            </span>
          </div>
          <p className="sr-only">
            {`${allReporters ? 'All reporters' : 'Balanced panel'} ${config.primaryLabel.toLowerCase()} by fiscal year. `}
            {series
              .map(
                (row) =>
                  `${fiscalShort(row.fiscal_year)}: ${
                    config.unit === 'percent'
                      ? formatPct(row[config.primaryKey])
                      : formatCr(row[config.primaryKey])
                  }`,
              )
              .join('. ')}
          </p>
          <div className="h-[248px] w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              {config.unit === 'percent' ? (
                <LineChart data={series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="fiscal_year"
                    tickFormatter={fiscalShort}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={9}
                    tick={{ fill: 'var(--faint)', fontSize: 10.5 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={tickFormatter}
                    tick={{ fill: 'var(--faint)', fontSize: 10.5 }}
                    width={46}
                  />
                  <Tooltip
                    content={<ChartTooltip unit="percent" />}
                    cursor={{ stroke: 'var(--chart-cursor)', strokeDasharray: '3 3' }}
                  />
                  <ReferenceLine y={0} stroke="var(--chart-cursor)" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey={config.primaryKey}
                    name={config.primaryLabel}
                    stroke={config.primaryColor}
                    strokeWidth={2}
                    dot={{ r: 2.5, strokeWidth: 0, fill: config.primaryColor }}
                    activeDot={{ r: 4 }}
                    animationDuration={500}
                  />
                  <Line
                    type="monotone"
                    dataKey={config.secondaryKey}
                    name={config.secondaryLabel}
                    stroke={config.secondaryColor}
                    strokeWidth={1.6}
                    strokeDasharray="4 3"
                    dot={false}
                    animationDuration={500}
                  />
                </LineChart>
              ) : (
                <ComposedChart data={series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trajectory-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={config.primaryColor} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={config.primaryColor} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="fiscal_year"
                    tickFormatter={fiscalShort}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={9}
                    tick={{ fill: 'var(--faint)', fontSize: 10.5 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={tickFormatter}
                    tick={{ fill: 'var(--faint)', fontSize: 10.5 }}
                    width={46}
                  />
                  <Tooltip
                    content={<ChartTooltip unit="currency" />}
                    cursor={{ stroke: 'var(--chart-cursor)', strokeDasharray: '3 3' }}
                  />
                  <Area
                    type="monotone"
                    dataKey={config.primaryKey}
                    name={config.primaryLabel}
                    stroke={config.primaryColor}
                    strokeWidth={2}
                    fill="url(#trajectory-fill)"
                    activeDot={{ r: 4 }}
                    animationDuration={500}
                  />
                  <Line
                    type="monotone"
                    dataKey={config.secondaryKey}
                    name={config.secondaryLabel}
                    stroke={config.secondaryColor}
                    strokeWidth={1.6}
                    dot={false}
                    animationDuration={500}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 border-t border-line pt-4 lg:flex lg:flex-col lg:justify-center lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div>
            <p className="label">FY22–FY26 CAGR</p>
            <p className="numeric mt-1 text-[18px] font-semibold tracking-tighter text-ink lg:text-[22px]">
              {formatSignedPct(kpis.cagr_pct)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted">balanced panel</p>
          </div>
          <div className="border-l border-line pl-3 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-3">
            <p className="label">PAT margin</p>
            <p className="numeric mt-1 text-[18px] font-semibold tracking-tighter text-ink lg:text-[22px]">
              {formatPct(kpis.pat_margin_pct)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              from {formatPct(kpis.pat_margin_first_pct)} in FY22
            </p>
          </div>
          <div className="border-l border-line pl-3 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-3">
            <p className="label">Latest revenue</p>
            <p className="numeric mt-1 text-[18px] font-semibold tracking-tighter text-ink lg:text-[22px]">
              {formatCr(kpis.latest_revenue)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              {kpis.latest_reporters} of {kpis.companies} reporters
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 md:px-5">
        <p className="text-[10px] text-faint">
          Source: {formatNumber(kpis.financial_rows)} financial rows · {data.meta.fy_start}–{data.meta.fy_end}
        </p>
        <button
          type="button"
          onClick={() => setAllReporters((current) => !current)}
          className="text-[10.5px] font-medium text-brand transition-colors hover:text-brand-dark"
        >
          {allReporters ? 'Show balanced panel' : 'Show all reporters'}
        </button>
      </div>
    </Panel>
  );
}

function SectorPanel({ data }) {
  const sectors = data.sectors;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Sector mix"
        description="Latest reported revenue and profitability by sector."
        actions={<SectionLink to="/screener">Open screener</SectionLink>}
      />
      <div className="px-4 pt-4 md:px-5">
        <div className="flex h-2 overflow-hidden rounded-full bg-track-strong">
          {sectors.map((sector, index) => (
            <span
              key={sector.sector}
              title={`${sector.sector} · ${formatPct(sector.revenue_share_pct)}`}
              style={{
                width: `${sector.revenue_share_pct}%`,
                background: sectorColor(index),
              }}
            />
          ))}
        </div>
      </div>
      <div className="px-4 pb-2 pt-3 md:px-5">
        {sectors.map((sector, index) => (
          <Link
            key={sector.sector}
            to={`/screener?sector=${encodeURIComponent(sector.sector)}`}
            className="group grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: sectorColor(index) }} />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-ink transition-colors group-hover:text-brand">
                {sector.sector}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">
                {sector.companies} companies · {formatPct(sector.pat_margin)} PAT
              </p>
            </div>
            <span
              className={cn(
                'numeric text-[11px] font-medium',
                sector.growth_pct >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {formatSignedPct(sector.growth_pct)}
            </span>
            <span className="numeric flex items-center justify-end gap-2 text-[11.5px] text-ink">
              {formatCr(sector.revenue)}
              <ArrowUpRight className="h-3 w-3 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function RiskTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="min-w-[170px] rounded-[10px] border border-line bg-surface px-3 py-2 shadow-pop backdrop-blur">
      <p className="text-[11px] font-medium text-ink">{point.name}</p>
      <p className="mt-0.5 text-[9.5px] text-muted">{point.sector}</p>
      <div className="mt-2 space-y-1 text-[10.5px]">
        <div className="flex justify-between gap-4">
          <span className="text-muted">Growth</span>
          <span className={cn('numeric font-medium', point.growth >= 0 ? 'text-positive' : 'text-negative')}>
            {formatSignedPct(point.growth)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">PAT margin</span>
          <span className="numeric font-medium text-ink">{formatPct(point.margin)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Revenue</span>
          <span className="numeric font-medium text-ink">{formatCr(point.revenue)}</span>
        </div>
      </div>
    </div>
  );
}

function RiskPanel({ data }) {
  const points = data.companies.map((company) => ({
    name: company.name,
    sector: company.sector,
    growth: company.revenue_growth_pct,
    margin: company.pat_margin,
    revenue: company.latest_revenue,
    risk: company.risk_flag,
  }));
  const colors = { LOW: 'var(--chart-green)', MEDIUM: 'var(--chart-ochre)', HIGH: 'var(--chart-coral)' };
  const counts = data.risk.counts;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Risk map"
        description="Growth vs PAT margin. Bubble size is revenue."
        actions={<SectionLink to="/screener">Filter</SectionLink>}
      />
      <p className="sr-only">
        {`Risk map of ${points.length} companies, plotting revenue growth against PAT margin. `}
        {`HIGH risk: ${counts.HIGH}, MEDIUM risk: ${counts.MEDIUM}, LOW risk: ${counts.LOW}.`}
      </p>
      <div className="mt-2 h-[236px] w-full px-1" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 14, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis
              type="number"
              dataKey="growth"
              name="Growth"
              domain={[-30, 50]}
              tickFormatter={(value) => `${value}%`}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--faint)', fontSize: 9.5 }}
            />
            <YAxis
              type="number"
              dataKey="margin"
              name="PAT margin"
              domain={[-40, 40]}
              tickFormatter={(value) => `${value}%`}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--faint)', fontSize: 9.5 }}
              width={38}
            />
            <ZAxis type="number" dataKey="revenue" range={[55, 360]} />
            <ReferenceLine x={0} stroke="var(--chart-cursor)" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="var(--chart-cursor)" strokeDasharray="3 3" />
            <Tooltip content={<RiskTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={points} isAnimationActive={false}>
              {points.map((point) => (
                <Cell
                  key={point.name}
                  fill={colors[point.risk]}
                  fillOpacity={0.78}
                  stroke="var(--surface)"
                  strokeWidth={1}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 md:px-5">
        {['LOW', 'MEDIUM', 'HIGH'].map((flag) => (
          <span key={flag} className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors[flag] }} />
            {flag} · {counts[flag]}
          </span>
        ))}
        <span className="ml-auto text-[9.5px] text-faint">Flags are rule-based</span>
      </div>
    </Panel>
  );
}

function RankingPanel({ data }) {
  const ranking = data.ranking.slice(0, 8);
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Screen ranking"
        description="40% growth · 30% scale · 30% risk."
        actions={<SectionLink to="/screener">All {data.kpis.companies}</SectionLink>}
      />
      <div className="mt-3 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10 pl-4 md:pl-5">#</th>
              <th>Company</th>
              <th className="hidden md:table-cell">Sector</th>
              <th className="text-right">Growth</th>
              <th className="text-right">Revenue</th>
              <th>Risk</th>
              <th className="pr-4 md:pr-5">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((company) => (
              <tr key={company.id}>
                <td className="pl-4 text-[11px] text-faint md:pl-5">{company.rank}</td>
                <td>
                  <Link
                    to={`/company/${company.id}`}
                    className="block max-w-[190px] truncate text-[12px] font-medium text-ink transition-colors hover:text-brand"
                  >
                    {company.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[9.5px] uppercase tracking-wide text-faint">{company.ticker}</span>
                    {company.data_source !== 'real' ? <SourceBadge source={company.data_source} compact /> : null}
                  </div>
                </td>
                <td className="hidden text-[11px] text-muted md:table-cell">{company.sector}</td>
                <td
                  className={cn(
                    'numeric text-right text-[11.5px] font-medium',
                    company.revenue_growth_pct >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {formatSignedPct(company.revenue_growth_pct)}
                </td>
                <td className="numeric text-right text-[11.5px] text-ink">{formatCr(company.latest_revenue)}</td>
                <td>
                  <RiskPill flag={company.risk_flag} />
                </td>
                <td className="pr-4 md:pr-5">
                  <ScoreBar score={company.score} showValue />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DataHealthPanel({ data }) {
  const kpis = data.kpis;
  const provenance = data.provenance;
  const total = provenance.reduce((sum, item) => sum + item.count, 0) || 1;
  const seed = provenance.find((item) => item.source === 'seed')?.count || 0;

  return (
    <Panel className="flex flex-col overflow-hidden">
      <PanelHeader
        title="Data health"
        description="Provenance, coverage, and retrieval freshness."
        actions={<SectionLink to="/data">Data room</SectionLink>}
      />
      <div className="px-4 pt-4 md:px-5">
        <div className="flex items-center justify-between text-[10px] text-muted">
          <span>Provenance</span>
          <span>{total} profiles</span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-track-strong">
          {provenance.map((item) => (
            <span
              key={item.source}
              title={`${item.source}: ${item.count}`}
              style={{
                width: `${(item.count / total) * 100}%`,
                background:
                  item.source === 'real' ? 'var(--chart-green)' : item.source === 'hybrid' ? 'var(--chart-ochre)' : 'var(--chart-slate)',
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[9.5px] text-muted">
          {provenance.map((item) => (
            <span key={item.source} className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    item.source === 'real' ? 'var(--chart-green)' : item.source === 'hybrid' ? 'var(--chart-ochre)' : 'var(--chart-slate)',
                }}
              />
              {item.source} · {item.count}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-px border-y border-line bg-line">
        {[
          { label: 'Filings', value: formatNumber(kpis.filings) },
          { label: 'Pages', value: formatNumber(kpis.pages) },
          { label: 'Chunks', value: formatNumber(kpis.chunks) },
        ].map((item) => (
          <div key={item.label} className="bg-surface px-4 py-3 md:px-5">
            <p className="text-[9.5px] text-muted">{item.label}</p>
            <p className="numeric mt-1 text-[16px] font-semibold tracking-tight text-ink">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-2 px-4 py-4 md:px-5">
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="text-muted">Filing coverage</span>
          <span className="numeric font-medium text-ink">{formatPct(kpis.filing_coverage_pct)}</span>
        </div>
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="text-muted">Last refresh</span>
          <span className="text-ink">{formatDate(data.meta.last_refresh)}</span>
        </div>
        {seed ? (
          <div className="flex items-start gap-2 rounded-[9px] border border-warning-line bg-warning-soft px-2.5 py-2 text-[9.5px] leading-relaxed text-warning-ink">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {seed} profiles use the seed fallback; figures are approximate and flagged throughout.
          </div>
        ) : null}
        <div className="flex items-center gap-1.5 pt-1 text-[9.5px] text-faint">
          <StatusDot tone="positive" />
          <FileText className="h-3 w-3" />
          Retrieval index ready · {formatNumber(kpis.chunks)} chunks
        </div>
      </div>
    </Panel>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-3 pb-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-3 w-96" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="bg-surface p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-3 h-2 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-panel" />
      <Skeleton className="h-[390px] w-full rounded-panel" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[400px] rounded-panel" />
        <Skeleton className="h-[400px] rounded-panel" />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isInitialLoading, error, isStale, reload } = useOverview();

  if (isInitialLoading) return <AnalyticsSkeleton />;

  if (error && !data) {
    return (
      <Panel>
        <EmptyState
          icon={RefreshCw}
          title="The analytics workspace did not load"
          description={error}
          action={
            <button type="button" onClick={reload} className="btn btn-primary">
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          }
        />
      </Panel>
    );
  }

  if (!data) return null;

  const exportCompanies = () =>
    downloadCsv('capital-screener-companies.csv', companiesCsv(data.companies));

  return (
    <div className="animate-fade-in pb-10">
      <div className="animate-rise-in">
        <PageHeader
          title="Market overview"
          description={`A measured view of ${data.kpis.companies} BSE-listed SMEs across ${data.kpis.sectors} sectors. Financials span ${data.meta.fy_start}–${data.meta.fy_end}; filings cover the latest three reporting cycles.`}
          actions={
            <>
              <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] text-muted md:inline-flex">
                <StatusDot tone={isStale ? 'warning' : 'positive'} pulse={!isStale} />
                {isStale ? 'Stale data' : `Updated ${formatDate(data.meta.last_refresh)}`}
              </span>
              <button type="button" onClick={exportCompanies} className="btn btn-secondary">
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              <Link to="/ask" className="btn btn-primary">
                <MessageSquare className="h-3.5 w-3.5" />
                Ask Capital
              </Link>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_352px] xl:gap-5">
        <div className="min-w-0 space-y-4">
          <div className="animate-rise-in" style={{ animationDelay: '40ms' }}>
            <KpiBand data={data} />
          </div>

          <div className="animate-rise-in" style={{ animationDelay: '80ms' }}>
            <SignalStrip signals={data.signals} />
          </div>

          <div className="animate-rise-in" style={{ animationDelay: '120ms' }}>
            <TrajectoryPanel data={data} />
          </div>

          <div
            className="grid animate-rise-in grid-cols-1 gap-4 min-[1400px]:grid-cols-[minmax(0,1.22fr)_minmax(310px,0.9fr)]"
            style={{ animationDelay: '160ms' }}
          >
            <SectorPanel data={data} />
            <RiskPanel data={data} />
          </div>

          <div
            className="grid animate-rise-in grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.78fr)]"
            style={{ animationDelay: '200ms' }}
          >
            <RankingPanel data={data} />
            <DataHealthPanel data={data} />
          </div>
        </div>

        <aside aria-label="Ask Capital" className="hidden xl:block">
          <div className="sticky top-6 h-[calc(100dvh-3rem)] max-h-[840px] animate-rise-in" style={{ animationDelay: '100ms' }}>
            <ChatPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}
