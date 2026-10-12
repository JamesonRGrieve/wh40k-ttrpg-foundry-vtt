import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    awardConferralRenown,
    type ConferralActor,
    type ConferralItem,
    conferralRefusal,
    conferralRenown,
    readDwRenown,
    readSpecialAbility,
    refuseBelowRenownRank,
} from './dw-distinction-actions.ts';

/**
 * Behavior coverage for Deathwatch special-ability conferral (#171): the
 * Renown-rank gate the actor sheet applies before a dropped Distinction / Mark /
 * Advanced Special Ability is created, and the Renown reward it pays after.
 * Only Deathwatch actors carry Renown; every other line is a no-op.
 */

function actor(gameSystem: string, renown: number | undefined): ConferralActor {
    return { name: 'Brother Varro', system: renown === undefined ? { gameSystem } : { gameSystem, renown } };
}

function ability(system: object, type = 'specialAbility'): ConferralItem {
    return { type, name: 'Command and Control', system };
}

const FAMED_ADVANCED = ability({ category: 'advanced', renownRequired: 'famed', renownReward: 0, cost: 0 });
const REWARDED_DISTINCTION = ability({ category: 'distinction', renownRequired: null, renownReward: 5, cost: 1100 });

describe('readSpecialAbility', () => {
    it('reads the Distinction fields and the Mark grant off a special-ability item', () => {
        const view = readSpecialAbility(
            ability({
                category: 'mark',
                renownRequired: 'respected',
                renownReward: 2,
                cost: 500,
                grant: { trait: 'Compendium.x.y.Item.z', activeEffect: '' },
                modifiers: { characteristics: { perception: 10, junk: 'x' } },
            }),
        );
        expect(view).toEqual({
            category: 'mark',
            renownRequired: 'respected',
            renownReward: 2,
            cost: 500,
            markGrant: { grant: { trait: 'Compendium.x.y.Item.z', activeEffect: '' }, modifiers: { characteristics: { perception: 10 } } },
        });
    });

    it('defaults missing fields so a legacy speciality ability still reads', () => {
        expect(readSpecialAbility(ability({ category: 'speciality' }))).toEqual({
            category: 'speciality',
            renownRequired: null,
            renownReward: 0,
            cost: 0,
            markGrant: { grant: { trait: '', activeEffect: '' }, modifiers: { characteristics: {} } },
        });
    });

    it('drops an unknown Renown rank rather than gating on it', () => {
        expect(readSpecialAbility(ability({ category: 'advanced', renownRequired: 'legend' }))?.renownRequired).toBeNull();
    });

    it('ignores items that are not special abilities or have no readable category', () => {
        expect(readSpecialAbility(ability({ category: 'mark' }, 'talent'))).toBeNull();
        expect(readSpecialAbility(ability({ category: 'honour' }))).toBeNull();
        expect(readSpecialAbility(ability({}))).toBeNull();
    });
});

describe('readDwRenown', () => {
    it('reads Renown from a Deathwatch actor', () => {
        expect(readDwRenown(actor('dw', 42))).toBe(42);
    });

    it('is null for any other line, even one whose schema carries a renown field', () => {
        expect(readDwRenown(actor('dh2', 42))).toBeNull();
        expect(readDwRenown(actor('rt', 42))).toBeNull();
    });

    it('is null for a Deathwatch actor without a Renown score', () => {
        expect(readDwRenown(actor('dw', undefined))).toBeNull();
    });
});

describe('conferralRefusal', () => {
    it('refuses a Famed ability for a Distinguished (Renown 59) Battle-Brother', () => {
        expect(conferralRefusal(actor('dw', 59), FAMED_ADVANCED)).toEqual({ requiredRank: 'famed', currentRank: 'distinguished' });
    });

    it('allows it at exactly Famed (Renown 60)', () => {
        expect(conferralRefusal(actor('dw', 60), FAMED_ADVANCED)).toBeNull();
    });

    it('never gates outside Deathwatch', () => {
        expect(conferralRefusal(actor('dh2', 0), FAMED_ADVANCED)).toBeNull();
    });
});

describe('conferralRenown', () => {
    it('returns the Renown after paying the reward', () => {
        expect(conferralRenown(actor('dw', 30), REWARDED_DISTINCTION)).toBe(35);
    });

    it('is null when there is no reward to pay', () => {
        expect(conferralRenown(actor('dw', 30), FAMED_ADVANCED)).toBeNull();
    });

    it('is null outside Deathwatch', () => {
        expect(conferralRenown(actor('ow', 30), REWARDED_DISTINCTION)).toBeNull();
    });
});

describe('notifying wrappers', () => {
    const warn = vi.fn();
    const info = vi.fn();
    const format = vi.fn((key: string) => key);

    beforeEach(() => {
        vi.stubGlobal('ui', { notifications: { warn, info } });
        vi.stubGlobal('game', { i18n: { localize: (key: string): string => key, format } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('refuseBelowRenownRank warns with the required and current rank and reports the refusal', () => {
        expect(refuseBelowRenownRank(actor('dw', 10), FAMED_ADVANCED)).toBe(true);
        expect(format).toHaveBeenCalledWith('WH40K.DW.Distinction.Gate.RankTooLow', {
            name: 'Command and Control',
            actor: 'Brother Varro',
            rank: 'WH40K.DW.Renown.Rank.Famed',
            current: 'WH40K.DW.Renown.Rank.Initiated',
        });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('refuseBelowRenownRank lets an allowed conferral through silently', () => {
        expect(refuseBelowRenownRank(actor('dw', 80), FAMED_ADVANCED)).toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });

    it('awardConferralRenown writes the new Renown and announces the amount', async () => {
        const update = vi.fn().mockResolvedValue(undefined);
        await awardConferralRenown({ ...actor('dw', 30), update }, REWARDED_DISTINCTION);
        expect(update).toHaveBeenCalledWith({ 'system.renown': 35 });
        expect(format).toHaveBeenCalledWith('WH40K.DW.Distinction.Award.Renown', { name: 'Command and Control', actor: 'Brother Varro', amount: '5' });
        expect(info).toHaveBeenCalledTimes(1);
    });

    it('awardConferralRenown writes nothing when no reward applies', async () => {
        const update = vi.fn().mockResolvedValue(undefined);
        await awardConferralRenown({ ...actor('dh2', 30), update }, REWARDED_DISTINCTION);
        await awardConferralRenown({ ...actor('dw', 30), update }, FAMED_ADVANCED);
        expect(update).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });
});
