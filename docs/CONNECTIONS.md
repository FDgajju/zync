# Hosts & Connections — Architecture & Auth Reference

**Last updated:** 2026-08-13
**Applies to:** main after Zync v2.23.0
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
| Password → vault on save | Shipped | `ssh-password` vault item + host `authRef` |
| Private key **file path** | Shipped | Path on host; passphrase is per-connection memory, OS credential store, or Vault |
| Private key **paste → managed file** | Shipped | PEM written to `{dataDir}/keys/`; path on host |
| Paste / import key → vault | Shipped | Encrypted in `vault.redb` (+ optional key passphrase) |
| Existing vault credential | Shipped | Vault item via `authRef` |
| System SSH agent | Not shipped | — (virtual agent exists only for jump forwarding) |

---

## 2. Storage model

Keep **two stores by sensitivity** (do not merge hosts into `vault.redb`):

| Store | Holds | Notes |
|-------|--------|------|
| `connections.json` | Hosts, folders, `privateKeyPath`, `authRef`, optional plaintext login passwords, and legacy key passphrases pending migration | Readable without vault unlock — new local-key saves do not write passphrases here |
| `vault.redb` | Encrypted credentials (password / private key / optional key passphrase) | Passphrase-locked; exclusive redb lock |

**File-key metadata:** only the **path string** (`privateKeyPath`) is persisted on the host. Zync does **not** store file mtime/size/hash as a key-file catalog in redb. Optional migration may copy a key into `{dataDir}/keys/` and rewrite the path — still path-only on the host.

