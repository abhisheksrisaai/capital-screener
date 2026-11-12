import { useEffect, useRef } from 'react';
import {
  ArrowUp,
  Database,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useChat } from '../hooks/useChat';
import { cn, formatCr, formatNumber, formatPct, formatSignedPct } from '../lib/format';
import ChartTooltip from './ChartTooltip';

const UNIVERSE_SUGGESTIONS = [
  'Which companies grew fastest?',
  'Where is risk concentrated?',
  'Compare Macpower and Krishna Defence',
  'How did PAT margins trend?',
];

const COMPANY_SUGGESTIONS = [
  'How has revenue trended?',
  'What risks do filings flag?',
  'Compare with its sector',
  'Is the margin improving?',
];

function MiniBarChart({ chart }) {
  const data = chart.data || [];
  const max = Math.max(...data.map((row) => Math.abs(Number(row.value))), 1);
  const unit = chart.unit;
  const display = (value) => {
    if (unit === 'percent') return formatSignedPct(value);
    if (unit === 'number') return formatNumber(value);
    return formatCr(value);
  };

  return (
    <div className="space-y-2">
      {data.slice(0, 6).map((row) => {
        const positive = Number(row.value) >= 0;
        return (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-[10.5px] text-muted">{row.label}</span>
            <span className="numeric text-[10.5px] font-medium text-ink">{display(row.value)}</span>
            <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-skeleton">
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-500 ease-out',
                  positive ? 'bg-brand' : 'bg-chart-coral',
                )}
                style={{ width: `${Math.max(2, (Math.abs(Number(row.value)) / max) * 100)}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MiniLineChart({ chart }) {
  const series = chart.series || [{ key: 'value', label: chart.title }];
  const colors = ['var(--chart-green)', 'var(--chart-ochre)', 'var(--chart-periwinkle)'];
  return (
    <div className="h-[132px] w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--faint)', fontSize: 9.5 }}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            content={<ChartTooltip unit={chart.unit} />}
            cursor={{ stroke: 'var(--chart-cursor)', strokeDasharray: '3 3' }}
          />
          {series.map((item, index) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={colors[index % colors.length]}
              strokeWidth={1.7}
              dot={false}
              animationDuration={450}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniChart({ chart }) {
  if (!chart?.data?.length) return null;
  return (
    <div className="mt-3 rounded-[10px] border border-line bg-surface p-3">
      <p className="text-[10px] font-medium text-muted">{chart.title}</p>
      <div className="mt-2.5">
        {chart.type === 'bar' ? <MiniBarChart chart={chart} /> : <MiniLineChart chart={chart} />}
      </div>
    </div>
  );
}

function FactGrid({ facts }) {
  if (!facts?.length) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line">
      {facts.slice(0, 6).map((fact) => (
        <div key={`${fact.label}-${fact.value}`} className="min-w-0 bg-surface px-2.5 py-2">
          <p className="truncate text-[9.5px] text-muted">{fact.label}</p>
          <p className="numeric mt-0.5 truncate text-[12.5px] font-semibold tracking-tight text-ink">
            {fact.value}
          </p>
          {fact.detail ? <p className="mt-0.5 truncate text-[9px] text-faint">{fact.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Citations({ citations }) {
  if (!citations?.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {citations.slice(0, 4).map((citation, index) => {
        const Icon = citation.kind === 'filing' ? FileText : Database;
        return (
          <span
            key={`${citation.label}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[9.5px] text-muted"
            title={citation.detail}
          >
            <Icon className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{citation.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function TypingRow() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Sparkles className="h-3 w-3" />
      </span>
      <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-muted px-3 py-2">
        <span className="flex gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1.5 w-1.5 animate-typing rounded-full bg-brand"
              style={{ animationDelay: `${index * 160}ms` }}
            />
          ))}
        </span>
        <span className="text-[10.5px] text-muted">Reading financials and filings</span>
      </div>
    </div>
  );
}

export default function ChatPanel({
  companyId = null,
  companyName = null,
  className,
  variant = 'rail',
}) {
  const {
    state,
    scopeKey,
    submit,
    retry,
    clear,
    setDraft,
    isEmpty,
    isSubmitting,
    canSubmit,
    canRetry,
  } = useChat({ companyId });
  const { messages, draft, status, error } = state;
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const suggestions = companyName ? COMPANY_SUGGESTIONS : UNIVERSE_SUGGESTIONS;
  const statusMessage = isSubmitting
    ? 'Reading financials and filings.'
    : status === 'ready'
      ? 'Answer ready.'
      : status === 'error'
        ? 'The question could not be answered.'
        : '';

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(96, inputRef.current.scrollHeight)}px`;
    }
  }, [draft]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollTo({ top: node.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, isSubmitting]);

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const isPage = variant === 'page';

  return (
    <section
      aria-label={companyName ? `Ask Capital about ${companyName}` : 'Ask Capital'}
      aria-busy={isSubmitting}
      data-chat-state={status}
      data-chat-scope={scopeKey}
      className={cn('panel flex h-full min-h-0 flex-col overflow-hidden', className)}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft text-brand">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold tracking-tight text-ink">Ask Capital</p>
            <p className="truncate text-[10px] text-muted">
              {companyName ? `Scoped to ${companyName}` : 'Grounded in financials and filings'}
            </p>
          </div>
        </div>
        {messages.length ? (
          <button
            type="button"
            onClick={clear}
            className="icon-btn h-7 w-7"
            aria-label="Clear conversation"
            title="New conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {isEmpty ? (
          <div className={cn('flex h-full flex-col', isPage ? 'justify-center' : 'justify-start')}>
            <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand-soft text-brand">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="mt-3 text-[17px] font-semibold tracking-tight text-ink">
              {companyName ? `Ask about ${companyName}` : 'Ask the universe'}
            </h2>
            <p className="mt-1.5 max-w-[42ch] text-[11.5px] leading-relaxed text-muted">
              {companyName
                ? 'Answers use this company’s financial history and filing excerpts.'
                : 'Answers use computed financials across 18 companies, plus filing excerpts when you ask about risk or strategy.'}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  disabled={isSubmitting}
                  className="group flex items-start gap-2 rounded-[9px] border border-line bg-surface-muted px-2.5 py-2 text-left text-[10.5px] leading-snug text-muted transition-[border-color,background-color,color] duration-150 hover:border-line-strong hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                >
                  <ArrowUp className="mt-0.5 h-3 w-3 shrink-0 -rotate-45 text-faint transition-colors group-hover:text-brand" />
                  {suggestion}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[9.5px] leading-relaxed text-faint">
              Numbers are computed from the committed dataset, never generated. The narrative
              layer is optional.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[88%] rounded-[11px] rounded-br-[4px] bg-ink px-3 py-2 text-[11.5px] leading-relaxed text-canvas">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Sparkles className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-[11px] rounded-tl-[4px] border border-line bg-surface-muted px-3 py-2.5">
                      <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink">
                        {message.content}
                      </p>
                      <FactGrid facts={message.result?.facts} />
                      <MiniChart chart={message.result?.chart} />
                      <Citations citations={message.result?.citations} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
                      <span className="text-[9px] text-faint">
                        {message.result?.meta?.engine === 'groq'
                          ? 'Groq narrative · computed facts'
                          : 'Computed from committed data'}
                      </span>
                      {message.result?.suggestions?.length ? (
                        <button
                          type="button"
                          onClick={() => submit(message.result.suggestions[0])}
                          disabled={isSubmitting}
                          className="text-[9.5px] font-medium text-brand transition-colors hover:text-brand-dark disabled:opacity-50"
                        >
                          {message.result.suggestions[0]}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ),
            )}
            {isSubmitting ? <TypingRow /> : null}
            {error ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-danger-line bg-danger-soft px-3 py-2 text-[10.5px] leading-relaxed text-danger-ink"
              >
                <span>{error}</span>
                {canRetry ? (
                  <button
                    type="button"
                    onClick={retry}
                    className="font-medium underline decoration-danger-line underline-offset-2 transition-opacity hover:opacity-75"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t border-line bg-surface p-3">
        <div className="relative rounded-[11px] border border-line bg-surface-muted p-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:bg-surface focus-within:ring-2 focus-within:ring-focus-ring">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={companyName ? `Ask about ${companyName}…` : 'Ask about growth, risk, margins…'}
            className="max-h-24 w-full resize-none bg-transparent px-2 py-1 text-[11.5px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
            aria-label="Ask Capital a question"
          />
          <div className="flex items-center justify-between px-1 pb-0.5">
            <span className="text-[9px] text-faint">Enter to send · Shift+Enter for a new line</span>
            <button
              type="button"
              onClick={() => submit()}
              disabled={!canSubmit}
              aria-busy={isSubmitting}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-ink text-canvas transition-[background-color,transform,opacity] duration-150 hover:bg-ink-strong active:scale-[0.96] disabled:opacity-30 disabled:active:scale-100"
              aria-label="Send question"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
