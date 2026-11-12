import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Building2,
  Database,
  Download,
  FileText,
  Layers,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
  SourceBadge,
  StatusDot,
} from '../components/ui';
import { useOverview } from '../context/OverviewContext';
import {
  cn,
  companiesCsv,
  downloadCsv,
  financialsCsv,
  formatDate,
  formatNumber,
  formatPct,
} from '../lib/format';

const DATASET_ICONS = {
  universe: Building2,
  financials: TrendingUp,
  filings: FileText,
  retrieval: Layers,
};

function DatasetCard({ dataset }) {
  const Icon = DATASET_ICONS[dataset.id] || Database;
  return (
    <Panel className="flex flex-col p-4">
      <div className="flex items-start justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-line bg-surface-muted text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="text-right">
          <p className="numeric text-[20px] font-semibold leading-none tracking-tighter text-ink">
            {formatNumber(dataset.rows)}
          </p>
          <p className="mt-1 text-[9.5px] text-muted">{dataset.unit}</p>
        </div>
      </div>
      <p className="mt-3 text-[12.5px] font-medium text-ink">{dataset.name}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{dataset.description}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {dataset.fields.slice(0, 4).map((field) => (
          <span
            key={field}
            className="rounded-full border border-line bg-surface-muted px-1.5 py-0.5 text-[9px] text-muted"
          >
            {field}
          </span>
        ))}
        {dataset.fields.length > 4 ? (
          <span className="rounded-full px-1 py-0.5 text-[9px] text-faint">
            +{dataset.fields.length - 4}
          </span>
        ) : null}
      </div>
      <p className="mt-auto truncate pt-3 text-[9px] text-faint" title={dataset.source}>
        {dataset.source}
      </p>
    </Panel>
  );
}

function CoverageMatrix({ coverage }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Filing coverage"
        description="Annual reports committed per company and fiscal year."
        actions={<span className="text-[10px] text-faint">{coverage.companies.length} companies</span>}
      />
      <div className="mt-3 overflow-x-auto">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th className="pl-4 md:pl-5">Company</th>
              {coverage.filing_years.map((year) => (
                <th key={year} className="text-center">
                  {year}
                </th>
              ))}
              <th className="text-right">Docs</th>
              <th className="text-right">Pages</th>
              <th className="pr-4 text-right md:pr-5">Chunks</th>
            </tr>
          </thead>
          <tbody>
            {[...coverage.companies]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((company) => (
                <tr key={company.id}>
                  <td className="pl-4 md:pl-5">
                    <Link
                      to={`/company/${company.id}`}
                      className="block max-w-[210px] truncate text-[11.5px] font-medium text-ink transition-colors hover:text-brand"
                    >
                      {company.name}
                    </Link>
                    <p className="mt-0.5 text-[9px] text-faint">{company.sector}</p>
                  </td>
                  {coverage.filing_years.map((year) => {
                    const count = company.years[year] || 0;
                    return (
                      <td key={year} className="text-center">
                        {count ? (
                          <span
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-brand-soft px-1 text-[9.5px] font-semibold text-brand"
                            title={`${count} filing${count > 1 ? 's' : ''}`}
                          >
                            {count}
                          </span>
                        ) : (
                          <span className="inline-block h-5 w-5 rounded-[5px] bg-track-strong" title="No filing" />
                        )}
                      </td>
                    );
                  })}
                  <td className="numeric text-right text-[11px] text-ink">{company.docs}</td>
                  <td className="numeric text-right text-[11px] text-muted">{formatNumber(company.pages)}</td>
                  <td className="numeric pr-4 text-right text-[11px] text-muted md:pr-5">
                    {formatNumber(company.chunks)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5 text-[9.5px] text-faint md:px-5">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-brand-soft px-1 text-[8px] font-semibold text-brand">
            1
          </span>
          documents committed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-[4px] bg-track-strong" />
          no filing
        </span>
        <span className="ml-auto">Page and chunk counts come from the ingestion manifest.</span>
      </div>
    </Panel>
  );
}

function FinancialCoverage({ coverage, companies }) {
  const max = Math.max(...coverage.financial_years.map((row) => row.companies), 1);
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Financial coverage"
        description="Company-years available per fiscal year. Early years are intentionally thin."
      />
      <div className="space-y-3 px-4 py-4 md:px-5">
        {coverage.financial_years.map((row) => (
          <div key={row.fiscal_year} className="grid grid-cols-[48px_minmax(0,1fr)_36px] items-center gap-3">
            <span className="text-[10.5px] font-medium text-muted">{row.fiscal_year}</span>
            <div className="h-2 overflow-hidden rounded-full bg-track-strong">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-700',
                  row.companies >= companies * 0.7 ? 'bg-brand' : 'bg-chart-sand',
                )}
                style={{ width: `${(row.companies / max) * 100}%` }}
              />
            </div>
            <span className="numeric text-right text-[10.5px] text-ink">{row.companies}</span>
          </div>
        ))}
        <p className="pt-1 text-[9.5px] leading-relaxed text-faint">
          FY2020–FY2021 contain only the seed profiles. The balanced panel starts at FY2022, where all
          companies report.
        </p>
      </div>
    </Panel>
  );
}