**Source of truth for auth linkage:** `authRef` → vault `credentialId` / `itemId` (see [VAULT.md §2](./VAULT.md#2-credential-identity-model)).

---

## 3. Add / edit connection UI (today)

Primary surface: `AddConnectionModal` (+ `useConnectionForm`, `useAutoVault`).

Auth method tabs:

1. **Password** — password field on the form/host.
   - **On this host** (default) — plaintext on the host record; can migrate later via Secure to vault.
   - **Save to Vault** (when a vault exists) — on Create/Save creates an `ssh-password` vault item and stores only `authRef` on the host (no plaintext password on the host).
2. **Private Key (local / non-vault)**
   - **File** — browse for a key path; path stored on host; read at connect time.
   - **Paste** — paste PEM; on save Zync writes a managed file under `{dataDir}/keys/` and stores only `privateKeyPath`.
   - Zync inspects the key locally. The passphrase field appears only for encrypted keys. It may be left blank when saving a host; Zync asks on the first connection. Test requires a valid passphrase.
   - Retention is explicit: ask on each new connection, remember in the OS credential store, or move the key and passphrase into Vault. Choosing Vault only selects the destination; the Vault item and host are written together when the user presses Create/Save.
3. **Vault** (shown when vault exists — locked or unlocked)
   - **Existing** — pick a vault credential (`authRef`) — password or private-key kinds.
   - **Paste** — paste PEM (+ optional passphrase) into vault; set `authRef`.
   - **Import file** — read a local key file into vault; set `authRef`.

Other flows: Import from SSH config, quick-connect / paste SSH command (welcome), secure-to-vault from Settings. SSH-config import inspects accessible `IdentityFile` entries and marks encrypted, invalid, or unavailable key files for attention; it does not import a passphrase.

---

## 4. Connect-time auth resolution

Frontend builds a connect config (`buildConnectConfig` / form transforms):

- `authRef` → `VaultRef` → backend resolves to password or key material (+ stored passphrase if present).
- Else `privateKeyPath` → `PrivateKey { key_path, passphrase }` — optional passphrase comes from the host `password` field when auth is key-based (same overloaded field used for login password vs `ssh-keygen` passphrase).
- Else password → `Password`.

Backend (`ssh.rs`) decodes file/vault key material with `russh_keys::decode_secret_key(..., passphrase)`. Add/edit host inspects selected or pasted key material locally. An encrypted local key may be saved without a passphrase, while Test requires a verified passphrase. Connect preflights local keys, prompts when an encrypted key has no usable passphrase, and retries with the verified value. This applies recursively to jump hosts.

For **Remember this key on this device**, the renderer never reads the remembered value. Rust loads it from the OS credential store into the temporary connect configuration. The credential is keyed by normalized private-key path, so hosts sharing that key also share its remembered state. Normal host edits never delete it; **Forget this key from this device** is the explicit key-level removal action. The credential store is protected by the signed-in OS account; Windows normally does not request the device password again when Zync stores or reads the value. Other platforms may show their native keychain unlock prompt. For **Ask every time**, the value remains in the active in-memory connection handle only, which allows transport recovery without writing it to disk; a new connection prompts again.

The add/edit form and connect-time prompt share the same retention control. Passphrase fields include show/hide and Caps Lock feedback. Connect-time Vault selection verifies the passphrase, unlocks Vault if needed, creates a uniquely named credential, updates the affected host (including a jump host), and resumes the original connection. Failed host persistence rolls back the newly created Vault item when possible.

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

**Shipped (current app):** Private Key = local file / paste→managed file; Vault = existing / paste / import-file. File, paste, and vault-import flows detect encrypted keys and verify entered passphrases locally. A local key may be saved without entering its passphrase; Zync prompts when connecting. See §3.

**Still planned / deferred:** system SSH agent; one-click migration reporting for any legacy records that have not connected or been edited; GitHub #90 close-out after a release verify.

### Current product model

**Password** — shipped
- Password auth on the host (local), or **Save to Vault** on create/edit to write an `ssh-password` item + `authRef`.
- Vault-first still works: add SSH password in Vault, then attach via **Vault → Existing**.

**Private key (local / non-vault)** — shipped
- Key **file** path (Browse).
- Optional **paste** that **writes a key file** under `{dataDir}/keys/…`, then stores **`privateKeyPath` only**.
- Optional **key passphrase** field (the `ssh-keygen` passphrase), wired through connect config via the host `password` field for key auth.

**Vault** — shipped
- Use **existing** vault credential.
- **Paste** key content (+ optional passphrase) into vault.
- **Import key file** into vault (read file → store encrypted; set `authRef`).

### Remaining follow-ups

1. Add an in-import passphrase resolution step. Imports are marked when `IdentityFile` is encrypted, invalid, or unavailable; connecting now opens the global passphrase prompt.
2. Add the system ssh-agent option under Private Key.
3. Reply / close GitHub #90 once verified in a release build.
4. Add soft empty-vault guidance when user wants vault paste but vault is uninitialized.

### Approved passphrase flow

1. The user selects or pastes a private key.
2. Rust inspects the key locally; private-key content and passphrase are not persisted by inspection.
3. Unencrypted keys show no passphrase control. For encrypted local keys, the passphrase can be entered now or deferred until connection.
4. Zync verifies any entered passphrase before Test or Save. A blank passphrase permits Save but not Test; connecting opens the global prompt.
5. The retention choice is explicit: **Ask every time**, **Remember this key on this device**, or **Save to Vault**. Remembered credentials are removed only through the explicit forget action.

New local-key saves clear the overloaded host `password` field. A successfully used legacy host-stored key passphrase is also removed from `connections.json`; the active connection retains its temporary in-memory copy until disconnect.

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
| Inspect key encryption / verify passphrase | `src-tauri/src/commands.rs` (`ssh_inspect_private_key`) |
| Device passphrase storage | `src-tauri/src/ssh_key_passphrase_cache.rs` |
| Connect-time prompt | `src/components/connections/GlobalKeyPassphraseModal.tsx` |
| Secure-to-vault | `src-tauri/src/vault/secure_to_vault.rs` |

---

## 9. Related docs

- [VAULT.md](./VAULT.md) — credential identity, vault kinds, sync
- [VAULT_ROADMAP.md](./VAULT_ROADMAP.md) — deferred vault/sync work; points here for host auth UX
- [SESSION_PERSISTENCE.md](./SESSION_PERSISTENCE.md) — tab/session restore (hosts stay disconnected until reconnect)
- [TUNNELS.md](./TUNNELS.md) — tunnels bound to `connection_id`
- Older refactor notes (historical): `mdfiles_and_doc/architecture/CONNECTION_FLOW_REFACTOR_PLAN.md`
- Marketing/docs site page: `zync-landing-page/src/app/docs/connections/page.tsx`
