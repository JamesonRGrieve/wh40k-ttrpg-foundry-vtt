import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    classifyCriticalEffect,
    clampCriticalSeverity,
    type CriticalDamageRiders,
    criticalRiderConditionIds,
    getCriticalDamageRecord,
    invalidateCriticalDamageCache,
} from './critical-damage';
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
                1: { text: '<p>Arm crit 1: grazes the arm; -30 to arm tests for 1d5 rounds.</p>' },
                5: { text: '<p>Arm crit 5: Stunned 1 round; arm Useless.</p>' },
                10: { text: '<p>Arm crit 10: target immediately dies.</p>' },
            },
        },
    },
    {
        system: {
            damageType: 'Energy',
            bodyPart: 'Body',
            effects: {
                5: {
                    text: '<p>Body crit 5: Prone; test or catch fire; test or Stunned 1 round.</p>',
                },
            },
        },
    },
    {
        system: {
            damageType: 'Explosive',
            bodyPart: 'Leg',
            effects: {
                1: { text: '<p>Leg crit 1: pushed back 1 m; test or Prone.</p>' },
                6: {
                    text: '<p>Leg crit 6: 1d10 Fatigue; leg Useless; test or Lost Foot.</p>',
                },
                10: {
                    text: '<p>Leg crit 10: killing the target outright.</p>',
                },
            },
        },
    },
    {
        system: {
            damageType: 'Impact',
            bodyPart: 'Head',
            effects: {
                1: { text: '<p>Head crit 1: test or 1 Fatigue.</p>' },
                4: { text: '<p>Head crit 4: test or Stunned 1 round and Prone.</p>' },
                8: {
                    text: '<p>Head crit 8: death is instantaneous.</p>',
                },
            },
        },
    },
    {
        system: {
            damageType: 'Rending',
            bodyPart: 'Body',
            effects: {
                3: { text: '<p>Body crit 3: Stunned 1 round; test or Blood Loss.</p>' },
                7: {
                    text: '<p>Body crit 7: Blood Loss; -1d5 Toughness permanently.</p>',
                },
                9: {
                    text: '<p>Body crit 9: target is quite dead.</p>',
                },
            },
        },
    },
];

