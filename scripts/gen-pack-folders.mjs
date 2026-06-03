#!/usr/bin/env node
/**
 * @file Regenerate `system.json` `packFolders` from `packs[]` (#297).
 *
 * Foundry auto-builds the compendium directory's folder tree from the declarative
 * `packFolders` array. That array is hand-edited and drifts: packs added to
 * `packs[]` never get foldered (they fall to the root) and renamed/removed packs
 * leave stale refs. This script makes it deterministic — every `wh40k-rpg` pack is
 * placed under `<line> → <book>` (or `<line> → General` for book-less packs), and
 * nothing that isn't a current pack survives.
 *
 * Book labels are taken (in priority order) from: the labels already present in the
 * current `packFolders` tree (authoritative), then a known book registry, then a
 * title-cased slug fallback. Run via `pnpm packs:folders`; `--check` only verifies
 * (non-zero exit on drift) so it can gate CI / pre-commit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYS_PATH = resolve(ROOT, 'src/system.json');

const LINE_LABELS = {
    bc: 'Black Crusade',
    dh1: 'Dark Heresy 1e',
    dh2: 'Dark Heresy 2e',
    dw: 'Deathwatch',
    ow: 'Only War',
    rt: 'Rogue Trader',
    im: 'Imperium Maledictum',
    hb: 'Homebrew',
};

/** Foundry document-class / category prefixes — when a name's 2nd segment is one of
 *  these there is no book segment (a book-less pack → the line's "General" folder). */
const CATEGORY_PREFIXES = new Set(['items', 'origins', 'actors', 'journals', 'rolltables', 'vehicles', 'adventures', 'patrons', 'endeavours', 'locations']);

/** Book slug → display label, for books with no pack currently foldered (so the
 *  tree can't supply the label). Mirrors the Book-slug registry in src/packs/CLAUDE.md. */
const BOOK_REGISTRY = {
    core: 'Core Rulebook',
    // DH1
    inquisitor: "Inquisitor's Handbook",
    ascension: 'Ascension',
    // DH2
    beyond: 'Enemies Beyond',
    within: 'Enemies Within',
    without: 'Enemies Without',
    // BC
    binding: 'Binding Contracts',
    blood: 'Tome of Blood',
    decay: 'Tome of Decay',
    excess: 'Tome of Excess',
    fate: 'Tome of Fate',
    corruption: 'Hand of Corruption',
    chains: 'Broken Chains',
    // DW
    achilus: 'The Achilus Assault',
    chosen: "The Emperor's Chosen",
    founding: 'First Founding',
    honour: 'Honour the Chapter',
    jericho: 'The Jericho Reach',
    outer: 'The Outer Reach',
    rites: 'Rites of Battle',
    xenos: 'Mark of the Xenos',
    knownofear: 'Know No Fear',
    ark: 'Ark of Lost Souls',
    tempest: 'Rising Tempest',
    // OW
    enemies: 'Enemies of the Imperium',
    hammer: 'Hammer of the Emperor',
    shield: 'Shield of Humanity',
    surrender: 'No Surrender',
    eleventh: 'Eleventh Hour',
    testament: 'Final Testament',
    // RT
    abyss: 'Edge of the Abyss',
    faith: 'Faith and Coin',
    hostile: 'Hostile Acquisitions',
    storm: 'Into the Storm',
    koronus: 'Koronus Bestiary',
    stars: 'Stars of Inequity',
    inequity: 'Stars of Inequity',
    tau: 'Tau Character Guide',
    navis: 'The Navis Primer',
    reaver: 'The Soul Reaver',
    kin: 'The Dark Kin',
    epoch: 'Epoch Koronus',
    // IM
    inquisition: "Inquisition Player's Guide",
    chemical: 'Chemical Burn',
    // shared
    gmkit: "Game Master's Kit",
};

const GENERAL = 'General';
const HOMEBREW_BOOK = 'Homebrew';

