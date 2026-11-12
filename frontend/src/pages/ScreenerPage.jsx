import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  MessageSquare,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react';
import ChatPanel from '../components/ChatPanel';
import {
  EmptyState,
  PageHeader,
  Panel,
  RiskPill,
  ScoreBar,
  Segmented,
  Skeleton,
  SourceBadge,
  Sparkline,
} from '../components/ui';
import { useOverview } from '../context/OverviewContext';
import {
  cn,
  companiesCsv,
  downloadCsv,
  formatCr,
  formatPct,
  formatRatio,
  formatSignedPct,
} from '../lib/format';
import { parseScreenerState, writeScreenerState } from '../state/screenerState';

const RISK_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

const COLUMNS = {
  name: (company) => company.name,
  sector: (company) => company.sector,
  latest_revenue: (company) => company.latest_revenue,
  revenue_growth_pct: (company) => company.revenue_growth_pct,
  pat_margin: (company) => company.pat_margin,
  latest_debt_to_equity: (company) => company.latest_debt_to_equity,
  risk_flag: (company) => company.risk_flag,
  score: (company) => company.score,
};

function SortHeader({ label, column, sortKey, sortDir, onSort, align = 'left' }) {
  const active = sortKey === column;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={align === 'right' ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium transition-colors hover:text-ink',
          active ? 'text-ink' : 'text-muted',
          align === 'right' ? 'flex-row-reverse' : '',
        )}
      >
        {label}
        <Icon className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-35')} />
      </button>
    </th>
  );
}

function ScreenerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-16 w-full rounded-panel" />
      <Skeleton className="h-[560px] w-full rounded-panel" />
    </div>
  );
}

