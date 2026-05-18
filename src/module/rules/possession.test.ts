import { describe, expect, it } from 'vitest';
import {
    applyMismanifest,
    beginPossessionContest,
    canUnleashDaemon,
    endPossessionContest,
    getResistDaemonTarget,
    isFrenzyTestActive,
    resetSessionUnleash,
    resolveFrenzyTest,
    resolveMismanifestPossession,
    spendUnleashDaemon,
    type PossessionSlot,
} from './possession';

describe('canUnleashDaemon (#82)', () => {
    it('returns false in the none state regardless of charges', () => {
        expect(canUnleashDaemon({ state: 'none', unleashUsed: 0, unleashMax: 3 })).toBe(false);
    });
    it('returns true when latent + charges remain', () => {
        expect(canUnleashDaemon({ state: 'latent', unleashUsed: 0, unleashMax: 2 })).toBe(true);
        expect(canUnleashDaemon({ state: 'latent', unleashUsed: 1, unleashMax: 2 })).toBe(true);
    });
    it('returns false when used == max', () => {
        expect(canUnleashDaemon({ state: 'latent', unleashUsed: 2, unleashMax: 2 })).toBe(false);
    });
    it('returns true when possessed + charges remain', () => {
        expect(canUnleashDaemon({ state: 'possessed', unleashUsed: 0, unleashMax: 3 })).toBe(true);
    });
});

describe('spendUnleashDaemon (#82)', () => {
    it('increments unleashUsed when a charge is available', () => {
        const next = spendUnleashDaemon({ state: 'latent', unleashUsed: 0, unleashMax: 2 });
        expect(next.unleashUsed).toBe(1);
    });
    it('is a no-op when no charge is available', () => {
        const slot = { state: 'latent' as const, unleashUsed: 2, unleashMax: 2 };
        expect(spendUnleashDaemon(slot)).toEqual(slot);
    });
    it('is a no-op in the none state', () => {
        const slot = { state: 'none' as const, unleashUsed: 0, unleashMax: 3 };
        expect(spendUnleashDaemon(slot)).toEqual(slot);
    });
});

describe('resetSessionUnleash (#82)', () => {
    it('resets unleashUsed to 0 and preserves state / max', () => {
        const slot = { state: 'possessed' as const, unleashUsed: 3, unleashMax: 4 };
        const next = resetSessionUnleash(slot);
        expect(next.unleashUsed).toBe(0);
        expect(next.state).toBe('possessed');
        expect(next.unleashMax).toBe(4);
    });
});

describe('getResistDaemonTarget (#82)', () => {
    it('returns full WP at tier 0 (CP 0..30)', () => {
        expect(getResistDaemonTarget(50, 0)).toBe(50);
        expect(getResistDaemonTarget(50, 30)).toBe(50);
    });
    it('subtracts 10 at tier 1 (CP 31..60)', () => {
        expect(getResistDaemonTarget(50, 31)).toBe(40);
        expect(getResistDaemonTarget(50, 60)).toBe(40);
    });
    it('subtracts 20 at tier 2 (CP 61..90)', () => {
        expect(getResistDaemonTarget(50, 61)).toBe(30);
        expect(getResistDaemonTarget(50, 90)).toBe(30);
    });
    it('subtracts 30 at tier 3 (CP 91+)', () => {
        expect(getResistDaemonTarget(50, 91)).toBe(20);
        expect(getResistDaemonTarget(50, 200)).toBe(20);
    });
    it('floors at 0 (never negative)', () => {
        expect(getResistDaemonTarget(10, 91)).toBe(0);
        expect(getResistDaemonTarget(0, 0)).toBe(0);
    });
});

/* ----------------------------------------------------------------- */
/*  Frenzy-test loop (#132)                                           */
/* ----------------------------------------------------------------- */

const NONE: PossessionSlot = { state: 'none', unleashUsed: 0, unleashMax: 1 };
const LATENT: PossessionSlot = { state: 'latent', unleashUsed: 1, unleashMax: 2 };
const POSSESSED: PossessionSlot = { state: 'possessed', unleashUsed: 0, unleashMax: 3 };

describe('isFrenzyTestActive (#132)', () => {
    it('is active only while contested (latent)', () => {
        expect(isFrenzyTestActive(LATENT)).toBe(true);
    });
    it('is inactive in none (no power sustained)', () => {
        expect(isFrenzyTestActive(NONE)).toBe(false);
    });
    it('is inactive in possessed (daemon already in control)', () => {
        expect(isFrenzyTestActive(POSSESSED)).toBe(false);
    });
});

describe('beginPossessionContest (#132)', () => {
    it('moves a none actor into the latent (contested) state', () => {
        expect(beginPossessionContest(NONE).state).toBe('latent');
    });
    it('is idempotent for an already-contested actor', () => {
        expect(beginPossessionContest(LATENT)).toEqual(LATENT);
    });
    it('does not regress a possessed actor', () => {
        expect(beginPossessionContest(POSSESSED)).toEqual(POSSESSED);
    });
});

describe('endPossessionContest (#132)', () => {
    it('returns a contested actor to none when the power is released', () => {
        expect(endPossessionContest(LATENT).state).toBe('none');
    });
    it('cannot release a fully possessed actor (daemon decides)', () => {
        expect(endPossessionContest(POSSESSED)).toEqual(POSSESSED);
    });
    it('is a no-op for a none actor', () => {
        expect(endPossessionContest(NONE)).toEqual(NONE);
    });
});

