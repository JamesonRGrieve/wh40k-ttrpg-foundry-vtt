/**
 * Regression guard for game-line homebrew origin conversions (see packs/CLAUDE.md
 * "Homebrew Conversions").
 *
 * A homebrew conversion adds a target-line variant (e.g. `dh2`), flagged
 * `source.dh2.provenance: "homebrew"`, to a canonical that is `raw` elsewhere. It
 * has no stub in the target line's packs and no `gameSystems` membership there:
 * the target line's builder discovers it from the canonical's own line's pack
 * (content#38) and badges it as an adapted homebrew conversion. The resolver's
 * raw-provenance fallback keeps the homebrew branch off any line that has no
 * branch of its own.
 *
 * Fortress World (OW/RT raw → DH2 homebrew) is the worked conversion; Schola
 * Progenium (OW/DH1 raw, DH2 homebrew, mechanics authored for OW and DH2 only)
 * is the worked fallback.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeOrigin } from '../src/module/applications/character-creation/normalized-origin.ts';
import { discoverableEntries, discoveredOriginDocument, type DiscoveryIndexEntry } from '../src/module/applications/character-creation/origin-discovery.ts';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';
import { materializeItemVariants } from '../src/module/utils/item-variant-utils.ts';

const PACKS = resolve(__dirname, '../src/packs-private');
const FORTRESS = resolve(PACKS, 'only-war/ow-core-origins-homeworlds/_source/fortress-world_a51ce4de508a699d.json');
const SCHOLA = resolve(PACKS, 'only-war/ow-core-origins-homeworlds/_source/schola-progenium_dee620a3c1ed174e.json');
const OLD_DH2_STUB = resolve(PACKS, 'dark-heresy-2/dh2-core-origins-homeworlds/_source/fortress-world_a51ce4de508a699d.json');

interface Resolved {
    grants: { aptitudes: string[]; skills: object[] };
    modifiers: { characteristics: Record<string, number> };
}

/** A canonical as the compendium index stores it; a fresh parse each call, since the resolver mutates its input. */
function storedEntry(path: string): DiscoveryIndexEntry {
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); the stored document read as an index entry
    return JSON.parse(readFileSync(path, 'utf8')) as DiscoveryIndexEntry;
}

function resolveFor(path: string, line: Parameters<typeof materializeItemVariants>[1]): Resolved {
    // eslint-disable-next-line no-restricted-syntax -- boundary: resolver returns the untyped system payload; cast to the fields this test reads
    return materializeItemVariants(storedEntry(path).system, line) as unknown as Resolved;
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('Fortress World — DH2 homebrew conversion', () => {
    it('resolves the DH2 homebrew stats for a DH2 actor', () => {
        const sys = resolveFor(FORTRESS, 'dh2');
        expect({ aptitudes: sys.grants.aptitudes, characteristics: sys.modifiers.characteristics }).toEqual({
            aptitudes: ['Defence'],
            characteristics: { toughness: 5, willpower: 5 },
        });
    });

    it('resolves the original OW stats for an OW actor', () => {
        const sys = resolveFor(FORTRESS, 'ow');
        expect({ skills: sys.grants.skills.length, characteristics: sys.modifiers.characteristics }).toEqual({ skills: 4, characteristics: {} });
    });

    it('gives RT its own Into the Storm p.11 stats, never DH2’s homebrew', () => {
        const sys = resolveFor(FORTRESS, 'rt');
        expect({ skills: sys.grants.skills.length, characteristics: sys.modifiers.characteristics }).toEqual({
            skills: 2,
            characteristics: { ballisticSkill: 5, willpower: 5, intelligence: -5, fellowship: -5 },
        });
    });

    it('has no DH2 stub and no DH2 gameSystems membership, so DH2’s compendium browser does not list it', () => {
        const stored = storedEntry(FORTRESS);
        expect({ stub: existsSync(OLD_DH2_STUB), gameSystems: stored.system['gameSystems'] }).toEqual({ stub: false, gameSystems: ['ow', 'rt'] });
    });

    it('is discovered by the DH2 builder from the OW pack, with DH2’s stats and OW and RT as its official lines', () => {
        // Official lines that exclude the active line are what `originProvenanceFlags`
        // reads as an adapted homebrew conversion (the shuffle badge; origin-path-builder.test.ts).
        const origins = discoverableEntries([storedEntry(FORTRESS)], 'dh2', new Set()).map((entry) => normalizeOrigin(discoveredOriginDocument(entry, 'dh2')));
        expect(origins.map((origin) => ({ official: [...origin.officialLines].sort(), aptitudes: origin.grants.aptitudes }))).toEqual([
            { official: ['ow', 'rt'], aptitudes: ['Defence'] },
        ]);
    });
});

describe.skipIf(!HAS_PRIVATE_CONTENT)('Schola Progenium — a line with no mechanics branch falls back to raw, never homebrew', () => {
    it('gives DH1, which has no grants/modifiers branch, OW’s raw stats rather than DH2’s homebrew', () => {
        const dh1 = resolveFor(SCHOLA, 'dh1');
        const dh2 = resolveFor(SCHOLA, 'dh2');
        expect({ dh1: dh1.modifiers.characteristics, dh2: dh2.modifiers.characteristics }).toEqual({
            dh1: resolveFor(SCHOLA, 'ow').modifiers.characteristics,
            dh2: { willpower: 5, toughness: 5 },
        });
    });
});