export default function ScreenerPage() {
  const { data, isInitialLoading, error, reload } = useOverview();
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => parseScreenerState(params), [params]);

  const updateView = useCallback(
    (patch) => {
      setParams(
        writeScreenerState(params, { ...parseScreenerState(params), ...patch }),
        { replace: true },
      );
    },
    [params, setParams],
  );

  const companies = data?.companies || [];
  const sectors = data?.sectors || [];

  const filtered = useMemo(() => {
    const needle = view.query.trim().toLowerCase();
    const min = view.minGrowth === '' ? null : Number(view.minGrowth);
    return companies.filter((company) => {
      if (view.sector && company.sector !== view.sector) return false;
      if (view.risk && company.risk_flag !== view.risk) return false;
      if (min !== null && Number.isFinite(min) && company.revenue_growth_pct < min) return false;
      if (!needle) return true;
      return [company.name, company.ticker, company.sector, company.bse_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [companies, view.minGrowth, view.query, view.risk, view.sector]);

  const sorted = useMemo(() => {
    const accessor = COLUMNS[view.sortKey] || COLUMNS.score;
    return [...filtered].sort((a, b) => {
      const left = accessor(a);
      const right = accessor(b);
      if (typeof left === 'string') {
        return view.sortDir === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
      }
      return view.sortDir === 'asc' ? left - right : right - left;
    });
  }, [filtered, view.sortDir, view.sortKey]);

  const onSort = (column) => {
    if (view.sortKey === column) {
      updateView({ sortDir: view.sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      updateView({
        sortKey: column,
        sortDir: column === 'name' || column === 'sector' ? 'asc' : 'desc',
      });
    }
  };

  const resetFilters = () => {
    updateView({ query: '', sector: '', risk: '', minGrowth: '' });
  };

  const hasFilters = Boolean(view.query || view.sector || view.risk || view.minGrowth);
  const exportRows = () => downloadCsv('capital-screener-screen.csv', companiesCsv(sorted));

  if (isInitialLoading) return <ScreenerSkeleton />;

  if (error && !data) {
    return (
      <Panel>
        <EmptyState
          icon={RefreshCw}
          title="The screener did not load"
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

  return (
    <div
      className="animate-fade-in pb-10"
      data-result-count={sorted.length}
      data-screener-sort={`${view.sortKey}:${view.sortDir}`}
    >
      <PageHeader
        title="Screener"
        description={`Filter, sort, and inspect all ${data.kpis.companies} companies. The score is a transparent first-pass screen, not investment advice.`}
        actions={
          <>
            <span
              role="status"
              aria-live="polite"
              className="hidden items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] text-muted sm:inline-flex"
            >
              {sorted.length} of {data.kpis.companies} shown
            </span>
            <button type="button" onClick={exportRows} className="btn btn-secondary" disabled={!sorted.length}>
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

      <Panel className="mb-4 p-3 md:p-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={view.query}
              onChange={(event) => updateView({ query: event.target.value })}
              placeholder="Search company, ticker, or sector"
              className="input pl-9"
              aria-label="Search companies"
            />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="sector-filter">
              Sector
            </label>
            <select
              id="sector-filter"
              value={view.sector}
              onChange={(event) => updateView({ sector: event.target.value })}
              className="select min-w-[170px]"
            >
              <option value="">All sectors</option>
              {sectors.map((row) => (
                <option key={row.sector} value={row.sector}>
                  {row.sector}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label mb-1 block">Risk flag</span>
            <Segmented
              options={RISK_OPTIONS}
              value={view.risk}
              onChange={(value) => updateView({ risk: value })}
              label="Filter by risk"
            />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="growth-filter">
              Min growth
            </label>
            <div className="relative">
              <input
                id="growth-filter"
                type="number"
                value={view.minGrowth}
                onChange={(event) => updateView({ minGrowth: event.target.value })}
                placeholder="0"
                className="input w-24 pr-7"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint">
                %
              </span>
            </div>
          </div>
          {hasFilters ? (
            <button type="button" onClick={resetFilters} className="btn btn-ghost h-9">
              <X className="h-3.5 w-3.5" />
              Reset
            </button>
          ) : null}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        {sorted.length ? (
          <div className="flex items-center justify-between border-b border-line bg-surface-muted px-4 py-2 text-[10px] text-muted md:hidden">
            <span>Swipe the table for all columns</span>
            <span className="numeric">{sorted.length} rows</span>
          </div>
        ) : null}
        {sorted.length ? (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <thead>
                <tr>
                  <SortHeader label="Company" column="name" sortKey={view.sortKey} sortDir={view.sortDir} onSort={onSort} />
                  <SortHeader label="Sector" column="sector" sortKey={view.sortKey} sortDir={view.sortDir} onSort={onSort} />
                  <SortHeader
                    label="Revenue"
                    column="latest_revenue"
                    sortKey={view.sortKey}
                    sortDir={view.sortDir}
                    onSort={onSort}
                    align="right"
                  />
                  <SortHeader
                    label="Growth"
                    column="revenue_growth_pct"
                    sortKey={view.sortKey}
                    sortDir={view.sortDir}
                    onSort={onSort}
                    align="right"
                  />
                  <SortHeader
                    label="PAT margin"
                    column="pat_margin"
                    sortKey={view.sortKey}
                    sortDir={view.sortDir}
                    onSort={onSort}
                    align="right"
                  />
                  <SortHeader
                    label="D/E"
                    column="latest_debt_to_equity"
                    sortKey={view.sortKey}
                    sortDir={view.sortDir}
                    onSort={onSort}
                    align="right"
                  />
                  <SortHeader label="Risk" column="risk_flag" sortKey={view.sortKey} sortDir={view.sortDir} onSort={onSort} />
                  <SortHeader
                    label="Score"
                    column="score"
                    sortKey={view.sortKey}
                    sortDir={view.sortDir}
                    onSort={onSort}
                  />
                  <th>5Y trend</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((company) => {
                  const revenueTrend = (company.history || []).map((row) => row.revenue);
                  return (
                    <tr key={company.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <Link
                              to={`/company/${company.id}`}
                              className="block max-w-[210px] truncate text-[12.5px] font-medium text-ink transition-colors hover:text-brand"
                            >
                              {company.name}
                            </Link>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className="text-[9.5px] uppercase tracking-wide text-faint">
                                {company.ticker} · {company.latest_year}
                              </span>
                              {company.data_source !== 'real' ? (
                                <SourceBadge source={company.data_source} compact />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-[11.5px] text-muted">{company.sector}</td>
                      <td className="numeric text-right text-[12px] text-ink">{formatCr(company.latest_revenue)}</td>
                      <td
                        className={cn(
                          'numeric text-right text-[12px] font-medium',
                          company.revenue_growth_pct >= 0 ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {formatSignedPct(company.revenue_growth_pct)}
                      </td>
                      <td className="numeric text-right text-[12px] text-ink">{formatPct(company.pat_margin)}</td>
                      <td className="numeric text-right text-[12px] text-muted">
                        {formatRatio(company.latest_debt_to_equity)}
                      </td>
                      <td>
                        <RiskPill flag={company.risk_flag} />
                      </td>
                      <td>
                        <ScoreBar score={company.score} showValue width={52} />
                      </td>
                      <td>
                        <Sparkline
                          values={revenueTrend}
                          width={78}
                          height={24}
                          filled={false}
                          color={company.revenue_growth_pct >= 0 ? 'var(--chart-green)' : 'var(--negative)'}
                          label={`${company.name} revenue trend`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Table2}
            title="No companies match these filters"
            description="Try widening the growth range, clearing the sector, or searching a ticker."
            action={
              <button type="button" onClick={resetFilters} className="btn btn-secondary">
                Clear filters
              </button>
            }
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[10px] text-faint">
          <span>
            Latest reported year per company · {data.kpis.financial_rows} financial rows ·{' '}
            {data.kpis.filings} filings
          </span>
          <span>Score = 0.40 growth + 0.30 scale + 0.30 risk multiplier</span>
        </div>
      </Panel>

      <div className="mt-4 xl:hidden">
        <ChatPanel className="h-[560px]" />
      </div>
    </div>
  );
}
