#!/usr/bin/env node
/**
 * Bootstrap-create the DH2 gameplay-rules audit issues on GitHub.
 *
 * Reads `docs/dh2-audit-issues.yaml`, looks up the active set of open and
 * closed audit issues via `gh issue list --label dh2-audit`, and creates
 * any entry whose title is not already present. Idempotent — running it
 * twice never produces duplicates.
 *
 * Plan: /home/jameson/.claude/plans/fizzy-dazzling-treehouse.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const inventoryPath = path.join(repoRoot, 'docs', 'dh2-audit-issues.yaml');
const repo = 'JamesonRGrieve/wh40k-ttrpg-foundry-vtt';

const inventory = yaml.load(fs.readFileSync(inventoryPath, 'utf8'));
if (!inventory || !Array.isArray(inventory.issues)) {
    console.error(`Invalid inventory shape at ${inventoryPath}`);
    process.exit(1);
}

function sh(args) {
    return execFileSync('gh', args, { encoding: 'utf8' });
}

console.log(`Fetching existing audit issues from ${repo}…`);
const existingRaw = sh([
    'issue',
    'list',
    '--repo',
    repo,
    '--label',
    'dh2-audit',
    '--state',
    'all',
    '--limit',
    '500',
    '--json',
    'number,title,state',
]);
const existing = JSON.parse(existingRaw);
const byTitle = new Map(existing.map((i) => [i.title, i]));
console.log(`Found ${existing.length} existing audit issues.`);

let created = 0;
let skipped = 0;
for (const entry of inventory.issues) {
    if (!entry.title || !entry.body) {
        console.error(`Skipping malformed entry: ${JSON.stringify(entry).slice(0, 100)}`);
        continue;
    }
    const prior = byTitle.get(entry.title);
    if (prior) {
        console.log(`  • exists #${prior.number} [${prior.state}] — ${entry.title}`);
        skipped += 1;
        continue;
    }
    const labels = (entry.labels ?? []).join(',');
    const args = [
        'issue',
        'create',
        '--repo',
        repo,
        '--title',
        entry.title,
        '--body',
        entry.body,
    ];
    if (labels) {
        args.push('--label', labels);
    }
    const out = sh(args).trim();
    console.log(`  + created ${out} — ${entry.title}`);
    created += 1;
}

console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
