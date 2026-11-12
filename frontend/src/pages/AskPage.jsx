import { Link } from 'react-router-dom';
import {
  Database,
  FileSearch,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import ChatPanel from '../components/ChatPanel';
import { PageHeader, Panel, Skeleton } from '../components/ui';
import { useOverview } from '../context/OverviewContext';
import { formatNumber } from '../lib/format';

const CAN_ANSWER = [
  {
    icon: TrendingUp,
    title: 'Financials & growth',
    detail: 'Revenue, EBITDA, PAT, margins, debt/equity, five-year trends, and like-for-like comparisons.',
  },
  {
    icon: Database,
    title: 'Sectors & ranking',
    detail: 'Sector mix, growth dispersion, concentration, and the transparent 40/30/30 screen score.',
  },
  {
    icon: ShieldAlert,
    title: 'Risk & leverage',
    detail: 'Rule-based risk flags, shrinking companies, high-risk revenue share, and leverage outliers.',
  },
  {
    icon: FileSearch,
    title: 'Filings & coverage',
    detail: 'Filing excerpts for company-specific risk or strategy questions, plus corpus coverage.',
  },
];

export default function AskPage() {
  const { data, isInitialLoading, error, reload } = useOverview();

  return (
    <div className="animate-fade-in pb-8">
      <PageHeader
        title="Ask Capital"
        description="A grounded analyst for the 18-company universe. It computes from financials first, then uses filing excerpts for qualitative questions."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] text-muted">
            <Sparkles className="h-3 w-3 text-brand" />
            Computed answers, not generated numbers
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel className="p-4 md:p-5">
            <h2 className="text-[14px] font-semibold tracking-tight text-ink">What it can answer</h2>
            <div className="mt-4 space-y-4">
              {CAN_ANSWER.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-line bg-surface-muted text-brand">
                      <Icon className="h-3 w-3" />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-ink">{item.title}</p>
                      <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="border-b border-line bg-warning-soft px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-warning-ink">
                <ShieldAlert className="h-3.5 w-3.5" />
                Out of scope
              </div>
              <p className="mt-1 text-[9.5px] leading-relaxed text-warning-ink">
                Share prices, valuation multiples, news, and buy/sell recommendations are not in the
                committed dataset. The analyst abstains rather than guessing.
              </p>
            </div>
            <div className="p-4">
              {isInitialLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="h-2.5 w-3/4" />
                  <Skeleton className="h-2.5 w-2/3" />
                </div>
              ) : !data ? (
                <div className="space-y-2">
                  <p role="alert" className="text-[10px] leading-relaxed text-danger-ink">
                    {error || 'The dataset summary could not load.'}
                  </p>
                  <button type="button" onClick={reload} className="btn btn-secondary h-7 text-[10.5px]">
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Rows', value: formatNumber(data.kpis.financial_rows) },
                      { label: 'Filings', value: formatNumber(data.kpis.filings) },
                      { label: 'Chunks', value: formatNumber(data.kpis.chunks) },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[8px] border border-line bg-surface-muted px-2 py-2">
                        <p className="text-[8.5px] text-muted">{item.label}</p>
                        <p className="numeric mt-1 text-[13px] font-semibold tracking-tight text-ink">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Link
                    to="/data"
                    className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-brand hover:text-brand-dark"
                  >
                    <Database className="h-3 w-3" />
                    Open the data room
                  </Link>
                </>
              )}
            </div>
          </Panel>

          <div className="rounded-panel border border-line bg-surface-muted p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-medium text-ink">
              <MessageSquare className="h-3.5 w-3.5 text-brand" />
              How answers work
            </div>
            <ol className="mt-3 space-y-2 text-[9.5px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <span className="numeric text-faint">1</span>
                Parse the question for companies, sectors, metrics, and time range.
              </li>
              <li className="flex gap-2">
                <span className="numeric text-faint">2</span>
                Compute the answer from structured financials.
              </li>
              <li className="flex gap-2">
                <span className="numeric text-faint">3</span>
                Retrieve filing excerpts when the question is qualitative.
              </li>
              <li className="flex gap-2">
                <span className="numeric text-faint">4</span>
                Return facts, citations, a chart, and follow-ups.
              </li>
            </ol>
          </div>
        </div>

        <div className="min-h-[620px] lg:h-[calc(100dvh-190px)] lg:min-h-[560px]">
          <ChatPanel variant="page" />
        </div>
      </div>
    </div>
  );
}
