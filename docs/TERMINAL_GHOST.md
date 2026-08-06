# Terminal Ghost Suggestions — Current Documentation

**Last updated:** 2026-07-06  
**Terminal stack:** [TERMINAL.md](./TERMINAL.md)

Canonical reference for Zync’s inline ghost suggestion system: product behavior, architecture, settings, and operations.

---

## Table of Contents

1. [What it is](#1-what-it-is)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [Guiding principles](#3-guiding-principles)
4. [Architecture](#4-architecture)
5. [Suggestion engine](#5-suggestion-engine)
6. [Input routing and key bindings](#6-input-routing-and-key-bindings)
7. [Scoping and context](#7-scoping-and-context)
8. [Native shell coexistence](#8-native-shell-coexistence)
9. [Settings](#9-settings)
10. [WSL path completion](#10-wsl-path-completion)
11. [SSH history import](#11-ssh-history-import)
12. [IPC commands](#12-ipc-commands)
13. [File map](#13-file-map)
14. [Debugging](#14-debugging)
15. [Testing](#15-testing)
16. [Known limits](#16-known-limits)
17. [Future plans](#17-future-plans)

---

## 1. What it is

Ghost suggestions show **faded inline text** at the terminal cursor while you type — similar to fish shell autosuggest. Zync completes from:

- **Command history** — frecency-ranked commands per terminal scope (local or per SSH connection)
- **Filesystem paths** — directory listings via `fs_list` (Windows host, WSL, SSH remote)

The user accepts a suggestion with **→** (right arrow). **Tab always goes to the shell** for native completion.

**Shipped surface (inline only):**

| Capability | Status |
|------------|--------|
| Inline faded suffix while typing | Shipped |
| History provider (Rust frecency, per scope) | Shipped |
| Filesystem path provider (local + WSL + SSH) | Shipped |
| Accept via → / Alt+→ / Ctrl+→ | Shipped |
| Tab passes to shell; ghost dismisses until line reset | Shipped |
| Pipeline / multisegment lines (`\|`, `;`, `&&`) | Shipped |
| Context-aware ranking (cwd + session commands) | Shipped |
| SSH shell-history seed on connect (opt-in) | Shipped |
| Native fish/zsh suppression policy | Shipped |
| Tab popup suggestion list | **Removed** (v2.19.2) — not planned unless rebuilt shell-safe |

Ghost runs **outside the shell** — in the renderer and Tauri backend — so it works on any connection without shell plugins or injection.

---

## 2. Goals and non-goals

### Goals

- Fast, low-latency inline completions while typing
- Accurate suffix spacing (word glue vs path fragments vs leading space)
- Per-connection isolation — Server A history never leaks to Server B
- Complement native shells (fish, zsh-autosuggestions) instead of fighting them
- Single Rust decision engine; TypeScript renders and routes keys only
- Fail-soft UX — timeouts, desync, and suppression degrade to “no ghost” rather than wrong text

### Non-goals (current scope)

- Fuzzy shorthand matching (`gc` → `git commit`) — deferred
- Tab-triggered popup lists — removed; any list UI must use a non-Tab trigger
- Shell plugin installation or prompt injection
- Cross-host history merge by default
- Sub-50 ms completion latency at scale (acceptable for desktop terminal today)

---

## 3. Guiding principles

1. **Accuracy before intelligence** — wrong ghost text is worse than no ghost text.
2. **Shell owns Tab** — fish/zsh/bash completion must not be intercepted; Zync owns → for inline accept.
3. **Complement native shells** — suppress Zync ghost when fish or zsh-autosuggestions is active.
4. **Backend-first decisions** — ranking, path logic, and suffix spacing live in Rust; TS is thin.
5. **Per-connection scope** — history, imports, and path listing follow the active terminal backend.

---

## 4. Architecture

```text
xterm.onData
  → inputQueue (serialized — ghost cannot reorder shell keystrokes)
    → useTerminalGhost / handleGhostInputEvent
      → inputTracker (line buffer, accept/dismiss, desync)
        → runtime (debounce, stale guards)
          → client.resolveInlineSuggestion()
            → ghost_suggest_v2 IPC (Rust suggest_engine)
              → history (frecency + context ranking)
              → path (fs_list / fs_list_wsl / remote fs_list)
      → GhostSuggestionOverlay (faded suffix at cursor)
      → ghost_accept / ghost_commit on accept / Enter
```

### Layer responsibilities

| Layer | Role |
|-------|------|
| **UI** | `GhostSuggestionOverlay.tsx` — render suffix; theme via CSS variables |
| **Hook** | `useTerminalGhost.ts` — bind xterm input, settings, cwd, recent lines |
| **Input** | `inputTracker.ts` + `escapeInput.ts` — line buffer, key routing, desync |
| **Runtime** | `runtime.ts` — debounce, suppression checks, IPC orchestration |
| **Client** | `client.ts` — single `ghost_suggest_v2` call; no provider merge in TS |
| **Backend** | `suggest_engine.rs` — pick history vs path, normalize suffix, return confidence |
| **Persistence** | `manager.rs` — scoped frecency store, commit/accept, import flags |

**Visibility:** Ghost IPC is skipped when the shell tab is hidden (`isVisibleRef`).

**Popup IPC:** `ghost_candidates` remains in Rust for a possible future list UI; inline ghost does not use it today.

---

## 5. Suggestion engine

All inline decisions flow through **`ghost_suggest_v2`** and `suggest_engine.rs`.

### Request (TypeScript → Rust)

```typescript
{
  prefix: string;           // full current line (active segment parsed in Rust)
  scope?: string;           // ghost history scope (local or connection id)
  cwd?: string;             // last known working directory
  shellId?: string;         // wsl, wsl:Distro, fish, zsh, etc.
  fsConnectionId?: string;  // filesystem backend (defaults to scope)
  recentCommands?: string[]; // in-session commands from scrollback (ranking boost)
  providers: { history?: boolean; filesystem?: boolean };
  debug?: boolean;          // returns rawSuffix + spacingReason
}
```

### Response

```typescript
{
  suffix: string;
  confidence: number;
  suppressReason?: string;   // e.g. "no_match", "no_command"
  rawSuffix?: string;        // debug only
  spacingReason?: string;    // debug only — glue, path_fragment, leading_space, etc.
}
```

### Provider selection order

1. **Guardrails** — skip empty lines, unmatched quotes, non-command contexts (`token.rs`)
2. **Path-first** when the active token looks path-oriented (`cd`, `ls`, trailing `/`, etc.)
3. **History** — frecency + `RankingContext` (cwd boost, recent-command boost) unless bare `cd` or open quote
4. **Path fallback** when history misses on non-path-preferring lines

Path listing and suffix normalization run entirely in Rust (`path_suggest.rs`, `suffix.rs`). TypeScript helpers (`commandTokens.ts`, `pathUtils.ts`) support tests and non-IPC utilities only.

### Suffix spacing

`normalize_suggestion_suffix` in `suffix.rs` decides whether to:

- Glue mid-token (`c` + `lear` → `lear`)
- Insert leading space for word completions (`cd` + `.acme.sh/` → ` .acme.sh/`)
- Strip duplicate space when the line already ends with whitespace
- Treat path fragments after separators (`/`, `\`)

This is the single source of truth for spacing — do not duplicate logic in TypeScript.

---

## 6. Input routing and key bindings

`InputTracker` maintains a local line buffer from `onData` bytes. It does **not** replace the shell — it mirrors typing for suggestion purposes.

| Key | Behavior |
|-----|----------|
| **→** (Right arrow) | Accept full ghost suffix when visible |
| **Tab** | Always forwarded to PTY; dismisses ghost; enters **desync** until Enter / Ctrl+C / Ctrl+U |
| **Alt+→** / **Alt+F** | Accept next word of suffix |
| **Ctrl+→** | Accept next path component |
| **Enter** | Commit command to frecency history; hard reset |
| **Ctrl+C** / **Ctrl+U** | Hard reset line buffer |
| **Arrow Left/Right, Home, End** | Desync without wiping buffer — ghost pauses until line stabilizes |
| **Ctrl+R / Up** (history search) | Desync until line reset |

**Desynced mode:** After shell Tab completion or cursor/history edits, Zync suppresses new ghost fetches until the line is reset. This prevents stale suffixes after the shell rewrites the line.

---

## 7. Scoping and context

### History scope

- **Local terminal** — scope `"local"` (or terminal key)
- **SSH tab** — scope = connection id; history is isolated per host

Commits on Enter and accepts update the scoped frecency store in `GhostManager`.

### Working directory

`lastKnownCwd` is maintained from:

- Passive prompt sniffing (`promptCwdSniffer.ts`)
- `cd` target resolution (`cwdTracking.ts`)
- OSC 7 sequences (see [TERMINAL.md](./TERMINAL.md))
- WSL `wsl_get_cwd` when needed

Cwd feeds path listing roots and history ranking boosts (prefer paths under the current directory).

### Session context

`recentCommands` is extracted from terminal scrollback (`recentCommands.ts`) and passed into Rust so repeated in-session command families rank higher — without crossing connection boundaries.

### Active segment parsing

For `cmd1 | cmd2`, `a && b`, `a; b` — Rust parses the **tail segment** under the cursor (`parser.rs`, `activeSegment.ts` on TS side for tests). Ghost suggests only on the active command, not the full line prefix.

---

## 8. Native shell coexistence

Settings → Terminal → Ghost suggestions → **Native shell policy**:

| Policy | Behavior |
|--------|----------|
| **Auto** (default) | Suppress on fish; suppress on zsh only when zsh-autosuggestions plugin is detected |
| **Always** | Show Zync ghost even on fish/zsh |
| **Off** | Suppress on all detected native shells (fish, zsh, bash/sh) |

Zsh detection probes `~/.zshrc` and related init files once per session (`zshAutosuggestDetect.ts`). WSL tabs read Linux home init files via `wsl.exe`, not the Windows profile path.

---

## 9. Settings

**Settings → Terminal → Ghost suggestions** (`settings.ghostSuggestions`)

| Toggle | Default | Purpose |
|--------|---------|---------|
| Inline ghost text | on | Gray suffix at cursor |
| Context menu actions | off | Accept inline suggestion from terminal right-click menu |
| Import remote history on connect | off | One-time SSH `~/.bash_history` / `~/.zsh_history` seed (privacy opt-in) |
| Native shell policy | `auto` | fish/zsh coexistence (see §8) |
| Provider: history | on | Rust frecency history |
| Provider: filesystem | on | `fs_list` / `fs_list_wsl` path completion |

---

## 10. WSL path completion

On Windows, WSL tabs must list the **Linux filesystem**, not `%USERPROFILE%`.

### Backend selection

| Signal | Source |
|--------|--------|
| Tab `shellOverride` | Persisted at spawn — ground truth for PTY |
| Settings `localTerm.windowsShell` | Default for new local tabs |
| Linux cwd | `lastKnownCwd`, prompt sniffer, `wsl_get_cwd` |
| `resolveWslShellIdForPathCompletion` | Merges signals in `wslShell.ts` |

When WSL is resolved, path listing uses `fs_list_wsl` instead of host `fs_list`.

### Implementation notes

- Listing runs via `wsl.exe -- sh -lc` with the path **inlined** in the script — shell variable assignments are unreliable when spawned from the Windows host.
- `ls -1AF` output parsed in Rust (`/` → directory, `@` → symlink).
- Cold-start mitigations: longer timeout, in-memory cache (~1.2 s TTL), `prefetchWslHomeListing` on terminal-ready.

---

## 11. SSH history import

When **Import remote history on connect** is enabled, `connectionSlice` triggers `ghost_seed_remote_history` after SSH connect:

1. Read `~/.zsh_history` / `~/.bash_history` via SFTP (10 s timeout)
2. Parse shell-specific formats (`history_import.rs`)
3. Seed up to 500 commands into the scoped frecency pool (display-only weighting)
4. Mark scope as imported — never re-imports on reconnect

Raw history lines are never logged. Import requires history provider + inline ghost enabled.

---

## 12. IPC commands

| Command | Purpose |
|---------|---------|
| `ghost_suggest_v2` | **Primary** — inline suffix decision (history + path) |
| `ghost_commit` | Record executed command on Enter |
| `ghost_accept` | Boost frecency when user accepts a suggestion |
| `ghost_seed_remote_history` | One-time SSH history import |
| `ghost_suggest` | Legacy history-only suggest (superseded by v2) |
| `ghost_candidates` | Ranked candidate list — reserved for future list UI |

Supporting filesystem IPC: `fs_list`, `fs_list_wsl`, `wsl_get_cwd`, `read_wsl_zsh_init_files`.

---

## 13. File map

### Frontend UI

| File | Role |
|------|------|
| `src/components/terminal/Terminal.tsx` | Mounts `useTerminalGhost` |
| `src/components/terminal/useTerminalGhost.ts` | Ghost runtime binding |
| `src/components/terminal/GhostSuggestionOverlay.tsx` | Inline suffix overlay |
| `src/components/terminal/TerminalHost.tsx` | Layout + overlay mount |
| `src/components/terminal/TerminalContextMenu.tsx` | Optional context-menu accept |

### Frontend logic (`src/lib/ghostSuggestions/`)

| File | Role |
|------|------|
| `client.ts` | IPC: `ghost_suggest_v2`, commit, accept, seed, prefetch |
| `inputTracker.ts` | Line buffer, accept keys, desync |
| `runtime.ts` | Debounce, stale guards, input routing |
| `escapeInput.ts` | Escape-sequence classification |
| `shellSuppression.ts` | Native shell policy |
| `zshAutosuggestDetect.ts` | Zsh plugin probe |
| `commandTokens.ts` | Command/path heuristics (tests + helpers) |
| `pathUtils.ts` | Path helpers (tests + helpers) |
| `activeSegment.ts` | Pipeline segment parsing (tests) |
| `recentCommands.ts` | Scrollback extraction for ranking context |
| `cwdTracking.ts` | `cd` target resolution |
| `promptCwdSniffer.ts` | Passive cwd from prompt text |
| `wslShell.ts` | WSL shell id + cwd resolution |
| `suggestionSuffix.ts` | TS suffix helpers (tests mirror Rust) |
| `ghostDebug.ts` | `localStorage` debug toggle |
| `cursorPosition.ts` | Cell → pixel coords for overlay (char-measure width + viewport row height) |

### Backend Rust (`src-tauri/src/ghost/`)

| File | Role |
|------|------|
| `suggest_engine.rs` | **Decision engine** — provider order, IPC v2 response |
| `manager.rs` | Scoped store, persistence, suggest/commit/accept |
| `path_suggest.rs` | Path listing + completion suffix |
| `suffix.rs` | Suffix spacing normalization |
| `ranking.rs` | Frecency + context-weighted scoring |
| `parser.rs` | Prefix / active-segment extraction |
| `token.rs` | Line guards, path vs command detection |
| `context.rs` | `RankingContext` (cwd, recent commands) |
| `history_import.rs` | Shell history file parsing |
| `history_seed.rs` | SSH import orchestration |
| `suggest_types.rs` | v2 request/response types |
| `commands.rs` | Tauri command handlers |
| `types.rs` | Frecency models and constants |

### Settings and tests

| File | Role |
|------|------|
| `src/store/settingsSlice.ts` | `ghostSuggestions` schema |
| `src/components/settings/tabs/TerminalTab.tsx` | Ghost toggles UI |
| `src/store/connectionSlice.ts` | SSH history seed on connect |
| `tests/ghostSuggestionsHelpers.test.mjs` | TS helper + input behavior tests |
| `src-tauri/src/ghost/*.rs` | Rust unit tests inline in modules |

---

## 14. Debugging

Enable verbose ghost logging in devtools:

```javascript
localStorage.setItem('zync:ghost-debug', '1');
// reload terminal tab
```

Logs include `rawSuffix`, `spacingReason`, `suppressReason`, and IPC phases via `ghostDebug.ts`.

---

## 15. Testing

From `zync/`:

```bash
npm run test:ghost-helpers    # TS helpers, inputTracker, spacing fixtures
cargo test ghost --manifest-path src-tauri/Cargo.toml   # Rust ghost modules
```

**Manual smoke checklist:**

- Local bash — `c` → `lear` (no leading space); `cd` + `.folder/` spacing
- Local fish — ghost suppressed when policy = Auto
- SSH zsh — per-scope history; optional history import on connect
- Tab reaches shell; no stale ghost after shell Tab completion
- → accepts ghost without duplicate characters
- Server A history does not appear on Server B

---

## 16. Known limits

| Area | Limit |
|------|-------|
| Matching | Strict prefix only — no fuzzy shorthand |
| WSL listing | Per-request `wsl.exe` spawn on cache miss — latency on cold start |
| WSL detection | Heuristic from cwd when tab metadata is stale |
| Cwd | Prompt regex sniffing — custom themes may need OSC 7 |
| Buffer sync | Desync after shell edits — ghost pauses rather than tracks shell buffer |
| vi/emacs readline | `bindkey -v` etc. may not match `InputTracker` assumptions |
| List UI | No popup; `ghost_candidates` unused by inline ghost |

These are acceptable for current product scale. Infrastructure improvements are listed in §17.

---

## 17. Future plans

Deferred work — not required for the shipped inline ghost feature.

### AI-assisted suggestions

Zync already has an AI sidebar and command bar (`src/ai/`, `src/components/ai/`). Ghost and AI serve different moments:

| Mode | When | Source |
|------|------|--------|
| **Ghost (today)** | Character-by-character while typing | Local history + filesystem |
| **AI (today)** | Explicit ask — sidebar, command bar | LLM providers |

**Possible integration (not implemented):**

- **AI ghost provider** — optional third provider in `suggest_engine` that calls a fast/local model for suffix prediction on high-confidence prefixes; gated by setting and latency budget.
- **Context handoff** — pass `recentCommands`, `cwd`, and connection metadata into AI context (same signals as §7) for command generation in the sidebar, with “insert as ghost” or “run” actions.
- **Unified ranking** — treat AI proposals as low-confidence candidates behind history/path unless user opts into “AI-first” mode.

Design constraint: inline ghost must stay **sub-100 ms** for history/path; AI belongs on a separate async path with clear loading/disabled states — not blocking the keystroke pipeline.

### Infrastructure hardening

- **Immutable `sessionBackend`** on tab at spawn (`windows` | `wsl` | `ssh`) — stop inferring WSL from cwd alone
- **WSL list sidecar** — long-lived helper inside distro instead of per-request `wsl.exe`
- **OSC 7 defaults** — document shell snippets so prompt sniffing is fallback only
- **Provider registry** — ranked merge for future sources (git branch, docker context, snippets)

### Deferred UX features

- **Fuzzy matching** — conservative subsequence only when frecency confidence is very high (`gc` → `git commit`); off by default
- **Popup list v2** — only with non-Tab trigger (Ctrl+Space or double-Tab), default off, auto-off on fish/zsh; reuse `ghost_candidates` IPC

### Change checklist

When modifying ghost behavior, update in the same change:

- This document (if behavior or architecture changes)
- [TERMINAL.md](./TERMINAL.md) §15 (short summary only)
- `tests/ghostSuggestionsHelpers.test.mjs` and Rust ghost tests
- Overlay colors remain **CSS-variable-based** for theme compatibility

---

## Related documents

- [TERMINAL.md](./TERMINAL.md) — integrated terminal stack, input queue, CWD capture
- [SESSION_PERSISTENCE.md](./SESSION_PERSISTENCE.md) — tab restore (ghost history is per scope)