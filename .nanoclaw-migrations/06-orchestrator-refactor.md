# Orchestrator refactor — cursor-after-delivery + idle-vs-working timeout

⚠️ **Highest-risk customization.** Touches `src/index.ts`, `src/group-queue.ts`, `src/container-runner.ts`, `src/config.ts`. v2 has a new entity model and a two-DB session split (`inbound.db`/`outbound.db`) which **may already address some of these concerns natively**.

**Read v2's orchestrator code first** (whatever replaces v1's `src/index.ts:processGroupMessages`, `src/group-queue.ts`, and `src/container-runner.ts:runContainerAgent`). For each of the four sub-changes below, decide:
- v2 already does it → skip
- v2 differs → port the **intent** (described below), not the v1 code verbatim
- v2 doesn't address it → port verbatim

## Sub-change 1: Advance message cursor only after delivery to user

**Intent:** In v1, the cursor advanced *before* the agent ran. If the container died mid-turn or hit a timeout, those messages were marked as processed but never replied to — silent loss. Cursor should advance only after the response is confirmed delivered to the user, OR after a clean status=success completion.

**Symptom this fixed:** Container kill (rate limit, timeout, OOM) caused the user's last few messages to vanish from the agent's perspective on next run.

**v1 code shape (in `processGroupMessages` in `src/index.ts`):**

```ts
// Save current cursor for reference. Do NOT advance yet — cursor only
// advances after output is confirmed delivered to the user, or the agent
// completes successfully. This prevents message loss when containers die.
const previousCursor = lastAgentTimestamp[chatJid] || '';
const batchTimestamp =
  missedMessages[missedMessages.length - 1].timestamp;
// (no saveState() here — see below)
```

In the agent's `onResult` callback, when `text` is non-empty and successfully sent:

```ts
if (text) {
  await channel.sendMessage(chatJid, text);
  outputSentToUser = true;
  // Advance cursor now — output confirmed delivered to user
  lastAgentTimestamp[chatJid] = pipedTimestamp || batchTimestamp;
  saveState();
}
```

After the agent run completes, fall through to advance cursor for clean-success-with-no-text case:

```ts
// Agent completed successfully. Advance cursor if not already done
// (handles the case where agent processed but sent no visible output,
// e.g. intentionally silent completion or internal-only response).
const finalTimestamp = pipedTimestamp || batchTimestamp;
if (lastAgentTimestamp[chatJid] !== finalTimestamp) {
  lastAgentTimestamp[chatJid] = finalTimestamp;
  saveState();
  // (log line in source)
}
```

On error path with output already sent: don't roll back. Without output: leave cursor as-is, messages will reprocess.

**Piped-message cursor support:** When follow-up messages arrive while the container is active, they're piped via IPC. Track the latest piped message's timestamp so the cursor advances to that on completion, not just the original batch:

```ts
// At top of file:
const pendingPipedTimestamps = new Map<string, string>();

// Inside processGroupMessages, when reading the piped value at end:
let pipedTimestamp: string | undefined;
// ...
pipedTimestamp = pendingPipedTimestamps.get(chatJid);
pendingPipedTimestamps.delete(chatJid);
```

The message loop (wherever it pipes follow-ups to an active container) needs to set `pendingPipedTimestamps.set(chatJid, latestPipedMessage.timestamp)` and call `idleTimerResets.get(chatJid)?.()` to extend the idle timer.

**v2 considerations:** v2's two-DB split (`inbound.db` for host writes, `outbound.db` for container writes) may make this concern obsolete — if the container's outbound writes are atomic and the host reads them after success, the cursor problem may be solved at the storage layer. **Read v2's docs/db-session.md before reimplementing.**

## Sub-change 2: Split idle vs working timeout

**Intent:** v1 reset the same `timeoutMs` (e.g. 30min) on every streamed chunk. So a container with continuous tool-use output would never be considered idle, and a container that responded once and went quiet would be killed at the long timeout instead of the short idle one.

Distinguish two states:
- **Working** — agent emitted a text result; agent is actively responding. Use the long `timeoutMs` (configured `containerConfig.timeout || CONTAINER_TIMEOUT`).
- **Idle** — agent emitted a session marker (`status: 'success', result: null`). Use `IDLE_TIMEOUT`.

**v1 code shape (in `runContainerAgent` in `src/container-runner.ts`):**

```ts
let agentIdle = false;
const resetTimeout = (idle?: boolean) => {
  clearTimeout(timeout);
  agentIdle = idle ?? agentIdle;
  const t = agentIdle ? IDLE_TIMEOUT : timeoutMs;
  timeout = setTimeout(killOnTimeout, t);
};
```

