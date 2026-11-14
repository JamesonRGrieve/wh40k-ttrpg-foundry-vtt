import { describe, expect, it, vi } from 'vitest';
import { installApplicationV2Stub } from '../../../testing/app-v2-stub.ts';
import { asCharacterSheet } from '../../../testing/sheet-stub.ts';

// The module binds Foundry's TextEditor / DialogV2 / Toast as it loads (sheet-support.ts),
// so a minimal `foundry` global goes in before it is imported.
vi.stubGlobal('foundry', { applications: { ux: { TextEditor: { implementation: {} } }, api: { DialogV2: {} } } });
installApplicationV2Stub();
const { grantedAptitudes } = await import('./origin-context.ts');

/** The origin path and aptitude context, split out of the character sheet (#716). */
describe('grantedAptitudes (#331, #716)', () => {
    it('returns the character’s aptitudes', () => {
        expect(grantedAptitudes.call(asCharacterSheet({ actor: { system: { aptitudes: ['Fieldcraft', 'Weapon Skill'] } } }))).toEqual([
            'Fieldcraft',
            'Weapon Skill',
        ]);
    });

    it('returns none for an NPC, whose DataModel has no aptitudes field', () => {
        expect(grantedAptitudes.call(asCharacterSheet({ actor: { system: {} } }))).toEqual([]);
    });
});
