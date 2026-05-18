import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    MEDICAE_MECHADENDRITE,
    actorHasMedicaeMechadendrite,
    findMedicaeMechadendrite,
    isMedicaeMechadendrite,
    isMedicaeMechadendriteSystem,
    resolveBloodLossStaunch,
    staunchBloodLoss,
} from './medicae-mechadendrite.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

/* -------------------------------------------- */
/*  Constants (errata p. 183)                   */
/* -------------------------------------------- */

describe('MEDICAE_MECHADENDRITE constants (#104, errata p. 183)', () => {
    it('staunches Blood Loss as a Half Action', () => {
        expect(MEDICAE_MECHADENDRITE.bloodLossClearAction).toBe('half');
        expect(MEDICAE_MECHADENDRITE.staunchActionKind).toBe('half');
    });

    it('grants the errata +10 Medicae bonus and one melee attack per round', () => {
        expect(MEDICAE_MECHADENDRITE.medicaeBonus).toBe(10);
        expect(MEDICAE_MECHADENDRITE.meleeAttacksPerRound).toBe(1);
    });
});

/* -------------------------------------------- */
/*  Pure resolution                             */
/* -------------------------------------------- */

describe('resolveBloodLossStaunch', () => {
    it('folds the errata +10 into the Medicae target', () => {
        const r = resolveBloodLossStaunch(40, 45);
        expect(r.target).toBe(50);
        expect(r.success).toBe(true); // 45 <= 50
    });

    it('fails when the roll exceeds the bonused target', () => {
        const r = resolveBloodLossStaunch(30, 55);
        expect(r.target).toBe(40);
        expect(r.success).toBe(false); // 55 > 40
    });

    it('a natural 01 always succeeds even against a hopeless target', () => {
        const r = resolveBloodLossStaunch(0, 1);
        expect(r.success).toBe(true);
    });

    it('a natural 100 always fails even against a trivial target', () => {
        const r = resolveBloodLossStaunch(90, 100);
        expect(r.success).toBe(false);
    });

    it('reports degrees of success / failure in tens', () => {
        expect(resolveBloodLossStaunch(40, 20).degrees).toBe(3); // (50-20)/10
        expect(resolveBloodLossStaunch(20, 60).degrees).toBe(-3); // -(60-30)/10
    });
});

/* -------------------------------------------- */
/*  System gating (homologation)                */
/* -------------------------------------------- */

describe('isMedicaeMechadendriteSystem', () => {
    it('enables the errata path for the six FFG-family systems', () => {
        for (const sys of ['dh1e', 'dh2e', 'bc', 'dw', 'ow', 'rt']) {
            expect(isMedicaeMechadendriteSystem(sys)).toBe(true);
        }
    });

    it('excludes Imperium Maledictum (no FFG mechadendrite entry)', () => {
        expect(isMedicaeMechadendriteSystem('im')).toBe(false);
    });

    it('excludes an undefined game system', () => {
        expect(isMedicaeMechadendriteSystem(undefined)).toBe(false);
    });
});

/* -------------------------------------------- */
/*  Item / actor eligibility                    */
/* -------------------------------------------- */

describe('isMedicaeMechadendrite', () => {
    it('matches a cybernetic named Medicae Mechadendrite (case-insensitive)', () => {
        expect(isMedicaeMechadendrite({ name: 'Medicae Mechadendrite', isCybernetic: true })).toBe(true);
        expect(isMedicaeMechadendrite({ name: 'medicae mechadendrite (Best)', isCybernetic: true })).toBe(true);
    });

    it('rejects a non-cybernetic item even when named correctly', () => {
        expect(isMedicaeMechadendrite({ name: 'Medicae Mechadendrite', isCybernetic: false })).toBe(false);
    });

    it('rejects an unrelated cybernetic', () => {
        expect(isMedicaeMechadendrite({ name: 'Utility Mechadendrite', isCybernetic: true })).toBe(false);
        expect(isMedicaeMechadendrite({ name: 'Luminen Capacitor', isCybernetic: true })).toBe(false);
    });
});

interface FakeItem {
    name: string;
    isCybernetic: boolean;
}

function makeActor(opts: { gameSystem?: string; items?: FakeItem[]; medicae?: number }): WH40KBaseActorDocument {
    const items = opts.items ?? [];
    return {
        name: 'Brother Medicae',
        system: { gameSystem: opts.gameSystem ?? 'dh2e' },
        skills: { medicae: { current: opts.medicae ?? 0 } },
        items,
        effects: [] as unknown[],
        deleteEmbeddedDocuments: vi.fn(async () => []),
    } as unknown as WH40KBaseActorDocument;
}

