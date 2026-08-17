# Notifications

**Last updated:** 2026-08-18  
**Status:** modular package + public `notify` API + localStorage inbox (not forever)

## Goals

| Goal | Approach |
|------|----------|
| Modular | Pure modules under `src/features/notifications/` |
| External usable | `import { notify } from '@/features/notifications'` (plugins/features) |
| Multiple options | `NotifyOptions` + optional `channel` |
| Not forever | Cap **50** + auto-prune older than **7 days**; user **Clear all** |
| No app-data file | Inbox in **localStorage** only (prefs still in settings) |
| Robust | Soft-fail storage; action handlers separate from serializable history |

---

## Architecture

```text
features/notifications/
  types.ts          — Toast, NotifyOptions, settings, limits
  policy.ts         — duration + shouldStoreInHistory (+ channel)
  buildToast.ts     — pure toast builder
  historyOps.ts     — prepend / prune / unread / sanitize
  storage.ts        — localStorage load/save
  layout.ts         — corner CSS helpers
  actionRegistry.ts — in-memory action onClick map
  hideTimers.ts     — auto-hide pause/resume
  notify.ts         — public notify.* API (store-bound)
  notificationSound.ts
  index.ts          — public barrel
  notificationHistory.ts — back-compat re-exports

store/toastSlice.ts — thin Zustand adapter (UI + showToast)
components/notifications/* — Bell, Center, appearance
```

**Data flow**

```text
notify / showToast
  → buildToast (policy)
  → live stack and/or history
  → localStorage (history only, pruned)
```

---

## Kinds

### Visual types

| Type | Default duration | Default inbox? |
|------|------------------|----------------|
| `success` | ~4s | No |
| `info` | ~4s | No |
| `warning` | ~6s | Yes |
| `error` | ~8s | Yes |

### Lifecycle

| Kind | Screen | Inbox |
|------|--------|-------|
| Ephemeral | Auto-hide | Never |
| History | Auto-hide or sticky | Yes |
| Sticky (`duration: 0` / `persist`) | Until dismiss | Yes |
| Actionable | Until dismiss/action | Yes |

### Policy (`shouldStoreInHistory`)

1. `channel: 'toast'` → no  
2. `channel: 'inbox' | 'both'` → yes  
3. `history: false` → no  
4. `history: true` → yes  
5. sticky / actions → yes  
6. `error` / `warning` → yes  
7. else → ephemeral  

---

## External API (app features)

```ts
import { notify } from '../features/notifications';

// Preferred for new feature code
notify.success('Copied 3 item(s)');
notify.error('Failed to save', { persist: true });
notify.info('Sync finished', { history: true, source: 'sync' });
notify.warning('Slow network', { channel: 'both' });
notify.emit('error', 'Upload failed', {
  actions: [{ id: 'retry', label: 'Retry', onClick: () => retry() }],
});
```

Legacy (still supported):

```ts
get().showToast('success', 'Copied');
useAppStore.getState().showToast('error', 'Failed', 8000);
```

## Plugin API

Plugins never import the store. They use the worker host API:

```js
// Inside a plugin
await zync.ui.notify({
  type: 'error',              // success | info | warning | error
  message: 'Deploy failed',   // or body / title
  persist: true,
  history: true,              // force inbox
  channel: 'both',            // optional: auto | toast | inbox | both
  duration: 8000,
  silent: false,
  id: 'deploy-failed',
  actions: [{ id: 'retry', label: 'Retry' }],  // no functions — JSON only
});
```

Host bridge (`PluginContext` → `api:ui:notify`):

1. Parses payload with `parsePluginUiNotify(pluginId, payload)`
2. Sets `source: 'plugin:<pluginId>'`
3. Namespaces caller `id` to `plugin:<pluginId>:<id>` (host storage only)
4. Calls `notify.emit(type, message, options)`
5. For each action, host attaches `onClick` that posts back (with in-flight lock):

```text
type: 'api:ui:notify:action'
payload: { pluginId, actionId, notificationId, message, type }
```

**Plugin action helper (preferred) — with result:**

```js
const stop = zync.ui.onNotifyAction(async (payload) => {
  // payload: { requestId, pluginId, actionId, notificationId?, message, type }
  if (payload.actionId === 'retry') {
    try {
      await doRetry();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'Retry failed' };
    }
  }
  return { ok: true };
});
// later: stop();
```

Host behavior:

1. Posts `api:ui:notify:action` with `requestId`
2. Waits up to **15s** for `api:ui:notify:action:response`
3. **ok** → dismisses that notification  
4. **error / timeout** → shows an error toast (`source: plugin:<id>`), keeps the original action notification

```text
Host → Plugin:  api:ui:notify:action        { requestId, actionId, ... }
Plugin → Host:  api:ui:notify:action:response { requestId, result: { ok, error? } }
             or { requestId, error: '...' }
```

**Policy** is the same as app toasts: success/info ephemeral by default; errors/warnings → inbox; sticky/actions → inbox.

### Inbox a11y

Notification center uses `role="dialog"` + **`aria-modal="true"`** with:

- Focus moves into the panel on open  
- **Tab cycle trapped** inside the panel  
- Esc / outside click closes  
- Focus restored to the control that opened it (usually the bell)

### `NotifyOptions`

| Field | Role |
|-------|------|
| `duration` | Auto-hide ms; `0` sticky |
| `persist` | Sticky + inbox |
| `history` | Force in/out of inbox |
| `channel` | `auto` \| `toast` \| `inbox` \| `both` |
| `actions` | Buttons (callbacks in-session only) |
| `silent` | No sound |
| `id` | Optional stable id (replaces live toast with same id) |
| `source` | Debug / future filter tag |

---

## Surfaces & prefs

| Surface | Notes |
|---------|--------|
| Live toasts | Corner; hover/focus pauses hide; aria-live host stays mounted |
| Bell | Follows corner (title bar or status bar) |
| Inbox | List, actions, clear, gear prefs; focus restore; relative times refresh |

Prefs (`settings.notifications`, gear in inbox): `position`, `doNotDisturb`, `playSound`.

---

## Persistence rules

| What | Where | Lifetime |
|------|--------|----------|
| Prefs | `settings.json` | Until user changes |
| Inbox | `localStorage` `zync.notificationHistory.v1` | Until Clear, **or** age > 7 days, **or** over 50 items |
| Actions | Memory | Session / until dismiss |
| Live toasts | Memory | Session |

---

## File map

| Role | Path |
|------|------|
| Public API | `src/features/notifications/index.ts`, `notify.ts` |
| Store adapter | `src/store/toastSlice.ts` |
| UI | `src/components/notifications/*`, `src/components/ui/Toast.tsx` |
| Tests | `tests/notificationHistory.test.mjs` |
