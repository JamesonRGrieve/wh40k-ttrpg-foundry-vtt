import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyCriticalEffect, clampCriticalSeverity, getCriticalDamageRecord, invalidateCriticalDamageCache } from './critical-damage';
import { normalizeBodyPart, normalizeDamageType } from './damage-type';

/**
 * Tests for the DH2 Critical Damage table lookup (#108 — core.md
 * §"Critical Damage", Tables 7–7 … 7–22).
 *
 * The GW-copyrighted effect prose lives in a compendium pack, so the
 * structured-record path is exercised against a small fixture built
 * from RAW rows (one per damage type × representative location ×
 * low/mid/high severity). The pure helpers (classifier, clamp,
 * normalisers) are exercised directly.
 */

/**
 * Minimal fixture mirroring the consolidated-critical-injury pack
 * shape (`system.damageType` / `system.bodyPart` / `system.effects`
 * keyed by severity → `{ text }`). Text is paraphrased RAW so the
 * rider classifier has realistic vocabulary to scan.
 */
interface FixtureItem {
    system: {
        damageType: string;
        bodyPart: string;
        effects: Record<string, { text: string }>;
    };
}

const FIXTURE: FixtureItem[] = [
    {
        system: {
            damageType: 'Energy',
            bodyPart: 'Arm',
            effects: {
                1: { text: '<p>The attack grazes the arm; all tests involving that arm suffer a -30 penalty for 1d5 rounds.</p>' },
                5: { text: '<p>Energy courses through the arm. He is Stunned for 1 round, and the arm is Useless until treated.</p>' },
                10: { text: '<p>The attack reduces the arm to crimson ash. He immediately dies from shock, clutching his smoking stump.</p>' },
            },
        },
    },
    {
        system: {
            damageType: 'Energy',
            bodyPart: 'Body',
            effects: {
                5: {
                    text: '<p>The target is knocked Prone and must make a test or catch fire. He must also test or be Stunned for 1 round.</p>',
                },
            },
        },
    },
    {
        system: {
            damageType: 'Explosive',
            bodyPart: 'Leg',
            effects: {
                1: { text: '<p>A glancing blast sends the character backwards one metre. The target must test or be knocked Prone.</p>' },
                6: {
                    text: '<p>The blast shatters the leg bones. The target suffers 1d10 levels of Fatigue. The leg is Useless until treated. He must test or suffer the Lost Foot condition.</p>',
                },
                10: {
                    text: '<p>The leg explodes in an eruption of blood, killing the target immediately and sending fragments hurtling off.</p>',
                },
            },
        },
    },
    {
        system: {
            damageType: 'Impact',
            bodyPart: 'Head',
            effects: {
                1: { text: '<p>The impact fills the head with a ringing noise. The target must test or suffer 1 level of Fatigue.</p>' },
                4: { text: '<p>The concussive strike staggers the target. He must test or be Stunned for 1 round and knocked Prone.</p>' },
                8: {
                    text: "<p>The target's head snaps around to face the opposite direction. His death is instantaneous.</p>",
                },
            },
        },
    },
    {
        system: {
            damageType: 'Rending',
            bodyPart: 'Body',
            effects: {
                3: { text: '<p>The attack rips a large patch of skin away. The target is Stunned for 1 round and must test or suffer Blood Loss.</p>' },
                7: {
                    text: "<p>The attack cuts open the target's abdomen. The target suffers Blood Loss. Permanently reduce his Toughness by 1d5.</p>",
                },
                9: {
                    text: '<p>The powerful blow cleaves the target from gullet to groin. The target is now quite dead.</p>',
                },
            },
        },
    },
];

function stubGameWithFixture(docs: FixtureItem[]): void {
    vi.stubGlobal('game', {
        packs: {
            get: (id: string) => (id === 'wh40k-rpg.dh2-core-stats-critical-injuries' ? { getDocuments: async () => Promise.resolve(docs) } : undefined),
        },
    });
}

describe('clampCriticalSeverity (#108)', () => {
    it('passes 1–10 through unchanged', () => {
        for (let i = 1; i <= 10; i++) expect(clampCriticalSeverity(i)).toBe(i);
    });

    it('clamps values above 10 to 10 (the 10+ row)', () => {
        expect(clampCriticalSeverity(11)).toBe(10);
        expect(clampCriticalSeverity(99)).toBe(10);
    });

    it('clamps values below 1 up to 1', () => {
        expect(clampCriticalSeverity(0)).toBe(1);
        expect(clampCriticalSeverity(-4)).toBe(1);
    });

    it('truncates fractional input and treats non-finite as 1', () => {
        expect(clampCriticalSeverity(3.9)).toBe(3);
        expect(clampCriticalSeverity(Number.NaN)).toBe(1);
        expect(clampCriticalSeverity(Number.POSITIVE_INFINITY)).toBe(1);
    });
});

