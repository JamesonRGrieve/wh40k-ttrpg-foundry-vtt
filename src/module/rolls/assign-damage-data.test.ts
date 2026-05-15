import { describe, expect, it, vi } from 'vitest';
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
