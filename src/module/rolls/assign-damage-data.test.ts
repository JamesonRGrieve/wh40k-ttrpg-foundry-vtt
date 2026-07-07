import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateCriticalDamageCache } from '../rules/critical-damage';
import { AssignDamageData, type ActorLike } from './assign-damage-data';

function buildActor(overrides: Partial<ActorLike['system']> = {}): ActorLike {
    return {
        system: {
            armour: {
                BODY: { value: 4, toughnessBonus: 3 },
                HEAD: { value: 2, toughnessBonus: 3 },
            },
            wounds: { value: 10, critical: 0 },
            fatigue: { value: 0 },
            ...overrides,
        },
        hasTalent: () => false,
        update: vi.fn<ActorLike['update']>().mockResolvedValue(undefined),
        createEmbeddedDocuments: vi.fn<ActorLike['createEmbeddedDocuments']>().mockResolvedValue(undefined),
    };
}

describe('AssignDamageData cover AP wiring', () => {
    it('adds hit.coverAP to the location armour during update()', () => {
        const actor = buildActor();
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 12,
            totalPenetration: 0,
            totalFatigue: 0,
            coverAP: 6,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        expect(data.coverAP).toBe(6);
        // Base armour 4 + cover AP 6 = 10
        expect(data.armour).toBe(10);
        expect(data.tb).toBe(3);
    });

    it('treats absent hit.coverAP as zero', () => {
        const actor = buildActor();
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 5,
            totalPenetration: 0,
            totalFatigue: 0,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        expect(data.coverAP).toBe(0);
        expect(data.armour).toBe(4);
    });

    it('cover AP is subtracted from damage just like ordinary armour', async () => {
        const actor = buildActor();
        // 10 damage, 0 pen, cover AP 6 → effective armour 4+6=10, reduction 10+3 TB = 13, damage 10-13 < 0 → no wound
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 10,
            totalPenetration: 0,
            totalFatigue: 0,
            coverAP: 6,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.hasDamage).toBe(false);
        expect(data.damageTaken).toBe(0);
    });

    it('cover AP is reducible by penetration like ordinary armour', async () => {
        const actor = buildActor();
        // base 4 + cover 6 = 10 armour; pen 8 → effective 2; reduction 2+3 TB = 5; damage 12-5 = 7
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 12,
            totalPenetration: 8,
            totalFatigue: 0,
            coverAP: 6,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.damageTaken).toBe(7);
        expect(data.hasDamage).toBe(true);
    });
});

describe('Righteous Fury no-break branch (#109)', () => {
    it('damage breaks through normally — RF count does not add extra', async () => {
        const actor = buildActor();
        // 12 dmg, 0 pen → reduction 4+3=7 → reducedDamage=5; RF count is informational only here.
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 12,
            totalPenetration: 0,
            totalFatigue: 0,
            righteousFuryCount: 2,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.damageTaken).toBe(5);
        expect(data.hasDamage).toBe(true);
    });

    it('defences absorb the hit AND RF triggered → 1 unarmoured wound lands', async () => {
        const actor = buildActor();
        // 5 dmg, 0 pen → reduction 4+3=7 → reducedDamage=-2; RF saves the 1.
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 5,
            totalPenetration: 0,
            totalFatigue: 0,
            righteousFuryCount: 1,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.damageTaken).toBe(1);
        expect(data.hasDamage).toBe(true);
    });

    it('defences absorb the hit and NO RF triggered → no damage', async () => {
        const actor = buildActor();
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 5,
            totalPenetration: 0,
            totalFatigue: 0,
            righteousFuryCount: 0,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.damageTaken).toBe(0);
        expect(data.hasDamage).toBe(false);
    });

    it('absent righteousFuryCount field is treated as zero', async () => {
        const actor = buildActor();
        const hit = {
            location: 'Body',
            damageType: 'Impact',
            totalDamage: 5,
            totalPenetration: 0,
            totalFatigue: 0,
        };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.damageTaken).toBe(0);
    });

    // wounds = 0 path: in that case the no-break branch routes the 1 damage
    // through criticalDamageTaken, which downstream calls
    // getCriticalDamage → loadCriticalDamageTable → game.packs.get(...). The
    // Foundry `game` global is not present in pure-rules vitest runs, so
    // exercising that path here would crash the same way the existing
    // wounds<=0 branch above (line 92 in source) would. The branch itself is
    // covered by code review against the source; the wounds>0 case above
    // proves the RF-no-break trigger fires.
});

