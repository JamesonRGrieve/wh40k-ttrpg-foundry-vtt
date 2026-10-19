import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installApplicationV2Stub } from '../testing/app-v2-stub.ts';

/**
 * A won Damage Opponent (#665) deals the controller's unarmed hit through the
 * normal damage path: the same `Hit.createHit` an attack uses and the same damage
 * card. These tests pin what the grapple adds: which weapon is the unarmed strike,
 * where the hit lands per line, and the Fatigue and effect it stamps on the hit.
 * The whole path on a real actor (the hit rolled, the card posted, the wounds and
 * Fatigue applied) is the Tier B grapple spec.
 */

// The damage path's import chain builds dialog classes on `foundry.applications.api` at load.
installApplicationV2Stub();
const mod = await import('./grapple-damage.ts');
const { Hit } = await import('./damage-data.ts');

const strike = { type: 'weapon', name: 'Unarmed', system: { unarmed: true } };
const knife = { type: 'weapon', name: 'Knife', system: { unarmed: false } };

describe('findUnarmedStrike', () => {
    it('picks the weapon the content declares unarmed', () => {
        expect(mod.findUnarmedStrike([knife, strike])).toBe(strike);
        expect(mod.findUnarmedStrike([knife, { type: 'gear', name: 'Rope', system: { unarmed: true } }])).toBeNull();
    });
});

describe('grappleDamageLocation', () => {
    it('lands on the location the line prints, else where the test roll puts it', () => {
        expect(mod.grappleDamageLocation({ location: 'body', fatigue: 1 }, 1)).toBe('body');
        // 01 reverses to 10: the Head (01-10).
        expect(mod.grappleDamageLocation({ location: null, fatigue: 1 }, 1)).toBe('head');
        // 52 reverses to 25: the Left Arm (21-30).
        expect(mod.grappleDamageLocation({ location: null, fatigue: 1 }, 52)).toBe('leftArm');
    });
});

describe('stampGrappleHit', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('names the opponent, adds the line’s Fatigue with Damage Opponent as its source, and states where the hit landed', () => {
        const hit = new Hit();
        hit.totalFatigue = 0;
        mod.stampGrappleHit(hit, { location: 'body', fatigue: 1 }, 'Cultist');
        expect(hit).toMatchObject({
            targetName: 'Cultist',
            totalFatigue: 1,
            fatigueSource: 'WH40K.Grapple.DamageOpponent',
            effects: [{ name: 'WH40K.Grapple.DamageOpponent', effect: 'WH40K.Grapple.Damage.EffectBody' }],
        });
    });

    it('adds to Fatigue the hit already deals', () => {
        const hit = new Hit();
        hit.totalFatigue = 1;
        mod.stampGrappleHit(hit, { location: 'body', fatigue: 1 }, 'Cultist');
        expect(hit.totalFatigue).toBe(2);
    });

    it('DH1, naming no location, says the test roll placed it', () => {
        const hit = new Hit();
        mod.stampGrappleHit(hit, { location: null, fatigue: 1 }, 'Cultist');
        expect(hit.effects.at(0)?.effect).toBe('WH40K.Grapple.Damage.EffectRolledLocation');
    });
});
