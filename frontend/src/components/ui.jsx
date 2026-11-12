import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatSignedPct, riskClass } from '../lib/format';

export function PageHeader({ title, description, actions, meta }) {
  return (
    <header className="flex flex-col gap-4 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Research workspace
          {meta ? <span className="text-faint">/ {meta}</span> : null}
        </div>
        <h1 className="mt-2 text-[28px] font-semibold leading-[1.08] tracking-tighter text-ink md:text-[34px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({ children, className, as: Component = 'section' }) {
  return <Component className={cn('panel', className)}>{children}</Component>;
}

export function PanelHeader({ title, description, actions, className }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between md:px-5 md:pt-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function RiskPill({ flag, withDot = true }) {
  return (
    <span className={riskClass(flag)}>
      {withDot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {flag || '—'}
    </span>
  );
}

const SOURCE_LABELS = {
  real: 'Live scrape',
  hybrid: 'Hybrid',
  seed: 'Seed fallback',
};

export function SourceBadge({ source, compact = false }) {
  const label = SOURCE_LABELS[source] || 'Seed fallback';
  const color =
    source === 'real' ? 'bg-brand' : source === 'hybrid' ? 'bg-chart-ochre' : 'bg-chart-slate';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] text-muted',
        compact ? '' : 'rounded-full border border-line px-2 py-0.5',
      )}
      title={`Data provenance: ${label}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
      {label}
    </span>
  );
}

export function Delta({ value, suffix = '', inverse = false, className }) {
  const number = Number(value);
  const up = number >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11.5px] font-medium',
        good ? 'text-positive' : 'text-negative',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      {formatSignedPct(number)}
      {suffix ? <span className="font-normal text-muted">{suffix}</span> : null}
    </span>
  );
}

export function Sparkline({
  values = [],
  width = 96,
  height = 28,
  color = 'var(--chart-green)',
  filled = true,
  className,
  label = 'Trend sparkline',
}) {
  const rawId = useId();
  const gradientId = `spark-${rawId.replaceAll(':', '')}`;
  const data = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (data.length < 2) return <span className="text-[11px] text-faint">—</span>;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const inset = 2;
  const points = data.map((value, index) => {
    const x = inset + (index / (data.length - 1)) * (width - inset * 2);
    const y = height - inset - ((value - min) / range) * (height - inset * 2);
    return [x, y];
  });
  const path = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const area = `${path} L${width - inset},${height - inset} L${inset},${height - inset} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={label}
    >
      {filled ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
}

export function Segmented({ options, value, onChange, label = 'View options' }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex items-center rounded-[9px] border border-line bg-track p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-7 rounded-[7px] px-2.5 text-[11.5px] font-medium transition-[background-color,color,box-shadow] duration-150',
              active
                ? 'bg-surface text-ink shadow-control'
                : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ScoreBar({ score, width = 54, showValue = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 overflow-hidden rounded-full bg-track-strong" style={{ width }}>
        <span
          className="block h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, Number(score) || 0))}%` }}
        />
      </span>
      {showValue ? (
        <span className="numeric text-[11.5px] text-muted">{Number(score).toFixed(1)}</span>
      ) : null}
    </span>
  );
}

export function StatusDot({ tone = 'positive', pulse = false, className }) {
  const color =
    tone === 'positive'
      ? 'bg-positive'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'negative'
          ? 'bg-negative'
          : 'bg-faint';
  return (
    <span className={cn('relative inline-flex h-1.5 w-1.5', className)}>
      {pulse ? <span className={cn('absolute inset-0 animate-ping rounded-full opacity-40', color)} /> : null}
      <span className={cn('relative h-1.5 w-1.5 rounded-full', color)} />
    </span>
  );
}

export function Skeleton({ className }) {
  return <span className={cn('skeleton block', className)} aria-hidden="true" />;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-muted text-muted">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SectionLink({ to, children }) {
  return (
    <Link to={to} className="link-arrow">
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}