describe('normalizeDamageType (#108)', () => {
    it('canonicalises every casing of the four types', () => {
        expect(normalizeDamageType('energy')).toBe('Energy');
        expect(normalizeDamageType('EXPLOSIVE')).toBe('Explosive');
        expect(normalizeDamageType(' Impact ')).toBe('Impact');
        expect(normalizeDamageType('Rending')).toBe('Rending');
    });

    it('returns null for unknown / empty input', () => {
        expect(normalizeDamageType('plasma')).toBeNull();
        expect(normalizeDamageType('')).toBeNull();
        expect(normalizeDamageType(null)).toBeNull();
        expect(normalizeDamageType(undefined)).toBeNull();
    });
});

describe('normalizeBodyPart (#108)', () => {
    it('collapses the six hit locations onto four body-parts', () => {
        expect(normalizeBodyPart('Head')).toBe('Head');
        expect(normalizeBodyPart('Right Arm')).toBe('Arm');
        expect(normalizeBodyPart('Left Arm')).toBe('Arm');
        expect(normalizeBodyPart('Body')).toBe('Body');
        expect(normalizeBodyPart('Right Leg')).toBe('Leg');
        expect(normalizeBodyPart('Left Leg')).toBe('Leg');
    });

    it('resolves hand/foot/torso/chest synonyms', () => {
        expect(normalizeBodyPart('hand')).toBe('Arm');
        expect(normalizeBodyPart('foot')).toBe('Leg');
        expect(normalizeBodyPart('torso')).toBe('Body');
        expect(normalizeBodyPart('chest')).toBe('Body');
    });

    it('returns null for unresolvable input', () => {
        expect(normalizeBodyPart('wing')).toBeNull();
        expect(normalizeBodyPart('')).toBeNull();
        expect(normalizeBodyPart(null)).toBeNull();
    });
});

describe('classifyCriticalEffect (#108)', () => {
    it('returns an all-false rider set for empty / blank text', () => {
        const r = classifyCriticalEffect('');
        expect(r.stunned).toBe(false);
        expect(r.fatal).toBe(false);
        expect(classifyCriticalEffect(null).bloodLoss).toBe(false);
        expect(classifyCriticalEffect(undefined).lostLimb).toBe(false);
    });

    it('detects Stunned + Useless (lost-limb) + Fatigue', () => {
        const r = classifyCriticalEffect('He is Stunned for 1 round. The arm is Useless. He suffers 1d5 levels of Fatigue.');
        expect(r.stunned).toBe(true);
        expect(r.lostLimb).toBe(true);
        expect(r.fatigue).toBe(true);
        expect(r.fatal).toBe(false);
    });

    it('detects Blood Loss and Prone', () => {
        const r = classifyCriticalEffect('The target is knocked Prone and suffers Blood Loss.');
        expect(r.bloodLoss).toBe(true);
        expect(r.prone).toBe(true);
    });

    it('detects Burning from "catch fire" / "on fire" / "immolate"', () => {
        expect(classifyCriticalEffect('he must test or catch fire').burning).toBe(true);
        expect(classifyCriticalEffect('the target is completely encased and set on fire').burning).toBe(true);
        expect(classifyCriticalEffect('the leg immolates and thick fire consumes the target').burning).toBe(true);
    });

    it('detects Blinded / Deafened', () => {
        const r = classifyCriticalEffect('He is Blinded for 1d10 rounds and permanently Deafened.');
        expect(r.blinded).toBe(true);
        expect(r.deafened).toBe(true);
    });

    it('detects fatal rows across the RAW death phrasings', () => {
        expect(classifyCriticalEffect('He immediately dies from shock.').fatal).toBe(true);
        expect(classifyCriticalEffect('killing the target immediately').fatal).toBe(true);
        expect(classifyCriticalEffect('The target is now quite dead.').fatal).toBe(true);
        expect(classifyCriticalEffect('his death is instantaneous').fatal).toBe(true);
        expect(classifyCriticalEffect('His death is instantaneous. He dies in a pool of blood.').fatal).toBe(true);
        expect(classifyCriticalEffect('the target does not survive').fatal).toBe(true);
        expect(classifyCriticalEffect('He cannot get much deader than this.').fatal).toBe(true);
        expect(classifyCriticalEffect('this is instantly and messily fatal').fatal).toBe(true);
    });

    it('a non-lethal row is not flagged fatal', () => {
        const r = classifyCriticalEffect('The target suffers 1 level of Fatigue from a painful laceration.');
        expect(r.fatal).toBe(false);
    });
});

