/**
 * Regression guard (#331): `_prepareAptitudePills` must not assume
 * `system.aptitudes` exists. NPC actors reuse the PC templates but their
 * DataModel has no `aptitudes` field, so `actor.system.aptitudes` is undefined —
 * an unguarded `[...granted]` spread threw "granted is not iterable" and crashed
 * every NPC sheet (the Aptitudes relocation to the Statistics tab surfaced it).
 *
 * The sheet class pulls in Foundry globals at module load and cannot instantiate
 * under the unit env, so the contract is asserted at the source level — the same
 * idiom as npc-sheet-sidebar-fields.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const SRC = readRepoFile('src/module/applications/actor/character-sheet.ts');

describe('_prepareAptitudePills NPC guard (#331)', () => {
    it('reads granted aptitudes through an optional shape so absent NPC aptitudes yield []', () => {
        // The helper reads aptitudes via { aptitudes?: string[] } and defaults to [],
        // so an NPC actor (whose DataModel has no aptitudes) produces an empty list
        // instead of throwing on the spread.
        expect(SRC).toMatch(/as \{ aptitudes\?: string\[\] \}\)\.aptitudes/);
        expect(SRC).toMatch(/return apt \?\? \[\]/);
    });

    it('no longer spreads the unguarded raw cast (the crash shape)', () => {
        expect(SRC).not.toContain('const granted = actor.system.aptitudes as string[];');
    });
});
