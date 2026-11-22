import { describe, expect, it } from 'vitest';
import { characteristicGenerationRules } from './index.ts';

// Each line's characteristic generation as its core rulebook prints it (#760).
describe('characteristicGenerationRules per line', () => {
    it.each([
        ['dh1', 20],
        ['dh2', 20],
        ['rt', 25],
        ['bc', 25],
        ['dw', 30],
        ['ow', 20],
        ['im', 20],
    ] as const)('%s rolls 2d10 + %i', (line, base) => {
        const rules = characteristicGenerationRules(line);
        expect(rules.roll.dice).toBe('2d10');
        expect(rules.roll.base).toBe(base);
    });

    it('only DH2 turns the home world + and − into 3d10 keep two, prints point buy and an experienced variant', () => {
        const dh2 = characteristicGenerationRules('dh2');
        expect(dh2.roll.originModifiers).toBe('keep-dice');
        expect(dh2.pointBuy).toEqual({ base: 25, pool: 60, cap: 40, raw: true });
        expect(dh2.experienced).toEqual({ rollBase: 25, pointBuyBase: 30, cap: 45 });
        for (const line of ['dh1', 'rt', 'bc', 'dw', 'ow', 'im'] as const) {
            const rules = characteristicGenerationRules(line);
            expect(rules.roll.originModifiers).toBe('flat');
            expect(rules.pointBuy.raw).toBe(false);
            expect(rules.experienced).toBeNull();
        }
    });
});
