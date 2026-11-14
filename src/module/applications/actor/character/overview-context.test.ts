import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApplicationV2Stub } from '../../../testing/app-v2-stub.ts';
import { asCharacterSheet } from '../../../testing/sheet-stub.ts';
import type { CharacterSheetContext } from './sheet-support.ts';

// The module binds Foundry's TextEditor / DialogV2 / Toast as it loads (sheet-support.ts),
// so a minimal `foundry` global goes in before it is imported.
vi.stubGlobal('foundry', { applications: { ux: { TextEditor: { implementation: {} } }, api: { DialogV2: {} } } });
installApplicationV2Stub();
// The XP-cost table is the only value this module takes from the base sheet, whose class needs Foundry to load.
vi.mock('../base-actor-sheet.ts', () => ({ ADVANCE_XP_COSTS: [100, 250, 500, 750, 1000] }));
const { injectInfluenceAsCharacteristic } = await import('./overview-context.ts');

/** The Overview tab's context, split out of the character sheet (#716). */
beforeEach(() => {
    vi.stubGlobal('game', { i18n: { localize: (key: string): string => key } });
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('injectInfluenceAsCharacteristic (#716)', () => {
    it('adds DH2 RAW Influence to the characteristics as a flat 0–100 value with its bonus', () => {
        const context = { actor: { characteristics: {} } } as CharacterSheetContext;
        injectInfluenceAsCharacteristic.call(asCharacterSheet({ actor: { system: { influence: 37 } } }), context);
        expect(context.actor?.characteristics?.['influence']).toMatchObject({
            base: 37,
            total: 37,
            bonus: 3,
            advance: 0,
            label: 'WH40K.Characteristic.Influence',
        });
    });

    it('does nothing without an actor in the context', () => {
        const context: CharacterSheetContext = {};
        injectInfluenceAsCharacteristic.call(asCharacterSheet({ actor: { system: { influence: 37 } } }), context);
        expect(context).toEqual({});
    });
});