function titleCase(slug) {
    return slug
        .split(/[-_]/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
}

/** Parse a pack `name` into { line, book } where `book` is the display label. */
function classify(name, harvested) {
    const segs = name.split('-');
    const line = segs[0];
    if (line === 'hb') return { line: 'hb', book: HOMEBREW_BOOK };
    if (!LINE_LABELS[line]) return null; // not a recognised line prefix — leave alone
    const second = segs[1];
    if (second === undefined || CATEGORY_PREFIXES.has(second)) return { line, book: GENERAL };
    const slug = second;
    const label = harvested[line]?.[slug] ?? BOOK_REGISTRY[slug] ?? titleCase(slug);
    return { line, book: label, slug };
}

/** Harvest slug→label from the existing tree so we preserve curated labels exactly. */
function harvestLabels(packFolders) {
    const map = {};
    for (const top of packFolders ?? []) {
        for (const book of top.folders ?? []) {
            for (const pack of book.packs ?? []) {
                const segs = pack.split('-');
                const line = segs[0];
                const slug = segs[1];
                if (!LINE_LABELS[line] || slug === undefined || CATEGORY_PREFIXES.has(slug)) continue;
                (map[line] ??= {})[slug] = book.name;
            }
        }
    }
    return map;
}

/** Preserve existing top-level folder color/sorting where present. */
function topMeta(packFolders) {
    const meta = {};
    for (const top of packFolders ?? []) meta[top.name] = { color: top.color ?? '', sorting: top.sorting ?? 'a' };
    return meta;
}

function build(system) {
    const harvested = harvestLabels(system.packFolders);
    const meta = topMeta(system.packFolders);
    /** line label → { book label → Set<packName> } */
    const tree = new Map();
    let unrecognised = 0;
    for (const pack of system.packs) {
        const info = classify(pack.name, harvested);
        if (info === null) {
            unrecognised++;
            continue;
        }
        const lineLabel = LINE_LABELS[info.line];
        if (!tree.has(lineLabel)) tree.set(lineLabel, new Map());
        const books = tree.get(lineLabel);
        if (!books.has(info.book)) books.set(info.book, new Set());
        books.get(info.book).add(pack.name);
    }

    const lineLabelsSorted = [...tree.keys()].sort((a, b) => a.localeCompare(b));
    const packFolders = lineLabelsSorted.map((lineLabel) => {
        const books = tree.get(lineLabel);
        const bookNamesSorted = [...books.keys()].sort((a, b) => {
            // General sinks to the bottom; everything else alphabetical.
            if (a === GENERAL) return 1;
            if (b === GENERAL) return -1;
            return a.localeCompare(b);
        });
        return {
            name: lineLabel,
            color: meta[lineLabel]?.color ?? '',
            sorting: meta[lineLabel]?.sorting ?? 'a',
            folders: bookNamesSorted.map((bookName) => ({
                name: bookName,
                packs: [...books.get(bookName)].sort((a, b) => a.localeCompare(b)),
            })),
        };
    });
    return { packFolders, unrecognised };
}

function main() {
    const check = process.argv.includes('--check');
    const raw = readFileSync(SYS_PATH, 'utf8');
    const system = JSON.parse(raw);
    const indentMatch = /\n(\s+)"/.exec(raw);
    const indent = indentMatch ? indentMatch[1].replace(/\t/g, '\t') : '  ';
    const declared = system.packs.length;

    const { packFolders, unrecognised } = build(system);

    const foldered = packFolders.reduce((n, t) => n + t.folders.reduce((m, f) => m + f.packs.length, 0), 0);
    const expected = declared - unrecognised;

    const next = { ...system, packFolders };
    const serialized = `${JSON.stringify(next, null, indent)}\n`;
    const changed = serialized !== raw;

    console.log(`[pack-folders] declared=${declared} foldered=${foldered} (expected ${expected}) lines=${packFolders.length} unrecognised=${unrecognised}`);
    if (foldered !== expected) {
        console.error(`[pack-folders] ERROR: ${expected - foldered} recognised pack(s) not foldered`);
        process.exit(1);
    }

    if (check) {
        if (changed) {
            console.error('[pack-folders] DRIFT: packFolders is out of sync with packs[]. Run `pnpm packs:folders`.');
            process.exit(1);
        }
        console.log('[pack-folders] OK: in sync.');
        return;
    }

    if (changed) {
        writeFileSync(SYS_PATH, serialized);
        console.log('[pack-folders] rewrote src/system.json packFolders.');
    } else {
        console.log('[pack-folders] already in sync; no change.');
    }
}

main();
