import { describe, expect, it, vi } from 'vitest';
import { getRenownRank } from '../../../rules/dw-renown.ts';
import { OW_DEFAULT_LOGISTICS_RATING } from '../../../rules/ow-logistics.ts';
import { installApplicationV2Stub } from '../../../testing/app-v2-stub.ts';
import { asCharacterSheet } from '../../../testing/sheet-stub.ts';

// The module binds Foundry's TextEditor / DialogV2 / Toast as it loads (sheet-support.ts),
// so a minimal `foundry` global goes in before it is imported.
vi.stubGlobal('foundry', { applications: { ux: { TextEditor: { implementation: {} } }, api: { DialogV2: {} } } });
installApplicationV2Stub();
const { PANEL_BUILDERS, prepareBcRitualPanel, prepareDwRequisitionPanel, prepareOwLogisticsPanel } = await import('./line-panels.ts');

/** The per-line engine panels' context builders, split out of the character sheet (#716). */

const sheet = (system: object): ReturnType<typeof asCharacterSheet> => asCharacterSheet({ actor: { system } });

describe('PANEL_BUILDERS (#282, #716)', () => {
    it('lists each line’s panel keys, and only Black Crusade, Deathwatch and Only War have any', () => {
        expect(Object.keys(PANEL_BUILDERS).sort()).toEqual(['bc', 'dw', 'ow']);
        expect(PANEL_BUILDERS.bc?.map((p) => p.key)).toEqual([
            'alignmentPanel',
            'psychicPanel',
            'ritualPanel',
            'giftsPanel',
            'supplementsPanel',
            'daemonPrincePanel',
        ]);
        expect(PANEL_BUILDERS.dw?.map((p) => p.key)).toContain('requisitionPanel');
        expect(PANEL_BUILDERS.ow?.map((p) => p.key)).toContain('logisticsPanel');
    });
});

describe('line panel context builders (#716)', () => {
    it('reads the Deathwatch requisition panel off the actor, ranking its renown', () => {
        expect(prepareDwRequisitionPanel.call(sheet({ requisitionPoints: 30, missionRating: 2, renown: 25 }))).toEqual({
            rp: 30,
            missionRating: 2,
            renownRank: getRenownRank(25),
        });
    });

    it('shows Only War’s default logistics rating until one is set', () => {
        expect(prepareOwLogisticsPanel.call(sheet({ logisticsRating: 0, munitorum: 1, situational: 0 })).rating).toBe(OW_DEFAULT_LOGISTICS_RATING);
        expect(prepareOwLogisticsPanel.call(sheet({ logisticsRating: 42, munitorum: 1, situational: 0 })).rating).toBe(42);
    });

    it('passes Black Crusade ritual mastery through', () => {
        expect(prepareBcRitualPanel.call(sheet({ ritualMastery: 3 }))).toEqual({ ritualMastery: 3 });
    });
});
