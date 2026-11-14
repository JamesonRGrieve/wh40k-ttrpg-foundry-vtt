import { describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import { dosDamageDieOffered } from './dos-damage-die.ts';

describe('the Degrees-of-Success damage die is per line and once per attack (#737)', () => {
    it('is declared by exactly the lines whose rulebook has it', () => {
        const lines = SystemConfigRegistry.getAll()
            .filter((config) => config.dosDamageDie)
            .map((config) => config.id)
            .sort();
        expect(lines).toEqual(['bc', 'dh2', 'dw', 'ow', 'rt']);
    });

    it('is offered on a line with the rule until the attack spends it', () => {
        expect(dosDamageDieOffered('dh2', false)).toBe(true);
        expect(dosDamageDieOffered('dh2', true)).toBe(false);
    });

    it('is not offered on a line without the rule, or with no known line', () => {
        expect(dosDamageDieOffered('dh1', false)).toBe(false);
        expect(dosDamageDieOffered(undefined, false)).toBe(false);
    });
});
