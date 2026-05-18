import { describe, expect, it } from 'vitest';
import {
    FAITH_OF_THE_EMPEROR,
    HOLY_AEGIS,
    SISTER_OF_BATTLE_TALENTS,
    SISTERS_RESOLVE,
} from './sister-of-battle';

/**
 * Contract tests for the Sister of Battle elite-advance talents
 * (#134 — within.md L1070-1074). Each constant pins the mechanical
 * rider the engine consumer needs.
 */
describe('Sister of Battle talents — within.md (#134)', () => {
    it('Faith of the Emperor: +10 WP vs psychic powers', () => {
        expect(FAITH_OF_THE_EMPEROR.id).toBe('faith-of-the-emperor');
        expect(FAITH_OF_THE_EMPEROR.label).toBe('WH40K.SisterOfBattle.FaithOfEmperor');
        expect(FAITH_OF_THE_EMPEROR.wpBonus).toBe(10);
        expect(FAITH_OF_THE_EMPEROR.fearBonus).toBeUndefined();
        expect(FAITH_OF_THE_EMPEROR.daemonReduction).toBeUndefined();
    });

    it('Holy Aegis: ignore 1d10 daemonic-source damage once per round', () => {
        expect(HOLY_AEGIS.id).toBe('holy-aegis');
        expect(HOLY_AEGIS.label).toBe('WH40K.SisterOfBattle.HolyAegis');
        expect(HOLY_AEGIS.daemonReduction).toBe('1d10');
        expect(HOLY_AEGIS.wpBonus).toBeUndefined();
        expect(HOLY_AEGIS.fearBonus).toBeUndefined();
    });

    it("Sister's Resolve: +20 to Fear tests", () => {
        expect(SISTERS_RESOLVE.id).toBe('sisters-resolve');
        expect(SISTERS_RESOLVE.label).toBe('WH40K.SisterOfBattle.SistersResolve');
        expect(SISTERS_RESOLVE.fearBonus).toBe(20);
        expect(SISTERS_RESOLVE.wpBonus).toBeUndefined();
        expect(SISTERS_RESOLVE.daemonReduction).toBeUndefined();
    });

    it('grants list contains all three talents in display order', () => {
        expect(SISTER_OF_BATTLE_TALENTS).toHaveLength(3);
        expect(SISTER_OF_BATTLE_TALENTS[0]).toBe(FAITH_OF_THE_EMPEROR);
        expect(SISTER_OF_BATTLE_TALENTS[1]).toBe(HOLY_AEGIS);
        expect(SISTER_OF_BATTLE_TALENTS[2]).toBe(SISTERS_RESOLVE);
    });
});
