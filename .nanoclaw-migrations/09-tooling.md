# Tooling — build chain and Dockerfile pins regression test

## A. Chained container build into npm build

**Intent:** When `src/` changes and we run `npm run build`, the container image is also rebuilt so MCP/agent-runner changes propagate without a manual `./container/build.sh` step.

**File:** `package.json`

**How to apply:**

```diff
   "scripts": {
-    "build": "tsc",
+    "build": "tsc && ./container/build.sh",
     "start": "node dist/index.js",
```

If v2 has moved to `pnpm` and reorganized scripts (per the v2 install flow change), the equivalent edit is to chain the container build into whatever script v2 ships for "build everything for deploy."

Source commit: `c530843` on `wip/pre-v2-uncommitted` (bundled into the MCP commit since that commit's edits are what this build chain is for).

## B. Dockerfile MCP pins regression test

**Intent:** Every MCP server installed via the Dockerfile's `npm install -g` block must carry an explicit `@version`. This prevents regression: someone adds a server without pinning, runtime `npx` downloads start happening on cold-start, and containers time out.

**File:** `src/dockerfile-pins.test.ts` (new)

**How to apply:** Verbatim — 47 lines:

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

describe('container/Dockerfile MCP pins', () => {
  const dockerfile = readFileSync(
    resolve(__dirname, '../container/Dockerfile'),
    'utf-8',
  );

  const mcpBlock = dockerfile
    .split(/\n(?=RUN |FROM |COPY |CMD |ENTRYPOINT )/)
    .find((b) => b.includes('npm install -g') && b.includes('mcp'));

  it('pins every globally-installed MCP server to an explicit version', () => {
    expect(mcpBlock).toBeDefined();
    const pkgs = (mcpBlock as string)
      .split(/\s+/)
      .filter((t) => /^(@?[\w-]+\/)?[\w.-]+(@.+)?$/.test(t))
      .filter(
        (t) =>
          t.startsWith('@') ||
          (t.includes('mcp') &&
            !['npm', 'install', '-g', 'RUN'].includes(t)),
      );

    for (const pkg of pkgs) {
      // Scoped or unscoped, must contain "@version" after the name.
      // Scoped: @scope/name@version (so we expect ≥2 '@')
      // Unscoped: name@version (so we expect ≥1 '@')
      const minAt = pkg.startsWith('@') ? 2 : 1;
      const atCount = (pkg.match(/@/g) || []).length;
      expect(atCount, `${pkg} must be pinned`).toBeGreaterThanOrEqual(minAt);
    }
  });
});
```

For v2 — if v2's Dockerfile has a different structure (multi-stage build, separate `RUN` blocks per server), the regex that finds the MCP block may need adjustment. The intent (every globally-installed MCP server is version-pinned) stays the same.

The corresponding `.gitignore` entry for vitest output should also land on v2:

```
# In .gitignore
test-results/
```

## C. Source commits

- Build chain: `c530843`
- Test file: `174e5ff` (ships with `.gitignore` line for `test-results/`)

Run `git show 174e5ff -- src/dockerfile-pins.test.ts .gitignore` for the exact verbatim diff.
