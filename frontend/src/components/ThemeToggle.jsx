import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/format';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export default function ThemeToggle({ compact = false, className }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const nextLabel = isDark ? 'light' : 'dark';

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(nextLabel)}
        className={cn(
          'icon-btn border border-line bg-surface text-muted hover:text-ink',
          className,
        )}
        aria-label={`Switch to ${nextLabel} theme`}
        title={`Switch to ${nextLabel} theme`}
      >
        <span className="relative grid h-4 w-4 place-items-center" aria-hidden="true">
          <Sun
            className={cn(
              'absolute h-4 w-4 transition-[opacity,transform] duration-200 ease-out',
              isDark ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
            )}
          />
          <Moon
            className={cn(
              'absolute h-4 w-4 transition-[opacity,transform] duration-200 ease-out',
              isDark ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
            )}
          />
        </span>
      </button>
    );
  }

  return (
    <div className={cn('rounded-[11px] border border-line bg-surface-muted p-1', className)}>
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Color theme">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-pressed={active}
              className={cn(
                'flex h-7 items-center justify-center gap-1.5 rounded-[7px] text-[10.5px] font-medium transition-[background-color,color,box-shadow] duration-150',
                active
                  ? 'bg-surface text-ink shadow-[var(--shadow-control)]'
                  : 'text-muted hover:bg-subtle hover:text-ink',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
