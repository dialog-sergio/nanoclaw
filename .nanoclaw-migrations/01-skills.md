# Skills to reapply

Run each `/add-X` slash command on the clean v2 base. After each, run `npm run build` and verify the channel/skill is functional before moving on.

## Apply order

1. **`/add-whatsapp`** — WhatsApp channel via Baileys. Re-pair via QR or pairing code; existing auth state under `~/.whatsapp-auth/` (or wherever v2 keeps it) should be preserved across the migration since data dirs are not touched.
2. **`/add-slack`** — Slack channel (Scout). Uses Socket Mode; existing app token in `.env` should still work.
3. **`/add-gmail`** — Gmail channel (personal account). OAuth credentials at `~/.gmail-mcp/` are preserved.
4. **`/add-voice-transcription`** — OpenAI Whisper API for WhatsApp voice notes. Requires `OPENAI_API_KEY`.
5. **`/add-image-vision`** — image attachments → multimodal blocks. Hooks into WhatsApp channel.
6. **`/add-pdf-reader`** — pdftotext-backed PDF extraction. Container skill (no host code).
7. **`/flight-search`** — Kiwi.com MCP. Adds `kiwi` MCP server in container with `type: 'http', url: 'https://mcp.kiwi.com'` (no API key).

## Post-skill verification

The fork accumulated WhatsApp/Baileys compatibility patches between the skill's initial application and now. v2's add-whatsapp skill **probably** has these already (the explore agent's read suggests so), but **verify by reading the post-`/add-whatsapp` `src/channels/whatsapp.ts`** and checking each item below. If any is missing, port the corresponding fix from the listed commit on `wip/pre-v2-uncommitted`.

| Feature | Verify exists in v2 add-whatsapp | Source commit if porting needed |
|---|---|---|
| `senderPn` fallback for unresolved LIDs | search for `senderPn` in `src/channels/whatsapp.ts` | `2186208` |
| Mention normalization in groups (`@<lid>` → `@<assistantName>`) | search for LID-prefix mention rewriting | `d1381ea` |
| Removed LID translation in outbound metadata routing | outbound code paths use phone JIDs | `151a973` |
| `cachedGroupMetadata` in `makeWASocket` opts | grep `makeWASocket` call | `468625c` |
| `chats.phoneNumberShare` event handler that records LID→phone | grep `phoneNumberShare` | `468625c` |
| `getMessage` callback with persistent cache (≥256 msgs) | grep `getMessage` in `makeWASocket` opts | `c3d349a` |
| `getMessage` returns `undefined` (not throw) on miss | check `getMessage` body | `0b6b9a8` |
| `getPlatformId` monkey-patch (charCode → enum) | grep `getPlatformId` in `whatsapp-auth.ts` | `435b415`, `c0863cc`, `1bd8f06` |
| `proto` via `createRequire` (not ESM import) | grep `createRequire` near `proto` | `a0bf89d`, `468625c` |
| `Baileys ^6.17.16` or newer | `package.json` deps | `87132a3` |
| `openai ^6` (zod v4 compat for transcription) | `package.json` deps | `aa7f149` |
| `image-vision` `media_type` literal-narrowed | `container/agent-runner/src/index.ts`, image content blocks | `5b2991f` |

To inspect a source commit:

```bash
git show <SHA>                                    # full diff
git show <SHA> -- src/channels/whatsapp.ts        # whatsapp.ts diff at that commit
git show <SHA>:src/channels/whatsapp.ts           # full file content
```

## Custom skills not from upstream

None. All applied skills exist as upstream `/add-X` skills on v2.
