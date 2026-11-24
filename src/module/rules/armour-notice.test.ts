import { describe, expect, it } from 'vitest';
import { armourNotice } from './armour-notice.ts';

describe('armourNotice (#798)', () => {
    it('says nothing once any armour is equipped', () => {
        expect(
            armourNotice([
                { id: 'a', name: 'Flak Vest', equipped: true },
                { id: 'b', name: 'Flak Helmet', equipped: false },
            ]),
        ).toBeNull();
    });

    it('names every piece carried when none is equipped', () => {
        expect(
            armourNotice([
                { id: 'a', name: 'Flak Vest', equipped: false },
                { id: 'b', name: 'Flak Helmet', equipped: false },
            ]),
        ).toEqual({
            kind: 'unequipped',
            pieces: [
                { id: 'a', name: 'Flak Vest' },
                { id: 'b', name: 'Flak Helmet' },
            ],
        });
    });

    it('says the character has no armour when none is carried', () => {
        expect(armourNotice([])).toEqual({ kind: 'none' });
    });
});
