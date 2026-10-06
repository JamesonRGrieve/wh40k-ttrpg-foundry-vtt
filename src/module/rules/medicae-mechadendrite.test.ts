import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asBaseActor as asActor } from '../testing/actor-stub.ts';
import { stubChatRuntime, type ChatRuntimeHandle } from '../testing/chat-runtime.ts';
import {
    MEDICAE_MECHADENDRITE,
    actorHasMedicaeMechadendrite,
    findMedicaeMechadendrite,
    isMedicaeMechadendrite,
    isMedicaeMechadendriteSystem,
    mechadendriteMedicaeBonus,
    resolveBloodLossStaunch,
    staunchBloodLoss,
} from './medicae-mechadendrite.ts';

/* -------------------------------------------- */
/*  Constants (errata p. 183)                   */
/* -------------------------------------------- */

describe('MEDICAE_MECHADENDRITE constants (#104, errata p. 183)', () => {
    it('staunches Blood Loss as a Half Action', () => {
        expect(MEDICAE_MECHADENDRITE.bloodLossClearAction).toBe('half');
        expect(MEDICAE_MECHADENDRITE.staunchActionKind).toBe('half');
    });

    it('allows one melee attack per round', () => {
        expect(MEDICAE_MECHADENDRITE.meleeAttacksPerRound).toBe(1);
    });
});

/* -------------------------------------------- */
/*  Pure resolution                             */
/* -------------------------------------------- */

describe('resolveBloodLossStaunch', () => {
    it('rolls against the Medicae total as-is — the document bonus is already in it, never added twice', () => {
        const r = resolveBloodLossStaunch(50, 45);
        expect(r.target).toBe(50);
        expect(r.success).toBe(true); // 45 <= 50
    });

    it('fails when the roll exceeds the target', () => {
        const r = resolveBloodLossStaunch(40, 55);
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
        expect(resolveBloodLossStaunch(50, 20).degrees).toBe(3); // (50-20)/10
        expect(resolveBloodLossStaunch(30, 60).degrees).toBe(-3); // -(60-30)/10
    });
});

/* -------------------------------------------- */
/*  System gating (homologation)                */
/* -------------------------------------------- */

