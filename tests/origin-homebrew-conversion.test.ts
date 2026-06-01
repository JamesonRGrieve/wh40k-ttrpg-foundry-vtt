/**
 * Regression guard for game-line homebrew origin conversions (see packs/CLAUDE.md
 * "Homebrew Conversions").
 *
 * A homebrew conversion adds a target-line variant (e.g. `dh2`) — flagged
 * `source.dh2.provenance: "homebrew"` — to a canonical that is `raw` elsewhere,
 * plus a reference stub in the target line's pack so it shows in that builder
 * with the adapted-homebrew (`fa-shuffle`) icon. The risk is that variantizing
 * `grants`/`modifiers` leaks the homebrew branch onto sibling lines that merely
 * reference the canonical; the resolver's raw-provenance fallback prevents that.
 *
 * Fortress World (OW/RT raw → DH2 homebrew) is the worked example.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeItemVariants } from '../src/module/utils/item-variant-utils.ts';

const CANON = resolve(__dirname, '../src/packs/only-war/ow-core-origins-homeworlds/_source/fortress-world_a51ce4de508a699d.json');
const DH2_STUB = resolve(__dirname, '../src/packs/dark-heresy-2/dh2-core-origins-homeworlds/_source/fortress-world_a51ce4de508a699d.json');

interface ResolvedFortress {
    grants: { aptitudes: string[]; skills: object[] };
    modifiers: { characteristics: Record<string, number> };
}
interface ProvenanceEntry {
    provenance: string;
}

/** Untyped compendium `system` payload (variant-resolution boundary). */
// eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry item system data parsed from compendium JSON
type Sys = Record<string, unknown>;

/** Fresh parse each call — materializeItemVariants mutates its input in place. */
function freshSystem(): Sys {
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); compendium document shape, system read structurally
    const doc = JSON.parse(readFileSync(CANON, 'utf8')) as { system: Sys };
    return doc.system;
}

function resolveFor(line: Parameters<typeof materializeItemVariants>[1]): ResolvedFortress {
    // eslint-disable-next-line no-restricted-syntax -- boundary: resolver returns the untyped system payload; cast to the fields this test reads
    return materializeItemVariants(freshSystem(), line) as unknown as ResolvedFortress;
}

describe('Fortress World — DH2 homebrew conversion', () => {
    it('resolves the DH2 homebrew stats for a DH2 actor', () => {
        const sys = resolveFor('dh2');
        expect(sys.grants.aptitudes).toEqual(['Defence']);
        expect(sys.modifiers.characteristics).toEqual({ toughness: 5, willpower: 5 });
    });

    it('resolves the original OW stats for an OW actor', () => {
        const sys = resolveFor('ow');
        expect(sys.grants.skills).toHaveLength(4); // OW Common Lore grants
        expect(sys.modifiers.characteristics).toEqual({}); // OW char mods live in the choice block, not here
    });

    it('does NOT leak the DH2 homebrew block onto the sibling RAW line (RT)', () => {
        // RT references the canonical but has no grants/modifiers branch. The
        // raw-provenance fallback must hand it the OW (raw) stats, never DH2's.
        const sys = resolveFor('rt');
        expect(sys.grants.skills).toHaveLength(4);
        expect(sys.modifiers.characteristics).toEqual({});
        expect(sys.modifiers.characteristics).not.toHaveProperty('toughness');
    });

    it('marks DH2 as a homebrew conversion of RAW source lines (drives the fa-shuffle icon)', () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: untyped compendium source map; cast to the provenance fields read below
        const source = freshSystem()['source'] as Record<string, ProvenanceEntry>;
        expect(source['dh2'].provenance).toBe('homebrew');
        expect(source['ow'].provenance).toBe('raw');
        expect(source['rt'].provenance).toBe('raw');
        // officialLines = [ow, rt] (raw), dh2 not among them → originProvenanceFlags
        // (covered in origin-path-builder.test.ts) classifies this as adapted homebrew.
    });

    it('is reachable from the DH2 builder via a reference stub to the OW canonical', () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); stub shape, reference read structurally
        const stub = JSON.parse(readFileSync(DH2_STUB, 'utf8')) as { reference?: string };
        expect(stub.reference).toContain('ow-core-origins-homeworlds/_source/fortress-world_a51ce4de508a699d.json');
    });
});
