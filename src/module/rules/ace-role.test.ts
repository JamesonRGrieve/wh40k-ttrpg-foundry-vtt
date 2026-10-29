import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asBaseActor as asActor } from '../testing/actor-stub.ts';
import { stubChatRuntime, type ChatRuntimeHandle } from '../testing/chat-runtime.ts';
import { actorHasFatePoints, actorIsAce, canSpendRightStuff, getAgilityBonus, isRightStuffSkill, resolveRightStuff, spendRightStuff } from './ace-role.ts';

/**
 * Contract tests for the Ace role's Right Stuff Fate spend (#100). Covers
 * detection (the role owned by identifier),
 * pure resolution (DoS = AgB), and the runtime spend (fate deduction
 * + chat card with the per-system anchor).
 */

/* -------------------------------------------- */
/*  System gating (homologation)                */
/* -------------------------------------------- */

/* -------------------------------------------- */
/*  Skill applicability                         */
/* -------------------------------------------- */

describe('isRightStuffSkill', () => {
    it('accepts Operate and Survival', () => {
        expect(isRightStuffSkill('operate')).toBe(true);
        expect(isRightStuffSkill('survival')).toBe(true);
    });

    it('rejects skills outside the Without entry', () => {
        for (const k of ['dodge', 'medicae', 'awareness', 'pilot', 'drive', '']) {
            expect(isRightStuffSkill(k)).toBe(false);
        }
    });
});

/* -------------------------------------------- */
/*  Actor probes                                */
/* -------------------------------------------- */

interface FakeFate {
    value: number;
    max?: number;
}

interface FakeAceActor {
    name: string;
    items: Array<{ type: string; system: { identifier: string } }>;
    system: {
        gameSystem: string;
        fate: FakeFate;
        characteristics: { agility: { bonus: number } };
    };
    update: ReturnType<typeof vi.fn>;
}

/** An actor owning a role `originPath` whose identifier is `role` (none when blank). */
function makeActor(opts: { gameSystem?: string; role?: string | undefined; fateValue?: number; agilityBonus?: number }): FakeAceActor {
    const role = opts.role ?? '';
    return {
        name: 'Vex Tannor',
        items: role === '' ? [] : [{ type: 'originPath', system: { identifier: role } }],
        system: {
            gameSystem: opts.gameSystem ?? 'dh2',
            fate: { value: opts.fateValue ?? 0 },
            characteristics: { agility: { bonus: opts.agilityBonus ?? 0 } },
        },
        update: vi.fn(() => undefined),
    };
}

describe('actorIsAce', () => {
    it('matches an actor owning the role whose identifier is `ace`', () => {
        expect(actorIsAce(makeActor({ role: 'ace' }))).toBe(true);
    });

    it('matches by identifier only — no role, another role, or a look-alike identifier is not the Ace', () => {
        expect(actorIsAce(makeActor({ role: '' }))).toBe(false);
        expect(actorIsAce(makeActor({ role: 'assassin' }))).toBe(false);
        expect(actorIsAce(makeActor({ role: 'tank-ace' }))).toBe(false);
    });

    it('is the same on every line that ships the role', () => {
        for (const sys of ['dh1', 'dh2', 'bc', 'dw', 'ow', 'rt', 'im']) {
            expect(actorIsAce(makeActor({ gameSystem: sys, role: 'ace' }))).toBe(true);
        }
    });
});

describe('actorHasFatePoints / getAgilityBonus', () => {
    it('actorHasFatePoints reflects fate.value > 0', () => {
        expect(actorHasFatePoints(asActor(makeActor({ fateValue: 0 })))).toBe(false);
        expect(actorHasFatePoints(asActor(makeActor({ fateValue: 1 })))).toBe(true);
        expect(actorHasFatePoints(asActor(makeActor({ fateValue: 5 })))).toBe(true);
    });

    it('getAgilityBonus reads characteristics.agility.bonus, defaults to 0', () => {
        expect(getAgilityBonus(asActor(makeActor({ agilityBonus: 4 })))).toBe(4);
        expect(getAgilityBonus(asActor(makeActor({})))).toBe(0);
    });
});

describe('canSpendRightStuff', () => {
    it('requires both Ace role and at least one Fate point', () => {
        expect(canSpendRightStuff(asActor(makeActor({ role: 'ace', fateValue: 1 })))).toBe(true);
        expect(canSpendRightStuff(asActor(makeActor({ role: 'ace', fateValue: 0 })))).toBe(false);
        expect(canSpendRightStuff(asActor(makeActor({ role: 'assassin', fateValue: 3 })))).toBe(false);
    });
});

