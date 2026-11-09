/**
 * Guard for the shipped CC0 cue and status sounds (#609). Every file under
 * `src/packs/sounds/` must carry a credit row in its ATTRIBUTION.md (and no row
 * may name a file that is gone), and every pack document that points a cue or
 * status sound into `systems/wh40k-rpg/packs/sounds/` must name a file that
 * exists, or the sound 404s on every client. The private content is optional
 * here: without `src/packs-private` only the attribution half runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SOUNDS = path.join(ROOT, 'src/packs/sounds');
const PRIVATE = path.join(ROOT, 'src/packs-private');
const SERVED = 'systems/wh40k-rpg/packs/sounds/';

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
    const found: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...filesUnder(full, keep));
        else if (keep(entry.name)) found.push(full);
    }
    return found;
}

/** The sound files the credits table names, relative to the sounds folder. */
function creditedFiles(): Set<string> {
    const text = fs.readFileSync(path.join(SOUNDS, 'ATTRIBUTION.md'), 'utf8');
    return new Set([...text.matchAll(/^\| `([^`]+\.ogg)` \|/gm)].map((match) => match[1]));
}

/** Every `systems/wh40k-rpg/packs/sounds/…` path a pack source file mentions. */
function referencedSounds(): Set<string> {
    const referenced = new Set<string>();
    const pattern = /"src": "systems\/wh40k-rpg\/packs\/sounds\/([^"]+)"/g;
    for (const file of filesUnder(PRIVATE, (name) => name.endsWith('.json'))) {
        if (!file.includes(`${path.sep}_source${path.sep}`)) continue;
        const text = fs.readFileSync(file, 'utf8');
        if (!text.includes(SERVED)) continue;
        for (const match of text.matchAll(pattern)) referenced.add(match[1]);
    }
    return referenced;
}

describe('shipped cue sounds', () => {
    const shipped = filesUnder(SOUNDS, (name) => name.endsWith('.ogg')).map((file) => path.relative(SOUNDS, file).split(path.sep).join('/'));

    it('ships at least one sound', () => {
        expect(shipped.length).toBeGreaterThan(0);
    });

    it('credits every shipped file, and credits no file that is not shipped', () => {
        const credited = creditedFiles();
        expect(shipped.filter((file) => !credited.has(file))).toEqual([]);
        expect([...credited].filter((file) => !shipped.includes(file))).toEqual([]);
    });

    it('keeps the CC0 licence text beside every Kenney folder', () => {
        const kenney = fs.readdirSync(SOUNDS).filter((name) => name.startsWith('kenney-'));
        expect(kenney.length).toBeGreaterThan(0);
        for (const folder of kenney) expect(fs.existsSync(path.join(SOUNDS, folder, 'License.txt'))).toBe(true);
    });

    it.skipIf(!fs.existsSync(PRIVATE))('resolves every sound a pack document references to a shipped file', () => {
        const referenced = referencedSounds();
        expect(referenced.size).toBeGreaterThan(0);
        expect([...referenced].filter((file) => !shipped.includes(file))).toEqual([]);
    });
});
