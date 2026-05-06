# Channel post-skill follow-ups

These are additions on top of the v1 channel skills. Apply ONLY if v2's equivalent skills don't already include them. Verify by reading the post-`/add-X` files first.

## A. Slack — mention via bot ID + reconnect-on-health-fail

**Intent:**
1. Resolve and store `bot_id` in addition to `bot_user_id`. Treat both `<@user_id>` and `<@bot_id>` as @-mentions of the assistant. (Slack sometimes encodes bot mentions with the bot_id, not the user_id.)
2. Use the group's configured `trigger` (rather than hardcoded `ASSISTANT_NAME` constant) when prepending after a mention, so per-group trigger renames work end-to-end.
3. Add a 60s health check that calls `auth.test`; on failure, stop+reconnect to recover from silent socket drops.
4. Wire `app.error` to log app-level errors instead of crashing.

**File:** `src/channels/slack.ts`

**How to apply:**

In the class, add a `botId` field alongside `botUserId`:

```ts
private botUserId: string | undefined;
private botId: string | undefined;
```

In the constructor (or wherever the `App` is built), wire an error handler:

```ts
if (typeof this.app.error === 'function') {
  this.app.error(async (error) => {
    logger.error({ err: error }, 'Slack app error');
  });
}
```

Add a 60s reconnect health check (also in the constructor, after `this.setupEventHandlers()`):

```ts
setInterval(async () => {
  if (!this.connected) return;
  try {
    await this.app.client.auth.test();
  } catch (err) {
    logger.warn({ err }, 'Slack health check failed, reconnecting');
    this.connected = false;
    try {
      await this.app.stop();
    } catch { /* ignore stop errors */ }
    try {
      await this.connect();
      logger.info('Slack reconnected after health check failure');
    } catch (reconnectErr) {
      logger.error({ err: reconnectErr }, 'Slack reconnection failed');
    }
  }
}, 60_000);
```

In the message-event handler, replace the bot-mention detection block with one that handles BOTH user_id and bot_id mentions and uses the group's configured trigger:

```ts
let content = msg.text;
if (!isBotMessage) {
  const isMention =
    (this.botUserId && content.includes(`<@${this.botUserId}>`)) ||
    (this.botId && content.includes(`<@${this.botId}>`));
  if (isMention && !TRIGGER_PATTERN.test(content)) {
    const group = groups[jid];
    const trigger = group?.trigger || `@${ASSISTANT_NAME}`;
    content = `${trigger} ${content}`;
  }
}
```

In the connect method, capture bot_id as well as bot_user_id:

```ts
const auth = await this.app.client.auth.test();
this.botUserId = auth.user_id as string;
this.botId = auth.bot_id as string | undefined;
logger.info(
  { botUserId: this.botUserId, botId: this.botId },
  'Connected to Slack',
);
```

Source commit: `8dcd6a3` on `wip/pre-v2-uncommitted`.

## B. Gmail — tolerate OneCLI-managed credential stubs

**Intent:** When credentials are managed by OneCLI, the host gets stub tokens (`access_token: 'onecli-managed'`); real tokens are only injected at container request time. The host must:
1. Detect the stub and skip host-level inbox polling rather than failing the channel.
2. Wrap the `getProfile` verification call so a transient failure disables polling instead of crashing.

**File:** `src/channels/gmail.ts`, after `this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });`

**How to apply:**

```ts
// Verify connection — skip if credentials are OneCLI-managed stubs (real tokens
// are only injected inside containers; host-level polling needs a separate OAuth flow)
const isStub =
  tokens.access_token === 'onecli-managed' ||
  tokens.refresh_token === 'onecli-managed';
if (isStub) {
  logger.warn(
    'Gmail credentials are OneCLI-managed stubs — inbox polling disabled. ' +
      'Container agents can still use Gmail MCP tools. ' +
      'To enable inbox polling, run: npx -y @gongrzhe/server-gmail-autoauth-mcp auth',
  );
  this.gmail = null;
  return;
}

try {
  const profile = await this.gmail.users.getProfile({ userId: 'me' });
  this.userEmail = profile.data.emailAddress || '';
  logger.info({ email: this.userEmail }, 'Gmail channel connected');
} catch (err) {
  logger.warn(
    { err },
    'Gmail credential verification failed — inbox polling disabled',
  );
  this.gmail = null;
  return;
}
```

This depends on `this.gmail` being typed nullable in the class. Source commit: `804c011` on `wip/pre-v2-uncommitted`.

## C. WhatsApp — LID_PHONE_MAP env-based participant mapping

**Intent:** Baileys can fail to encrypt messages for group participants whose LID it can't resolve through `signalRepository`. Allow seeding mappings from an env var so the user can work around resolution gaps without code changes.

**File:** `src/channels/whatsapp.ts`, in the connect/reconnect handler near where the channel acquires its initial socket state.

**How to apply:**

Import `readEnvFile` at the top:

```ts
import { readEnvFile } from '../env.js';
```

In the connection-established branch (after the socket auth state is loaded, before `flushOutgoingQueue`), seed mappings:

```ts
// Seed LID→phone mappings from env so Baileys can encrypt for
// participants whose LID it can't resolve via signalRepository.
// Format: LID_PHONE_MAP=LID1:PHONE1,LID2:PHONE2
const lidPhoneMap =
  process.env.LID_PHONE_MAP ||
  readEnvFile(['LID_PHONE_MAP']).LID_PHONE_MAP;
if (lidPhoneMap) {
  for (const entry of lidPhoneMap.split(',')) {
    const [lid, phone] = entry.trim().split(':');
    if (lid && phone) {
      const phoneJid = phone.includes('@')
        ? phone
        : `${phone}@s.whatsapp.net`;
      this.setLidPhoneMapping(lid, phoneJid);
    }
  }
  logger.info(
    { count: lidPhoneMap.split(',').length },
    'Seeded LID→phone mappings from LID_PHONE_MAP',
  );
}
```

This depends on a `setLidPhoneMapping(lid, phoneJid)` method on the class that updates whatever LID-tracking state the v2 add-whatsapp uses. If v2's add-whatsapp uses a different storage shape, adapt the call to match.

Source commit: `5df9330` on `wip/pre-v2-uncommitted`.
