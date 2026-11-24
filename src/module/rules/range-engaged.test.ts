import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { pointBlankWhenEngaged } from './range.ts';

describe("Point Blank when engaged with the target (#804, RAW: the bonus doesn't apply)", () => {
    it('a pistol at Point Blank, not engaged with the target: +30 stands', () => {
        expect(pointBlankWhenEngaged('pointBlank', 30, false)).toEqual({ bonus: 30, voided: false });
    });

    it('a pistol at the foe it is engaged with: Point Blank, but no bonus', () => {
        expect(pointBlankWhenEngaged('pointBlank', 30, true)).toEqual({ bonus: 0, voided: true });
    });

    it('engagement changes nothing beyond Point Blank range', () => {
        expect(pointBlankWhenEngaged('short', 10, true)).toEqual({ bonus: 10, voided: false });
        expect(pointBlankWhenEngaged('long', -10, true)).toEqual({ bonus: -10, voided: false });
    });

    it('the weapon range applies it and says why on the card', () => {
        const range = readRepoFile('src/module/rules/range.ts');
        expect(range).toMatch(/pointBlankWhenEngaged\(mutableRollData\.rangeBracket, rollData\.rangeBonus, rollData\.engagedWithTarget\)/);
        expect(range).toContain("t('WH40K.Roll.Engagement.NoPointBlank')");
    });
});
