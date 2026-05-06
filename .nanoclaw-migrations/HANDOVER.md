# Handover — v1 → v2 migration in progress

**Paused:** 2026-05-06 evening session
**Reason:** Conversation context approaching healthy fraction of 1M; clean checkpoint reached.

## TL;DR for the fresh session

The v1 install at `/Users/sergioiacobucci/Documents/nanoclaw` is **untouched and still running** (launchd `com.nanoclaw` PID was 54585 on Apr 22, runs from `dist/index.js`). Don't break this.

A fully-seeded **v2 sibling** sits at `/Users/sergioiacobucci/Documents/nanoclaw-v2`, on branch `wip/v2-migration-in-progress`. Push pending or already at `git@github.com:dialog-sergio/nanoclaw.git` (remote name: `fork`).

The user wants to continue the migration in a fresh session. End goal: build a new agent called **Ledger** (FreeAgent invoice matcher) on the migrated v2 base. Ledger work hasn't started — it's blocked on completing the migration.

## Where each piece lives

| Path | Purpose |
|---|---|
| `/Users/sergioiacobucci/Documents/nanoclaw` | v1 install. Service runs from here. **Read-only during migration.** |
| `/Users/sergioiacobucci/Documents/nanoclaw-v2` | v2 sibling. All migration work happens here. |
| `/Users/sergioiacobucci/Documents/nanoclaw/.nanoclaw-migrations/` | Migration guide — index.md + 9 hand-authored sections (`01-skills.md` … `09-tooling.md`) describing v1's bespoke customizations |
| `/Users/sergioiacobucci/Documents/nanoclaw/.nanoclaw-migrations/v1-data/` | Driver-extracted JSONs from v1 (registered groups, sessions, scheduled tasks, etc.) — gitignored |
| `/Users/sergioiacobucci/Documents/nanoclaw/.nanoclaw-migrations/guide.md` | Driver-auto-generated guide — gitignored, reference only |
| `/Users/sergioiacobucci/Documents/nanoclaw-v2/data/v2.db` | Seeded central DB — gitignored |
| `/Users/sergioiacobucci/Documents/nanoclaw-v2/groups/*/CLAUDE.local.md` | Copied from v1 — gitignored |

## Backup / rollback refs (all on origin = `git@github.com:dialog-sergio/nanoclaw.git`)

| Ref | What | Restore command |
|---|---|---|
| `pre-v2-backup` (tag) | v1 main as it was before any of today's work began (d362067) | `git -C ~/Documents/nanoclaw reset --hard pre-v2-backup` |
| `pre-v2-2f6d85d-2026-05-06-19-00-56` (tag) | v1 immediately before the migration driver ran (created by driver) | same |
| `wip/pre-v2-uncommitted` (branch) | v1 with the 12 split commits but no migration guide | branch on origin |
| `backup/pre-migrate-ecd2d14-20260506-181326` (branch) | v1 with the 12 commits + migration guide | branch on origin |
| `wip/v2-migration-in-progress` (branch) | v2 sibling state (this commit) on `fork` remote | branch on `dialog-sergio/nanoclaw` |

## What's done

### Phase 1 — extract (complete)

- Wrote `.nanoclaw-migrations/{index,01-skills,02-personalization,03-misc-fixes,04-channel-followups,05-mcp-expansion,06-orchestrator-refactor,07-integration-health,08-claw-cli,09-tooling}.md` — 10 hand-authored intent-based migration documents committed to v1 main.

### Phase 2 — upgrade (in progress)

✅ Cloned v2 sibling from `upstream/migrate/v1-to-v2` (commit `5afe51b`).
✅ `pnpm install` (corepack + pnpm 10.33.0 + 277 packages).
✅ Channel adapters installed:
   - `add-whatsapp` — copied from `origin/channels`, Baileys 7.0.0-rc.9
   - `add-slack` — copied from `origin/channels`, Chat SDK 4.26.0
