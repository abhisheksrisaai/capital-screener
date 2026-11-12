# State map

This app keeps state close to the surface that owns it. Async work that can be
interrupted, retried, or rendered stale uses a pure reducer. Presentation toggles
that never race stay as local `useState`.

## Explicit machines

| Machine | States | Why it exists | Observable output |
| --- | --- | --- | --- |
| `resourceMachine` | `idle → loading → ready`, `ready → refreshing → ready`, `refreshing → stale` | The overview must never blank out during a refresh, and a late request must not replace newer data. | `main[data-overview-state]`, status banner, retry live region |
| `chatMachine` | `idle → submitting → ready`, `submitting → error → submitting` | Clearing a chat or changing companies must invalidate an in-flight answer. Failures must keep the question and allow retry without duplicating it. | `[data-chat-state]`, `[data-chat-scope]`, `role="log"`, polite status |
| `companyFallbackReducer` | `idle → loading → ready/error` | Navigating between companies must clear the previous company before the next response arrives. | `[data-company-source]`, filings `[data-filings-state]` |
| `memoReducer` | `idle → generating → success/error` | Memo generation is a one-shot write with a visible busy state and retryable failure. | `[data-memo-state]`, button `aria-busy`, live feedback |
| Screener URL state | filter/sort values in the URL | Filters, sorting, and empty results should survive reloads, sharing, and agent navigation. | `[data-result-count]`, `[data-screener-sort]`, `role="status"` |
| Theme | `light`, `dark`, `system follow` | The pre-paint script owns the first frame; React owns later changes and persistence. | `html.dark`, `color-scheme`, `theme-color` |
| Navigation drawer | `closed`, `open` | A modal drawer needs focus entry, focus trapping, Escape, scroll lock, and focus restoration. | `[data-navigation-state]`, `aria-expanded`, `aria-controls` |

## Deliberately local

- Overview metric tab (`revenue`, `ebitda`, `pat`, `margin`) and `allReporters`
  are presentation toggles with no async transition.
- Theme selection is two choices, but its persistence and system listener are
  already isolated in `ThemeContext`.
- Backend answer intent routing is a stateless classifier, not a client
  lifecycle. It returns an `intent` value for observability but keeps no state
  between requests.

## Invariants

1. A stale response never writes to a newer scope.
2. A failed refresh never discards the last good snapshot.
3. Clearing a conversation or changing company aborts the current request.
4. Retry reuses the failed question instead of duplicating the transcript.
5. Every blocking state has a retry, and every busy state exposes `aria-busy`.
6. Every machine exposes a stable `data-*` state for agents and tests.
7. Pure transitions live in this folder and are tested with `npm test`.