describe('resolveFrenzyTest (#132)', () => {
    it('passes (no Frenzy) when the roll is under the Willpower target', () => {
        const r = resolveFrenzyTest(15, 45);
        expect(r.passed).toBe(true);
        expect(r.isFrenzied).toBe(false);
        expect(r.degreesOfSuccess).toBe(4); // floor((45-15)/10)+1
        expect(r.degreesOfFailure).toBe(0);
        expect(r.target).toBe(45);
    });
    it('passes on an exact-target roll (roll <= target)', () => {
        const r = resolveFrenzyTest(45, 45);
        expect(r.passed).toBe(true);
        expect(r.degreesOfSuccess).toBe(1);
    });
    it('fails (Frenzied) when the roll exceeds the Willpower target', () => {
        const r = resolveFrenzyTest(66, 45);
        expect(r.passed).toBe(false);
        expect(r.isFrenzied).toBe(true);
        expect(r.degreesOfSuccess).toBe(0);
        expect(r.degreesOfFailure).toBe(3); // floor((66-45)/10)+1
    });
    it('clamps rolls into the legal 1..100 d100 range', () => {
        expect(resolveFrenzyTest(0, 45).passed).toBe(true);
        expect(resolveFrenzyTest(120, 45).passed).toBe(false);
    });
    it('treats a 0 Willpower target as an automatic Frenzy', () => {
        const r = resolveFrenzyTest(1, 0);
        expect(r.passed).toBe(false);
        expect(r.isFrenzied).toBe(true);
    });
});

describe('resolveMismanifestPossession (#132)', () => {
    it('psyker keeps control (stays latent) when they pass and the daemon fails', () => {
        const r = resolveMismanifestPossession(20, 45, 90, 40, 'latent');
        expect(r.psykerWon).toBe(true);
        expect(r.escalatedToPossessed).toBe(false);
        expect(r.nextState).toBe('latent');
    });
    it('escalates to possessed when the daemon out-scores the psyker', () => {
        const r = resolveMismanifestPossession(80, 45, 10, 60, 'latent');
        expect(r.psykerWon).toBe(false);
        expect(r.escalatedToPossessed).toBe(true);
        expect(r.nextState).toBe('possessed');
    });
    it('escalates when the psyker fails and the daemon passes', () => {
        const r = resolveMismanifestPossession(95, 45, 30, 40, 'latent');
        expect(r.psykerWon).toBe(false);
        expect(r.nextState).toBe('possessed');
    });
    it('psyker wins ties (daemon must strictly out-score to seize control)', () => {
        // both pass with equal DoS → psyker holds.
        const r = resolveMismanifestPossession(35, 45, 30, 40, 'latent');
        expect(r.psykerDoS).toBe(r.daemonDoS);
        expect(r.psykerWon).toBe(true);
        expect(r.nextState).toBe('latent');
    });
    it('psyker holds when both fail (no daemon pass)', () => {
        const r = resolveMismanifestPossession(99, 45, 99, 40, 'latent');
        expect(r.psykerWon).toBe(true);
        expect(r.escalatedToPossessed).toBe(false);
    });
    it('a none actor cannot be mismanifested', () => {
        const r = resolveMismanifestPossession(80, 45, 10, 60, 'none');
        expect(r.nextState).toBe('none');
        expect(r.escalatedToPossessed).toBe(false);
    });
    it('an already-possessed actor stays possessed', () => {
        const r = resolveMismanifestPossession(20, 45, 90, 40, 'possessed');
        expect(r.psykerWon).toBe(false);
        expect(r.nextState).toBe('possessed');
    });
});

describe('applyMismanifest (#132)', () => {
    it('escalates the slot to possessed on a psyker loss', () => {
        const resolution = resolveMismanifestPossession(80, 45, 10, 60, 'latent');
        const next = applyMismanifest(LATENT, resolution);
        expect(next.state).toBe('possessed');
        expect(next.unleashUsed).toBe(LATENT.unleashUsed);
        expect(next.unleashMax).toBe(LATENT.unleashMax);
    });
    it('preserves the slot when the psyker holds control', () => {
        const resolution = resolveMismanifestPossession(20, 45, 90, 40, 'latent');
        const next = applyMismanifest(LATENT, resolution);
        expect(next.state).toBe('latent');
    });
});

describe('Possession Frenzy-test loop integration (#132)', () => {
    it('drives the full none → contested → mismanifest → possessed cascade', () => {
        // 1. Engage the power.
        let slot = beginPossessionContest(NONE);
        expect(slot.state).toBe('latent');
        expect(isFrenzyTestActive(slot)).toBe(true);

        // 2. Round 1: pass the Frenzy test → no Frenzy, still contested.
        const round1 = resolveFrenzyTest(20, 45);
        expect(round1.isFrenzied).toBe(false);
        expect(slot.state).toBe('latent');

        // 3. Round 2: fail the Frenzy test → Frenzied but power still sustained.
        const round2 = resolveFrenzyTest(80, 45);
        expect(round2.isFrenzied).toBe(true);
        expect(isFrenzyTestActive(slot)).toBe(true); // loop continues

        // 4. Mismanifest: lose the opposed-WP contest → full possession.
        const mis = resolveMismanifestPossession(85, 45, 15, 55, slot.state);
        slot = applyMismanifest(slot, mis);
        expect(slot.state).toBe('possessed');

        // 5. Loop now disengaged; the power can no longer be released at will.
        expect(isFrenzyTestActive(slot)).toBe(false);
        expect(endPossessionContest(slot).state).toBe('possessed');
    });
});
