# Hosts & Connections — Architecture & Auth Reference

**Last updated:** 2026-08-10  
**Applies to:** Zync v2.22.5+  
**User-facing guide:** [zync.thesudoer.in/docs/connections](https://zync.thesudoer.in/docs/connections)  
**Related:** [VAULT.md](./VAULT.md) (credential identity / vault secrets), [VAULT_ROADMAP.md](./VAULT_ROADMAP.md)

Canonical reference for **adding/editing hosts**, auth modes, where secrets live, and planned auth UX cleanup. Use this for connection-form / host-auth work; use VAULT docs for vault storage and sync.

---

## Table of Contents

1. [Executive summary](#1-executive-summary)
2. [Storage model](#2-storage-model)
3. [Add / edit connection UI (today)](#3-add--edit-connection-ui-today)
4. [Connect-time auth resolution](#4-connect-time-auth-resolution)
5. [Known inconsistency (issue #90)](#5-known-inconsistency-issue-90)
6. [Auth UX — shipped vs remaining](#6-auth-ux--shipped-vs-remaining)
7. [Non-goals](#7-non-goals)
8. [File map](#8-file-map)
9. [Related docs](#9-related-docs)

---

## 1. Executive summary

Zync hosts are lightweight records. **Secrets should not live on the host** when vault is used; the host holds an `authRef` into the vault instead.

| Auth path | Status | Where secret lives |
|-----------|--------|--------------------|
| Password on host | Shipped | Optional plaintext on host; secure-to-vault migrates |
| Private key **file path** | Shipped | Path on host; file on disk; optional passphrase on host |
| Private key **paste → managed file** | Shipped | PEM written to `{dataDir}/keys/`; path on host |
| Paste / import key → vault | Shipped | Encrypted in `vault.redb` (+ optional key passphrase) |
| Existing vault credential | Shipped | Vault item via `authRef` |
| System SSH agent | Not shipped | — (virtual agent exists only for jump forwarding) |

---

## 2. Storage model

Keep **two stores by sensitivity** (do not merge hosts into `vault.redb`):

| Store | Holds | Notes |
|-------|--------|------|
| `connections.json` | Hosts, folders, `privateKeyPath`, `authRef`, and optionally **plaintext** host login passwords / key passphrases (non-vault auth) | Readable without vault unlock — treat as sensitive on disk; prefer vault for secrets |
| `vault.redb` | Encrypted credentials (password / private key / optional key passphrase) | Passphrase-locked; exclusive redb lock |

**File-key metadata:** only the **path string** (`privateKeyPath`) is persisted on the host. Zync does **not** store file mtime/size/hash as a key-file catalog in redb. Optional migration may copy a key into `{dataDir}/keys/` and rewrite the path — still path-only on the host.

**Source of truth for auth linkage:** `authRef` → vault `credentialId` / `itemId` (see [VAULT.md §2](./VAULT.md#2-credential-identity-model)).

---

## 3. Add / edit connection UI (today)

Primary surface: `AddConnectionModal` (+ `useConnectionForm`, `useAutoVault`).

Auth method tabs:

1. **Password** — password field on the form/host.
2. **Private Key (local / non-vault)**
   - **File** — browse for a key path; path stored on host; read at connect time.
   - **Paste** — paste PEM; on save Zync writes a managed file under `{dataDir}/keys/` and stores only `privateKeyPath`.
   - **Passphrase** — optional `ssh-keygen` passphrase (stored on the host record in the existing `password` field for key auth).
3. **Vault** (shown when vault exists — locked or unlocked)
   - **Existing** — pick a vault credential (`authRef`).
   - **Paste** — paste PEM (+ optional passphrase) into vault; set `authRef`.
   - **Import file** — read a local key file into vault; set `authRef`.

Other flows: Import from SSH config, quick-connect / paste SSH command (welcome), secure-to-vault from Settings.

---

## 4. Connect-time auth resolution

Frontend builds a connect config (`buildConnectConfig` / form transforms):

- `authRef` → `VaultRef` → backend resolves to password or key material (+ stored passphrase if present).
- Else `privateKeyPath` → `PrivateKey { key_path, passphrase }` — optional passphrase comes from the host `password` field when auth is key-based (same overloaded field used for login password vs `ssh-keygen` passphrase).
- Else password → `Password`.

Backend (`ssh.rs`) decodes file/vault key material with `russh_keys::decode_secret_key(..., passphrase)`. There is **no interactive unlock prompt** for a missing key passphrase today — if the key is encrypted and no passphrase is stored on the host, decode fails.

Zync’s “agent” in `ssh.rs` is a **virtual agent for ProxyJump key forwarding** after Zync has loaded a key — not “use keys already in the OS ssh-agent.”

---

## 5. Known inconsistency (issue #90)

Reporter observation (was correct before the auth UX split):

- Key **file** auth did not prompt for a key passphrase and did not offer system SSH agent.
- **Paste to Vault** had a passphrase field (the `ssh-keygen` private-key passphrase).
- Paste key **content** without vault was not supported.

**Shipped fix (partial):** Private Key is local-only (file / paste→managed file + passphrase). Vault owns existing / paste / import-file. System SSH agent remains deferred.

Tracked as GitHub issue **#90** (`Prompt for passphrase`).

---

## 6. Auth UX — shipped vs remaining

**Shipped (current app):** Private Key = local file / paste→managed file + passphrase; Vault = existing / paste / import-file. See §3.

**Still planned / deferred:** system SSH agent; prefer vault over long-lived host-stored key passphrases; GitHub #90 close-out after a release verify.

### Current product model

**Password**
- Password auth (unchanged).

**Private key (local / non-vault)** — shipped
- Key **file** path (Browse).
- Optional **paste** that **writes a key file** under `{dataDir}/keys/…`, then stores **`privateKeyPath` only**.
- Optional **key passphrase** field (the `ssh-keygen` passphrase), wired through connect config via the host `password` field for key auth.

**Vault** — shipped
- Use **existing** vault credential.
- **Paste** key content (+ optional passphrase) into vault.
- **Import key file** into vault (read file → store encrypted; set `authRef`).

### Remaining follow-ups

1. System ssh-agent option under Private Key.
2. Prefer migrating local key passphrases into vault (secure-to-vault) rather than long-lived plaintext on the host.
3. Reply / close GitHub #90 once verified in a release build.
4. Soft empty-vault guidance when user wants vault paste but vault is uninitialized.

### Test-without-save (security note)

- **Local Paste Test** and **Vault Paste / Import Test** both use an **ephemeral** file under `{dataDir}/tmp-keys/`, deleted after the test.
- Local Paste **Save** writes a durable managed file under `{dataDir}/keys/` and stores only `privateKeyPath` on the host.
- Vault Paste / Import write to `vault.redb` only on Save — never during Test.

---

## 7. Non-goals

- Merging `connections.json` into `vault.redb`.
- Storing plaintext private-key PEM on the host record as a long-term design.
- Treating vault unlock passphrase as the same thing as an SSH key passphrase (they are different).

---

## 8. File map

| Area | Path |
|------|------|
| Add/edit modal | `src/components/modals/AddConnectionModal.tsx` |
| Form state | `src/components/modals/useConnectionForm.ts` |
| Paste → vault | `src/components/modals/useAutoVault.ts` |
| Domain connect config | `src/features/connections/domain/connectionConfig.ts` |
| Form → backend shapes | `src/features/connections/domain/formTransforms.ts` |
| Types | `src/features/connections/domain/types.ts` |
| Persistence / IPC | `src/features/connections/infrastructure/` |
| Store | `src/store/connectionSlice.ts` |
| SSH auth | `src-tauri/src/ssh.rs` |
| Auth enums / saved host | `src-tauri/src/types.rs` |
| Vault resolve on connect | `src-tauri/src/commands.rs` (`resolve_vault_refs`) |
| Key path migrate into data dir | `src-tauri/src/commands.rs` (`ssh_migrate_all_keys`) |
| Paste → managed key file | `src-tauri/src/commands.rs` (`ssh_write_managed_key`) |
| Read local key for vault import | `src-tauri/src/commands.rs` (`ssh_read_local_key_file`) |
| Secure-to-vault | `src-tauri/src/vault/secure_to_vault.rs` |

---

## 9. Related docs

- [VAULT.md](./VAULT.md) — credential identity, vault kinds, sync
- [VAULT_ROADMAP.md](./VAULT_ROADMAP.md) — deferred vault/sync work; points here for host auth UX
- [SESSION_PERSISTENCE.md](./SESSION_PERSISTENCE.md) — tab/session restore (hosts stay disconnected until reconnect)
- [TUNNELS.md](./TUNNELS.md) — tunnels bound to `connection_id`
- Older refactor notes (historical): `mdfiles_and_doc/architecture/CONNECTION_FLOW_REFACTOR_PLAN.md`
- Marketing/docs site page: `zync-landing-page/src/app/docs/connections/page.tsx`
