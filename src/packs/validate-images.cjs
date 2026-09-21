/*
 * Build-time image-COVERAGE validator across ALL entity types (companion to
 * validate-schema.cjs and validate-actors.cjs).
 *
 * Every pack document (Actor, Item, JournalEntry, RollTable, Adventure, Scene…)
 * is classified by its Foundry document class, and its `img` is graded as either
 * REAL ART (a curated `…/images/**` asset or an `https://` hotlink — see "Artwork
 * & Tokens" in docs/pack-authoring.md) or a DEFAULT (Foundry core `icons/**`, the
 * `_vendored-ui/icons/**` generics, mystery-man / item-bag, or a missing img).
 *
 * Coverage is the count of documents with real art, PER document class. It is a
 * one-way ratchet (see scripts/images-ratchet.mjs): the arted count for a class
 * may RISE, never FALL — exactly like the Tailwind theme-adoption ratchet, and
 * the opposite direction to the defect ratchets. This is the correct shape for a
 * coverage metric: adding new (legitimately un-arted) content never trips it, and
 * only losing existing art — replacing a portrait with a placeholder, or deleting
 * an arted document — does. Image coverage is bounded by source-art availability
 * (an inherent limit, not a defect — docs/pack-authoring.md), so unlike the defect
 * ratchets it never "graduates to strict"; the team re-baselines upward as art
 * lands.
 *
 * WARN-ONLY on its own (prints a coverage report); the ratchet does the gating.
 *
 * Usage:
 *   node src/packs/validate-images.cjs [--verbose]
 *   require('./validate-images.cjs').validateImagePacks({ rootDir, verbose })
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['_backups', '_templates', '.build', 'node_modules']);

function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function nonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

/**
 * True when `img` is genuine curated art — a hotlinked image or a `…/images/**`
 * asset — rather than a Foundry/vendored default icon. Mirrors the Artwork &
 * Tokens contract: `icons/**`, `systems/wh40k-rpg/icons/**`,
 * `…/_vendored-ui/icons/**`, mystery-man and item-bag are all replaceable
 * defaults; curated art lives under `…/images/**` or is an `https://` hotlink.
 */
function hasRealArt(img) {
    if (!nonEmptyString(img)) return false;
    if (/^https?:\/\//i.test(img)) return true;
    if (/\/images\//.test(img)) return true;
    return false;
}

/** Actor document `type` values (npc/character/vehicle families, per-line or bare). */
const ACTOR_TYPE_RE = /(^|-)(npc|character|vehicle|starship|terracraft|aircraft)$/;

/**
 * The Foundry document class of a pack `_source` document, from its shape — the
 * grain the coverage ratchet buckets by ("all entity types"). RollTable and
 * JournalEntry are identified by their embedded collections; Actors by their
 * type family; everything else with a `type` is an Item.
 */
function imageClassOf(doc) {
    if (!isPlainObject(doc)) return 'Other';
    if (Array.isArray(doc.results)) return 'RollTable';
    if (Array.isArray(doc.pages)) return 'JournalEntry';
    if (Array.isArray(doc.scenes) || nonEmptyString(doc.navName)) return 'Adventure';
    const t = doc.type;
    if (typeof t === 'string' && ACTOR_TYPE_RE.test(t)) return 'Actor';
    if (nonEmptyString(t)) return 'Item';
    return 'Other';
}

/**
 * Document classes that are mechanical/text, not illustrated — their Foundry
 * default icon IS the correct final state, so they are EXEMPT from image
 * coverage. A RollTable's `d20` icon is not a placeholder to be replaced, so
 * counting it as "0% arted" would be noise; it is dropped from the tally
 * entirely rather than tracked at zero.
 */
const NO_ART_CLASSES = new Set(['RollTable']);

function collectPackFiles(rootDir) {
    const results = [];
    for (const group of fs.readdirSync(rootDir)) {
        if (SKIP_DIRS.has(group)) continue;
        const groupPath = path.join(rootDir, group);
        if (!fs.statSync(groupPath).isDirectory()) continue;
        for (const packName of fs.readdirSync(groupPath)) {
            if (/\.backup|backup-\d/.test(packName)) continue;
            const sourceDir = path.join(groupPath, packName, '_source');
            if (!fs.existsSync(sourceDir)) continue;
            for (const entry of fs.readdirSync(sourceDir)) {
                if (entry.endsWith('.json')) results.push(path.join(sourceDir, entry));
            }
        }
    }
    return results;
}

/**
 * Walk every pack `_source` document and tally real-art coverage per document
 * class. Reference stubs are skipped (they resolve to another document's art).
 */
function validateImagePacks(opts) {
    const options = opts || {};
    const rootDir = options.rootDir || __dirname;
    const verbose = Boolean(options.verbose);
    const log = typeof options.log === 'function' ? options.log : (msg) => process.stdout.write(`${msg}\n`);

    const byClass = {};
    const placeholders = [];
    let scanned = 0;
    let exempt = 0;

    for (const file of collectPackFiles(rootDir)) {
        let doc;
        try {
            doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            continue;
        }
        if (!isPlainObject(doc) || Object.prototype.hasOwnProperty.call(doc, 'reference')) continue;
        scanned += 1;
        const cls = imageClassOf(doc);
        if (NO_ART_CLASSES.has(cls)) {
            exempt += 1;
            continue;
        }
        const bucket = byClass[cls] || (byClass[cls] = { arted: 0, total: 0 });
        bucket.total += 1;
        if (hasRealArt(doc.img)) bucket.arted += 1;
        else placeholders.push({ class: cls, file: path.relative(rootDir, file), img: nonEmptyString(doc.img) ? doc.img : '(none)' });
    }

    const arted = {};
    for (const [cls, b] of Object.entries(byClass)) arted[cls] = b.arted;
    const totalArted = Object.values(byClass).reduce((a, b) => a + b.arted, 0);

    log('=== image coverage (warn-only) ===');
    log(`scanned ${scanned} pack document(s)${exempt ? ` (${exempt} art-exempt: ${[...NO_ART_CLASSES].join(', ')})` : ''}`);
    for (const cls of Object.keys(byClass).sort()) {
        const b = byClass[cls];
        const pct = b.total ? Math.round((100 * b.arted) / b.total) : 0;
        log(`  ${cls.padEnd(14)} ${String(b.arted).padStart(5)} / ${String(b.total).padStart(5)} arted (${pct}%)`);
    }
    log(`  ${'TOTAL'.padEnd(14)} ${String(totalArted).padStart(5)} / ${String(scanned - exempt).padStart(5)} arted`);
    if (verbose) {
        for (const p of placeholders) log(`      [${p.class}] ${p.file} — ${p.img}`);
    } else {
        log('  (run with --verbose for the per-document placeholder list)');
    }

    return { scanned, exempt, byClass, arted, placeholders };
}

module.exports = { validateImagePacks, hasRealArt, imageClassOf, NO_ART_CLASSES };

// CLI shim (warn-only; always exits 0 — scripts/images-ratchet.mjs does the gating).
if (require.main === module) {
    const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
    validateImagePacks({ verbose });
    process.exit(0);
}