describe('getCriticalDamageRecord (#108)', () => {
    beforeEach(() => {
        invalidateCriticalDamageCache();
        stubGameWithFixture(FIXTURE);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        invalidateCriticalDamageCache();
    });

    it('Energy / Arm / low (1) — minor graze, no fatal/blood-loss', async () => {
        const rec = await getCriticalDamageRecord('Energy', 'Right Arm', 1);
        expect(rec).not.toBeNull();
        expect(rec?.damageType).toBe('Energy');
        expect(rec?.bodyPart).toBe('Arm');
        expect(rec?.severity).toBe(1);
        expect(rec?.effect).toContain('grazes the arm');
        expect(rec?.riders.fatal).toBe(false);
        expect(rec?.riders.bloodLoss).toBe(false);
    });

    it('Energy / Arm / mid (5) — Stunned + lost-limb riders', async () => {
        const rec = await getCriticalDamageRecord('energy', 'Left Arm', 5);
        expect(rec?.severity).toBe(5);
        expect(rec?.riders.stunned).toBe(true);
        expect(rec?.riders.lostLimb).toBe(true);
    });

    it('Energy / Arm / high (10+, clamped) — fatal row', async () => {
        const rec = await getCriticalDamageRecord('Energy', 'Right Arm', 14);
        expect(rec?.severity).toBe(10);
        expect(rec?.riders.fatal).toBe(true);
    });

    it('Energy / Body / mid (5) — Burning + Prone + Stunned', async () => {
        const rec = await getCriticalDamageRecord('Energy', 'Body', 5);
        expect(rec?.bodyPart).toBe('Body');
        expect(rec?.riders.burning).toBe(true);
        expect(rec?.riders.prone).toBe(true);
        expect(rec?.riders.stunned).toBe(true);
    });

    it('Explosive / Leg / low (1) — Prone only', async () => {
        const rec = await getCriticalDamageRecord('Explosive', 'Left Leg', 1);
        expect(rec?.damageType).toBe('Explosive');
        expect(rec?.bodyPart).toBe('Leg');
        expect(rec?.riders.prone).toBe(true);
        expect(rec?.riders.fatal).toBe(false);
    });

    it('Explosive / Leg / mid (6) — Fatigue + lost-limb (Useless / Lost Foot)', async () => {
        const rec = await getCriticalDamageRecord('Explosive', 'Right Leg', 6);
        expect(rec?.severity).toBe(6);
        expect(rec?.riders.fatigue).toBe(true);
        expect(rec?.riders.lostLimb).toBe(true);
    });

    it('Explosive / Leg / high (10) — fatal', async () => {
        const rec = await getCriticalDamageRecord('Explosive', 'Left Leg', 10);
        expect(rec?.riders.fatal).toBe(true);
    });

    it('Impact / Head / low (1) — Fatigue, not fatal', async () => {
        const rec = await getCriticalDamageRecord('Impact', 'Head', 1);
        expect(rec?.damageType).toBe('Impact');
        expect(rec?.bodyPart).toBe('Head');
        expect(rec?.riders.fatigue).toBe(true);
        expect(rec?.riders.fatal).toBe(false);
    });

    it('Impact / Head / mid (4) — Stunned + Prone', async () => {
        const rec = await getCriticalDamageRecord('Impact', 'Head', 4);
        expect(rec?.riders.stunned).toBe(true);
        expect(rec?.riders.prone).toBe(true);
    });

    it('Impact / Head / high (8) — instantaneous death', async () => {
        const rec = await getCriticalDamageRecord('Impact', 'Head', 8);
        expect(rec?.riders.fatal).toBe(true);
    });

    it('Rending / Body / low (3) — Stunned + Blood Loss', async () => {
        const rec = await getCriticalDamageRecord('Rending', 'Body', 3);
        expect(rec?.damageType).toBe('Rending');
        expect(rec?.riders.stunned).toBe(true);
        expect(rec?.riders.bloodLoss).toBe(true);
    });

    it('Rending / Body / mid (7) — Blood Loss, not fatal', async () => {
        const rec = await getCriticalDamageRecord('Rending', 'Body', 7);
        expect(rec?.riders.bloodLoss).toBe(true);
        expect(rec?.riders.fatal).toBe(false);
    });

    it('Rending / Body / high (9) — fatal ("quite dead")', async () => {
        const rec = await getCriticalDamageRecord('Rending', 'Body', 9);
        expect(rec?.riders.fatal).toBe(true);
    });

    it('unknown damage type falls back to Impact (core.md L10646)', async () => {
        const rec = await getCriticalDamageRecord('Plasma', 'Head', 4);
        expect(rec?.damageType).toBe('Impact');
        expect(rec?.riders.stunned).toBe(true);
    });

    it('unresolvable body-part returns null', async () => {
        const rec = await getCriticalDamageRecord('Energy', 'Wing', 5);
        expect(rec).toBeNull();
    });

    it('missing compendium pack still returns a record with empty effect + riders', async () => {
        vi.unstubAllGlobals();
        invalidateCriticalDamageCache();
        vi.stubGlobal('game', { packs: { get: () => undefined } });
        const rec = await getCriticalDamageRecord('Energy', 'Body', 5);
        expect(rec).not.toBeNull();
        expect(rec?.effect).toBe('');
        expect(rec?.riders.stunned).toBe(false);
    });

    it('clamps a negative critical value up to the row-1 effect', async () => {
        const rec = await getCriticalDamageRecord('Energy', 'Right Arm', -3);
        expect(rec?.severity).toBe(1);
        expect(rec?.effect).toContain('grazes the arm');
    });
});