/* -------------------------------------------- */
/*  Pure resolution                             */
/* -------------------------------------------- */

describe('resolveRightStuff', () => {
    it('produces DoS equal to the Agility bonus on Operate', () => {
        const r = resolveRightStuff('operate', 4);
        expect(r.skill).toBe('operate');
        expect(r.degrees).toBe(4);
        expect(r.hasDegrees).toBe(true);
    });

    it('produces DoS equal to the Agility bonus on Survival', () => {
        const r = resolveRightStuff('survival', 5);
        expect(r.skill).toBe('survival');
        expect(r.degrees).toBe(5);
    });

    it('clamps negative or fractional Agility bonus to a non-negative integer', () => {
        expect(resolveRightStuff('operate', -2).degrees).toBe(0);
        expect(resolveRightStuff('operate', 3.7).degrees).toBe(3);
    });

    it('reports hasDegrees=false when the auto-success grants 0 DoS', () => {
        expect(resolveRightStuff('operate', 0).hasDegrees).toBe(false);
    });
});

/* -------------------------------------------- */
/*  Runtime spend                               */
/* -------------------------------------------- */

describe('spendRightStuff', () => {
    interface RightStuffCardContext {
        actorName?: string;
        skillRaw?: string;
        degrees?: number;
        gameSystem?: string;
    }

    let chat: ChatRuntimeHandle;

    beforeEach(() => {
        chat = stubChatRuntime({
            renderTemplate: (_tpl, context) => {
                const ctx = context as RightStuffCardContext;
                return `<card actor="${String(ctx.actorName)}" skill="${String(ctx.skillRaw)}" dos="${String(ctx.degrees)}" sys="${String(ctx.gameSystem)}">`;
            },
        });
    });

    afterEach(() => {
        chat.restore();
        vi.restoreAllMocks();
    });

    it('deducts one Fate point and emits an auto-success card', async () => {
        const actor = makeActor({ role: 'ace', fateValue: 3, agilityBonus: 4 });
        const res = await spendRightStuff(asActor(actor), 'operate');

        expect(res).not.toBeNull();
        expect(res?.degrees).toBe(4);

        expect(actor.update).toHaveBeenCalledTimes(1);
        expect(actor.update.mock.calls[0]?.[0]).toEqual({ system: { fate: { value: 2 } } });
        expect(chat.lastContent()).toContain('skill="operate"');
        expect(chat.lastContent()).toContain('dos="4"');
    });

    it('refuses to spend when the actor is not an Ace', async () => {
        const actor = makeActor({ role: 'assassin', fateValue: 3, agilityBonus: 4 });
        const res = await spendRightStuff(asActor(actor), 'operate');
        expect(res).toBeNull();
        expect(actor.update).not.toHaveBeenCalled();
        expect(chat.lastContent()).toBeNull();
    });

    it('refuses to spend when the actor has no Fate points', async () => {
        const actor = makeActor({ role: 'ace', fateValue: 0, agilityBonus: 4 });
        const res = await spendRightStuff(asActor(actor), 'operate');
        expect(res).toBeNull();
        expect(actor.update).not.toHaveBeenCalled();
    });

    it('refuses to spend on a non-applicable skill', async () => {
        const actor = makeActor({ role: 'ace', fateValue: 3, agilityBonus: 4 });
        // The runtime guard rejects non-applicable skills; cast through string narrowed to the parameter union.
        const res = await spendRightStuff(asActor(actor), 'dodge' as 'operate' | 'survival');
        expect(res).toBeNull();
    });

    it('propagates the actor game system onto the chat card for per-system theming', async () => {
        const actor = makeActor({ gameSystem: 'rt', role: 'ace', fateValue: 2, agilityBonus: 3 });
        await spendRightStuff(asActor(actor), 'survival');
        expect(chat.lastContent()).toContain('sys="rt"');
        expect(chat.lastContent()).toContain('skill="survival"');
    });

    it('still spends when Agility bonus is 0 — auto-success itself is the value', async () => {
        const actor = makeActor({ role: 'ace', fateValue: 1, agilityBonus: 0 });
        const res = await spendRightStuff(asActor(actor), 'operate');
        expect(res).not.toBeNull();
        expect(res?.degrees).toBe(0);
        expect(res?.hasDegrees).toBe(false);
        expect(chat.lastContent()).toContain('dos="0"');
    });
});