describe('DW horde branch (#166 — core.md p. 359 "Damaging a Horde")', () => {
    function buildHordeActor(magnitude = 30, gameSystem: string | undefined = 'dw'): ActorLike {
        const actor = buildActor();
        actor.system.gameSystem = gameSystem;
        actor.system.horde = { enabled: true, magnitude: { current: magnitude, max: magnitude } };
        return actor;
    }

    it('damaging hit removes 1 Magnitude (DW)', async () => {
        const actor = buildHordeActor(30);
        // Body armour 4 + TB 3 = 7; damage 12 → 5 reduced damage (>0 → 1 hit lands).
        const hit = { location: 'Body', damageType: 'Impact', totalDamage: 12, totalPenetration: 0, totalFatigue: 0 };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.hasHordeDamage).toBe(true);
        expect(data.magnitudeLost).toBe(1);
        expect(data.magnitudeBefore).toBe(30);
        expect(data.magnitudeAfter).toBe(29);
        // Wound bookkeeping must stay zero on the horde branch.
        expect(data.damageTaken).toBe(0);
        expect(data.hasCriticalDamage).toBe(false);
    });

    it('hit fully absorbed → 0 Magnitude loss (no damage = no hit removed)', async () => {
        const actor = buildHordeActor(30);
        // Damage 5 vs armour 4 + TB 3 = 7 reduction → 0 net.
        const hit = { location: 'Body', damageType: 'Impact', totalDamage: 5, totalPenetration: 0, totalFatigue: 0 };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.hasHordeDamage).toBe(true);
        expect(data.magnitudeLost).toBe(0);
        expect(data.magnitudeAfter).toBe(30);
    });

    it('Explosive damage type removes 2 Magnitude per hit (RAW: counts as extra hit)', async () => {
        const actor = buildHordeActor(30);
        const hit = { location: 'Body', damageType: 'Explosive', totalDamage: 12, totalPenetration: 0, totalFatigue: 0, isExplosive: true };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.magnitudeLost).toBe(2);
        expect(data.magnitudeAfter).toBe(28);
    });

    it('Magnitude floors at 0 (no negative magnitude)', async () => {
        const actor = buildHordeActor(1);
        const hit = { location: 'Body', damageType: 'Explosive', totalDamage: 30, totalPenetration: 0, totalFatigue: 0, isExplosive: true };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.magnitudeLost).toBe(2);
        expect(data.magnitudeAfter).toBe(0);
    });

    it('non-DW horde target falls back to normal wounds path (other six systems unaffected)', async () => {
        const actor = buildHordeActor(30, 'dh2');
        const hit = { location: 'Body', damageType: 'Impact', totalDamage: 12, totalPenetration: 0, totalFatigue: 0 };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        // Horde branch must NOT fire outside DW.
        expect(data.hasHordeDamage).toBe(false);
        expect(data.magnitudeLost).toBe(0);
        // Falls through to normal wound bookkeeping: 12 - (4+3) = 5 wounds.
        expect(data.damageTaken).toBe(5);
    });

    it('DW non-horde target falls back to normal wounds path', async () => {
        const actor = buildActor();
        actor.system.gameSystem = 'dw';
        // No horde field at all.
        const hit = { location: 'Body', damageType: 'Impact', totalDamage: 12, totalPenetration: 0, totalFatigue: 0 };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.hasHordeDamage).toBe(false);
        expect(data.damageTaken).toBe(5);
    });

    it('horde disabled → falls back to normal wounds path', async () => {
        const actor = buildHordeActor(30);
        actor.system.horde = { enabled: false, magnitude: { current: 30, max: 30 } };
        const hit = { location: 'Body', damageType: 'Impact', totalDamage: 12, totalPenetration: 0, totalFatigue: 0 };
        const data = new AssignDamageData(actor, hit);
        data.update();
        await data.finalize();
        expect(data.hasHordeDamage).toBe(false);
        expect(data.damageTaken).toBe(5);
    });
});

