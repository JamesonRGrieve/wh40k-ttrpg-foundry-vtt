#!/usr/bin/env node
/**
 * Author `system.trainedSkills` onto NPC actors in the compendium packs (#503).
 *
 * Every actor in every line ships with an EMPTY `trainedSkills` and carries its
 * skills only as the prose `system.skills` line — a field that is not in the
 * schema, so Foundry parses it once on load and then discards it. Any actor
 * imported into a world before that parser existed lost the prose on save and can
 * never recover its skills. This tool materialises the structured field so the
 * data is explicit, reviewable, validator-checkable, and independent of the
 * import-time parser.
 *
 * It reuses the SYSTEM's own parser (`parseSkillEntries`) rather than
 * reimplementing it, loaded through Vite's SSR pipeline so the TypeScript source
 * is the single definition. The one thing it adds on top is grouping: a printed
 * line naming two specialisations of one skill ("Common Lore (Ecclesiarchy),
 * Common Lore (Underworld) +10") collapses to a single key in the map form, which
 * silently drops one of them. Here they become sibling `entries[]` rows, matching
 * the PC `SkillField` shape.
 *
 * Idempotent: an actor that already has a non-empty `trainedSkills` is skipped, so
 * hand-authored data is never clobbered.
 *
 * Usage:
 *   node scripts/author-npc-skills.mjs                 # dry run over every line
 *   node scripts/author-npc-skills.mjs --apply         # write
 *   node scripts/author-npc-skills.mjs --line homebrew --apply
 *   node scripts/author-npc-skills.mjs --line dark-heresy-2 --apply
 *   node scripts/author-npc-skills.mjs --line homebrew --apply --force   # re-author
 *
 * `--force` re-derives over an existing `trainedSkills`. Safe because the field is
 * wholly derived from the prose line; use it after a parser change, never to
 * overwrite genuinely hand-authored data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = path.join(ROOT, 'src', 'packs');

/** Pack directories that hold NPC-shaped actors. Vehicles/ships legitimately have no skills. */
const ACTOR_DIR = /(actors|items-actors)/;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const lineArg = args.indexOf('--line');
const ONLY_LINE = lineArg >= 0 ? args[lineArg + 1] : null;

/** Recursively collect every `_source/*.json` under a directory. */
function collectSources(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectSources(full, out);
        else if (entry.name.endsWith('.json') && full.includes(`${path.sep}_source${path.sep}`)) out.push(full);
    }
    return out;
}

/** Cumulative rank mirrors — must agree with `rankFlags` in rules/npc-advancement.ts. */
function flagsFor(advance) {
    return { trained: advance >= 1, plus10: advance >= 2, plus20: advance >= 3, plus30: advance >= 4 };
}

/**
 * Build the `trainedSkills` map from the parsed entries, grouping repeated keys
 * into `entries[]` so no specialisation is lost.
 */
function buildTrainedSkills(parsed) {
    const byKey = new Map();
    for (const entry of parsed) {
        if (!byKey.has(entry.key)) byKey.set(entry.key, []);
        byKey.get(entry.key).push(entry);
    }

    const trained = {};
    for (const [key, rawGroup] of byKey) {
        // Collapse repeats of the SAME specialisation (a duplicated printing, or the
        // same skill listed twice) to the strongest one. Only genuinely DIFFERENT
        // specialisations deserve separate entries[] rows.
        const bySpec = new Map();
        for (const entry of rawGroup) {
            const prior = bySpec.get(entry.specialization);
            if (prior === undefined || entry.advance > prior.advance || (entry.advance === prior.advance && entry.bonus > prior.bonus)) {
                bySpec.set(entry.specialization, entry);
            }
        }
        const group = [...bySpec.values()];

        // Single printing: one flat row, specialisation (if any) kept in the name.
        if (group.length === 1) {
            const only = group[0];
            trained[key] = { name: only.name, characteristic: only.characteristic, advance: only.advance, ...flagsFor(only.advance), bonus: only.bonus };
            continue;
        }

        // Several specialisations of one skill: a base row at rank 0 plus one entry
        // per specialisation, each carrying its own advance.
        const base = group[0];
        const baseName = base.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
        trained[key] = {
            name: baseName === '' ? base.name : baseName,
            characteristic: base.characteristic,
            advance: 0,
            ...flagsFor(0),
            bonus: 0,
            entries: group.map((entry) => ({
                name: entry.specialization === '' ? entry.name : entry.specialization,
                specialization: entry.specialization,
                characteristic: entry.characteristic,
                advance: entry.advance,
                bonus: entry.bonus,
            })),
        };
    }
    return trained;
}

