import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Database,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageSquare,
  RefreshCw,
  Table2,
  X,
} from 'lucide-react';
import { useOverview } from '../context/OverviewContext';
import { cn, formatDate } from '../lib/format';
import ThemeToggle from './ThemeToggle';
import { Skeleton, StatusDot } from './ui';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/screener', label: 'Screener', icon: Table2 },
  { to: '/data', label: 'Data room', icon: Database },
  { to: '/ask', label: 'Ask Capital', icon: MessageSquare },
];

export function BrandMark({ className }) {
  return (
    <span
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-end justify-center gap-[3px] overflow-hidden rounded-[9px] bg-ink pb-2',
        className,
      )}
      aria-hidden="true"
    >
      <span className="h-2 w-[3px] rounded-full bg-canvas opacity-50" />
      <span className="h-3.5 w-[3px] rounded-full bg-canvas opacity-80" />
      <span className="h-5 w-[3px] rounded-full bg-canvas" />
      <span className="absolute inset-x-0 top-0 h-px bg-canvas opacity-20" />
    </span>
  );
}

function DataHealth() {
  const {
    data,
    isInitialLoading,
    isRefreshing,
    isStale,
    showBlockingError,
    reload,
  } = useOverview();
  const kpis = data?.kpis;
  const coverage = kpis?.filing_coverage_pct ?? 0;

  return (
    <div className="rounded-[12px] border border-line bg-surface-muted p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink">Data health</span>
        <span className="flex items-center gap-1 text-[10.5px] text-muted">
          <StatusDot
            tone={isStale || showBlockingError || coverage < 90 ? 'warning' : 'positive'}
            pulse={!isStale && !isRefreshing && !showBlockingError}
          />
          {isInitialLoading
            ? 'Syncing'
            : showBlockingError
              ? 'Offline'
              : isStale
                ? 'Stale'
                : isRefreshing
                  ? 'Refreshing'
                  : 'Live'}
          <button
            type="button"
            onClick={reload}
            disabled={isInitialLoading || isRefreshing}
            aria-label="Refresh market data"
            title="Refresh market data"
            className="icon-btn ml-0.5 h-6 w-6 disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
          </button>
        </span>
      </div>
      {isInitialLoading || !kpis ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-2/3" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="numeric text-[18px] font-semibold tracking-tight text-ink">
              {kpis.companies}
            </span>
            <span className="text-[10.5px] text-muted">companies tracked</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-track-faint">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700"
              style={{ width: `${Math.max(3, coverage)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted">
            <span>{kpis.filings} filings</span>
            <span>{Math.round(coverage)}% covered</span>
          </div>
          <div className="mt-2 border-t border-line pt-2 text-[10.5px] text-faint">
            Updated {formatDate(data.meta?.last_refresh)}
          </div>
        </>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-lg px-1 py-1"
      >
        <BrandMark />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold leading-tight tracking-tight text-ink">
            Capital Screener
          </span>
          <span className="mt-0.5 block text-[10.5px] leading-none text-muted">
            Research workspace
          </span>
        </span>
      </Link>

      <div className="mt-7">
        <p className="px-2 text-[10.5px] font-medium text-faint">Workspace</p>
        <nav className="mt-2 space-y-0.5" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium transition-[background-color,color] duration-150',
                    isActive
                      ? 'bg-brand-soft text-brand-dark'
                      : 'text-muted hover:bg-subtle hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-[16px] w-[16px]" strokeWidth={isActive ? 2 : 1.7} />
                    <span className="flex-1">{item.label}</span>
                    {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-7 px-2">
        <p className="text-[11px] font-medium text-ink">Coverage</p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
          18 BSE-listed SMEs. Financials from FY2020, filings from FY2023.
        </p>
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <div>
          <p className="mb-1.5 px-1 text-[9.5px] font-medium text-faint">Appearance</p>
          <ThemeToggle />
        </div>
        <DataHealth />
        <a
          href="https://github.com/abhisheksrisaai/capital-screener"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-lg px-2 py-1 text-[10.5px] text-muted transition-colors hover:text-ink"
        >
          Method, evals, data contract
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function OverviewStatus() {
  const { status, error, isRefreshing, isStale, reload } = useOverview();
  if (!isRefreshing && !isStale) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-state={status}
      className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-warning-line bg-warning-soft px-3 py-2 text-[10.5px] text-warning-ink"
    >
      {isRefreshing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <StatusDot tone="warning" />
      )}
      <span className="min-w-0 flex-1">
        {isRefreshing
          ? 'Refreshing market data.'
          : `Showing the last loaded snapshot. ${error || ''}`.trim()}
      </span>
      {isStale ? (
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-1 font-medium underline decoration-warning-line underline-offset-2 transition-opacity hover:opacity-75"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

export default function AppShell({ children }) {
  const [open, setOpen] = useState(false);
  const { status: overviewStatus } = useOverview();
  const location = useLocation();
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const showFloatingAsk =
    location.pathname !== '/ask' && !location.pathname.startsWith('/company/');

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const drawer = drawerRef.current;
    const focusables = drawer
      ? Array.from(
          drawer.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];

    closeButtonRef.current?.focus();
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      const trigger = menuButtonRef.current;
      if (trigger && trigger.getClientRects().length) {
        trigger.focus();
      } else if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
        previousFocus.focus();
      }
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-canvas" data-navigation-state={open ? 'open' : 'closed'}>
      <aside
        aria-label="Workspace navigation"
        className="fixed inset-y-0 left-0 z-30 hidden w-[236px] overflow-y-auto overscroll-contain border-r border-line bg-sidebar px-4 py-5 lg:block"
      >
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 lg:hidden">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="h-7 w-7 rounded-lg pb-1.5" />
          <span className="text-[13px] font-semibold tracking-tight">Capital Screener</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            className="icon-btn"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="fixed inset-0 z-40 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 w-[286px] animate-fade-in overflow-y-auto overscroll-contain border-r border-line bg-sidebar px-4 py-5 shadow-float"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setOpen(false)}
              className="icon-btn absolute right-3 top-4"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main
        data-overview-state={overviewStatus}
        className="pb-16 lg:pb-0 lg:pl-[236px]"
      >
        <div className="mx-auto w-full max-w-content px-4 py-6 md:px-7 md:py-7 xl:px-8">
          <OverviewStatus />
          {children}
        </div>
      </main>

      {showFloatingAsk ? (
        <nav aria-label="Quick actions" className="lg:hidden">
          <Link
            to="/ask"
            className="fixed bottom-5 right-4 z-20 inline-flex h-11 items-center gap-2 rounded-full border border-ink bg-ink px-4 text-[12px] font-medium text-canvas shadow-float transition-[background-color,transform] duration-150 hover:bg-ink-strong active:scale-[0.96]"
          >
            <MessageSquare className="h-4 w-4" />
            Ask Capital
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
