# NanoClaw v1 → v2 Migration Guide

**Generated:** 2026-05-06T17:03:55Z
**Base (merge-base with upstream/main):** `934f063`
**HEAD at generation:** `174e5ff` (main, fast-forwarded from `wip/pre-v2-uncommitted`)
**Upstream main HEAD:** `f2d2ce9`
**Upstream v2 HEAD:** `5ae6662`
**Tier:** 3 (complex)
**Backup tag:** `pre-v2-backup` (points at d362067 on origin)

This guide reapplies a customized fork of NanoClaw v1 onto a clean v2 base. v2 is a major architectural rewrite (CHANGELOG.md, 2026-04-22). Intent-based reapplication, not cherry-pick.

## Migration scope

- **202 commits** ahead of base, **41 files changed**, +9384/−399 lines
- **747 commits** behind upstream
- **7 skill applications** to redo via `/add-X`
- **13 bespoke customizations** to reapply (most as verbatim, some as intent-port)
- **Highest risk:** orchestrator refactor (touches v1 `src/index.ts` which v2 may have rewritten)

## Section files

Read in order during the upgrade phase:

| Order | File | What it covers |
|---|---|---|
| 1 | `01-skills.md` | Skills to re-apply (channels + features). Verify post-skill tweaks present. |
| 2 | `02-personalization.md` | Andy → Waco; Notion family databases. |
| 3 | `03-misc-fixes.md` | Image caption ordering; IPC TZ-aware schedules; WhatsApp version pin. |
| 4 | `04-channel-followups.md` | Slack mention/health; Gmail stub tolerance; WhatsApp LID env. |
| 5 | `05-mcp-expansion.md` | Notion/Browser/Sheets MCPs; per-group filtering; pinned versions; NO_PROXY. |
| 6 | `06-orchestrator-refactor.md` | Cursor-after-delivery; idle-vs-working timeout; trigger opt-in for main. |
| 7 | `07-integration-health.md` | Notion startup probe. |
| 8 | `08-claw-cli.md` | Python `claw` CLI for terminal-driven agent invocation. |
| 9 | `09-tooling.md` | Dockerfile pins regression test; build chain. |

## Migration plan (Tier 3 ordering)

### Stage 0 — On clean v2 base
Skill-merge phase establishes a working baseline before any handwritten code goes in.

### Stage 1 — Reapply skills (in dependency order)
1. `/add-whatsapp` (channels first; image-vision and pdf-reader hook into channels)
2. `/add-slack`
3. `/add-gmail`
4. `/add-voice-transcription`
5. `/add-image-vision`
6. `/add-pdf-reader`
7. `/flight-search`

After each, build+test before moving to the next.

### Stage 2 — Apply bespoke customizations (low → high risk)

**Independent, low-risk (parallel-safe):**
- 02-personalization
- 03-misc-fixes
- 09-tooling (Dockerfile pins test)
- 08-claw-cli (verify OneCLI API hasn't changed first)

**Container-side (requires Dockerfile + agent-runner edits, then rebuild):**
- 05-mcp-expansion — **agent-runner moved to Bun in v2**, so MCP server config syntax may differ. Read v2's `container/agent-runner/` first; port intent.

**Orchestrator (highest risk — v2 architecture changes):**
- 06-orchestrator-refactor — v2 has new entity model + two-DB session split. Some of the cursor-after-delivery concerns may already be solved in v2's `outbound.db` model. Read v2's `src/index.ts` (or its replacement) and v2's session-handling docs **before porting**. If v2 already does cursor-after-delivery natively, skip this customization.
- 07-integration-health — additive, port last.

**On top of skills:**
- 04-channel-followups — apply ONLY if v2's channel skills don't already include the equivalent fixes (LID handling, Gmail stub tolerance, Slack health check).

## Skill interactions

The fork's WhatsApp skill has accumulated significant Baileys-compatibility patches (LID/JID handling, getPlatformId charCode bug, getMessage cache, named imports for Baileys 6.17, openai v6 for transcription compat). The explore-agent's read of v2's add-whatsapp skill suggests these are already merged upstream — but **verify after `/add-whatsapp` lands on v2** by reading the resulting `src/channels/whatsapp.ts` and checking for:

- `senderPn` fallback in incoming message handling
- LID→phone learning via `chats.phoneNumberShare` event
- `cachedGroupMetadata` option to `makeWASocket`
- `getMessage` callback with DB-backed cache (≥256 messages)
- `getPlatformId` monkey-patch that emits enum `1` not `49`
- `proto` imported via `createRequire` (not ESM named export)
- Baileys version `^6.17.16` or newer in package.json

If any are missing, port from `git show <SHA>` against the commits listed in `04-channel-followups.md`.

## Rollback

```bash
git reset --hard pre-v2-backup
git push origin main --force-with-lease   # only if you've already pushed v2
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

`wip/pre-v2-uncommitted` branch on origin preserves the exact pre-migration state if the tag itself is ever lost.

## Reference: full pre-migration history

For any customization where the guide says "see commit `<SHA>`", run:

```bash
git show <SHA>                    # full diff
git show <SHA> -- <path>          # diff for a specific file
git show <SHA>:<path>             # file content at that commit
```

All pre-migration commits remain reachable via `wip/pre-v2-uncommitted` and `pre-v2-backup`.