const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { parseSkillEntries } = await server.ssrLoadModule('/src/module/data/actor/npc-import-migration.ts');
const { SKILL_DEFINITIONS } = await server.ssrLoadModule('/src/module/data/shared/skill-definitions.ts');
const CATALOGUE = new Set(Object.keys(SKILL_DEFINITIONS));

const lines = ONLY_LINE !== null ? [ONLY_LINE] : fs.readdirSync(PACKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

let scanned = 0;
let authored = 0;
let skippedExisting = 0;
let noProse = 0;
const grouped = [];
const rejected = [];

for (const line of lines) {
    for (const file of collectSources(path.join(PACKS, line))) {
        const rel = path.relative(PACKS, file);
        if (!ACTOR_DIR.test(rel)) continue;

        let doc;
        let raw;
        try {
            raw = fs.readFileSync(file, 'utf8');
            doc = JSON.parse(raw);
        } catch {
            continue;
        }
        // A whole-file reference stub resolves at build time and owns no data.
        if (doc.reference !== undefined && Object.keys(doc).length === 1) continue;
        const system = doc.system;
        if (system === undefined || system === null) continue;
        scanned += 1;

        if (!FORCE && system.trainedSkills !== undefined && Object.keys(system.trainedSkills).length > 0) {
            skippedExisting += 1;
            continue;
        }
        const prose = typeof system.skills === 'string' ? system.skills : '';
        if (prose.trim() === '') {
            noProse += 1;
            continue;
        }

        const parsed = parseSkillEntries(prose);
        if (parsed.length === 0) {
            noProse += 1;
            continue;
        }

        // Anything that does not resolve to a real catalogue skill is a CONTENT defect
        // — a GM-choice placeholder ("Any one skill"), a talent mis-filed under Skills
        // ("Peer"), or a typo. Authoring it would mint a key that resolves to no
        // characteristic and renders nowhere, so drop it and report it loudly instead.
        const usable = parsed.filter((e) => CATALOGUE.has(e.key));
        for (const e of parsed) {
            if (!CATALOGUE.has(e.key)) rejected.push(`${rel}: ${doc.name} -> ${JSON.stringify(e.name)} (key ${e.key})`);
        }
        if (usable.length === 0) {
            noProse += 1;
            continue;
        }
        const trainedSkills = buildTrainedSkills(usable);
        if (Object.values(trainedSkills).some((s) => s.entries !== undefined)) {
            grouped.push(`${rel}: ${doc.name}`);
        }

        system.trainedSkills = trainedSkills;
        authored += 1;
        // Preserve the file's existing trailing-newline state so the diff shows only
        // the added trainedSkills, not an unrelated whitespace normalisation.
        if (APPLY) fs.writeFileSync(file, JSON.stringify(doc, null, 4) + (raw.endsWith('\n') ? '\n' : ''), 'utf8');
    }
}

await server.close();

console.log(`scanned            ${scanned}`);
console.log(`authored           ${authored}${APPLY ? '' : '  (dry run — pass --apply to write)'}`);
console.log(`already authored   ${skippedExisting}`);
console.log(`no skills prose    ${noProse}   (vehicles/ships/mindless — expected)`);
if (rejected.length > 0) {
    console.log(`\nREJECTED — not a catalogue skill, needs a content fix (${rejected.length}):`);
    for (const r of rejected) console.log(`  ${r}`);
}
if (grouped.length > 0) {
    console.log(`\nactors needing entries[] for repeated specialisations (${grouped.length}):`);
    for (const g of grouped) console.log(`  ${g}`);
}
