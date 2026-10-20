import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** An NPC as the assign step reads it: Body armour 2 with TB 3, its wounds and its fatigue track. */
function npc(wounds: number, fatigue: number): ActorLike & { update: ReturnType<typeof vi.fn<ActorLike['update']>> } {
    return {
        system: {
            armour: { BODY: { value: 2, toughnessBonus: 3 } },
            wounds: { value: wounds, max: 12, critical: 0 },
            fatigue: { value: fatigue, max: 7 },
            gameSystem: 'dh2',
        },
        hasTalent: () => false,
        update: vi.fn<ActorLike['update']>().mockResolvedValue(undefined),
        createEmbeddedDocuments: vi.fn<ActorLike['createEmbeddedDocuments']>().mockResolvedValue(undefined),
    };
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
});
