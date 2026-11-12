import { useEffect, useMemo, useReducer, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip from '../components/ChartTooltip';
import ChatPanel from '../components/ChatPanel';
import {
  Delta,
  EmptyState,
  Panel,
  PanelHeader,
  RiskPill,
  ScoreBar,
  Skeleton,
  SourceBadge,
} from '../components/ui';
import { useOverview } from '../context/OverviewContext';
import { useCompanyFallback } from '../hooks/useCompanyFallback';
import { apiErrorMessage, downloadMemo } from '../services/api';
import {
  COMPANY_STATUS,
  MEMO_STATUS,
  createMemoState,
  memoReducer,
} from '../state/companyMachine';
import {
  cn,
  fiscalShort,
  formatCr,
  formatDate,
  formatNumber,
  formatPct,
  formatRatio,
  formatSignedPct,
} from '../lib/format';

function CompanyChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-[10px] border border-line bg-surface px-3 py-2 shadow-pop backdrop-blur">
      <p className="text-[10.5px] font-medium text-muted">{label}</p>
      <div className="mt-1.5 space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color || item.fill }} />
              {item.name}
            </span>
            <span className="numeric font-medium text-ink">
              {item.dataKey === 'pat_margin' ? formatPct(item.value) : formatCr(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="bg-surface p-4">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-3 h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Skeleton className="h-[360px] rounded-panel" />
        <Skeleton className="h-[360px] rounded-panel" />
      </div>
    </div>
  );
}

export default function CompanyDetail() {
  const { id } = useParams();
  const {
    data,
    isInitialLoading: overviewInitialLoading,
    error: overviewError,
    reload,
  } = useOverview();
  const overviewCompany = data?.companies.find((company) => company.id === id);
  const { state: fallback, reload: reloadFallback } = useCompanyFallback(id);
  const fallbackMatches = fallback.companyId === id;
  const fallbackCompany =
    fallbackMatches && fallback.status === COMPANY_STATUS.READY ? fallback.company : null;
  const fallbackFinancials = fallbackMatches ? fallback.financials : [];
  const filings = fallbackMatches ? fallback.filings : [];
  const [memo, dispatchMemo] = useReducer(memoReducer, undefined, createMemoState);
  const memoControllerRef = useRef(null);

  useEffect(() => {
    dispatchMemo({ type: 'reset' });
    memoControllerRef.current?.abort();
    memoControllerRef.current = null;
  }, [id]);

  useEffect(
    () => () => {
      memoControllerRef.current?.abort();
    },
    [],
  );

  const company = useMemo(() => {
    if (overviewCompany) return overviewCompany;
    if (!fallbackCompany) return null;
    const history = fallbackFinancials.map((row) => ({
      ...row,
      pat_margin: row.pat_margin ?? (row.revenue ? (row.pat / row.revenue) * 100 : 0),
      ebitda_margin: row.ebitda_margin ?? (row.revenue ? (row.ebitda / row.revenue) * 100 : 0),
    }));
    const latest = history[history.length - 1] || {};
    return {
      ...fallbackCompany,
      latest_year: latest.fiscal_year || '',
      latest_revenue: latest.revenue || fallbackCompany.latest_revenue || 0,
      latest_pat: latest.pat || 0,
      latest_ebitda: latest.ebitda || 0,
      latest_debt_to_equity: latest.debt_to_equity || 0,
      pat_margin: latest.pat_margin || 0,
      ebitda_margin: latest.ebitda_margin || 0,
      revenue_growth_pct: fallbackCompany.revenue_growth_pct || 0,
      history,
      rank: 0,
      score: 0,
      score_breakdown: {},
    };
  }, [fallbackCompany, fallbackFinancials, overviewCompany]);

  useEffect(() => {
    document.title = company?.name
      ? `${company.name} — Capital Screener`
      : 'Company — Capital Screener';
  }, [company?.name]);

  const fallbackPending =
    !fallbackMatches ||
    fallback.status === COMPANY_STATUS.IDLE ||
    fallback.status === COMPANY_STATUS.LOADING;
  const fallbackFailed =
    fallbackMatches && fallback.status === COMPANY_STATUS.ERROR;

  if (!company && (overviewInitialLoading || fallbackPending)) {
    return <DetailSkeleton />;
  }

  if (!company) {
    return (
      <Panel>
        <EmptyState
          icon={RefreshCw}
          title="Company not available"
          description={
            (fallbackFailed ? fallback.error : overviewError) || 'Company not available'
          }
          action={
            <button
              type="button"
              onClick={() => {
                reloadFallback();
                reload();
              }}
              className="btn btn-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          }
        />
      </Panel>
    );
  }

  const history = company.history || [];
  const latest = history[history.length - 1] || {};
  const meta = data?.meta;
  const sector = data?.sectors.find((row) => row.sector === company.sector);
  const peers = (data?.companies || [])
    .filter((row) => row.sector === company.sector)
    .sort((a, b) => b.latest_revenue - a.latest_revenue);
  const sectorRank = peers.findIndex((row) => row.id === company.id) + 1;
  const sectorRevenueShare = sector ? (company.latest_revenue / sector.revenue) * 100 : 0;
  const maxPeerRevenue = peers[0]?.latest_revenue || company.latest_revenue || 1;
  const filingsLoading =
    !fallbackMatches ||
    fallback.status === COMPANY_STATUS.IDLE ||
    fallback.status === COMPANY_STATUS.LOADING;
  const filingsError = fallbackMatches && fallback.status === COMPANY_STATUS.ERROR;
  const memoGenerating = memo.status === MEMO_STATUS.GENERATING;

  const handleMemo = async () => {
    memoControllerRef.current?.abort();
    const controller = new AbortController();
    memoControllerRef.current = controller;
    dispatchMemo({ type: 'start' });

    try {
      const response = await downloadMemo(company.id, { signal: controller.signal });
      const type = response.headers['content-type'] || '';
      const extension = type.includes('pdf') ? 'pdf' : 'html';
      const blob = new Blob([response.data], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${company.id}_memo.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      dispatchMemo({ type: 'succeed' });
    } catch (err) {
      if (controller.signal.aborted) return;
      dispatchMemo({
        type: 'fail',
        error: apiErrorMessage(err, 'Memo generation failed'),
      });
    } finally {
      if (memoControllerRef.current === controller) {
        memoControllerRef.current = null;
      }
    }
  };

  return (
    <div
      className="animate-fade-in pb-10"
      data-company-id={company.id}
      data-company-source={overviewCompany ? 'overview' : 'fallback'}
      data-memo-state={memo.status}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <Link to="/screener" className="inline-flex items-center gap-1 transition-colors hover:text-ink">
          <ArrowLeft className="h-3 w-3" />
          Screener
        </Link>
        <span className="text-faint">/</span>
        <span>{company.sector}</span>
      </div>

      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tighter text-ink md:text-[32px]">
              {company.name}
            </h1>
            <RiskPill flag={company.risk_flag} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
            <span>{company.sector}</span>
            <span className="text-faint">·</span>
            <span>BSE {company.bse_code}</span>
            <span className="text-faint">·</span>
            <span className="uppercase tracking-wide">{company.ticker}</span>
            <SourceBadge source={company.data_source} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleMemo}
            disabled={memoGenerating}
            aria-busy={memoGenerating}
            className="btn btn-secondary"
          >
            {memoGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {memoGenerating ? 'Generating' : 'Generate memo'}
          </button>
          <Link to="/ask" className="btn btn-primary">
            <MessageSquare className="h-3.5 w-3.5" />
            Ask Capital
          </Link>
        </div>
      </div>
      {memo.status === MEMO_STATUS.ERROR ? (
        <p role="alert" className="mt-2 text-[11px] text-negative">
          {memo.error}
        </p>
      ) : null}
      {memo.status === MEMO_STATUS.SUCCESS ? (
        <p role="status" aria-live="polite" className="mt-2 text-[11px] text-positive">
          Memo downloaded.
        </p>
      ) : null}

      <Panel className="mt-5 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-5">
          {[
            { label: 'Revenue', value: formatCr(company.latest_revenue), detail: company.latest_year },
            {
              label: 'Growth',
              value: formatSignedPct(company.revenue_growth_pct),
              detail: 'year on year',
              tone: company.revenue_growth_pct >= 0 ? 'positive' : 'negative',
            },
            { label: 'PAT margin', value: formatPct(company.pat_margin), detail: formatCr(company.latest_pat) },
            {
              label: 'Debt / equity',
              value: formatRatio(company.latest_debt_to_equity),
              detail: 'latest report',
            },
            {
              label: 'Screen score',
              value: company.score ? company.score.toFixed(1) : '—',
              detail: company.rank ? `rank #${company.rank} of ${data?.kpis.companies || 18}` : 'not ranked',
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-surface p-4">
              <p className="label">{kpi.label}</p>
              <p
                className={cn(
                  'numeric mt-2 text-[23px] font-semibold leading-none tracking-tighter',
                  kpi.tone === 'negative' ? 'text-negative' : kpi.tone === 'positive' ? 'text-positive' : 'text-ink',
                )}
              >
                {kpi.value}
              </p>
              <p className="mt-1.5 text-[10px] text-muted">{kpi.detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.82fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Revenue & profitability"
            description={`${history[0]?.fiscal_year || company.latest_year}–${latest.fiscal_year || company.latest_year} · bars are revenue, line is PAT margin.`}
          />
          {history.length >= 2 ? (
            <p className="sr-only">
              {`Revenue and PAT margin for ${company.name}, ${history[0]?.fiscal_year} to ${latest.fiscal_year}. `}
              {history
                .map(
                  (row) =>
                    `${row.fiscal_year}: revenue ${formatCr(row.revenue)}, PAT margin ${formatPct(row.pat_margin)}`,
                )
                .join('. ')}
            </p>
          ) : null}
          <div
            className="h-[280px] px-1 pb-3 pt-4"
            aria-hidden={history.length >= 2 ? 'true' : undefined}
          >
            {history.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={history} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
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
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `₹${Math.round(value)}`}
                    tick={{ fill: 'var(--faint)', fontSize: 10 }}
                    width={46}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${Math.round(value)}%`}
                    tick={{ fill: 'var(--faint)', fontSize: 10 }}
                    width={38}
                  />
                  <Tooltip content={<CompanyChartTooltip />} cursor={{ fill: 'var(--chart-hover)' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="revenue"
                    name="Revenue"
                    fill="var(--chart-green)"
                    fillOpacity={0.86}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={42}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pat_margin"
                    name="PAT margin"
                    stroke="var(--chart-ochre)"
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: 'var(--chart-ochre)', strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={FileText}
                title="No financial series"
                description="This company has a single reported year, so a trend cannot be drawn."
              />
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title={`Position in ${company.sector}`}
            description={sector ? `${sector.companies} companies · sector rank #${sectorRank || '—'}` : 'Sector aggregate'}
          />
          <div className="space-y-4 px-4 py-4 md:px-5">
            {sector ? (
              <>
                <div>
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-muted">Share of sector revenue</span>
                    <span className="numeric font-medium text-ink">{formatPct(sectorRevenueShare)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track-strong">
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-700"
                      style={{ width: `${Math.min(100, Math.max(2, sectorRevenueShare))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[9.5px] text-muted">
                    {formatCr(company.latest_revenue)} of {formatCr(sector.revenue)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                  <div>
                    <p className="text-[9.5px] text-muted">Company growth</p>
                    <p className="numeric mt-1 text-[15px] font-semibold tracking-tight text-ink">
                      {formatSignedPct(company.revenue_growth_pct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9.5px] text-muted">Sector growth</p>
                    <p className="numeric mt-1 text-[15px] font-semibold tracking-tight text-muted">
                      {formatSignedPct(sector.growth_pct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9.5px] text-muted">Company PAT</p>
                    <p className="numeric mt-1 text-[15px] font-semibold tracking-tight text-ink">
                      {formatPct(company.pat_margin)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9.5px] text-muted">Sector PAT</p>
                    <p className="numeric mt-1 text-[15px] font-semibold tracking-tight text-muted">
                      {formatPct(sector.pat_margin)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted">No sector aggregate available.</p>
            )}

            {peers.length > 1 ? (
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-[10px] font-medium text-muted">Sector peers</p>
                <div className="space-y-2">
                  {peers.slice(0, 4).map((peer) => (
                    <Link key={peer.id} to={`/company/${peer.id}`} className="group block">
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={cn(
                            'truncate text-[10.5px] transition-colors group-hover:text-brand',
                            peer.id === company.id ? 'font-medium text-ink' : 'text-muted',
                          )}
                        >
                          {peer.name}
                        </span>
                        <span className="numeric shrink-0 text-[9.5px] text-muted">{formatCr(peer.latest_revenue)}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-track-strong">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            peer.id === company.id ? 'bg-brand' : 'bg-track-strong',
                          )}
                          style={{ width: `${Math.max(2, (peer.latest_revenue / maxPeerRevenue) * 100)}%` }}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader title="Margin trend" description="PAT and EBITDA margins across reported years." />
          {history.length >= 2 ? (
            <p className="sr-only">
              {`PAT and EBITDA margins for ${company.name}. `}
              {history
                .map(
                  (row) =>
                    `${row.fiscal_year}: PAT margin ${formatPct(row.pat_margin)}, EBITDA margin ${formatPct(
                      row.ebitda_margin,
                    )}`,
                )
                .join('. ')}
            </p>
          ) : null}
          <div
            className="h-[240px] px-1 pb-3 pt-4"
            aria-hidden={history.length >= 2 ? 'true' : undefined}
          >
            {history.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
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
                    tickFormatter={(value) => `${Math.round(value)}%`}
                    tick={{ fill: 'var(--faint)', fontSize: 10 }}
                    width={40}
                  />
                  <ReferenceLine y={0} stroke="var(--chart-cursor)" strokeDasharray="3 3" />
                  <Tooltip
                    content={<ChartTooltip unit="percent" />}
                    cursor={{ stroke: 'var(--chart-cursor)', strokeDasharray: '3 3' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pat_margin"
                    name="PAT margin"
                    stroke="var(--chart-green)"
                    strokeWidth={2}
                    dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--chart-green)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ebitda_margin"
                    name="EBITDA margin"
                    stroke="var(--chart-ochre)"
                    strokeWidth={1.6}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="px-4 py-12 text-center text-[11px] text-muted">No margin series available.</p>
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Filings"
            description={
              filingsLoading
                ? 'Loading document inventory…'
                : filingsError
                  ? 'Document inventory unavailable'
                  : `${filings.length} document${filings.length === 1 ? '' : 's'} in the corpus`
            }
          />
          <div
            data-filings-state={filingsLoading ? 'loading' : filingsError ? 'error' : 'ready'}
            className="px-4 py-3 md:px-5"
          >
            {filingsLoading ? (
              <div className="space-y-2 py-1" aria-label="Loading filings">
                {[0, 1, 2].map((item) => (
                  <Skeleton key={item} className="h-9 w-full rounded-[8px]" />
                ))}
              </div>
            ) : filingsError ? (
              <div className="flex flex-col items-center gap-2 py-5 text-center">
                <p className="text-[10.5px] text-muted">Could not load the document inventory.</p>
                <button type="button" onClick={reloadFallback} className="btn btn-secondary h-7 text-[10.5px]">
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            ) : filings.length ? (
              <ul className="space-y-0">
                {filings.map((filing) => (
                  <li
                    key={filing.id}
                    className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-line bg-surface-muted text-muted">
                      <FileText className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-ink">{filing.title}</p>
                      <p className="mt-0.5 text-[9.5px] text-muted">
                        {filing.fiscal_year} · {formatNumber(filing.page_count)} pages
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[10.5px] text-muted">No filings committed for this company.</p>
            )}
          </div>
          <div className="border-t border-line px-4 py-2.5 text-[9.5px] text-faint md:px-5">
            Excerpt retrieval is scoped to this company when you ask below.
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
        <div className="h-[580px]">
          <ChatPanel
            key={company.id}
            companyId={company.id}
            companyName={company.name}
            variant="page"
          />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader title="Score anatomy" description="Transparent first-pass screen. Not investment advice." />
          <div className="space-y-4 px-4 py-4 md:px-5">
            {[
              {
                label: 'Growth',
                value: company.score_breakdown?.growth_contrib ?? 0,
                max: 40,
                color: 'var(--chart-green)',
              },
              {
                label: 'Scale',
                value: company.score_breakdown?.scale_contrib ?? 0,
                max: 30,
                color: 'var(--chart-ochre)',
              },
              {
                label: 'Risk multiplier',
                value: company.score_breakdown?.risk_contrib ?? 0,
                max: 30,
                color: 'var(--chart-periwinkle)',
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-muted">{row.label}</span>
                  <span className="numeric font-medium text-ink">
                    {Number(row.value).toFixed(1)} / {row.max}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track-strong">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (Number(row.value) / row.max) * 100)}%`,
                      background: row.color,
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-[10.5px] text-muted">Total score</span>
              <span className="numeric text-[16px] font-semibold tracking-tight text-ink">
                {company.score ? company.score.toFixed(1) : '—'}
              </span>
            </div>
            <div className="rounded-[9px] border border-line bg-surface-muted p-3">
              <p className="text-[9.5px] leading-relaxed text-muted">
                Risk flags are rule-based: negative growth, debt/equity above 2, or a PAT margin that
                declined for two years. The multiplier is 1.0 for LOW, 0.6 for MEDIUM, and 0.2 for HIGH.
              </p>
            </div>
            {meta ? (
              <p className="text-[9px] text-faint">
                Financials {meta.fy_start}–{meta.fy_end} · refreshed {formatDate(meta.last_refresh)}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      {company.data_source === 'seed' ? (
        <div className="mt-4 flex items-start gap-2 rounded-panel border border-warning-line bg-warning-soft px-4 py-3 text-[10px] leading-relaxed text-warning-ink">
          <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This profile uses the seed fallback because the live scrape was blocked or incomplete.
          Treat revenue, EBITDA, PAT, and leverage as approximate.
        </div>
      ) : null}
    </div>
  );
}