describe('isMedicaeMechadendriteSystem', () => {
    it('enables the errata path for the six FFG-family systems', () => {
        for (const sys of ['dh1', 'dh2', 'bc', 'dw', 'ow', 'rt']) {
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
    it('matches the cybernetic by its identifier, in either the camelCase or kebab-case spelling the lines ship', () => {
        expect(isMedicaeMechadendrite({ isCybernetic: true, system: { identifier: 'medicaeMechadendrite' } })).toBe(true);
        expect(isMedicaeMechadendrite({ isCybernetic: true, system: { identifier: 'medicae-mechadendrite' } })).toBe(true);
    });

    it('rejects a non-cybernetic item even with the identifier', () => {
        expect(isMedicaeMechadendrite({ isCybernetic: false, system: { identifier: 'medicaeMechadendrite' } })).toBe(false);
    });

    it('rejects an unrelated cybernetic, and never matches on a name', () => {
        expect(isMedicaeMechadendrite({ isCybernetic: true, system: { identifier: 'utilityMechadendrite' } })).toBe(false);
        expect(isMedicaeMechadendrite({ isCybernetic: true, system: {} })).toBe(false);
    });
});

describe('mechadendriteMedicaeBonus', () => {
    it("reads the bonus from the document's modifiers.skills.medicae", () => {
        expect(mechadendriteMedicaeBonus({ system: { modifiers: { skills: { medicae: 10, interrogation: 10 } } } })).toBe(10);
    });

    it('is 0 when the document authors none or there is no mechadendrite', () => {
        expect(mechadendriteMedicaeBonus({ system: {} })).toBe(0);
        expect(mechadendriteMedicaeBonus(null)).toBe(0);
    });
});

interface FakeItem {
    isCybernetic: boolean;
    system: { identifier: string };
}

const MECHADENDRITE: FakeItem = { isCybernetic: true, system: { identifier: 'medicae-mechadendrite' } };

interface FakeEffect {
    id: string;
    flags?: Record<string, Record<string, boolean | string>>;
}

type DeleteEmbeddedDocumentsFn = (type: string, ids: string[]) => Promise<FakeEffect[]>;

interface FakeMedicaeActor {
    name: string;
    system: { gameSystem: string };
    skills: { medicae: { current: number } };
    items: FakeItem[];
    effects: FakeEffect[];
    deleteEmbeddedDocuments: DeleteEmbeddedDocumentsFn;
}

function makeActor(opts: { gameSystem?: string; items?: FakeItem[]; medicae?: number }): FakeMedicaeActor {
    return {
        name: 'Brother Medicae',
        system: { gameSystem: opts.gameSystem ?? 'dh2' },
        skills: { medicae: { current: opts.medicae ?? 0 } },
        items: opts.items ?? [],
        effects: [],
        deleteEmbeddedDocuments: vi.fn(async (_type: string, _ids: string[]) => Promise.resolve([])),
    };
}

describe('findMedicaeMechadendrite / actorHasMedicaeMechadendrite', () => {
    it('finds the cybernetic on a DH2 actor that owns one', () => {
        const actor = makeActor({ gameSystem: 'dh2', items: [MECHADENDRITE] });
        expect(findMedicaeMechadendrite(asActor(actor))).not.toBeNull();
        expect(actorHasMedicaeMechadendrite(asActor(actor))).toBe(true);
    });

    it('returns null when the actor owns no matching cybernetic', () => {
        const actor = makeActor({ gameSystem: 'dh2', items: [{ isCybernetic: true, system: { identifier: 'bionicArm' } }] });
        expect(actorHasMedicaeMechadendrite(asActor(actor))).toBe(false);
    });

    it('returns null on Imperium Maledictum even with a matching item (homologation gate)', () => {
        const actor = makeActor({ gameSystem: 'im', items: [MECHADENDRITE] });
        expect(actorHasMedicaeMechadendrite(asActor(actor))).toBe(false);
    });

    it('remains eligible across the other five FFG systems', () => {
        for (const sys of ['dh1', 'bc', 'dw', 'ow', 'rt']) {
            const actor = makeActor({ gameSystem: sys, items: [MECHADENDRITE] });
            expect(actorHasMedicaeMechadendrite(asActor(actor))).toBe(true);
        }
    });
});

/* -------------------------------------------- */
/*  Runtime staunch (Half Action)               */
/* -------------------------------------------- */

describe('staunchBloodLoss (runtime, #104)', () => {
    interface StaunchCardContext {
        success?: boolean;
        bleedStopped?: boolean;
        gameSystem?: string;
    }

    let chat: ChatRuntimeHandle;

    beforeEach(() => {
        chat = stubChatRuntime({
            renderTemplate: (_tpl, context) => {
                const ctx = context as StaunchCardContext;
                return `<card success="${String(ctx.success)}" bleed="${String(ctx.bleedStopped)}" sys="${String(ctx.gameSystem)}">`;
            },
        });
    });

    afterEach(() => {
        chat.restore();
        vi.restoreAllMocks();
    });

    it('on success removes the Blood Loss Active Effect and emits a success card', async () => {
        const bloodLossEffect: FakeEffect = { id: 'ae-1', flags: { 'wh40k-rpg': { bloodloss: true } } };
        const actor = makeActor({ gameSystem: 'dh2', medicae: 50 });
        actor.effects = [bloodLossEffect];

        // rng 0.29 → rollD100 = 29 (0.29*100 = 28.9999… floors to 28, +1), vs the Medicae total 50 → success.
        const res = await staunchBloodLoss(asActor(actor), () => 0.29);

        expect(res.success).toBe(true);
        expect(res.roll).toBe(29);
        expect(res.target).toBe(50);
        expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['ae-1']);
        expect(chat.lastContent()).toContain('success="true"');
        expect(chat.lastContent()).toContain('bleed="true"');
    });

    it('on failure leaves the Blood Loss effect intact and emits a failure card', async () => {
        const bloodLossEffect: FakeEffect = { id: 'ae-1', flags: { 'wh40k-rpg': { bloodloss: true } } };
        const actor = makeActor({ gameSystem: 'dh2', medicae: 20 });
        actor.effects = [bloodLossEffect];

        // rng 0.89 → rollD100 = 90, vs the Medicae total 20 → failure.
        const res = await staunchBloodLoss(asActor(actor), () => 0.89);

        expect(res.success).toBe(false);
        expect(res.roll).toBe(90);
        expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        expect(chat.lastContent()).toContain('success="false"');
        expect(chat.lastContent()).toContain('bleed="false"');
    });

    it('only removes effects flagged as blood loss, not other harmful AEs', async () => {
        const bloodLoss: FakeEffect = { id: 'ae-blood', flags: { 'wh40k-rpg': { bloodloss: true } } };
        const stunned: FakeEffect = { id: 'ae-stun', flags: { 'wh40k-rpg': { nature: 'harmful' } } };
        const actor = makeActor({ gameSystem: 'dh2', medicae: 60 });
        actor.effects = [bloodLoss, stunned];

        // rng 0.09 → rollD100 = 10, vs the Medicae total 60 → success.
        await staunchBloodLoss(asActor(actor), () => 0.09);

        expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['ae-blood']);
    });

    it('propagates the actor game system onto the chat card for per-system theming', async () => {
        const actor = makeActor({ gameSystem: 'rt', medicae: 50 });
        await staunchBloodLoss(asActor(actor), () => 0.04); // rollD100 = 5
        expect(chat.lastContent()).toContain('sys="rt"');
    });

    it('routes the injected rng through rollD100 — a [0,1) float yields a real 1-100 roll, not the always-1 latent-bug result (#374)', async () => {
        // Pre-fix, `Math.floor(rng())` of any fractional value floored to 0 and
        // clamped to 1, so every injected roll was a guaranteed natural 01. A
        // mid-range fraction must now produce a mid-range roll instead.
        const actor = makeActor({ gameSystem: 'dh2', medicae: 30 });
        // rng 0.62 → rollD100 = 63, vs the Medicae total 30 → failure (not a forced 01 success).
        const res = await staunchBloodLoss(asActor(actor), () => 0.62);
        expect(res.roll).toBe(63);
        expect(res.success).toBe(false);
    });
});
