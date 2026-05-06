# Misc fixes (small, independent, low-risk)

These are tiny patches. Apply each on top of the v2 base after the relevant skill has been re-applied (where applicable).

## 1. Image caption ordering (depends on `/add-image-vision`)

**Intent:** Captions on incoming images must appear *before* the `[Image: ...]` reference, not after. The trigger regex anchors with `^@<ASSISTANT_NAME>\b`, so `[Image: ...] @Waco do this` would push the trigger off position 0 and the message would be ignored.

**File:** `src/image.ts` (function that builds the content string from a caption + relative path)

**How to apply:** In the function that returns `{ content, relativePath }`:

```ts
// caption-first ordering
const content = caption
  ? `${caption} [Image: ${relativePath}]`
  : `[Image: ${relativePath}]`;
```

Update the matching test in `src/image.test.ts`:

```ts
expect(result!.content).toMatch(
  /^Check this out \[Image: attachments\/img-\d+-[a-z0-9]+\.jpg\]$/,
);
```

Source commit: `626b057` on `wip/pre-v2-uncommitted`.

## 2. IPC TZ-aware one-shot schedule parsing

**Intent:** Scheduled tasks from the agent come as local time without a timezone suffix (e.g. `"2026-04-19T20:05:00"`). Previously parsed with `new Date(localStr)` which interprets in the *process* timezone. When launchd starts the service without `TZ` env, the process timezone is UTC, so a "20:05 local" schedule fires at 20:05 UTC instead of 20:05 user-local.

**File:** `src/ipc.ts` (the `processTaskIpc` function, `scheduleType === 'once'` branch)

**How to apply:** Replace the once-branch parse with timezone-aware parsing. Verbatim block (uses the configured `TIMEZONE` constant from `src/config.ts`):

```ts
} else if (scheduleType === 'once') {
  // schedule_value is local time without timezone suffix (e.g. "2026-04-19T20:05:00").
  // Convert to UTC using the configured TIMEZONE, not the process timezone,
  // so it's correct even if launchd runs without TZ env var.
  const localStr = data.schedule_value as string;
  // Parse as UTC first (append Z to prevent local-time interpretation)
  const asUtc = new Date(localStr + 'Z');
  if (isNaN(asUtc.getTime())) {
    logger.warn(
      { scheduleValue: data.schedule_value },
      'Invalid timestamp',
    );
    break;
  }
  // Find what local time this UTC instant corresponds to in TIMEZONE
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(asUtc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '0';
  const localAtUtc = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`,
  );
  // Offset = how far ahead local is from UTC
  const offsetMs = localAtUtc.getTime() - asUtc.getTime();
  // Subtract offset: "20:05 local" with +1h offset → 19:05 UTC
  const corrected = new Date(asUtc.getTime() - offsetMs);
  nextRun = corrected.toISOString();
}
```

Make sure `TIMEZONE` is imported from `src/config.ts` (it likely already is in v2's `ipc.ts` or its replacement).

Source commit: `ce2581f` on `wip/pre-v2-uncommitted`.

## 3. WhatsApp Web version pin in setup (depends on `/add-whatsapp`)

**Intent:** Group sync was returning `405 Connection Failure` because the default Baileys WA Web version had drifted out of compatibility. Use `fetchLatestWaWebVersion()` at sync time to negotiate with whatever version WA currently accepts.

**File:** `setup/groups.ts` (the inline syncScript template that spawns a Baileys sync process)

**How to apply:** In the `syncScript` string, the import line and `makeWASocket` call need updating:

Old import:
```ts
import makeWASocket, { useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers } from '@whiskeysockets/baileys';
```

New import (named `makeWASocket` + `fetchLatestWaWebVersion`):
```ts
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
```

Before the `makeWASocket(...)` call, fetch the latest version (graceful failure):
```ts
const { version } = await fetchLatestWaWebVersion({}).catch(() => ({ version: undefined }));

const sock = makeWASocket({
  version,
  // ...rest unchanged
});
```

If `setup/groups.ts` doesn't exist on v2 (the setup flow has been replaced by `bash nanoclaw.sh` and per-channel `/add-X` skills), this fix may already be in v2's `add-whatsapp` skill — verify by checking the setup script that comes from `/add-whatsapp` for `fetchLatestWaWebVersion`.

Source commit: `bb7e1b3` on `wip/pre-v2-uncommitted`. Memory entry `project_bug_groups_sync.md` documents the original incident.
