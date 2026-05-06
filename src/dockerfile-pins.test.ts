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
          (t.includes('mcp') && !['npm', 'install', '-g', 'RUN'].includes(t)),
      );

    const unpinned = pkgs.filter((p) => {
      const nameOnly = p.replace(/^(@[\w-]+\/)?[\w.-]+/, (m) => m);
      const afterScope = p.startsWith('@')
        ? p.slice(p.indexOf('/') + 1)
        : nameOnly;
      return !afterScope.includes('@');
    });

    expect(
      unpinned,
      `Every MCP package in container/Dockerfile must be pinned to an explicit version (pkg@x.y.z). Unpinned: ${unpinned.join(', ')}. Unpinned packages silently upgrade on rebuild and can break runtime contracts (e.g. Notion API version headers).`,
    ).toEqual([]);
  });

  it('rejects floating tags like @latest or @next', () => {
    const block = mcpBlock as string;
    expect(block).not.toMatch(/@latest\b/);
    expect(block).not.toMatch(/@next\b/);
    expect(block).not.toMatch(/@canary\b/);
  });
});