Caller in the streaming output handler:

```ts
const isIdleMarker =
  parsed.status === 'success' && parsed.result === null;
resetTimeout(
  isIdleMarker ? true : !!parsed.result ? false : undefined,
);
```

The `timeoutMs` definition guarantees `IDLE_TIMEOUT + 30s` minimum so the graceful close has time:

```ts
const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);
```

**Default IDLE_TIMEOUT** dropped from 30 min → 5 min (`src/config.ts`):

```ts
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '300000', 10); // 5min default
```

**Stderr in timeout logs:** When a timeout fires, append the captured stderr (truncation-aware) to the timeout log:

```ts
[
  `=== Container Run Log (TIMEOUT) ===`,
  // ...
  `Had Streaming Output: ${hadStreamingOutput}`,
  ``,
  `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
  stderr,
].join('\n')
```

## Sub-change 3: Trigger requirement opt-in for main groups

**Intent:** Main groups previously could not be made trigger-required. Now both directions are configurable via `requiresTrigger`:
- Main group: defaults to no trigger (every message goes to agent), but can opt in by setting `requiresTrigger: true`.
- Non-main group: defaults to trigger required, can opt out by setting `requiresTrigger: false`.

**v1 code shape (in `processGroupMessages`):**

```ts
// Check trigger unless the group explicitly opts out.
// Main groups default to no trigger, but can opt in by setting requiresTrigger: true.
const needsTriggerHere = isMainGroup
  ? group.requiresTrigger === true
  : group.requiresTrigger !== false;
if (needsTriggerHere) {
  // existing trigger-check block (pattern.test, allowlist, etc.)
}
```

## Sub-change 4: IPC late-arrival race fix (in `agent-runner`)

**Intent:** A race window: the SDK stops reading messages from the IPC poll before the host considers the agent done. If a message arrives in that gap, it gets consumed by the polling code but no one reads it from the stream. Fix: drain the stream's pending queue after the SDK stops, plus drain the IPC input dir for late files, and restart the loop with those messages.

**v1 code shape (in `container/agent-runner/src/index.ts`):**

Add a `drainRemaining()` method to `MessageStream` that returns any unread messages:

```ts
class MessageStream {
  // existing fields...

  /** Drain any messages pushed after the SDK stopped reading. */
  drainRemaining(): string[] {
    const messages: string[] = [];
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      if (typeof msg.message.content === 'string') {
        messages.push(msg.message.content);
      }
    }
    return messages;
  }
}
```

In `runQuery`, after the SDK loop ends and `ipcPolling = false`:

```ts
ipcPolling = false;

// Drain any messages that pollIpcDuringQuery pushed to the stream after
// the SDK stopped reading. This closes a race where an IPC file arrives
// between the SDK finishing and ipcPolling being set to false — the file
// gets consumed and pushed to the stream, but no one reads it.
const unconsumed = stream.drainRemaining();
// Also drain IPC input directory for files that arrived after polling stopped
const lateMessages = drainIpcInput();

return {
  newSessionId,
  lastAssistantUuid,
  closedDuringQuery,
  pendingMessages: [...unconsumed, ...lateMessages],
};
```

In `main()`, after each `runQuery` returns, if there are pending messages, immediately start the next query with them:

```ts
if (queryResult.pendingMessages.length > 0) {
  log(
    `${queryResult.pendingMessages.length} pending message(s) from race window, starting next query immediately`,
  );
  prompt = queryResult.pendingMessages.join('\n');
  continue;
}
```

The `runQuery` return type needs `pendingMessages: string[]` added.

## Group-queue support

**File:** `src/group-queue.ts`

Add an `isActive` accessor (so callers can detect whether a follow-up would land on an active container) and improved IPC logging:

```ts
isActive(groupJid: string): boolean {
  return this.getGroup(groupJid).active;
}
```

In the IPC message-write helper, log success and capture errors:

```ts
try {
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ type: 'message', text }));
  fs.renameSync(tempPath, filepath);
  logger.info(
    { groupJid, filepath, textLength: text.length },
    'IPC message file written',
  );
  return true;
} catch (err) {
  logger.error({ groupJid, err }, 'Failed to write IPC message file');
  return false;
}
```

## Source commits

- `4e59bea` — orchestrator refactor (the bulk of sub-changes 1–3)
- The agent-runner part of sub-change 4 lives in `c530843` (the MCP commit) since `container/agent-runner/src/index.ts` was committed atomically across both intents.

Run `git show 4e59bea` for the full v1 diff to use as porting reference.
