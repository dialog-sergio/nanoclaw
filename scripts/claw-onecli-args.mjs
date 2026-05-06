#!/usr/bin/env node
/**
 * Outputs OneCLI docker proxy args as a JSON array.
 * Called by the claw Python script to inject credentials into the container.
 * Usage: node claw-onecli-args.mjs <nanoclaw-dir>
 */
import { OneCLI } from '@onecli-sh/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

const nanoclaDir = process.argv[2] || process.cwd();
const envFile = join(nanoclaDir, '.env');

let onecliUrl = 'http://127.0.0.1:10254';
try {
  const env = readFileSync(envFile, 'utf-8');
  const match = env.match(/^ONECLI_URL=(.+)$/m);
  if (match) onecliUrl = match[1].trim();
} catch {}

try {
  const onecli = new OneCLI({ url: onecliUrl });
  const args = [];
  const applied = await onecli.applyContainerConfig(args, { addHostMapping: false });
  if (applied) {
    // Exclude Google APIs from the OneCLI proxy — Gmail/Calendar MCPs use their own
    // local OAuth credentials and must reach Google directly.
    const noProxy = 'googleapis.com,accounts.google.com,oauth2.googleapis.com,*.googleapis.com';
    args.push('-e', `NO_PROXY=${noProxy}`, '-e', `no_proxy=${noProxy}`);
  }
  console.log(JSON.stringify({ ok: applied, args }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, args: [], error: e.message }));
}
