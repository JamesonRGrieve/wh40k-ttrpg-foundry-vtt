#!/usr/bin/env node
/**
 * Copyright gate: the public tree carries no page citations, book titles or
 * book-named pack ids. Features are general; book content comes from the
 * private packs.
 *
 * The generic rules (page citations, `<line> core` shorthand, references into
 * the transcribed books, printed table and chapter numbers) live here. The
 * book titles and the book-named pack ids are content, so they are read from
 * the private content repo when it is checked out: the titles from its
 * `book-labels.json`, the pack ids from its pack manifest (every pack not
 * flagged homebrew). Without it, only the generic rules run.
 *
 * Every tracked file is scanned except binaries, the lockfile, generated
 * sources and the gate's own test (which must spell violations to test them).
 * A "Book, p.N" source-label sample (`Sample Book, p.12`) is a format fixture,
 * not a citation, and passes.
 *
 * Verbatim book text: when `WH40K_BOOK_CORPUS` names a directory of transcribed
 * books (their `*.Final.md` pages), any run of VERBATIM_WORDS or more words that
 * a scanned file shares with them is copied text and fails. The public tree may
 * say what a rule does in its own words, never in the book's. Without the
 * corpus this check does not run.
 *
 * Run via `pnpm copyright:audit`. Exit 1 on any violation.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPrivatePackManifest } from './lib/pack-manifest.mjs';
import { shingles, verbatimRuns } from './lib/verbatim-text.mjs';
import { readdirSync } from 'node:fs';

const LINE_NAMES = 'DH1|DH2e?|RT|BC|DW|OW|IM|Dark Heresy(?: 2e)?|Rogue Trader|Black Crusade|Deathwatch|Only War|Imperium Maledictum';

/** Content-agnostic rules: each a name and a global regex. */
export const GENERIC_RULES = [
    { name: 'page-citation', pattern: /\bpp?\.\s?\d{1,4}\b|\bpg\.?\s?\d{1,4}\b|\bpage \d{1,4}\b/giu },
    { name: 'line-core-shorthand', pattern: new RegExp(`\\b(?:${LINE_NAMES}) core\\b`, 'giu') },
    { name: 'book-corpus-ref', pattern: /\b[\w-]+\.md\s*(?:L\d|:\d|§|p\.|lines? \d)|\bL\d{3,}\b/gu },
    { name: 'printed-table', pattern: /\bTables? \d+[-–]\d+|\bChapter [IVX]+\b/giu },
];

/** A source-label format sample ("Sample Book, p.12") ahead of a page match. */
const SAMPLE_LABEL = /\b(?:Sample (?:Book|Sourcebook)|Other Book|Ledger|Book), $/u;

/** Paths never scanned: binaries, the lockfile, the licence text, generated sources and the gate's own test. */
const SKIP_PATH =
    /\.(?:png|webp|jpe?g|gif|svg|ico|woff2?|ttf|otf|pdf|zip|gz|ogg|mp3|webm)$|^pnpm-lock\.yaml$|^LICENSE$|^src\/module\/types\/i18n-keys\.d\.ts$|^tests\/copyright-audit\.test\.ts$/u;

/** The `name.md` a corpus-ref match starts with, if any. */
const MD_NAME = /^([\w-]+\.md)/u;

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * The content rules built from the private content: one for book titles (matched
 * case-sensitively, so a title's words in running prose are not flagged) and one
 * for book-named pack ids.
 * @param {{ titles?: readonly string[], packIds?: readonly string[] }} content
 */
export function contentRules({ titles = [], packIds = [] }) {
    const rules = [];
    const multiWord = [...new Set(titles)].filter((title) => title.trim().includes(' ')).sort((a, b) => b.length - a.length);
    if (multiWord.length > 0) rules.push({ name: 'book-title', pattern: new RegExp(`\\b(?:${multiWord.map(escapeRegExp).join('|')})\\b`, 'gu') });
    const ids = [...new Set(packIds)].sort((a, b) => b.length - a.length);
    if (ids.length > 0) rules.push({ name: 'book-pack-id', pattern: new RegExp(`(?<![\\w-])(?:${ids.map(escapeRegExp).join('|')})(?![\\w-])`, 'gu') });
    return rules;
}

/**
 * Every violation in one file's text. A `name.md` reference is a corpus ref only
 * when `name.md` is not one of the repo's own documents (`repoDocs`, basenames).
 * @param {string} text
 * @param {ReadonlyArray<{ name: string, pattern: RegExp }>} rules
 * @param {ReadonlySet<string>} [repoDocs]
 * @returns {Array<{ line: number, rule: string, match: string }>}
 */
export function findViolations(text, rules, repoDocs = new Set()) {
    const found = [];
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        for (const rule of rules) {
            for (const hit of line.matchAll(rule.pattern)) {
                if (rule.name === 'page-citation' && SAMPLE_LABEL.test(line.slice(0, hit.index))) continue;
                const mdName = MD_NAME.exec(hit[0])?.[1];
                if (rule.name === 'book-corpus-ref' && mdName !== undefined && repoDocs.has(mdName)) continue;
                found.push({ line: index + 1, rule: rule.name, match: hit[0] });
            }
        }
    }
    return found;
}

