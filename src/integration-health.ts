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
      detail: ctrl.signal.aborted
        ? `timeout after ${HEALTH_TIMEOUT_MS}ms`
        : `network error: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getHealthChecks(
  env: { NOTION_API_KEY?: string } = { NOTION_API_KEY },
): HealthCheck[] {
  return [
    {
      integration: 'notion',
      configured: Boolean(env.NOTION_API_KEY),
      run: () => checkNotion(env.NOTION_API_KEY as string),
    },
  ];
}

export async function runIntegrationHealthChecks(): Promise<HealthResult[]> {
  const checks = getHealthChecks().filter((c) => c.configured);
  if (checks.length === 0) return [];

  const results = await Promise.all(
    checks.map(async (c) => {
      try {
        return await c.run();
      } catch (err) {
        return {
          integration: c.integration,
          ok: false,
          detail: `check threw: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }),
  );

  for (const r of results) {
    if (r.ok) {
      logger.info(`[health] ${r.integration}: OK — ${r.detail}`);
    } else {
      logger.error(`[health] ${r.integration}: FAIL — ${r.detail}`);
    }
  }
  return results;
}