function stubGameWithFixture(docs: FixtureItem[]): void {
    vi.stubGlobal('game', {
        packs: {
            get: (id: string) => (id === 'wh40k-rpg.dh2-core-items-critical-injuries' ? { getDocuments: async () => Promise.resolve(docs) } : undefined),
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
        const r = classifyCriticalEffect('Stunned 1 round; arm Useless; 1d5 Fatigue.');
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
        expect(classifyCriticalEffect('target is now on fire').burning).toBe(true);
        expect(classifyCriticalEffect('the leg immolates').burning).toBe(true);
    });

    it('detects a helmet being torn/knocked off', () => {
        expect(classifyCriticalEffect('Helmet is torn off.').helmetTornOff).toBe(true);
        expect(classifyCriticalEffect('Hit knocks off the helmet.').helmetTornOff).toBe(true);
        // "torn off" without a helmet mention is NOT a helmet effect (e.g. a limb).
        expect(classifyCriticalEffect('The arm is torn off at the shoulder.').helmetTornOff).toBe(false);
    });

    it('classifies a `negates` armour gate (worn armour cancels the row)', () => {
        // Head phrasing: helmet → no ill effect, else a penalty.
        const head = classifyCriticalEffect('Helmet: no ill effect. Bare head: 1 Fatigue.');
        expect(head.armourGate).toBe('negates');
        expect(head.fatigue).toBe(true); // the "otherwise" branch still flags fatigue; the applier gates it on armour
        // Body phrasing (inverted): unarmoured → penalty, armoured → no effect.
        const body = classifyCriticalEffect('Not wearing armour: 1 Fatigue. Armoured: no effect.');
        expect(body.armourGate).toBe('negates');
    });

    it('classifies a `worsensIfUnarmoured` gate (unarmoured location suffers extra)', () => {
        const r = classifyCriticalEffect('Helmet torn off. No helmet: Deafened instead. Stunned 1d5 rounds.');
        expect(r.armourGate).toBe('worsensIfUnarmoured');
        expect(r.helmetTornOff).toBe(true);
        expect(r.deafened).toBe(true);
    });

    it('leaves the armour gate at `none` when the row does not mention armour', () => {
        expect(classifyCriticalEffect('The target is Stunned for 1 round and suffers Blood Loss.').armourGate).toBe('none');
    });

    it('detects a "drop held item" hand/arm crit', () => {
        expect(classifyCriticalEffect('Drop any item held.').dropsHeldItem).toBe(true);
        expect(classifyCriticalEffect('Prone; drops anything he was holding.').dropsHeldItem).toBe(true);
        expect(classifyCriticalEffect('Must drop his weapon.').dropsHeldItem).toBe(true);
        // A crit that doesn't unhand anything is not flagged.
        expect(classifyCriticalEffect('The target is Stunned for 1 round.').dropsHeldItem).toBe(false);
    });

    it('detects a held weapon being destroyed / rendered useless', () => {
        expect(classifyCriticalEffect('Held item is destroyed.').weaponDestroyed).toBe(true);
        expect(classifyCriticalEffect('Held item unusable until repaired.').weaponDestroyed).toBe(true);
        // A plain drop is not a destruction.
        expect(classifyCriticalEffect('Drops anything held.').weaponDestroyed).toBe(false);
    });

    it('detects carried munitions cooking off (needs a munition noun AND a detonation verb)', () => {
        expect(classifyCriticalEffect('Carried ammunition explodes.').detonatesMunitions).toBe(true);
        expect(classifyCriticalEffect('Carried grenades detonate.').detonatesMunitions).toBe(true);
        // "explodes" without a munition noun (a body-part bursting) is not a cook-off.
        expect(classifyCriticalEffect('Torso explodes.').detonatesMunitions).toBe(false);
    });

    it('detects Blinded / Deafened', () => {
        const r = classifyCriticalEffect('Blinded 1d10 rounds; Deafened.');
        expect(r.blinded).toBe(true);
        expect(r.deafened).toBe(true);
    });

    it('detects fatal rows across the RAW death phrasings', () => {
        expect(classifyCriticalEffect('immediately dies').fatal).toBe(true);
        expect(classifyCriticalEffect('killing the target').fatal).toBe(true);
        expect(classifyCriticalEffect('quite dead').fatal).toBe(true);
        expect(classifyCriticalEffect('death is instantaneous').fatal).toBe(true);
        expect(classifyCriticalEffect('dies in a heap').fatal).toBe(true);
        expect(classifyCriticalEffect('does not survive').fatal).toBe(true);
        expect(classifyCriticalEffect('deader than this').fatal).toBe(true);
        expect(classifyCriticalEffect('messily fatal').fatal).toBe(true);
    });

    it('a non-lethal row is not flagged fatal', () => {
        const r = classifyCriticalEffect('Painful cut: 1 Fatigue.');
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

describe('criticalRiderConditionIds (#108 — riders → condition registry ids)', () => {
    const noRiders: CriticalDamageRiders = {
        stunned: false,
        burning: false,
        bloodLoss: false,
        prone: false,
        blinded: false,
        deafened: false,
        fatigue: false,
        lostLimb: false,
        fatal: false,
        helmetTornOff: false,
        armourGate: 'none',
        dropsHeldItem: false,
        weaponDestroyed: false,
        detonatesMunitions: false,
    };

    it('returns no ids when no riders fire', () => {
        expect(criticalRiderConditionIds(noRiders)).toEqual([]);
    });

    it('maps each rider to the condition pack identifier', () => {
        // The ids are the `system.identifier` the condition compendium documents
        // author (`on-fire`, `blood-loss`, `useless-limb`), so the applied effect
        // resolves to a real document instead of an unknown id.
        expect(criticalRiderConditionIds({ ...noRiders, stunned: true })).toEqual(['stunned']);
        expect(criticalRiderConditionIds({ ...noRiders, burning: true })).toEqual(['on-fire']);
        expect(criticalRiderConditionIds({ ...noRiders, bloodLoss: true })).toEqual(['blood-loss']);
        expect(criticalRiderConditionIds({ ...noRiders, prone: true })).toEqual(['prone']);
        expect(criticalRiderConditionIds({ ...noRiders, blinded: true })).toEqual(['blinded']);
        expect(criticalRiderConditionIds({ ...noRiders, deafened: true })).toEqual(['deafened']);
        expect(criticalRiderConditionIds({ ...noRiders, fatigue: true })).toEqual(['fatigued']);
        expect(criticalRiderConditionIds({ ...noRiders, lostLimb: true })).toEqual(['useless-limb']);
    });

    it('maps the fatal rider to the `dead` status (#495)', () => {
        // Previously unmapped, on the reasoning that instant death was GM
        // adjudication rather than an auto-applied effect. That left death as
        // the ONE outcome with no state at all — only chat prose — so nothing
        // downstream could see it: not the token defeated overlay, not the
        // combat tracker, not the #477 pile conversion. The status IS the state;
        // a GM who overrules the result clears it like any other condition.
        expect(criticalRiderConditionIds({ ...noRiders, fatal: true })).toEqual(['dead']);
    });

    it('orders `dead` first when a fatal result also carries other riders', () => {
        const ids = criticalRiderConditionIds({ ...noRiders, fatal: true, stunned: true, bloodLoss: true });
        expect(ids).toEqual(['dead', 'stunned', 'blood-loss']);
    });

    it('combines multiple riders in a stable order', () => {
        const ids = criticalRiderConditionIds({ ...noRiders, stunned: true, burning: true, bloodLoss: true, lostLimb: true });
        expect(ids).toEqual(['stunned', 'on-fire', 'blood-loss', 'useless-limb']);
    });
});

describe('per-line critical-injury pack (#439 homologation)', () => {
    const DH2: FixtureItem[] = [{ system: { damageType: 'Impact', bodyPart: 'Head', effects: { 5: { text: '<p>DH2 head crit.</p>' } } } }];
    const RT: FixtureItem[] = [{ system: { damageType: 'Impact', bodyPart: 'Head', effects: { 5: { text: '<p>RT head crit.</p>' } } } }];

    beforeEach(() => {
        invalidateCriticalDamageCache();
        vi.stubGlobal('game', {
            packs: {
                get: (id: string) => {
                    if (id === 'wh40k-rpg.dh2-core-items-critical-injuries') return { getDocuments: async () => Promise.resolve(DH2) };
                    if (id === 'wh40k-rpg.rt-core-items-critical-injuries') return { getDocuments: async () => Promise.resolve(RT) };
                    return undefined;
                },
            },
        });
    });

    afterEach(() => {
        invalidateCriticalDamageCache();
        vi.unstubAllGlobals();
    });

    it("reads the active line's own crit pack (RT -> RT descriptors)", async () => {
        const rec = await getCriticalDamageRecord('Impact', 'Head', 5, 'rt');
        expect(rec?.effect).toContain('RT head crit');
    });

    it('falls back to the DH2 pack for a line without its own crit pack', async () => {
        const rec = await getCriticalDamageRecord('Impact', 'Head', 5, 'bc');
        expect(rec?.effect).toContain('DH2 head crit');
    });

    it('defaults to the DH2 pack when no system id is given', async () => {
        const rec = await getCriticalDamageRecord('Impact', 'Head', 5);
        expect(rec?.effect).toContain('DH2 head crit');
    });
});
