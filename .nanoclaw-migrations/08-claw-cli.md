# claw — Python CLI for terminal-driven agent invocation

**Intent:** Lightweight command-line client that lets the user run a NanoClaw agent container without going through a chat channel. Useful for ad-hoc one-off prompts, scripted invocations, and piping arbitrary text in.

## Files

Both new files (no v1 base versions to diff against):

| File | Lines | Role |
|---|---|---|
| `scripts/claw` | 440 | Python 3 CLI entry point (executable) |
| `scripts/claw-onecli-args.mjs` | 34 | Node helper that resolves OneCLI's container CLI args |

## Usage

```bash
claw "What is 2+2?"
claw -g <channel_name> "Review this code"
claw -g "<channel name with spaces>" "What's the latest issue?"
claw -j "<chatJid>" "Hello"
claw -g <channel_name> -s <session-id> "Continue"
claw --list-groups
echo "prompt text" | claw --pipe -g <channel_name>
cat prompt.txt | claw --pipe
```

## How to apply on v2

Both files are standalone — they don't import from the `src/` source tree. Copy them verbatim:

```bash
# From the migrated v2 worktree, with main checked out:
git show wip/pre-v2-uncommitted:scripts/claw > scripts/claw
git show wip/pre-v2-uncommitted:scripts/claw-onecli-args.mjs > scripts/claw-onecli-args.mjs
chmod +x scripts/claw
```

(Or if `wip/pre-v2-uncommitted` no longer exists, use `git show pre-v2-backup:scripts/claw` against the snapshot tag.)

## Compatibility notes for v2

The `claw` script reads from these on-disk locations:
- The local SQLite DB at `store/` (or wherever v2 keeps it)
- The container runtime binary (Docker / Apple Container)
- OneCLI args via `scripts/claw-onecli-args.mjs`

**Things to verify after copying onto v2:**

1. **DB schema** — the script queries the `chats` and `registered_groups` tables (or whatever v2 calls them). v2's two-DB session split + new entity model means these tables may have moved or been renamed. Inspect:

   ```bash
   grep -n "sqlite3\|chats\|registered_groups\|tasks" scripts/claw
   ```

   Update table/column references to match v2's schema (likely in `store/inbound.db` or via v2's helper API).

2. **Container runtime detection** — check that `CONTAINER_RUNTIME_BIN` resolution still works. v2's `src/container-runtime.ts` is the source of truth.

3. **OneCLI args resolution** — `scripts/claw-onecli-args.mjs` calls into OneCLI to resolve the credential-injection args for a `docker run` command. v2 still uses OneCLI as the sole credential path (per CHANGELOG), but its API may have changed. Open the file:

   ```bash
   cat scripts/claw-onecli-args.mjs
   ```

   If OneCLI's `applyContainerConfig` (or its v2 equivalent) signature differs, adapt.

4. **Group folder resolution** — the script resolves a group folder by `group.folder` field. If v2's entity model has renamed this (e.g. into a separate `agent_groups` entity), the lookup needs updating.

5. **Session continuation** — `-s <session-id>` continues a previous Claude session. v2's session management may differ.

## Source commit

`7783221` on `wip/pre-v2-uncommitted`. Run `git show 7783221` to see both files in one diff.

## If the user no longer wants `claw`

If the v2 install isn't expected to need terminal-driven invocation (e.g. the user only uses Slack/WhatsApp/Gmail), this can be skipped entirely. It's a self-contained tool — dropping it has no impact on any other customization.