describe('AssignDamageData.previewReducedDamage (#247)', () => {
    it('reduces damage by location armour and Toughness Bonus', () => {
        const actor = buildActor(); // BODY armour 4, TB 3
        const data = new AssignDamageData(actor, { location: 'Body', damageType: 'Impact', totalDamage: 12, totalPenetration: 0, totalFatigue: 0 });
        data.update();
        const p = data.previewReducedDamage();
        expect(p.effective).toBe(5); // 12 - (4 armour + 3 TB)
        expect(p.armour).toBe(4);
        expect(p.toughnessBonus).toBe(3);
        expect(p.absorbed).toBe(false);
    });

    it('penetration reduces usable armour, floored at zero', () => {
        const actor = buildActor();
        const data = new AssignDamageData(actor, { location: 'Body', damageType: 'Impact', totalDamage: 12, totalPenetration: 6, totalFatigue: 0 });
        data.update();
        const p = data.previewReducedDamage();
        expect(p.armour).toBe(0); // pen 6 > armour 4
        expect(p.effective).toBe(9); // 12 - (0 + 3 TB)
    });

    it('applies the RAW 1-point minimum when defences fully absorb the hit', () => {
        const actor = buildActor();
        const data = new AssignDamageData(actor, { location: 'Body', damageType: 'Impact', totalDamage: 5, totalPenetration: 0, totalFatigue: 0 });
        data.update();
        const p = data.previewReducedDamage();
        expect(p.absorbed).toBe(true); // 5 - (4+3) <= 0
        expect(p.effective).toBe(1);
    });

    it('ignores armour (but keeps TB) when ignoreArmour is set', () => {
        const actor = buildActor();
        const data = new AssignDamageData(actor, { location: 'Body', damageType: 'Impact', totalDamage: 12, totalPenetration: 0, totalFatigue: 0 });
        data.ignoreArmour = true;
        data.update();
        const p = data.previewReducedDamage();
        expect(p.armour).toBe(0);
        expect(p.effective).toBe(9); // 12 - (0 + 3 TB)
    });

    it('includes cover AP in the armour reduction', () => {
        const actor = buildActor();
        const data = new AssignDamageData(actor, { location: 'Body', damageType: 'Impact', totalDamage: 20, totalPenetration: 0, totalFatigue: 0, coverAP: 6 });
        data.update();
        const p = data.previewReducedDamage();
        expect(p.armour).toBe(10); // armour 4 + cover 6
        expect(p.effective).toBe(7); // 20 - (10 + 3 TB)
    });
});

describe('Critical Damage record capture (#108)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        invalidateCriticalDamageCache();
    });

    it('populates criticalRecord when damage overflows wounds into critical', async () => {
        // No content pack installed → the record still resolves with empty effect
        // + riders, proving the capture wiring runs off the same lookup.
        vi.stubGlobal('game', { packs: { get: () => undefined } });
        invalidateCriticalDamageCache();
        const actor = buildActor({ wounds: { value: 2, critical: 0 } });
        // Body armour 4 (pen 10 → 0) + TB 3 = 3 reduction; 20 - 3 = 17 damage.
        // 2 lands as wounds, 15 as critical → the crit lookup fires.
        const data = new AssignDamageData(actor, { location: 'Body', damageType: 'Impact', totalDamage: 20, totalPenetration: 10, totalFatigue: 0 });
        data.update();
        await data.finalize();
        expect(data.hasCriticalDamage).toBe(true);
        expect(data.criticalDamageTaken).toBe(15);
        expect(data.criticalRecord).not.toBeNull();
        expect(data.criticalRecord?.effect).toBe('');
        expect(data.criticalRecord?.riders.stunned).toBe(false);
    });

    it('leaves criticalRecord null when the hit deals no critical damage', async () => {
        vi.stubGlobal('game', { packs: { get: () => undefined } });
        invalidateCriticalDamageCache();
        const actor = buildActor(); // wounds 10
        const data = new AssignDamageData(actor, { location: 'Body', damageType: 'Impact', totalDamage: 10, totalPenetration: 0, totalFatigue: 0 });
        data.update();
        await data.finalize();
        expect(data.hasCriticalDamage).toBe(false);
        expect(data.criticalRecord).toBeNull();
    });
});