function ProvenancePanel({ data }) {
  const total = data.provenance.reduce((sum, item) => sum + item.count, 0) || 1;
  const seedCompanies = data.companies.filter((company) => company.data_source === 'seed');
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Provenance"
        description="Every company carries the source of its latest financial profile."
      />
      <div className="px-4 py-4 md:px-5">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-track-strong">
          {data.provenance.map((item) => (
            <span
              key={item.source}
              style={{
                width: `${(item.count / total) * 100}%`,
                background:
                  item.source === 'real' ? 'var(--chart-green)' : item.source === 'hybrid' ? 'var(--chart-ochre)' : 'var(--chart-slate)',
              }}
              title={`${item.source}: ${item.count}`}
            />
          ))}
        </div>
        <div className="mt-4 space-y-2.5">
          {data.provenance.map((item) => (
            <div key={item.source} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      item.source === 'real' ? 'var(--chart-green)' : item.source === 'hybrid' ? 'var(--chart-ochre)' : 'var(--chart-slate)',
                  }}
                />
                <span className="text-[11px] text-ink">
                  {item.source === 'real'
                    ? 'Live scrape'
                    : item.source === 'hybrid'
                      ? 'Hybrid'
                      : 'Seed fallback'}
                </span>
              </div>
              <span className="numeric text-[11px] text-muted">
                {item.count} · {formatPct((item.count / total) * 100)}
              </span>
            </div>
          ))}
        </div>
        {seedCompanies.length ? (
          <div className="mt-4 rounded-[9px] border border-warning-line bg-warning-soft p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-warning-ink">
              <ShieldCheck className="h-3 w-3" />
              Approximate seed profiles
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-warning-ink">
              {seedCompanies.map((company) => company.name).join(', ')}. Derived from public BSE SME
              filings when Screener.in blocked or returned incomplete tables.
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function RefreshPanel({ data }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Refresh & contract" description="How the committed artifacts stay current." />
      <div className="divide-y divide-line px-4 pb-2 md:px-5">
        {[
          {
            label: 'Last ingestion',
            value: formatDate(data.meta.last_refresh),
            detail: 'Weekday schedule · 02:00 UTC',
          },
          {
            label: 'Ingestion scope',
            value: `${formatNumber(data.kpis.companies)} companies`,
            detail: `${formatNumber(data.kpis.financial_rows)} financial rows · ${data.kpis.filings} filings`,
          },
          {
            label: 'Refresh guard',
            value: 'Zero-revenue check',
            detail: 'Refuses the commit when more than three companies report ₹0',
          },
          {
            label: 'Missing years',
            value: 'Sorted ascending',
            detail: 'Endpoints return available years; ranking uses the latest only',
          },
        ].map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-[10.5px] font-medium text-ink">{row.label}</p>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted">{row.detail}</p>
            </div>
            <span className="shrink-0 text-right text-[10.5px] text-muted">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-[9.5px] text-faint md:px-5">
        <StatusDot tone="positive" />
        Artifacts committed to the repo · data contract in README
      </div>
    </Panel>
  );
}

function DataSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-52" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-44 rounded-panel" />
        ))}
      </div>
      <Skeleton className="h-[520px] rounded-panel" />
    </div>
  );
}

export default function DataPage() {
  const { data, isInitialLoading, error, reload } = useOverview();

  if (isInitialLoading) return <DataSkeleton />;

  if (error && !data) {
    return (
      <Panel>
        <EmptyState
          icon={RefreshCw}
          title="The data room did not load"
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
    <div className="animate-fade-in pb-10">
      <PageHeader
        title="Data room"
        description={`Four datasets power this workspace. Every number is traceable to a committed artifact. Last ingestion ${formatDate(data.meta.last_refresh)}.`}
        actions={
          <>
            <button
              type="button"
              onClick={() => downloadCsv('capital-screener-companies.csv', companiesCsv(data.companies))}
              className="btn btn-secondary"
            >
              <Download className="h-3.5 w-3.5" />
              Companies CSV
            </button>
            <button
              type="button"
              onClick={() => downloadCsv('capital-screener-financials.csv', financialsCsv(data.companies))}
              className="btn btn-secondary"
            >
              <Download className="h-3.5 w-3.5" />
              Financials CSV
            </button>
            <Link to="/ask" className="btn btn-primary">
              <MessageSquare className="h-3.5 w-3.5" />
              Ask Capital
            </Link>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.datasets.map((dataset) => (
          <DatasetCard key={dataset.id} dataset={dataset} />
        ))}
      </div>

      <div className="mt-4">
        <CoverageMatrix coverage={data.coverage} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <FinancialCoverage coverage={data.coverage} companies={data.kpis.companies} />
        <ProvenancePanel data={data} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <RefreshPanel data={data} />
        <Panel className="overflow-hidden p-4 md:p-5">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold tracking-tight text-ink">Source profusion</p>
            <SourceBadge source="real" />
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            Screener.in is the happy path. When a scrape is blocked, empty, or maps revenue as zero,
            the pipeline fills the company from a seed profile derived from public BSE SME filings.
            The dashboard shows provenance on every company row.
          </p>
          <div className="mt-4 overflow-hidden rounded-[10px] border border-line">
            <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-line bg-surface-muted px-3 py-2 text-[9.5px] font-medium text-muted">
              <span>Dataset</span>
              <span>Rows</span>
            </div>
            {data.datasets.map((dataset) => (
              <div
                key={dataset.id}
                className="grid grid-cols-[1fr_auto] gap-2 border-b border-line px-3 py-2 text-[10px] last:border-b-0"
              >
                <span className="text-ink">{dataset.name}</span>
                <span className="numeric text-muted">{formatNumber(dataset.rows)}</span>
              </div>
            ))}
          </div>
          <a
            href="https://github.com/abhisheksrisaai/capital-screener/blob/main/EVAL.md"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand hover:text-brand-dark"
          >
            Read the eval method
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </Panel>
      </div>
    </div>
  );
}
