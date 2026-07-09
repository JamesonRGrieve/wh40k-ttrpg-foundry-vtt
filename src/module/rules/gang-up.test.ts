import { describe, expect, it } from 'vitest';
import { ALL_SYSTEM_IDS } from '../config/game-systems/types.ts';
import { computeGangUpModifier, countMeleeAttackers, gangUpConfigFor, tokensEngagedInMelee, type GangUpTokenLike } from './gang-up.ts';

const GRID = 100;

/** Build a 1×1 token at grid cell (col,row). */
function tok(id: string, col: number, row: number, disposition: number, size = 1): GangUpTokenLike {
    return { id, x: col * GRID, y: row * GRID, width: size, height: size, disposition };
}

describe('gangUpConfigFor (#417)', () => {
    it('gives the six FFG lines the standard +10/ally, cap +30 rule', () => {
        for (const id of ['rt', 'dh1', 'dh2', 'bc', 'ow', 'dw'] as const) {
            expect(gangUpConfigFor(id)).toEqual({ perAllyBonus: 10, maxBonus: 30 });
        }
    });

    it('disables Ganging Up for Imperium Maledictum', () => {
        expect(gangUpConfigFor('im')).toEqual({ perAllyBonus: 0, maxBonus: 0 });
    });

    it('resolves a config for every game system id (homologation)', () => {
        for (const id of ALL_SYSTEM_IDS) {
            const config = gangUpConfigFor(id);
            expect(config.perAllyBonus).toBeGreaterThanOrEqual(0);
            expect(config.maxBonus).toBeGreaterThanOrEqual(0);
        }
    });

    it('treats an unknown line as the standard rule', () => {
        expect(gangUpConfigFor(undefined)).toEqual({ perAllyBonus: 10, maxBonus: 30 });
    });
});

describe('tokensEngagedInMelee (#417)', () => {
    it('is true for orthogonally adjacent tokens', () => {
        expect(tokensEngagedInMelee(tok('a', 0, 0, 1), tok('b', 1, 0, -1), GRID)).toBe(true);
    });

    it('is true for diagonally adjacent tokens', () => {
        expect(tokensEngagedInMelee(tok('a', 0, 0, 1), tok('b', 1, 1, -1), GRID)).toBe(true);
    });

    it('is false for tokens two squares apart', () => {
        expect(tokensEngagedInMelee(tok('a', 0, 0, 1), tok('b', 2, 0, -1), GRID)).toBe(false);
    });

    it('is false for a token compared with itself', () => {
        const a = tok('a', 0, 0, 1);
        expect(tokensEngagedInMelee(a, a, GRID)).toBe(false);
    });

    it('counts a large (2×2) token adjacency from its far edge', () => {
        const big = { id: 'big', x: 0, y: 0, width: 2, height: 2, disposition: -1 };
        // A 1×1 at cell (2,0) touches the big token's right edge (cols 0-1).
        expect(tokensEngagedInMelee(big, tok('a', 2, 0, 1), GRID)).toBe(true);
        // At cell (3,0) it is one square clear → not engaged.
        expect(tokensEngagedInMelee(big, tok('a', 3, 0, 1), GRID)).toBe(false);
    });
});

describe('countMeleeAttackers (#417)', () => {
    it('counts the attacker plus adjacent same-disposition allies', () => {
        const target = tok('T', 2, 2, -1);
        const attacker = tok('A', 1, 2, 1);
        const ally1 = tok('B', 3, 2, 1);
        const ally2 = tok('C', 2, 1, 1);
        const tokens = [target, attacker, ally1, ally2];
        expect(countMeleeAttackers(attacker, target, tokens, GRID)).toBe(3);
    });

    it('excludes allies not adjacent to the target', () => {
        const target = tok('T', 2, 2, -1);
        const attacker = tok('A', 1, 2, 1);
        const farAlly = tok('B', 6, 6, 1);
        expect(countMeleeAttackers(attacker, target, [target, attacker, farAlly], GRID)).toBe(1);
    });

    it('excludes enemies of the attacker adjacent to the target', () => {
        const target = tok('T', 2, 2, -1);
        const attacker = tok('A', 1, 2, 1);
        const enemy = tok('E', 3, 2, -1); // hostile, adjacent, but not on attacker's side
        expect(countMeleeAttackers(attacker, target, [target, attacker, enemy], GRID)).toBe(1);
    });
});

describe('computeGangUpModifier (#417)', () => {
    const config = gangUpConfigFor('dh2');

    it('is zero when the attacker is not engaged with the target', () => {
        const target = tok('T', 5, 5, -1);
        const attacker = tok('A', 0, 0, 1);
        expect(computeGangUpModifier({ attacker, target, tokens: [target, attacker], gridSize: GRID, config }).bonus).toBe(0);
    });

    it('is zero for a lone attacker (no outnumbering)', () => {
        const target = tok('T', 2, 2, -1);
        const attacker = tok('A', 1, 2, 1);
        expect(computeGangUpModifier({ attacker, target, tokens: [target, attacker], gridSize: GRID, config }).bonus).toBe(0);
    });

    it('grants +10 per additional ally engaged', () => {
        const target = tok('T', 2, 2, -1);
        const attacker = tok('A', 1, 2, 1);
        const ally = tok('B', 3, 2, 1);
        const result = computeGangUpModifier({ attacker, target, tokens: [target, attacker, ally], gridSize: GRID, config });
        expect(result).toEqual({ attackerCount: 2, additionalAllies: 1, bonus: 10 });
    });

    it('caps the bonus at the per-line maximum (+30 for DH2)', () => {
        const target = tok('T', 2, 2, -1);
        // Surround the target on all four orthogonal + four diagonal cells with allies.
        const attacker = tok('A', 1, 2, 1);
        const allies = [attacker, tok('B', 3, 2, 1), tok('C', 2, 1, 1), tok('D', 2, 3, 1), tok('E', 1, 1, 1), tok('F', 3, 3, 1)];
        const result = computeGangUpModifier({ attacker, target, tokens: [target, ...allies], gridSize: GRID, config });
        expect(result.attackerCount).toBe(6);
        expect(result.bonus).toBe(30); // 5 additional × 10 = 50, capped at 30
    });

    it('never fires for Imperium Maledictum (no rule)', () => {
        const imConfig = gangUpConfigFor('im');
        const target = tok('T', 2, 2, -1);
        const attacker = tok('A', 1, 2, 1);
        const ally = tok('B', 3, 2, 1);
        expect(computeGangUpModifier({ attacker, target, tokens: [target, attacker, ally], gridSize: GRID, config: imConfig }).bonus).toBe(0);
    });
});
