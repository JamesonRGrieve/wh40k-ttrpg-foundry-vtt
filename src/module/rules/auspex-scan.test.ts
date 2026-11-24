import { describe, expect, it } from 'vitest';
import {
    contactKindFor,
    type ScanCandidate,
    scanAllowed,
    type ScannerData,
    scanContacts,
    scannerReach,
    type ScanWall,
    segmentsCross,
    wallBlocksScan,
} from './auspex-scan.ts';

// The auspex as the lines print it: Tech-Use, 50 m, sees through 50 cm (DH2: 20 cm when Poor), once a round.
const AUSPEX: ScannerData = { range: 50, testSkill: 'techUse', wallPenetration: 50, poorWallPenetration: 20, perRound: 1 };
const PPM = 100; // pixels per metre
const ORIGIN = { x: 0, y: 0 };

function candidate(id: string, x: number, y: number, kind: ScanCandidate['kind'] = 'life'): ScanCandidate {
    return { id, name: id, center: { x, y }, kind };
}

function wall(thickness: number | null, shielded = false): ScanWall {
    // A wall across the x axis at 10 m, spanning y −5 m to +5 m.
    return { a: { x: 1000, y: -500 }, b: { x: 1000, y: 500 }, thickness, shielded };
}

describe('auspex scan (#759)', () => {
    it('reaches 50 m and sees through 50 cm; a Poor auspex only 20 cm', () => {
        expect(scannerReach(AUSPEX, 'common')).toEqual({ range: 50, wallPenetration: 50 });
        expect(scannerReach(AUSPEX, 'poor')).toEqual({ range: 50, wallPenetration: 20 });
        expect(scannerReach({ ...AUSPEX, poorWallPenetration: null }, 'poor')).toEqual({ range: 50, wallPenetration: 50 });
    });

    it('an item with no range is not a scanner', () => {
        expect(scannerReach({ ...AUSPEX, range: 0 }, 'common')).toBeNull();
    });

    it('finds contacts in range, nearest first, with distance and bearing', () => {
        const contacts = scanContacts(ORIGIN, [candidate('far', 0, -4000), candidate('near', 300, 0), candidate('out', 6000, 0)], [], PPM, {
            range: 50,
            wallPenetration: 50,
        });
        expect(contacts.map((c) => c.id)).toEqual(['near', 'far']);
        expect(contacts[0]).toMatchObject({ distance: 3, bearing: 90 });
        expect(contacts[1]).toMatchObject({ distance: 40, bearing: 0 });
    });

    it('a thin or untagged wall does not hide a contact; a thicker or shielded one does', () => {
        const behind = [candidate('behind', 2000, 0)];
        const reach = { range: 50, wallPenetration: 50 };
        expect(scanContacts(ORIGIN, behind, [wall(null)], PPM, reach)).toHaveLength(1);
        expect(scanContacts(ORIGIN, behind, [wall(50)], PPM, reach)).toHaveLength(1);
        expect(scanContacts(ORIGIN, behind, [wall(60)], PPM, reach)).toHaveLength(0);
        expect(scanContacts(ORIGIN, behind, [wall(10, true)], PPM, reach)).toHaveLength(0);
        // A Poor auspex is stopped by 30 cm.
        expect(wallBlocksScan(wall(30), { range: 50, wallPenetration: 20 })).toBe(true);
    });

    it('a wall off the line between them hides nothing', () => {
        expect(scanContacts(ORIGIN, [candidate('beside', 0, 2000)], [wall(500)], PPM, { range: 50, wallPenetration: 50 })).toHaveLength(1);
    });

    it('segments cross only where they meet', () => {
        expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })).toBe(true);
        expect(segmentsCross({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })).toBe(false);
    });

    it('scans once a round in combat, any number of times outside it', () => {
        const combat = { combatId: 'c1', round: 3 };
        expect(scanAllowed(null, combat, 1)).toBe(true);
        expect(scanAllowed({ combatId: 'c1', round: 3 }, combat, 1)).toBe(false);
        expect(scanAllowed({ combatId: 'c1', round: 2 }, combat, 1)).toBe(true);
        expect(scanAllowed({ combatId: 'c1', round: 3 }, null, 1)).toBe(true);
        expect(scanAllowed({ combatId: 'c1', round: 3 }, combat, null)).toBe(true);
    });

    it('vehicles and craft read as machines, everything else as life signs', () => {
        expect(contactKindFor('dh2-terracraft')).toBe('machine');
        expect(contactKindFor('rt-starship')).toBe('machine');
        expect(contactKindFor('dh2-npc')).toBe('life');
        expect(contactKindFor('dh2-character')).toBe('life');
    });
});
