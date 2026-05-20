import { describe, expect, it } from 'vitest';

import type { RenownRank } from './dw-renown';
import {
    activateSquadAbility,
    canEnterSquadMode,
    DEFAULT_DW_MODE,
    enterSquadMode,
    getSupportRange,
    leaveSquadMode,
    SUPPORT_RANGE_BY_RANK,
    withinSupportRange,
    type SquadAbilityActivation,
} from './dw-squad-mode';

describe('dw-squad-mode — defaults', () => {
    it('starts every Battle-Brother in Solo Mode', () => {
        expect(DEFAULT_DW_MODE).toBe('solo');
    });
});

describe('dw-squad-mode — getSupportRange (Table 7-9)', () => {
    it('returns 30m for Initiated (visual + vocal)', () => {
        expect(getSupportRange('initiated')).toEqual({ visual: 30, vocal: 30 });
    });

    it('returns 60m for Respected and Distinguished', () => {
        expect(getSupportRange('respected')).toEqual({ visual: 60, vocal: 60 });
        expect(getSupportRange('distinguished')).toEqual({ visual: 60, vocal: 60 });
    });

    it('returns 120m for Famed and Hero', () => {
        expect(getSupportRange('famed')).toEqual({ visual: 120, vocal: 120 });
        expect(getSupportRange('hero')).toEqual({ visual: 120, vocal: 120 });
    });

    it('returns a defensive copy — mutating the result does not poison the table', () => {
        const tier = getSupportRange('initiated');
        tier.visual = 9999;
        expect(SUPPORT_RANGE_BY_RANK.initiated.visual).toBe(30);
    });

    it('covers every Renown rank', () => {
        const ranks: readonly RenownRank[] = ['initiated', 'respected', 'distinguished', 'famed', 'hero'];
        for (const rank of ranks) {
            const tier = getSupportRange(rank);
            expect(tier.visual).toBeGreaterThan(0);
            expect(tier.vocal).toBeGreaterThan(0);
        }
    });
});

describe('dw-squad-mode — canEnterSquadMode', () => {
    it('allows entry via Full Action from Solo Mode', () => {
        expect(canEnterSquadMode({ currentMode: 'solo', hasFullAction: true, passedCohesionChallenge: false })).toEqual({
            allowed: true,
            via: 'full-action',
        });
    });

    it('allows entry via Cohesion Challenge from Solo Mode', () => {
        expect(canEnterSquadMode({ currentMode: 'solo', hasFullAction: false, passedCohesionChallenge: true })).toEqual({
            allowed: true,
            via: 'cohesion-challenge',
        });
    });

    it('prefers Full Action when both paths are available', () => {
        const result = canEnterSquadMode({ currentMode: 'solo', hasFullAction: true, passedCohesionChallenge: true });
        expect(result).toEqual({ allowed: true, via: 'full-action' });
    });

    it('rejects entry when already in Squad Mode', () => {
        expect(canEnterSquadMode({ currentMode: 'squad', hasFullAction: true, passedCohesionChallenge: true })).toEqual({
            allowed: false,
            via: null,
        });
    });

    it('rejects entry when neither path is available', () => {
        expect(canEnterSquadMode({ currentMode: 'solo', hasFullAction: false, passedCohesionChallenge: false })).toEqual({
            allowed: false,
            via: null,
        });
    });
});

describe('dw-squad-mode — enterSquadMode / leaveSquadMode', () => {
    it('transitions Solo → Squad', () => {
        expect(enterSquadMode('solo')).toEqual({ newMode: 'squad', transitioned: true });
    });

    it('is a no-op when already in Squad Mode', () => {
        expect(enterSquadMode('squad')).toEqual({ newMode: 'squad', transitioned: false });
    });

    it('transitions Squad → Solo', () => {
        expect(leaveSquadMode('squad')).toEqual({ newMode: 'solo', transitioned: true });
    });

    it('is a no-op when already in Solo Mode', () => {
        expect(leaveSquadMode('solo')).toEqual({ newMode: 'solo', transitioned: false });
    });
});

