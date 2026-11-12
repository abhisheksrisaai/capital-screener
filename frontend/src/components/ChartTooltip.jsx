import { formatCr, formatNumber, formatPct } from '../lib/format';

function formatValue(value, unit) {
  if (unit === 'percent') return formatPct(value);
  if (unit === 'number') return formatNumber(value);
  return formatCr(value, Math.abs(Number(value)) < 10 ? 1 : 0);
}

export default function ChartTooltip({ active, payload, label, unit = 'currency', labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-[10px] border border-line bg-surface px-3 py-2 shadow-pop backdrop-blur">
      <p className="text-[10.5px] font-medium text-muted">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <div className="mt-1.5 space-y-1">
        {payload
          .filter((item) => item.value !== null && item.value !== undefined)
          .map((item) => (
            <div key={`${item.name}-${item.dataKey}`} className="flex items-center justify-between gap-4 text-[11.5px]">
              <span className="flex items-center gap-1.5 text-muted">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: item.color || item.fill || 'var(--chart-green)' }}
                />
                {item.name}
              </span>
              <span className="numeric font-medium text-ink">{formatValue(item.value, unit)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