describe('findMedicaeMechadendrite / actorHasMedicaeMechadendrite', () => {
    it('finds the cybernetic on a DH2 actor that owns one', () => {
        const actor = makeActor({ gameSystem: 'dh2e', items: [{ name: 'Medicae Mechadendrite', isCybernetic: true }] });
        expect(findMedicaeMechadendrite(actor)).not.toBeNull();
        expect(actorHasMedicaeMechadendrite(actor)).toBe(true);
    });

    it('returns null when the actor owns no matching cybernetic', () => {
        const actor = makeActor({ gameSystem: 'dh2e', items: [{ name: 'Bionic Arm', isCybernetic: true }] });
        expect(actorHasMedicaeMechadendrite(actor)).toBe(false);
    });

    it('returns null on Imperium Maledictum even with a matching item (homologation gate)', () => {
        const actor = makeActor({ gameSystem: 'im', items: [{ name: 'Medicae Mechadendrite', isCybernetic: true }] });
        expect(actorHasMedicaeMechadendrite(actor)).toBe(false);
    });

    it('remains eligible across the other five FFG systems', () => {
        for (const sys of ['dh1e', 'bc', 'dw', 'ow', 'rt']) {
            const actor = makeActor({ gameSystem: sys, items: [{ name: 'Medicae Mechadendrite', isCybernetic: true }] });
            expect(actorHasMedicaeMechadendrite(actor)).toBe(true);
        }
    });
});

/* -------------------------------------------- */
/*  Runtime staunch (Half Action)               */
/* -------------------------------------------- */

describe('staunchBloodLoss (runtime, #104)', () => {
    let createdContent: string | null;

    beforeEach(() => {
        createdContent = null;
        vi.stubGlobal('game', {
            user: { id: 'gm-1' },
            settings: { get: () => 'roll' },
        });
        vi.stubGlobal('ChatMessage', {
            create: vi.fn(async (data: { content: string }) => {
                createdContent = data.content;
                return data;
            }),
            getWhisperRecipients: () => [],
        });
        vi.stubGlobal('foundry', {
            applications: {
                handlebars: {
                    renderTemplate: vi.fn(async (_tpl: string, ctx: Record<string, unknown>) =>
                        `<card success="${String(ctx['success'])}" bleed="${String(ctx['bleedStopped'])}" sys="${String(ctx['gameSystem'])}">`,
                    ),
                },
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('on success removes the Blood Loss Active Effect and emits a success card', async () => {
        const bloodLossEffect = { id: 'ae-1', flags: { 'wh40k-rpg': { bloodloss: true } } };
        const actor = makeActor({ gameSystem: 'dh2e', medicae: 40 });
        (actor as unknown as { effects: unknown[] }).effects = [bloodLossEffect];

        // Roll 30 vs target 40+10=50 → success.
        const res = await staunchBloodLoss(actor, () => 30);

        expect(res.success).toBe(true);
        expect(res.target).toBe(50);
        const del = (actor as unknown as { deleteEmbeddedDocuments: ReturnType<typeof vi.fn> }).deleteEmbeddedDocuments;
        expect(del).toHaveBeenCalledWith('ActiveEffect', ['ae-1']);
        expect(createdContent).toContain('success="true"');
        expect(createdContent).toContain('bleed="true"');
    });

    it('on failure leaves the Blood Loss effect intact and emits a failure card', async () => {
        const bloodLossEffect = { id: 'ae-1', flags: { 'wh40k-rpg': { bloodloss: true } } };
        const actor = makeActor({ gameSystem: 'dh2e', medicae: 20 });
        (actor as unknown as { effects: unknown[] }).effects = [bloodLossEffect];

        // Roll 90 vs target 20+10=30 → failure.
        const res = await staunchBloodLoss(actor, () => 90);

        expect(res.success).toBe(false);
        const del = (actor as unknown as { deleteEmbeddedDocuments: ReturnType<typeof vi.fn> }).deleteEmbeddedDocuments;
        expect(del).not.toHaveBeenCalled();
        expect(createdContent).toContain('success="false"');
        expect(createdContent).toContain('bleed="false"');
    });

    it('only removes effects flagged as blood loss, not other harmful AEs', async () => {
        const bloodLoss = { id: 'ae-blood', flags: { 'wh40k-rpg': { bloodloss: true } } };
        const stunned = { id: 'ae-stun', flags: { 'wh40k-rpg': { nature: 'harmful' } } };
        const actor = makeActor({ gameSystem: 'dh2e', medicae: 60 });
        (actor as unknown as { effects: unknown[] }).effects = [bloodLoss, stunned];

        await staunchBloodLoss(actor, () => 10);

        const del = (actor as unknown as { deleteEmbeddedDocuments: ReturnType<typeof vi.fn> }).deleteEmbeddedDocuments;
        expect(del).toHaveBeenCalledWith('ActiveEffect', ['ae-blood']);
    });

    it('propagates the actor game system onto the chat card for per-system theming', async () => {
        const actor = makeActor({ gameSystem: 'rt', medicae: 50 });
        await staunchBloodLoss(actor, () => 5);
        expect(createdContent).toContain('sys="rt"');
    });
});