describe('dw-squad-mode — activateSquadAbility', () => {
    const ability: SquadAbilityActivation = { cohesionCost: 2, sustained: false, abilityId: 'pattern.bolter-assault' };

    it('activates when in Squad Mode with sufficient Cohesion', () => {
        const result = activateSquadAbility({ currentMode: 'squad', currentCohesion: 5, ability });
        expect(result).toEqual({ allowed: true, cohesionAfter: 3 });
    });

    it('rejects activation while in Solo Mode', () => {
        const result = activateSquadAbility({ currentMode: 'solo', currentCohesion: 5, ability });
        expect(result).toEqual({ allowed: false, cohesionAfter: 5, reason: 'not-in-squad-mode' });
    });

    it('rejects activation when Cohesion is insufficient', () => {
        const result = activateSquadAbility({ currentMode: 'squad', currentCohesion: 1, ability });
        expect(result).toEqual({ allowed: false, cohesionAfter: 1, reason: 'insufficient-cohesion' });
    });

    it('allows activation at exactly the cost boundary', () => {
        const result = activateSquadAbility({ currentMode: 'squad', currentCohesion: 2, ability });
        expect(result).toEqual({ allowed: true, cohesionAfter: 0 });
    });

    it('allows free (cost 0) sustained activations in Squad Mode', () => {
        const free: SquadAbilityActivation = { cohesionCost: 0, sustained: true, abilityId: 'stance.fortis' };
        const result = activateSquadAbility({ currentMode: 'squad', currentCohesion: 0, ability: free });
        expect(result).toEqual({ allowed: true, cohesionAfter: 0 });
    });

    it('sanitises negative current Cohesion to 0 before gating', () => {
        const result = activateSquadAbility({ currentMode: 'squad', currentCohesion: -3, ability });
        expect(result).toEqual({ allowed: false, cohesionAfter: 0, reason: 'insufficient-cohesion' });
    });
});

describe('dw-squad-mode — withinSupportRange', () => {
    it('returns true at the threshold distance with visual support', () => {
        expect(withinSupportRange({ actorRank: 'initiated', distance: 30, hasVisual: true, hasVocal: false })).toBe(true);
    });

    it('returns false just past the threshold', () => {
        expect(withinSupportRange({ actorRank: 'initiated', distance: 30.01, hasVisual: true, hasVocal: true })).toBe(false);
    });

    it('returns true at the higher Famed/Hero radius', () => {
        expect(withinSupportRange({ actorRank: 'famed', distance: 120, hasVisual: false, hasVocal: true })).toBe(true);
        expect(withinSupportRange({ actorRank: 'hero', distance: 120, hasVisual: true, hasVocal: false })).toBe(true);
    });

    it('returns false past the Famed/Hero radius', () => {
        expect(withinSupportRange({ actorRank: 'famed', distance: 121, hasVisual: true, hasVocal: true })).toBe(false);
    });

    it('returns false when both channels are blocked, even at zero distance', () => {
        expect(withinSupportRange({ actorRank: 'hero', distance: 0, hasVisual: false, hasVocal: false })).toBe(false);
    });

    it('returns true when either channel alone reaches', () => {
        expect(withinSupportRange({ actorRank: 'respected', distance: 60, hasVisual: true, hasVocal: false })).toBe(true);
        expect(withinSupportRange({ actorRank: 'respected', distance: 60, hasVisual: false, hasVocal: true })).toBe(true);
    });

    it('treats negative distance as zero (always in range when a channel is open)', () => {
        expect(withinSupportRange({ actorRank: 'initiated', distance: -5, hasVisual: true, hasVocal: false })).toBe(true);
    });

    it('treats non-finite distance as zero', () => {
        expect(withinSupportRange({ actorRank: 'initiated', distance: Number.NaN, hasVisual: true, hasVocal: false })).toBe(true);
    });

    it('rejects beyond-range distance even with both channels open', () => {
        expect(withinSupportRange({ actorRank: 'distinguished', distance: 200, hasVisual: true, hasVocal: true })).toBe(false);
    });
});
