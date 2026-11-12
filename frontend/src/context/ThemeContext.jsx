import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'capital-screener-theme';
const ThemeContext = createContext(null);

function systemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storedTheme() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme, suppressTransitions = false) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  let guard;

  if (suppressTransitions) {
    guard = document.createElement('style');
    guard.textContent = '*,*::before,*::after{transition:none !important}';
    document.head.appendChild(guard);
    void document.body.offsetHeight;
  }

  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0F1110' : '#F6F6F2');

  if (guard) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => guard.remove());
    });
  }
}

function persistTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing can reject writes; the in-memory theme still works.
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => storedTheme() || systemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => {
      if (storedTheme()) return;
      const next = event.matches ? 'dark' : 'light';
      applyTheme(next, true);
      setThemeState(next);
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return;
    applyTheme(next, true);
    setThemeState(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, isDark: theme === 'dark', setTheme, toggleTheme }),
    [setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
