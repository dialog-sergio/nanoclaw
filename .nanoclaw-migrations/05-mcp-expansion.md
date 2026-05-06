# MCP server expansion + per-group filtering

This is the largest customization. It touches the Dockerfile, the agent-runner MCP configuration, the host-side container-runner (mounts + env passthrough), and the type system. Some of it may be addressed natively by v2; **read v2's `container/agent-runner/` and `src/container-runner.ts` (or its v2 replacement) before porting**.

⚠️ **v2 caveat:** The agent-runner moved from Node to Bun in v2. The MCP server config object's *shape* is likely unchanged (it's defined by the Claude Agent SDK), but module imports and runtime helpers may differ.

## What this customization adds

1. **Notion MCP server** — new
2. **Browser MCP (Playwright)** — new
3. **Sheets MCP** — new
4. **Calendar MCP migration** — switched from `@gongrzhe/server-calendar-autoauth-mcp` to `@cocal/google-calendar-mcp` with a different on-disk credential layout
5. **Per-group MCP server filtering** via `ContainerConfig.mcpServers` allowlist
6. **Pinned MCP versions** in the Dockerfile (so cold-start `npx` downloads don't time out)
7. **NOTION_API_KEY env passthrough** to containers (Notion isn't routed via OneCLI)
8. **NO_PROXY** for googleapis.com, accounts.google.com, oauth2.googleapis.com, *.googleapis.com, api.notion.com, host.docker.internal — so the OneCLI gateway doesn't intercept Google MCP OAuth or Notion API calls

## A. Dockerfile — pin MCP versions and pre-install

**File:** `container/Dockerfile`

After the `RUN npm install -g agent-browser @anthropic-ai/claude-code` line, add:

```dockerfile
# Pre-install MCP servers globally to avoid npx download timeout at runtime
RUN npm install -g \
    @gongrzhe/server-gmail-autoauth-mcp@1.1.11 \
    @cocal/google-calendar-mcp@2.6.1 \
    @notionhq/notion-mcp-server@2.2.1 \
    mcp-google-sheets@2.0.1 \
    @playwright/mcp@0.0.70
```

Versions can drift; the `src/dockerfile-pins.test.ts` regression test (see `09-tooling.md`) asserts that any addition to this list carries an `@version`.

## B. Host-side container-runner — mounts + env passthrough

**File:** `src/container-runner.ts` (or v2's equivalent)

### Imports

Add `NOTION_API_KEY` to the imports from `./config.js`:

```ts
import {
  // existing imports...
  IDLE_TIMEOUT,
  NOTION_API_KEY,
  ONECLI_URL,
  TIMEZONE,
} from './config.js';
```

### Calendar MCP credential dir migration

Old layout (delete or replace):

```ts
// Google Calendar MCP credentials — mount read-only if present
const calendarMcpDir = path.join(os.homedir(), '.calendar-mcp');
if (fs.existsSync(path.join(calendarMcpDir, 'credentials.json'))) {
  mounts.push({
    hostPath: calendarMcpDir,
    containerPath: '/home/node/.calendar-mcp',
    readonly: true,
  });
}
```

New layout (read-write so token refresh persists, new path):

```ts
// Google Calendar MCP credentials — mount read-write so token refresh persists
const calendarMcpDir = path.join(
  os.homedir(),
  '.config',
  'google-calendar-mcp',
);
if (fs.existsSync(path.join(calendarMcpDir, 'tokens.json'))) {
  mounts.push({
    hostPath: calendarMcpDir,
    containerPath: '/home/node/.config/google-calendar-mcp',
    readonly: false,
  });
}

// Google Sheets MCP credentials — mount read-write so token refresh persists
const sheetsMcpDir = path.join(os.homedir(), '.config', 'google-sheets-mcp');
if (fs.existsSync(path.join(sheetsMcpDir, 'token.json'))) {
  mounts.push({
    hostPath: sheetsMcpDir,
    containerPath: '/home/node/.config/google-sheets-mcp',
    readonly: false,
  });
}
```

User-side: existing OAuth credentials at `~/.calendar-mcp/credentials.json` need to be migrated to `~/.config/google-calendar-mcp/tokens.json`. Use `@cocal/google-calendar-mcp`'s built-in setup if needed (the package documentation has the migration steps; `gcp-oauth.keys.json` goes in the same dir).

### Notion API key + Browser MCP comment

In `buildContainerArgs` (or wherever container env vars are pushed), after `args.push('-e', `TZ=${TIMEZONE}`)`:

```ts
// Pass Notion API key if configured (not managed by OneCLI)
if (NOTION_API_KEY) {
  args.push('-e', `NOTION_API_KEY=${NOTION_API_KEY}`);
}

// Browser MCP (Playwright) now runs inside each container as a stdio server,
// so no host-side URL or service management is needed.
```

### NO_PROXY for direct Google + Notion calls

In the same function, after the OneCLI applyContainerConfig succeeds:

```ts
if (onecliApplied) {
  logger.info({ containerName }, 'OneCLI gateway config applied');
  // Exclude Google APIs from the OneCLI proxy — Gmail/Calendar MCPs use their own
  // local OAuth credentials and must reach Google directly. The proxy intercepts
  // and breaks those calls.
  args.push(
    '-e',
    'NO_PROXY=googleapis.com,accounts.google.com,oauth2.googleapis.com,*.googleapis.com,api.notion.com,host.docker.internal',
    '-e',
    'no_proxy=googleapis.com,accounts.google.com,oauth2.googleapis.com,*.googleapis.com,api.notion.com,host.docker.internal',
  );
}
```

## C. Config additions

**File:** `src/config.ts`

Add `'NOTION_API_KEY'` and `'BROWSER_MCP_PORT'` to the `readEnvFile` array, then export both at the bottom:

```ts
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'ONECLI_URL',
  'NOTION_API_KEY',
  'BROWSER_MCP_PORT',
  'TZ',
]);

// ...existing code...

// Notion API key for container agents (passed as env var, not via OneCLI)
export const NOTION_API_KEY =
  process.env.NOTION_API_KEY || envConfig.NOTION_API_KEY;

// Browser MCP (Playwright) — runs on the host, containers connect via HTTP
// (vestigial in current code; Browser MCP now runs inside the container as stdio.
//  Kept exported in case any older code path still consults it.)
export const BROWSER_MCP_PORT =
  process.env.BROWSER_MCP_PORT || envConfig.BROWSER_MCP_PORT || '';
```

## D. Per-group MCP server filtering — type

**File:** `src/types.ts`

In the `ContainerConfig` interface:

```ts
export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
  mcpServers?: string[]; // MCP server names to enable (e.g. ['browser', 'sheets']). Omit for all.
}
```

A group can set `containerConfig.mcpServers = ['browser', 'sheets']` in its registered group config to scope which MCP servers are loaded inside that group's container. `'nanoclaw'` (the built-in IPC/messaging server) is always on regardless.

## E. Container-side agent-runner — MCP server config + filterMcpServers

**File:** `container/agent-runner/src/index.ts` (or v2's Bun-based replacement)

### ContainerInput field

Add `mcpServers` to the `ContainerInput` interface:

```ts
interface ContainerInput {
  // existing fields...
  mcpServers?: string[]; // MCP server names to enable. Omit for all.
}
```

### filterMcpServers helper

Add this helper above `runQuery`:

```ts
/**
 * Filter MCP servers by an allowlist. If no allowlist is provided, return all.
 * 'nanoclaw' is always included (core messaging/scheduling tools).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterMcpServers(
  allowlist: string[] | undefined,
  servers: Record<string, any>,
): Record<string, any> {
  if (!allowlist || allowlist.length === 0) return servers;
  const allowed = new Set([...allowlist, 'nanoclaw']); // nanoclaw is always on
  const filtered: Record<string, any> = {};
  for (const [name, config] of Object.entries(servers)) {
    if (allowed.has(name)) filtered[name] = config;
  }
  log(
    `MCP servers: ${Object.keys(filtered).join(', ')} (filtered from ${Object.keys(servers).join(', ')})`,
  );
  return filtered;
}
```

### Allowed-tools — add new MCP wildcards

In the `query()` config's `allowedTools` array, add:

```
'mcp__notion__*',
'mcp__browser__*',
'mcp__sheets__*',
```

(alongside whatever already exists — `mcp__nanoclaw__*`, `mcp__gmail__*`, `mcp__googlecalendar__*`, etc.)

### MCP server map — wrap in filterMcpServers

Wrap the `mcpServers: { ... }` object literal with `filterMcpServers(containerInput.mcpServers, { ... })`:

```ts
mcpServers: filterMcpServers(containerInput.mcpServers, {
  nanoclaw: { /* unchanged */ },
  googlecalendar: {
    command: 'google-calendar-mcp',
    args: [],
    env: {
      ...process.env,
      HOME: '/home/node',
      GOOGLE_OAUTH_CREDENTIALS:
        '/home/node/.config/google-calendar-mcp/gcp-oauth.keys.json',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      http_proxy: '',
      https_proxy: '',
    },
  },
  kiwi: {
    type: 'http',
    url: 'https://mcp.kiwi.com',
  },
  gmail: {
    command: 'gmail-mcp',
    args: [],
    env: {
      ...process.env,
      HOME: '/home/node',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      http_proxy: '',
      https_proxy: '',
    },
  },
  sheets: {
    command: 'mcp-google-sheets',
    args: [],
    env: {
      ...process.env,
      HOME: '/home/node',
      CREDENTIALS_PATH:
        '/home/node/.config/google-sheets-mcp/credentials.json',
      TOKEN_PATH: '/home/node/.config/google-sheets-mcp/token.json',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      http_proxy: '',
      https_proxy: '',
    },
  },
  browser: {
    command: 'playwright-mcp',
    args: ['--headless', '--executable-path', '/usr/bin/chromium'],
  },
  ...(process.env.NOTION_API_KEY
    ? {
        notion: {
          command: 'notion-mcp-server',
          args: [],
          env: {
            // NOTION_TOKEN (not OPENAPI_MCP_HEADERS) lets the MCP server
            // pick the Notion-Version that matches its bundled OpenAPI
            // spec. Override here and it will silently drift when the
            // pinned server version in the Dockerfile bumps.
            NOTION_TOKEN: process.env.NOTION_API_KEY,
            HTTP_PROXY: '',
            HTTPS_PROXY: '',
            http_proxy: '',
            https_proxy: '',
          },
        },
      }
    : {}),
}),
```

The `HTTP_PROXY=''` overrides force these MCP servers to ignore the OneCLI proxy and reach Google/Notion directly (matching the host-side `NO_PROXY` setup in section B).

## F. Tests

**File:** `src/container-runner.test.ts`

Add the new env vars to the mock for `./config.js`:

```ts
vi.mock('./config.js', () => ({
  // existing mocks...
  IDLE_TIMEOUT: 1800000, // 30min (or whatever v2 uses)
  ONECLI_URL: 'http://localhost:10254',
  TIMEZONE: 'America/Los_Angeles',
  NOTION_API_KEY: '',
  BROWSER_MCP_PORT: '',
}));
```

## G. User-side migration: existing credentials

After deploying v2, the user must:

1. **Calendar:** if migrating from `~/.calendar-mcp/credentials.json` (old MCP package), follow `@cocal/google-calendar-mcp`'s setup to populate `~/.config/google-calendar-mcp/gcp-oauth.keys.json` and run a one-time auth flow that creates `tokens.json`.
2. **Sheets:** create `~/.config/google-sheets-mcp/` with `credentials.json` (OAuth client) and run the package's auth flow to get `token.json`.
3. **Notion:** set `NOTION_API_KEY` in `.env` (an integration token from notion.so/profile/integrations, with access granted to the Family HQ page).
4. **Build:** `npm run build` (which now also rebuilds the container per `09-tooling.md` build-chain change).

## Source commit

`c530843` on `wip/pre-v2-uncommitted`. Run `git show c530843` for the full atomic diff.
