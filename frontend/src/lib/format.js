export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCr(value, digits = 0) {
  return `₹${formatNumber(value, digits)} Cr`;
}

export function formatCompactCr(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 1000) return `₹${(number / 1000).toFixed(1)}k`;
  return `₹${Math.round(number)}`;
}

export function formatPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(digits)}%`;
}

export function formatSignedPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

export function formatRatio(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toFixed(digits);
}

export function fiscalShort(fiscalYear) {
  if (!fiscalYear) return '—';
  return String(fiscalYear).replace('FY20', 'FY');
}

export function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function riskClass(flag) {
  if (flag === 'LOW') return 'risk-low';
  if (flag === 'HIGH') return 'risk-high';
  return 'risk-medium';
}

export const SECTOR_COLORS = [
  'var(--chart-green)',
  'var(--chart-ochre)',
  'var(--chart-periwinkle)',
  'var(--chart-coral)',
  'var(--chart-sage)',
  'var(--chart-slate)',
  'var(--chart-sand)',
];

export function sectorColor(index) {
  return SECTOR_COLORS[index % SECTOR_COLORS.length];
}

export function downloadCsv(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const content = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function companiesCsv(companies) {
  return companies.map((company) => ({
    company: company.name,
    ticker: company.ticker,
    sector: company.sector,
    latest_year: company.latest_year,
    revenue_cr: company.latest_revenue,
    revenue_growth_pct: company.revenue_growth_pct,
    pat_margin_pct: company.pat_margin,
    ebitda_margin_pct: company.ebitda_margin,
    debt_to_equity: company.latest_debt_to_equity,
    risk_flag: company.risk_flag,
    screen_score: company.score,
    data_source: company.data_source,
  }));
}

export function financialsCsv(companies) {
  return companies.flatMap((company) =>
    (company.history || []).map((row) => ({
      company: company.name,
      company_id: company.id,
      fiscal_year: row.fiscal_year,
      revenue_cr: row.revenue,
      ebitda_cr: row.ebitda,
      pat_cr: row.pat,
      debt_to_equity: row.debt_to_equity,
      pat_margin_pct: row.pat_margin,
      ebitda_margin_pct: row.ebitda_margin,
    })),
  );
}
