import { describe, expect, it } from 'vitest';

import { canSwearOath, isOathActive, releaseOath, swearOath, type OathBuff, type OathDef } from './dw-oath';

const buff: OathBuff = {
    id: 'Compendium.wh40k-rpg.dw-oath-buffs.Item.knowledge-buff',
    characteristic: 'intelligence',
    modifier: 10,
    description: 'Oath of Knowledge — +10 Intelligence for the mission.',
};

const oathKnowledge: OathDef = {
    id: 'Compendium.wh40k-rpg.dw-oaths.Item.knowledge',
    leaderPrereq: true,
    buff,
    grantedSquadAbilities: ['Compendium.wh40k-rpg.dw-squad-abilities.Item.tactical-insight', 'Compendium.wh40k-rpg.dw-squad-abilities.Item.target-priority'],
};

describe('dw-oath — canSwearOath', () => {
    it('blocks a non-leader from swearing', () => {
        const result = canSwearOath({
            isLeader: false,
            currentOathId: null,
            oath: oathKnowledge,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('not-leader');
    });

    it('allows a leader to swear when no current Oath is sworn', () => {
        const result = canSwearOath({
            isLeader: true,
            currentOathId: null,
            oath: oathKnowledge,
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('blocks a leader from swearing a second Oath while one is already sworn', () => {
        const result = canSwearOath({
            isLeader: true,
            currentOathId: 'Compendium.wh40k-rpg.dw-oaths.Item.glory',
            oath: oathKnowledge,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('already-sworn');
    });

    it('prefers the not-leader reason over already-sworn when both apply', () => {
        const result = canSwearOath({
            isLeader: false,
            currentOathId: 'Compendium.wh40k-rpg.dw-oaths.Item.glory',
            oath: oathKnowledge,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('not-leader');
    });
});

describe('dw-oath — swearOath', () => {
    it('returns the active id, mission buff, and granted Squad-Mode abilities', () => {
        const result = swearOath({ oath: oathKnowledge });
        expect(result.activeOathId).toBe(oathKnowledge.id);
        expect(result.missionBuff).toEqual(buff);
        expect(result.grantedSquadAbilities).toEqual([
            'Compendium.wh40k-rpg.dw-squad-abilities.Item.tactical-insight',
            'Compendium.wh40k-rpg.dw-squad-abilities.Item.target-priority',
        ]);
    });

    it('returns a defensive copy of the granted ability list', () => {
        const result = swearOath({ oath: oathKnowledge });
        result.grantedSquadAbilities.push('mutated');
        expect(oathKnowledge.grantedSquadAbilities).toHaveLength(2);
    });

    it('preserves an Oath whose ability list is empty', () => {
        const empty: OathDef = {
            id: 'Compendium.wh40k-rpg.dw-oaths.Item.silence',
            leaderPrereq: true,
            buff: { id: 'Compendium.wh40k-rpg.dw-oath-buffs.Item.silence-buff' },
            grantedSquadAbilities: [],
        };
        const result = swearOath({ oath: empty });
        expect(result.activeOathId).toBe(empty.id);
        expect(result.grantedSquadAbilities).toEqual([]);
    });
});

describe('dw-oath — releaseOath', () => {
    it('clears the active Oath id', () => {
        const result = releaseOath();
        expect(result.activeOathId).toBeNull();
    });
});

describe('dw-oath — isOathActive', () => {
    it('returns true when the active id is a non-null string', () => {
        expect(isOathActive('Compendium.wh40k-rpg.dw-oaths.Item.knowledge')).toBe(true);
    });

    it('returns false when the active id is null', () => {
        expect(isOathActive(null)).toBe(false);
    });

    it('returns true even for an empty string id (any non-null is active per the contract)', () => {
        expect(isOathActive('')).toBe(true);
    });
});