/** Whether a tracked path is scanned. */
export function isScanned(path) {
    return !SKIP_PATH.test(path);
}

/** The titles and book-named pack ids the private content declares, or null without it. */
function readContent(root) {
    const manifest = readPrivatePackManifest(root);
    if (manifest === null) return null;
    const labelsFile = resolve(root, 'src/packs-private/book-labels.json');
    const labels = existsSync(labelsFile) ? JSON.parse(readFileSync(labelsFile, 'utf8')) : {};
    const titles = [...Object.values(labels.labels ?? {}), ...(labels.otherTitles ?? [])];
    const packIds = (manifest.packs ?? []).filter((pack) => pack.flags?.['wh40k-rpg']?.homebrew !== true).map((pack) => pack.name);
    return { titles, packIds };
}

/**
 * Word runs the books share that are facts, not expression: a list of
 * characteristic abbreviations, a power's printed prerequisites. Each entry is
 * the run's normalised words.
 */
const VERBATIM_ALLOWED = new Set([
    'bs strength s toughness t agility ag intelligence int perception per willpower wp fellowship fel',
    'rating 7 infamy 70 forbidden lore the warp 30 scholastic lore occult 30 child of the',
]);

/** Every `*.Final.md` page under the corpus directory. */
function* corpusPages(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) yield* corpusPages(path);
        else if (entry.name.endsWith('.Final.md')) yield path;
    }
}

/** `path:line: verbatim-book-text: …` for every copied run in the scanned files. */
function verbatimViolations(root, files, corpus) {
    const owned = new Set();
    for (const path of files) {
        for (const shingle of shingles(readFileSync(resolve(root, path), 'utf8'))) owned.add(shingle);
    }
    const shared = new Set();
    for (const page of corpusPages(corpus)) {
        for (const shingle of shingles(readFileSync(page, 'utf8'))) if (owned.has(shingle)) shared.add(shingle);
    }
    const out = [];
    for (const path of files) {
        for (const run of verbatimRuns(readFileSync(resolve(root, path), 'utf8'), (shingle) => shared.has(shingle))) {
            if (!VERBATIM_ALLOWED.has(run.phrase)) out.push(`${path}:${run.line}: verbatim-book-text: ${run.words} words: ${run.excerpt}`);
        }
    }
    return out;
}

function main() {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const content = readContent(root);
    const rules = [...GENERIC_RULES, ...(content === null ? [] : contentRules(content))];
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

    const repoDocs = new Set(tracked.filter((path) => path.endsWith('.md')).map((path) => path.slice(path.lastIndexOf('/') + 1)));

    const violations = [];
    for (const path of tracked) {
        if (!isScanned(path)) continue;
        const file = resolve(root, path);
        if (!existsSync(file) || !statSync(file).isFile()) continue;
        for (const hit of findViolations(readFileSync(file, 'utf8'), rules, repoDocs)) violations.push(`${path}:${hit.line}: ${hit.rule}: ${hit.match}`);
    }

    const corpus = process.env['WH40K_BOOK_CORPUS'];
    if (corpus !== undefined && corpus !== '' && existsSync(corpus)) {
        // The gate spells its own allowed runs, so it is not scanned for them.
        const scanned = tracked.filter(
            (path) => isScanned(path) && path !== 'scripts/copyright-audit.mjs' && existsSync(resolve(root, path)) && statSync(resolve(root, path)).isFile(),
        );
        violations.push(...verbatimViolations(root, scanned, corpus));
    } else {
        console.log('[copyright-audit] WH40K_BOOK_CORPUS unset: verbatim book text not checked');
    }

    if (content === null) console.log('[copyright-audit] private content absent: book titles and pack ids not checked');
    if (violations.length > 0) {
        console.error(`[copyright-audit] ${violations.length} violation(s):`);
        for (const violation of violations) console.error(`  ${violation}`);
        process.exit(1);
    }
    console.log('[copyright-audit] OK');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
