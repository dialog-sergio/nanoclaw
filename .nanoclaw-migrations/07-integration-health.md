# Integration health checks

**Intent:** Fire-and-forget probe at boot for integrations that don't go through OneCLI (currently Notion). Surfaces broken tokens, revoked ACLs, or API-version drift in host logs immediately instead of waiting for the first user-facing 404.

## Files

- **New:** `src/integration-health.ts`
- **Modified:** `src/index.ts` (one import, one call site)

## Implementation

Create `src/integration-health.ts` (verbatim — 99 lines, no external dependencies beyond `./config.js` and `./logger.js`):

```ts
import { NOTION_API_KEY } from './config.js';
import { logger } from './logger.js';

type HealthResult = {
  integration: string;
  ok: boolean;
  detail: string;
};

type HealthCheck = {
  integration: string;
  configured: boolean;
  run: () => Promise<HealthResult>;
};

const HEALTH_TIMEOUT_MS = 8000;

async function checkNotion(apiKey: string): Promise<HealthResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2025-09-03',
      },
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
      name?: string;
      bot?: { workspace_name?: string };
    };
    if (!res.ok) {
      return {
        integration: 'notion',
        ok: false,
        detail: `HTTP ${res.status} ${body.code ?? 'unknown'}: ${body.message ?? '(no message)'}`,
      };
    }
    return {
      integration: 'notion',
      ok: true,
      detail: `bot="${body.name ?? '?'}" workspace="${body.bot?.workspace_name ?? '?'}"`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      integration: 'notion',
      ok: false,
      detail: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

const CHECKS: HealthCheck[] = [
  {
    integration: 'notion',
    configured: !!NOTION_API_KEY,
    run: () => checkNotion(NOTION_API_KEY!),
  },
];

export async function runIntegrationHealthChecks(): Promise<void> {
  const enabled = CHECKS.filter((c) => c.configured);
  if (enabled.length === 0) {
    logger.info('No external integrations configured for health checks');
    return;
  }
  logger.info(
    { integrations: enabled.map((c) => c.integration) },
    'Running integration health checks',
  );
  const results = await Promise.all(enabled.map((c) => c.run()));
  for (const r of results) {
    if (r.ok) {
      logger.info({ integration: r.integration, detail: r.detail }, 'OK');
    } else {
      logger.error(
        { integration: r.integration, detail: r.detail },
        'Integration health check FAILED',
      );
    }
  }
}
```

In `src/index.ts` (or v2's host-startup file), add the import alongside other imports:

```ts
import { runIntegrationHealthChecks } from './integration-health.js';
```

In the startup sequence (after `loadState()`, before the OneCLI agent ensure loop):

```ts
loadState();

// Fire-and-forget: surfaces broken integration tokens/ACLs/API-version drift
// in host logs at boot instead of silently 404ing on first use.
void runIntegrationHealthChecks();

// ...rest of startup
```

## Source commit

`37f6ace` on `wip/pre-v2-uncommitted`.

## Future expansion

The `CHECKS` array is the extension point. Each entry has:
- `integration` — string label
- `configured` — predicate that says "user wants this checked" (reads from config/env)
- `run()` — async function returning `{ integration, ok, detail }`

Add a check by appending to the array; no other code change needed.
