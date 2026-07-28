/**
 * Regression guard (#500): no pack actor may ship Foundry's generic placeholder
 * art without saying so out loud.
 *
 * 77 of 258 vehicle/craft actors shipped `icons/svg/mech.svg` or
 * `icons/svg/mystery-man.svg` — the Sentinel Walker among them — and nothing
 * distinguished "we could not source art for this" from "nobody looked". This
 * test inverts that: every actor still on a placeholder must be listed in
 * `.vehicle-art-skips.json` with a reason, so the gap is a declared, reviewable
 * inventory rather than an invisible one, and a NEW placeholder fails the build.
 *
 * Shrinking the skip list is the ongoing work; growing it requires a deliberate,
 * reviewed edit.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKS_ROOT = resolve(__dirname, '../src/packs');
const SKIPS_FILE = resolve(__dirname, '../.vehicle-art-skips.json');

/**
 * Any Foundry core `icons/svg/*` glyph on an ACTOR is placeholder art.
 *
 * Naming specific files (`mech.svg`, `mystery-man.svg`) only moves the problem
 * to the next glyph — that is exactly what happened here: a sweep repointed 53
 * vehicles from `mech.svg` to `clockwork.svg`, which reads as "resolved" to a
 * filename-matching check while still rendering a grey glyph on canvas.
 */
const isPlaceholder = (img: string): boolean => img === '' || img.startsWith('icons/svg/');

interface SkipList {
    /** Why the list exists, for whoever opens the file next. */
    description: string;
    /** actor name → reason it has no art yet. */
    skips: Record<string, string>;
}

/** Recursively collect every `_source/*.json` under a directory. */
function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
        else if (entry.endsWith('.json') && basename(dir) === '_source') out.push(full);
    }
    return out;
}

interface ActorDoc {
    name?: string;
    type?: string;
    img?: string;
}

const files = existsSync(PACKS_ROOT) ? sourceFiles(PACKS_ROOT) : [];

/** Actor documents in actor-bearing packs, with their authored image. */
const actors: Array<{ file: string; name: string; img: string }> = [];
/**
 * Scoped to the vehicle/craft packs — the surface content#26 covers.
 *
 * Widening it to every actor pack surfaces ~1000 further placeholder-art actors
 * across the bestiaries. That is a real and much larger gap, but declaring a
 * thousand skips here would drown the signal this gate exists to give, so it is
 * recorded on the issue as a follow-up rather than folded in. Widen this regex
 * when that sweep is done.
 */
const IN_SCOPE_PACK = /(^|-)(vehicles|voidcraft|starship)(-|$)/;

/** Parse a pack document, or null when it is unreadable. */
function readActor(file: string): ActorDoc | null {
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as ActorDoc;
    } catch {
        return null;
    }
}

actors.push(
    // `vehicles-*` groups compile as Actors (see the gulpfile's
    // `detectCollectionType`), which is where the reported placeholders live.
    ...files
        .filter((file) => IN_SCOPE_PACK.test(basename(resolve(file, '../..'))))
        .map((file) => ({ file, doc: readActor(file) }))
        .filter((entry): entry is { file: string; doc: ActorDoc } => entry.doc !== null)
        .filter(({ doc }) => typeof doc.name === 'string' && doc.name !== '')
        .map(({ file, doc }) => ({ file, name: doc.name ?? '', img: doc.img ?? '' })),
);

const skipList: SkipList = existsSync(SKIPS_FILE) ? (JSON.parse(readFileSync(SKIPS_FILE, 'utf8')) as SkipList) : { description: '', skips: {} };

describe('pack actor placeholder art (#500)', () => {
    it('finds actor documents to check', () => {
        expect(actors.length).toBeGreaterThan(0);
    });

    it('every placeholder-art actor is an explicitly declared skip', () => {
        const undeclared = actors
            .filter(({ img }) => isPlaceholder(img))
            .filter(({ name }) => !(name in skipList.skips))
            .map(({ name, file }) => `${name} [${file.slice(PACKS_ROOT.length + 1)}]`);
        expect(undeclared).toEqual([]);
    });

    it('the skip list has no stale entries — an actor that gained art is removed', () => {
        const stillPlaceholder = new Set(actors.filter(({ img }) => isPlaceholder(img)).map(({ name }) => name));
        const stale = Object.keys(skipList.skips).filter((name) => !stillPlaceholder.has(name));
        expect(stale).toEqual([]);
    });

    it('every skip carries a reason', () => {
        const reasonless = Object.entries(skipList.skips)
            .filter(([, reason]) => typeof reason !== 'string' || reason.trim() === '')
            .map(([name]) => name);
        expect(reasonless).toEqual([]);
    });
});
