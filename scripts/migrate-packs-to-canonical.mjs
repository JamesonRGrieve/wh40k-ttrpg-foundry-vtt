#!/usr/bin/env node
/*
 * Programmatic compendium converter: rewrites every `_source/*.json`
 * toward the canonical item schema documented in src/packs/CLAUDE.md.
 *
 * Phases (each gated so they can be applied as the runtime DataModel
 * catches up to the new shape):
 *
 *   cost    — asymmetric system.cost (dh1 no homebrew; homebrew.requisition
 *             dh2-only; homebrew.throneGelt on every line but dh1).
 *   state   — relocate flat transient state under system.state.
 *   source  — convert legacy source (bare string / {book,page,custom})
 *             into structured per-line provenance.
 *   variant — wrap flat lore/stat fields in a per-line variant container,
 *             keyed by the file's own game line.
 *
 * Idempotent: re-running on already-canonical data is a no-op. Reference
 * stubs and non-item docs are left untouched per phase applicability.
 *
 * Usage:
 *   node scripts/migrate-packs-to-canonical.mjs --dry-run [--phase=cost,state,...]
 *   node scripts/migrate-packs-to-canonical.mjs --apply   --phase=cost
 *   (default phases = all; default mode = --dry-run)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKS_ROOT = path.resolve(__dirname, '..', 'src', 'packs');

const LINES = ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow'];
const LINE_SET = new Set(LINES);

/** Group directory → game line. */
const GROUP_LINE = {
    'dark-heresy-1': 'dh1',
    'dark-heresy-2': 'dh2',
    'rogue-trader': 'rt',
    deathwatch: 'dw',
    'black-crusade': 'bc',
    'only-war': 'ow',
};

const STATE_FIELDS = ['equipped', 'stowed', 'inBackpack', 'inShipStorage', 'container', 'activated', 'overloaded'];
const VARIANT_FIELDS = ['description', 'effect', 'notes', 'category', 'consumable', 'uses', 'duration', 'requiredTraining'];

/* ------------------------------------------------------------------ */

function isObj(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isLineKeyed(v) {
    if (!isObj(v)) return false;
    const k = Object.keys(v);
    return k.length > 0 && k.every((x) => LINE_SET.has(x));
}
function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Infer the game line for a file from its group/pack path segments. */
function lineForFile(relPath) {
    const [group, pack] = relPath.split(path.sep);
    if (GROUP_LINE[group]) return GROUP_LINE[group];
    if (group === 'homebrew' && typeof pack === 'string') {
        const m = pack.match(/^hb-([a-z0-9]+)-/);
        if (m && LINE_SET.has(m[1])) return m[1];
        return null; // hb-generic-* : multi-line, no single source line
    }
    return null;
}

/* ----- cost ----- */
function convertCost(cost) {
    if (!isObj(cost)) return { cost, changed: false };
    const next = {
        dh1: { throneGelt: num(cost.dh1?.throneGelt) },
        dh2: {
            influence: num(cost.dh2?.influence),
            homebrew: {
                requisition: num(cost.dh2?.homebrew?.requisition),
                throneGelt: num(cost.dh2?.homebrew?.throneGelt),
            },
        },
        rt: { profitFactor: num(cost.rt?.profitFactor), homebrew: { throneGelt: num(cost.rt?.homebrew?.throneGelt) } },
        dw: { requisition: num(cost.dw?.requisition), homebrew: { throneGelt: num(cost.dw?.homebrew?.throneGelt) } },
        bc: { infamy: num(cost.bc?.infamy), homebrew: { throneGelt: num(cost.bc?.homebrew?.throneGelt) } },
        ow: { logistics: num(cost.ow?.logistics), homebrew: { throneGelt: num(cost.ow?.homebrew?.throneGelt) } },
    };
    return { cost: next, changed: JSON.stringify(cost) !== JSON.stringify(next) };
}

/* ----- state ----- */
function convertState(system) {
    let changed = false;
    const state = isObj(system.state) ? { ...system.state } : {};
    for (const f of STATE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(system, f)) {
            if (!(f in state)) state[f] = system[f];
            delete system[f];
            changed = true;
        }
    }
    if (changed) system.state = state;
    return changed;
}

