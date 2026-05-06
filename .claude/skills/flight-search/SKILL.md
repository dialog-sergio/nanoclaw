---
name: flight-search
description: Add flight search capability to NanoClaw using the Kiwi.com MCP server. Enables the assistant to search one-way and round-trip flights, compare prices across dates, and return direct booking links. No API key required.
---

# Add Flight Search (Kiwi.com)

Adds flight search to all agent containers via the Kiwi.com MCP server (`https://mcp.kiwi.com`). No API key or account needed — the service is free and open.

When installed, the assistant can handle requests like:
- "Find flights from London to New York next month for 2 people"
- "What's the cheapest return to Malaga in August?"
- "Search business class to Tokyo, flexible on dates"

## Phase 1: Pre-flight

Check if already installed:

```bash
grep -q 'mcp.kiwi.com' container/agent-runner/src/index.ts && echo "ALREADY_INSTALLED" || echo "NOT_INSTALLED"
```

If `ALREADY_INSTALLED`, skip to Phase 3.

## Phase 2: Apply Code Changes

### 1. Add Kiwi MCP server to the agent runner

In `container/agent-runner/src/index.ts`, find the `mcpServers` block inside `runQuery()`. Add a `kiwi` entry after `googlecalendar`:

```typescript
kiwi: {
  url: 'https://mcp.kiwi.com',
},
```

The block should look like:

```typescript
mcpServers: {
  nanoclaw: { ... },
  googlecalendar: { ... },
  kiwi: {
    url: 'https://mcp.kiwi.com',
  },
},
```

### 2. Add kiwi to allowed tools

In the same file, find the `allowedTools` array and add:

```typescript
'mcp__kiwi__*',
```

### 3. Create the container skill

The container skill already exists at `container/skills/flight-search/SKILL.md` — it's included in this skill. No further action needed here.

### 4. Validate

```bash
npm run build
```

Build must be clean before continuing.

## Phase 3: Rebuild container

```bash
./container/build.sh
```

## Phase 4: Sync and restart

Sync the updated agent-runner source to all group caches:

```bash
for dir in data/sessions/*/agent-runner-src/; do
  [ -d "$dir" ] && cp container/agent-runner/src/*.ts "$dir" && echo "synced $dir"
done
```

Restart the service:

```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Linux
systemctl --user restart nanoclaw
```

## Phase 5: Verify

Tell the user:

> Send a message like "Find flights from London to Barcelona next month" in your registered chat.

The assistant should call `mcp__kiwi__search_flight` and return results with booking links.

Check logs if there's no response:

```bash
tail -50 groups/*/logs/container-*.log | grep -i kiwi
```

## Troubleshooting

### "mcp__kiwi__search_flight not available"

The agent-runner wasn't rebuilt or the group cache wasn't synced. Re-run Phase 3 and 4.

### No results returned

Kiwi.com may not have routes for the requested city pair or date. Try:
- Major airport codes (LHR, JFK, BCN) instead of city names
- A date further in the future (Kiwi needs at least a few days lead time)
- Broader dates (the ±3-day window needs room to work)

### Connection error / timeout

`https://mcp.kiwi.com` is a remote service. Check internet connectivity from inside a test container:

```bash
docker run --rm nanoclaw-agent:latest bash -c 'curl -s https://mcp.kiwi.com/health || echo "unreachable"'
```

If unreachable, the Kiwi.com service may be down. Check their status or try again later.

## Removal

To remove flight search:

1. Remove the `kiwi` entry from `mcpServers` in `container/agent-runner/src/index.ts`
2. Remove `'mcp__kiwi__*'` from `allowedTools`
3. Delete `container/skills/flight-search/`
4. Rebuild and restart: `./container/build.sh && launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