✅ Patches applied to v2 main (because channels-branch source has unmerged feature-branch dependencies):
   - `src/channels/adapter.ts`: added `isGroup?: boolean` to `InboundEvent.message` and `InboundMessage`
   - `src/channels/slack.ts`: type-cast for `bridge.resolveChannelName` assignment
   - `src/attachment-safety.ts`: copied from `origin/channels`
✅ Build clean, all 172 tests pass.
✅ v1→v2 migration driver (`setup/migrate.ts`) ran to completion via `bash migrate-v2.sh ../nanoclaw`:
   - v1 state extracted: 2 registered groups, 2 sessions, 6 scheduled tasks, owner inferred from `.env OWNER_USER_ID`
   - Safety tag `pre-v2-2f6d85d-2026-05-06-19-00-56` created in v1
   - v2 central DB initialized + 11 migrations applied
   - Seeded: 1 user (you, Owner), 2 agent_groups (Waco Planning whatsapp_main + Scout slack_scout), 2 messaging_groups, 2 wirings (`session_mode: shared`, `engage_mode: pattern`, patterns `@waco` + `@Scout`), 1 role (owner), 2 memberships
   - Copy step: 4 CLAUDE.local.md files + 10 custom skills + 3 env keys + NANOCLAW_ADMIN_USER_IDS appended
   - Build + tests passed

## What's left

Listed in suggested order. The driver invoked with `NANOCLAW_MIGRATE_SKIP=guide,rebuild` so two driver steps were intentionally bypassed — the guide is hand-authored, the rebuild is being done manually as Stage 2 below.

### Stage 1 — outstanding driver-time warnings

⚠️ "Could not resolve DM channel for owner whatsapp:447976777909@s.whatsapp.net on channel 'whatsapp'."
The owner must DM the bot once after v2 is live so the DM channel gets cached in `user_dms`. Self-resolves on first message.

### Stage 2 — apply hand-authored source customizations to the v2 sibling

Read each section file in `~/Documents/nanoclaw/.nanoclaw-migrations/` and decide per item whether to port to v2 source. **Most need intent-port, not file copy** — v2 has rewritten `src/index.ts`, `src/router.ts`, `src/container-runner.ts`, etc.

