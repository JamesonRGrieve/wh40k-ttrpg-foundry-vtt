import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeCharacteristicTotals } from '../data/shared/characteristic-math.ts';
import { installApplicationV2Stub } from '../testing/app-v2-stub.ts';
import type { ActorLike } from './assign-damage-data.ts';

/**
 * Auto-applied damage on an NPC (#420). The assign step writes wounds AND Fatigue
 * and snapshots both for the card; an NPC carried no `fatigue`, so it threw before
 * writing anything. NPCs now carry the track, and a hit — including a grapple's
 * Damage Opponent, which adds 1 Fatigue (#665) — applies to them as to a PC.
 */

// The damage path's import chain builds dialog classes on `foundry.applications.api` at load.
installApplicationV2Stub();
const { AssignDamageData } = await import('./assign-damage-data.ts');
const { Hit } = await import('./damage-data.ts');
const { stampGrappleHit } = await import('./grapple-damage.ts');

type Target = ActorLike & { update: ReturnType<typeof vi.fn<ActorLike['update']>> };

const LOCATIONS = { head: 1, body: 4, leftArm: 2, rightArm: 2, leftLeg: 1, rightLeg: 1 };

/** An NPC as its model holds it: its armour block (simple AP 2 unless given), Toughness Bonus 3, wounds and fatigue. */
function npc(
    wounds: number,
    fatigue: number,
    armour: ActorLike['system']['armour'] = { mode: 'simple', total: 2, authored: true, locations: LOCATIONS },
    toughnessBonus = 3,
): Target {
    return {
        system: {
            armour,
            characteristics: { toughness: { bonus: toughnessBonus } },
            wounds: { value: wounds, max: 12, critical: 0 },
            fatigue: { value: fatigue, max: 7 },
            gameSystem: 'dh2',
        },
        hasTalent: () => false,
        update: vi.fn<ActorLike['update']>().mockResolvedValue(undefined),
        createEmbeddedDocuments: vi.fn<ActorLike['createEmbeddedDocuments']>().mockResolvedValue(undefined),
    };
}

/** A PC as its creature model prepares it: per-location armour entries carrying TB. */
function pc(wounds: number): Target {
    return {
        system: {
            armour: { body: { value: 4, toughnessBonus: 3 }, head: { value: 2, toughnessBonus: 3 } },
            wounds: { value: wounds, max: 14, critical: 0 },
            fatigue: { value: 0, max: 3 },
            gameSystem: 'dh2',
        },
        hasTalent: () => false,
        update: vi.fn<ActorLike['update']>().mockResolvedValue(undefined),
        createEmbeddedDocuments: vi.fn<ActorLike['createEmbeddedDocuments']>().mockResolvedValue(undefined),
    };
}

/** Assign a hit of `damage` (Pen `penetration`) at `location` and return the wounds written. */
async function woundsAfter(target: Target, damage: number, penetration: number, location = 'body'): Promise<number | undefined> {
    const hit = new Hit();
    Object.assign(hit, { location, totalDamage: damage, totalPenetration: penetration, totalFatigue: 0 });
    const assign = new AssignDamageData(target, hit);
    assign.update();
    await assign.finalize();
    await assign.performActionAndSendToChat();
    const written = target.update.mock.calls.at(0)?.[0];
    const value = written?.['system.wounds.value'];
    return typeof value === 'number' ? value : undefined;
}

describe('auto-applying damage to an NPC (#420)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            i18n: { localize: (key: string) => key, format: (key: string) => key, has: () => false },
            wh40k: { log: () => undefined },
            user: { id: 'gm' },
            settings: { get: () => 'publicroll' },
        });
        vi.stubGlobal('foundry', { applications: { handlebars: { renderTemplate: vi.fn(async () => Promise.resolve('<div></div>')) } } });
        vi.stubGlobal('ChatMessage', { create: vi.fn(async () => Promise.resolve(null)), getSpeaker: vi.fn(() => ({})) });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('writes the wounds and snapshots the NPC’s fatigue', async () => {
        const target = npc(12, 0);
        const hit = new Hit();
        Object.assign(hit, { location: 'body', totalDamage: 10, totalPenetration: 0, totalFatigue: 0 });
        const assign = new AssignDamageData(target, hit);
        assign.update();
        await assign.finalize();
        await assign.performActionAndSendToChat();
        expect(target.update).toHaveBeenCalledWith({ 'system.wounds.value': 7, 'system.wounds.critical': 0, 'system.fatigue.value': 0 });
        expect(assign.woundTransition).not.toBeNull();
    });

    it('applies a grapple’s Damage Opponent: its wounds and its 1 Fatigue (#665)', async () => {
        const target = npc(12, 1);
        const hit = new Hit();
        Object.assign(hit, { totalDamage: 7, totalPenetration: 0, totalFatigue: 0 });
        stampGrappleHit(hit, { location: 'body', fatigue: 1 }, 'Cultist');
        const assign = new AssignDamageData(target, hit);
        assign.update();
        await assign.finalize();
        await assign.performActionAndSendToChat();
        expect(assign.fatigueTaken).toBe(1);
        expect(target.update).toHaveBeenCalledWith({ 'system.wounds.value': 10, 'system.wounds.critical': 0, 'system.fatigue.value': 2 });
    });

    // #248: the NPC armour block soaked nothing (no PC-shaped key matched), so every hit
    // took the NPC's full damage. Each case: wounds lost = damage − (AP − Pen) − TB.
    it('an NPC in simple mode soaks its flat AP less Penetration, and its TB', async () => {
        // 12 − (2 − 1) − 3 = 8 lost.
        expect(await woundsAfter(npc(12, 0), 12, 1)).toBe(4);
    });

    it("an NPC in locations mode soaks the struck location's AP", async () => {
        const plated = { mode: 'locations' as const, total: 0, authored: true, locations: LOCATIONS };
        // Body AP 4: 12 − 4 − 3 = 5 lost; Head AP 1: 12 − 1 − 3 = 8 lost.
        expect(await woundsAfter(npc(12, 0, plated), 12, 0, 'body')).toBe(7);
        expect(await woundsAfter(npc(12, 0, plated), 12, 0, 'head')).toBe(4);
    });

    it('an NPC with Unnatural Toughness soaks its multiplied TB', async () => {
        // T 35 with Unnatural Toughness (×2): TB 3 × 2 = 6, as the NPC model prepares it.
        const { bonus } = computeCharacteristicTotals(35, 0, 2);
        expect(bonus).toBe(6);
        // 12 − 2 − 6 = 4 lost.
        expect(await woundsAfter(npc(12, 0, undefined, bonus), 12, 0)).toBe(8);
    });

    it('a PC still soaks its prepared location armour and TB', async () => {
        // Body: 12 − 4 − 3 = 5 lost.
        expect(await woundsAfter(pc(14), 12, 0)).toBe(9);
    });
});