/* ----- source ----- */
function convertSource(system, line) {
    const src = system.source;
    if (src === undefined || src === null) return false;
    if (isLineKeyed(src)) return false; // already structured per-line
    if (!line) return false; // can't attribute a line (hb-generic) — leave for manual review

    let entry;
    if (typeof src === 'string') {
        const isHb = /homebrew/i.test(src);
        entry = isHb ? { provenance: 'homebrew', url: null } : { provenance: 'raw', book: src, page: '' };
    } else if (isObj(src)) {
        const book = typeof src.book === 'string' ? src.book : '';
        const page = typeof src.page === 'string' ? src.page : '';
        const custom = typeof src.custom === 'string' ? src.custom : '';
        if (book || page) entry = { provenance: 'raw', book, page };
        else if (custom) entry = /homebrew/i.test(custom) ? { provenance: 'homebrew', url: null } : { provenance: 'raw', book: custom, page: '' };
        else return false;
    } else {
        return false;
    }
    system.source = { [line]: entry };
    return true;
}

/* ----- variantization ----- */
function convertVariant(system, line) {
    if (!line) return false; // hb-generic / unknown line — skip
    let changed = false;
    for (const f of VARIANT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(system, f)) continue;
        const v = system[f];
        if (v === null) continue;
        if (isLineKeyed(v)) continue; // already a variant container
        system[f] = { [line]: v };
        changed = true;
    }
    return changed;
}

/* ------------------------------------------------------------------ */

function collectFiles(root) {
    const out = [];
    const skip = new Set(['_backups', '_templates', '.build', 'node_modules']);
    for (const group of fs.readdirSync(root)) {
        if (skip.has(group)) continue;
        const gp = path.join(root, group);
        if (!fs.statSync(gp).isDirectory()) continue;
        for (const pack of fs.readdirSync(gp)) {
            if (/\.backup|backup-\d/.test(pack)) continue; // stale backup pack dir
            const pp = path.join(gp, pack);
            if (!fs.statSync(pp).isDirectory()) continue;
            const sd = path.join(pp, '_source');
            if (!fs.existsSync(sd)) continue;
            for (const f of fs.readdirSync(sd)) if (f.endsWith('.json')) out.push(path.join(sd, f));
        }
    }
    return out;
}

function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const phaseArg = args.find((a) => a.startsWith('--phase='));
    const phases = phaseArg ? phaseArg.slice('--phase='.length).split(',') : ['cost', 'state', 'source', 'variant'];
    const phaseSet = new Set(phases);

    const files = collectFiles(PACKS_ROOT);
    const stats = { cost: 0, state: 0, source: 0, variant: 0, files: files.length, changedFiles: 0, skippedNoLine: 0 };

    for (const file of files) {
        const rel = path.relative(PACKS_ROOT, file);
        let doc;
        try {
            doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            continue;
        }
        if (isObj(doc) && 'reference' in doc) continue; // stub
        const system = isObj(doc.system) ? doc.system : null;
        if (!system) continue;
        const line = lineForFile(rel);

        let fileChanged = false;
        if (phaseSet.has('cost') && system.cost !== undefined) {
            const { cost, changed } = convertCost(system.cost);
            if (changed) {
                system.cost = cost;
                stats.cost++;
                fileChanged = true;
            }
        }
        if (phaseSet.has('state') && convertState(system)) {
            stats.state++;
            fileChanged = true;
        }
        if (phaseSet.has('source') && convertSource(system, line)) {
            stats.source++;
            fileChanged = true;
        }
        if (phaseSet.has('variant') && convertVariant(system, line)) {
            stats.variant++;
            fileChanged = true;
        }
        if ((phaseSet.has('source') || phaseSet.has('variant')) && !line) stats.skippedNoLine++;

        if (fileChanged) {
            stats.changedFiles++;
            if (apply) fs.writeFileSync(file, `${JSON.stringify(doc, null, 4)}\n`);
        }
    }

    const mode = apply ? 'APPLIED' : 'DRY-RUN (no files written)';
    process.stdout.write(`=== compendium conversion — ${mode} ===\n`);
    process.stdout.write(`phases: ${[...phaseSet].join(', ')}\n`);
    process.stdout.write(`scanned ${stats.files} file(s); ${stats.changedFiles} would change\n`);
    process.stdout.write(`  cost rewritten:    ${stats.cost}\n`);
    process.stdout.write(`  state relocated:   ${stats.state}\n`);
    process.stdout.write(`  source structured: ${stats.source}\n`);
    process.stdout.write(`  fields variantized:${stats.variant}\n`);
    if (stats.skippedNoLine) process.stdout.write(`  (${stats.skippedNoLine} hb-generic/unknown-line files skipped for source/variant — need manual line attribution)\n`);
    if (!apply) process.stdout.write('re-run with --apply --phase=<csv> to write changes\n');
}

main();
