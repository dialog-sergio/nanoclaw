# Personalization

## Identity rename: Andy → Waco

**Intent:** Default assistant identity is "Waco" instead of "Andy" across all groups.

**Files:** `groups/global/CLAUDE.md`, `groups/main/CLAUDE.md` (and any per-group CLAUDE.md generated from these templates).

**How to apply:** In each `CLAUDE.md` template, replace:

- The H1 heading `# Andy` → `# Waco`
- The first sentence `You are Andy, a personal assistant.` → `You are Waco, a personal assistant.`

If v2 has moved CLAUDE.md to a composed format (per the v2 changelog: "shared base + per-group fragments"), the Waco identity should go in the per-group fragment so it overrides the shared base. The shared base may still ship the "Andy" default — that's fine, fragments override.

Also check `src/config.ts` for `ASSISTANT_NAME`:

```ts
export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
```

If v2 still has this default and we don't want to set `ASSISTANT_NAME` in `.env`, change the literal `'Andy'` to `'Waco'`.

## Notion family databases (groups/main only)

**Intent:** The main group's CLAUDE.md documents two Notion databases (Family To-Dos, Family Shopping List) under a "Family HQ" page, with their Database IDs and Data Source IDs, plus instructions for the agent on how to use the Notion MCP tools to manage them.

**Files:** `groups/main/CLAUDE.md`

**How to apply:** Append the following block before the `## Global Memory` section in `groups/main/CLAUDE.md`. Database IDs and data source IDs are user-specific data — copy verbatim:

```markdown
## Family To-Dos and Shopping List (Notion)

Family to-dos and the shopping list are stored in Notion databases under the **Family HQ** page. Always use the Notion MCP tools to manage these — never use local markdown files for to-dos or shopping items.

| Database | Notion Database ID | Data Source ID |
|----------|-------------------|----------------|
| Family To-Dos | `0f141bdfd8194d5c8813bcbf854837d7` | `dcc76d37-a432-4880-96b3-f00aae1010db` |
| Family Shopping List | `78fe25c619b844d29ef638060e4781df` | `ff17ddb8-ca91-4136-8101-a860cc15ff5f` |

### To-Dos
- When adding a to-do, always ask for a deadline if one isn't given
- Use `create-pages` with `data_source_id: dcc76d37-a432-4880-96b3-f00aae1010db`
- To tick off: update the Status to "Done"
- To list: use `query-database-view` on the data source

### Shopping List
- Use `create-pages` with `data_source_id: ff17ddb8-ca91-4136-8101-a860cc15ff5f`
- To tick off: set "Got It" to `__YES__`
- Categories: Groceries, Household, Kids, Health, Other
- When the user says "we got X" or "bought X", tick it off rather than deleting it

---
```

This block depends on the **Notion MCP server** being available to the container — that wiring is captured in `05-mcp-expansion.md`.