| Section | Recommendation for v2 |
|---|---|
| `02-personalization.md` | **Trivial.** The Notion family DBs section is already in `groups/main/CLAUDE.local.md` (copied by driver). Verify and adjust if needed. |
| `03-misc-fixes.md` | Image caption order: probably already handled by v2 add-image-vision (which isn't in v2 yet — see Stage 4). IPC TZ: v2's IPC mechanism is fully different ("everything is a message" via `inbound.db`/`outbound.db`) — this fix may not apply. WhatsApp version pin: verify `setup/whatsapp-auth.ts` already has `fetchLatestWaWebVersion`. |
| `04-channel-followups.md` | Slack mention/health: v2 Slack uses Chat SDK with HTTPS webhook — the v1 Socket Mode patch doesn't apply directly. Gmail stub: Gmail is `add-gmail-tool` in v2 (no full channel) — intent doesn't apply. WhatsApp LID env: verify v2 channels-branch whatsapp.ts has equivalent (LID handling has been substantially rewritten in Baileys 7). |
| `05-mcp-expansion.md` | **Highest-value port.** Notion/Browser/Sheets MCPs + per-group filtering. v2's agent-runner is on Bun (`container/agent-runner/src/index.ts` shape may differ); read v2's MCP config first. |
| `06-orchestrator-refactor.md` | **Likely SKIP.** v2's two-DB session split + outbound-confirmation delivery model probably already solves the cursor-after-delivery and idle-vs-working concerns natively. Read `docs/db-session.md` and `src/delivery.ts` before porting anything. |
| `07-integration-health.md` | Trivial port. Drop `src/integration-health.ts` and call `runIntegrationHealthChecks()` from v2's `src/index.ts` startup. |
| `08-claw-cli.md` | Port to v2 — but `scripts/claw` queries the v1 DB schema. Update SQL/table refs to match v2's `data/v2.db` schema. There's also an `/claw` skill in v2 main — check if v2's version supersedes the v1 one. |
| `09-tooling.md` | `dockerfile-pins.test.ts`: v2's Dockerfile may have a different pin layout — adapt or drop. Build-chain change (`tsc && ./container/build.sh`): v2 separates host (Node/pnpm) from container-runner (Bun) — chaining `./container/build.sh` into `pnpm run build` is reasonable but check the new Bun image build first. |

### Stage 3 — channel credentials reconfiguration

**Slack v2 uses Chat SDK with HTTPS webhook**, not v1's Socket Mode. Need a public URL for Slack to POST events to. Options:
- ngrok (free tier, URL changes on restart unless you pay)
- cloudflare tunnel (free, stable URL with subdomain)
- tailscale funnel (free, integrates with existing tailnet if you have one)

Slack app needs reconfiguring (already-existing app at api.slack.com/apps): switch from Socket Mode → Event Subscriptions with the new webhook URL.

**WhatsApp** auth carries over via `store/auth/` from v1 (see Stage 5 swap). No re-pairing needed if data dirs swap cleanly.

### Stage 4 — features lost in v2

The user accepted "Path 1: migrate now, accept reduced scope" earlier. These v1 capabilities are NOT in v2 by default:

- **Voice transcription** (was `/add-voice-transcription`) — no v2 equivalent.
- **Image vision as a discrete skill** — but Claude SDK handles images natively given file access; v2 add-whatsapp drops attachments in `/workspace/attachments/`. Likely "just works."
- **PDF reader** — install `poppler-utils` in `container/Dockerfile`, and the agent will use `pdftotext` via Bash. No skill needed.
- **Flight search (Kiwi MCP)** — wire `kiwi: { type: 'http', url: 'https://mcp.kiwi.com' }` into the v2 agent-runner's MCP config.
- **Gmail as a full channel** (incoming emails trigger agent) — only `add-gmail-tool` exists in v2 (agent reads/sends, no inbox poll/trigger).

The custom skills the driver copied (`add-voice-transcription`, `add-image-vision`, etc.) are now in `nanoclaw-v2/.claude/skills/` but they were authored against v1 architecture — **don't expect them to work as-is on v2**. They're there as reference.

For Ledger: Gmail-as-trigger is not strictly needed (Ledger can run on schedule or be Slack-invoked).

### Stage 5 — OneCLI vault init

Inside the v2 sibling: invoke `/init-onecli` (the skill exists in `~/Documents/nanoclaw-v2/.claude/skills/init-onecli/`). It migrates `.env` secrets into the OneCLI vault. v2 makes OneCLI the **sole** credential path (per CHANGELOG).

The v1 install also uses OneCLI (already running). Same vault; the v2 install just needs to ensure its agents are registered in the vault with the right secret modes.

### Stage 6 — container image build

```bash
cd ~/Documents/nanoclaw-v2
./container/build.sh
```

v2's container-runner is on **Bun** — the build script handles this. Takes a while (~minutes). The image is named `nanoclaw-agent:latest`.

### Stage 7 — live smoke test from v2 sibling

The `/migrate-v1-to-v2` SKILL.md describes the smoke-test pattern: symlink v1 data dirs into the v2 sibling (so the v2 binary runs against real auth state and history), start the v2 service from the sibling, send a test message.

⚠️ **Stop the v1 service first** (`launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`) so two binaries aren't fighting over the WhatsApp socket / Slack webhook. v1 service is currently running.

After successful smoke test, stop the v2 dev server before swapping.

### Stage 8 — the swap

```bash
# 1. Stop v1 service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# 2. Rename v1 data dirs to .v1-backup (preserve auth, sessions, history)
cd ~/Documents/nanoclaw
mv store store.v1-backup
mv data data.v1-backup
mv groups groups.v1-backup

# 3. Move v2 sibling INTO the v1 path (or move v1 aside and symlink)
cd ~/Documents
mv nanoclaw nanoclaw-v1-tree-backup
mv nanoclaw-v2 nanoclaw

# 4. Move data dirs from v1 backup into the new v2 tree
cd nanoclaw
mv ~/Documents/nanoclaw-v1-tree-backup/store.v1-backup ./store
mv ~/Documents/nanoclaw-v1-tree-backup/groups.v1-backup/global ./groups/  # if needed
# (the agent_groups in v2.db were created with new IDs — the actual data
#  to preserve is store/auth/ for WhatsApp pairing state and groups/<folder>
#  per-group filesystem. v2 reads these via the new entity model.)

# 5. Reload service
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

⚠️ **Read `migrate-v1-to-v2/SKILL.md` swap section carefully before doing this.** The exact data-dir reshape v2 expects is documented there. The above is a sketch.

### Stage 9 — Ledger build (the original goal)

After v2 is live and stable:
- Create `groups/slack_ledger/` agent group
- Wire to the existing Slack messaging group (or a new `#ledger` channel)
- Add work Gmail credentials (`add-gmail-tool` for the work account)
- Build FreeAgent OAuth + container CLI
- Build the matcher routine

Original Ledger spec is in the conversation history of the prior session. Key constraints captured:
- Communication via Slack (where Scout already lives — same workspace, distinct trigger word)
- Ambiguous matches surfaced for human assistance
- Attach invoices to FreeAgent unexplained-transactions for user approval

## Patches applied to v2 main worth knowing about

These are NOT upstream — they're local because upstream's channels branch source has accumulated dependencies on unmerged feature branches:

1. `src/channels/adapter.ts` — added `isGroup?: boolean` to `InboundEvent.message` and `InboundMessage`
2. `src/channels/slack.ts` — type cast `(bridge as any).resolveChannelName = ...`
3. `src/attachment-safety.ts` — vendored from `origin/channels`
4. `@whiskeysockets/baileys` — pinned to `7.0.0-rc.9` (channels-branch SKILL.md says this; v2 main SKILL.md still says `6.17.16` which doesn't compile against the channels source)

If/when upstream merges `feat/{slack-resolve-channel-name,resolve-channel-name,whatsapp-dm-isMention}`, the patches in (1) and (2) will conflict and need reconciling — likely by reverting them.

## Auth quirks to remember

- **Don't run `git push` interactively from a Claude shell** — Cursor's git-extension askpass intercepts credential prompts and shows them in a Cursor UI that's invisible from agent mode. SSH-over-port-443 is configured in `~/.ssh/config` (added today) so all push/pull works without HTTPS auth dance.

## Tasks state at handover

| # | Task | Status |
|---|---|---|
| 1 | Tag and push current state as backup | ✅ done |
| 2 | Resolve dirty working tree | ✅ done (12 commits on `wip/pre-v2-uncommitted`, fast-forwarded into `main`) |
| 3 | Verify current install works end-to-end | ✅ done (Scout + Waco both responded today) |
| 4 | Run /migrate-nanoclaw extract phase | ✅ done (10 section files in `.nanoclaw-migrations/`) |
| 5 | Run /migrate-nanoclaw upgrade phase | 🟡 paused — driver ran clean; source customizations + smoke test + swap remain |
| 6 | Re-add channels Slack, Gmail, WhatsApp | 🟡 partial — WhatsApp + Slack adapters installed; Gmail-as-tool only in v2 (no full channel skill) |

## How to resume in a new session

1. Open Claude Code with cwd `/Users/sergioiacobucci/Documents/nanoclaw` (or v2 sibling — context-loading reads `.claude/skills/` from cwd).
2. Tell the new session: *"Resuming v1→v2 migration. Read `.nanoclaw-migrations/HANDOVER.md` to catch up, then continue from Stage 2."*
3. The new session reads this file, the migration guide, and (if needed) the v1-data JSONs.
