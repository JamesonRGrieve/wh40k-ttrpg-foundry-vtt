import { describe, expect, it } from 'vitest';
import {
    CRIPPLED_STAT_PENALTY,
    criticalRollLabelKey,
    crippledCriticalRolls,
    crippledStatChanges,
    crippledStatComponents,
    followsCrippledRules,
    isShipDestroyed,
    shipConditionView,
    suffersCrippledEffects,
} from './ship-crippled.ts';

/**
 * Crippled and destroyed starships (#187 — RT Core 1.4 errata p.222 "Crippled
 * Ships", p.221 "Destroying Ships", Table 8-12). Every effect is gated on the
 * Rogue Trader line; other lines' voidcraft keep their own reading.
 */

const rt = (value: number, max = 35): { gameSystem: string; hullIntegrity: { value: number; max: number } } => ({
    gameSystem: 'rt',
    hullIntegrity: { value, max },
});
const dh2 = (value: number, max = 35): { gameSystem: string; hullIntegrity: { value: number; max: number } } => ({
    gameSystem: 'dh2',
    hullIntegrity: { value, max },
});

describe('ship-crippled — gating', () => {
    it('follows the Crippled rules on the Rogue Trader line only', () => {
        expect(followsCrippledRules('rt')).toBe(true);
        for (const line of ['dh1', 'dh2', 'bc', 'dw', 'ow', 'im']) expect(followsCrippledRules(line)).toBe(false);
    });

    it('applies the effects to an RT ship at 0 Hull, never at 1 Hull and never to another line', () => {
        expect(suffersCrippledEffects(rt(0))).toBe(true);
        expect(suffersCrippledEffects(rt(1))).toBe(false);
        expect(suffersCrippledEffects(rt(17))).toBe(false);
        expect(suffersCrippledEffects(dh2(0))).toBe(false);
        // An unconfigured hull (max 0) is not Crippled.
        expect(suffersCrippledEffects(rt(0, 0))).toBe(false);
    });
});

describe('ship-crippled — stat changes ("−10 Manoeuvrability and Detection, Speed to half")', () => {
    it('takes 10 off Manoeuvrability and Detection and halves Speed', () => {
        expect(CRIPPLED_STAT_PENALTY).toBe(-10);
        expect(crippledStatChanges(rt(0), 8)).toEqual({ manoeuvrability: -10, detection: -10, speed: -4 });
    });

    it('rounds a halved odd Speed up, so a Speed 1 ship still moves', () => {
        expect(crippledStatChanges(rt(0), 7).speed).toBe(-3);
        expect(crippledStatChanges(rt(0), 1).speed).toBe(0);
    });

    it('changes nothing for a ship that is not Crippled, or on another line', () => {
        expect(crippledStatChanges(rt(5), 8)).toEqual({ manoeuvrability: 0, detection: 0, speed: 0 });
        expect(crippledStatChanges(dh2(0), 8)).toEqual({ manoeuvrability: 0, detection: 0, speed: 0 });
    });

    it('names the penalty as its own provenance row on a test', () => {
        expect(crippledStatComponents(rt(0), 'manoeuvrability')).toEqual([{ labelKey: 'WH40K.Voidcraft.Crippled.Component.Manoeuvrability', value: -10 }]);
        expect(crippledStatComponents(rt(0), 'detection')).toEqual([{ labelKey: 'WH40K.Voidcraft.Crippled.Component.Detection', value: -10 }]);
        expect(crippledStatComponents(rt(3), 'detection')).toEqual([]);
        expect(crippledStatComponents(dh2(0), 'manoeuvrability')).toEqual([]);
    });
});

describe('ship-crippled — Critical Hits from damage past Armour', () => {
    it('reads each application of damage past Armour as a Critical Hit at that value', () => {
        expect(crippledCriticalRolls(rt(0), [7])).toEqual([7]);
        expect(crippledCriticalRolls(rt(0), [9, 6])).toEqual([9, 6]);
    });

    it('causes none when the damage stopped at Armour', () => {
        expect(crippledCriticalRolls(rt(0), [0, -4])).toEqual([]);
    });

    it('causes none to a ship that is not Crippled, or on another line', () => {
        expect(crippledCriticalRolls(rt(1), [7])).toEqual([]);
        expect(crippledCriticalRolls(dh2(0), [7])).toEqual([]);
    });
});

describe('ship-crippled — destruction (operator ruling: RT ships are never destroyed by Hull)', () => {
    it('keeps an RT ship at 0 Hull Crippled, not destroyed', () => {
        expect(isShipDestroyed({ ...rt(0), statuses: [] })).toBe(false);
        expect(isShipDestroyed({ ...rt(0), statuses: [{ destroysShip: false }] })).toBe(false);
    });

    it('destroys an RT ship only through a Critical Hit result marked as destroying it', () => {
        expect(isShipDestroyed({ ...rt(0), statuses: [{ destroysShip: false }, { destroysShip: true }] })).toBe(true);
        // Destruction is the critical, not the Hull: it holds whatever the Hull reads.
        expect(isShipDestroyed({ ...rt(12), statuses: [{ destroysShip: true }] })).toBe(true);
    });

    it('leaves the other lines on their 0-Hull reading', () => {
        expect(isShipDestroyed({ ...dh2(0), statuses: [] })).toBe(true);
        expect(isShipDestroyed({ ...dh2(1), statuses: [{ destroysShip: true }] })).toBe(false);
    });
});

describe('ship-crippled — how a recorded Critical Hit was rolled', () => {
    it('labels a weapon critical as its 1d5 and a Crippled critical as its damage past Armour', () => {
        expect(criticalRollLabelKey(false)).toBe('WH40K.Voidcraft.Critical.RollLabel');
        expect(criticalRollLabelKey(true)).toBe('WH40K.Voidcraft.Critical.CrippledRollLabel');
    });
});

describe('ship-crippled — the condition the voidcraft sheet shows', () => {
    it('shows an RT ship at 0 Hull as Crippled, and destroyed only after a destroying Critical Hit', () => {
        expect(shipConditionView({ ...rt(10), statuses: [] })).toEqual({ crippled: false, destroyed: false });
        expect(shipConditionView({ ...rt(0), statuses: [] })).toEqual({ crippled: true, destroyed: false });
        expect(shipConditionView({ ...rt(0), statuses: [{ destroysShip: true }] })).toEqual({ crippled: true, destroyed: true });
    });

    it('shows nothing on another line’s sheet, whatever its Hull', () => {
        expect(shipConditionView({ ...dh2(0), statuses: [] })).toEqual({ crippled: false, destroyed: false });
    });
});
