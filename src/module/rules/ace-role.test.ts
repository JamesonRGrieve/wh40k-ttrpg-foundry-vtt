import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import {
    actorHasFatePoints,
    actorIsAce,
    canSpendRightStuff,
    getAgilityBonus,
    isRightStuffSkill,
    isRightStuffSystem,
    resolveRightStuff,
    spendRightStuff,
} from './ace-role.ts';

/**
 * Contract tests for the Ace role's Right Stuff Fate spend
 * (without.md L948-L980, #100). Covers detection (role + system gate),
 * pure resolution (DoS = AgB), and the runtime spend (fate deduction
 * + chat card with the per-system anchor).
 */

/* -------------------------------------------- */
/*  System gating (homologation)                */
/* -------------------------------------------- */

describe('isRightStuffSystem', () => {
    it('enables Right Stuff for the six FFG-family systems', () => {
        for (const sys of ['dh1e', 'dh2e', 'bc', 'dw', 'ow', 'rt']) {
            expect(isRightStuffSystem(sys)).toBe(true);
        }
    });

    it('excludes Imperium Maledictum (no Without "Ace" role entry)', () => {
        expect(isRightStuffSystem('im')).toBe(false);
    });

    it('excludes an undefined game system', () => {
        expect(isRightStuffSystem(undefined)).toBe(false);
    });
});

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

function makeActor(opts: { gameSystem?: string; role?: string | undefined; fateValue?: number; agilityBonus?: number }): WH40KBaseActorDocument {
    const update = vi.fn(async () => undefined);
    return {
        name: 'Vex Tannor',
        system: {
            gameSystem: opts.gameSystem ?? 'dh2e',
            originPath: { role: opts.role ?? '' },
            fate: { value: opts.fateValue ?? 0 } as FakeFate,
            characteristics: { agility: { bonus: opts.agilityBonus ?? 0 } },
        },
        update,
    } as unknown as WH40KBaseActorDocument;
}

describe('actorIsAce', () => {
    it('matches a DH2 actor whose role is "Ace"', () => {
        expect(actorIsAce(makeActor({ role: 'Ace' }))).toBe(true);
        expect(actorIsAce(makeActor({ role: 'ace' }))).toBe(true);
    });

    it('matches when the role name has descriptive prefix / suffix (word-boundary, e.g. "Tank Ace")', () => {
        expect(actorIsAce(makeActor({ role: 'Tank Ace' }))).toBe(true);
        expect(actorIsAce(makeActor({ role: 'Ace Operator' }))).toBe(true);
        expect(actorIsAce(makeActor({ role: 'Ace (Pilot)' }))).toBe(true);
    });

    it('rejects when the role is empty / unrelated', () => {
        expect(actorIsAce(makeActor({ role: '' }))).toBe(false);
        expect(actorIsAce(makeActor({ role: 'Assassin' }))).toBe(false);
        expect(actorIsAce(makeActor({ role: 'Acolyte' }))).toBe(false);
    });

    it('rejects on Imperium Maledictum even with role "Ace" (homologation gate)', () => {
        expect(actorIsAce(makeActor({ gameSystem: 'im', role: 'Ace' }))).toBe(false);
    });

    it('matches across the other five FFG systems', () => {
        for (const sys of ['dh1e', 'bc', 'dw', 'ow', 'rt']) {
            expect(actorIsAce(makeActor({ gameSystem: sys, role: 'Ace' }))).toBe(true);
        }
    });
});

describe('actorHasFatePoints / getAgilityBonus', () => {
    it('actorHasFatePoints reflects fate.value > 0', () => {
        expect(actorHasFatePoints(makeActor({ fateValue: 0 }))).toBe(false);
        expect(actorHasFatePoints(makeActor({ fateValue: 1 }))).toBe(true);
        expect(actorHasFatePoints(makeActor({ fateValue: 5 }))).toBe(true);
    });

    it('getAgilityBonus reads characteristics.agility.bonus, defaults to 0', () => {
        expect(getAgilityBonus(makeActor({ agilityBonus: 4 }))).toBe(4);
        expect(getAgilityBonus(makeActor({}))).toBe(0);
    });
});

describe('canSpendRightStuff', () => {
    it('requires both Ace role and at least one Fate point', () => {
        expect(canSpendRightStuff(makeActor({ role: 'Ace', fateValue: 1 }))).toBe(true);
        expect(canSpendRightStuff(makeActor({ role: 'Ace', fateValue: 0 }))).toBe(false);
        expect(canSpendRightStuff(makeActor({ role: 'Assassin', fateValue: 3 }))).toBe(false);
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
                    renderTemplate: vi.fn(
                        async (_tpl: string, ctx: Record<string, unknown>) =>
                            `<card actor="${String(ctx['actorName'])}" skill="${String(ctx['skillRaw'])}" dos="${String(ctx['degrees'])}" sys="${String(
                                ctx['gameSystem'],
                            )}">`,
                    ),
                },
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('deducts one Fate point and emits an auto-success card', async () => {
        const actor = makeActor({ role: 'Ace', fateValue: 3, agilityBonus: 4 });
        const res = await spendRightStuff(actor, 'operate');

        expect(res).not.toBeNull();
        expect(res?.degrees).toBe(4);

        const update = (actor as unknown as { update: ReturnType<typeof vi.fn> }).update;
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0]?.[0]).toEqual({ system: { fate: { value: 2 } } });
        expect(createdContent).toContain('skill="operate"');
        expect(createdContent).toContain('dos="4"');
    });

    it('refuses to spend when the actor is not an Ace', async () => {
        const actor = makeActor({ role: 'Assassin', fateValue: 3, agilityBonus: 4 });
        const res = await spendRightStuff(actor, 'operate');
        expect(res).toBeNull();
        const update = (actor as unknown as { update: ReturnType<typeof vi.fn> }).update;
        expect(update).not.toHaveBeenCalled();
        expect(createdContent).toBeNull();
    });

    it('refuses to spend when the actor has no Fate points', async () => {
        const actor = makeActor({ role: 'Ace', fateValue: 0, agilityBonus: 4 });
        const res = await spendRightStuff(actor, 'operate');
        expect(res).toBeNull();
        const update = (actor as unknown as { update: ReturnType<typeof vi.fn> }).update;
        expect(update).not.toHaveBeenCalled();
    });

    it('refuses to spend on a non-applicable skill', async () => {
        const actor = makeActor({ role: 'Ace', fateValue: 3, agilityBonus: 4 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally exercising the runtime guard
        const res = await spendRightStuff(actor, 'dodge' as any);
        expect(res).toBeNull();
    });

    it('propagates the actor game system onto the chat card for per-system theming', async () => {
        const actor = makeActor({ gameSystem: 'rt', role: 'Ace', fateValue: 2, agilityBonus: 3 });
        await spendRightStuff(actor, 'survival');
        expect(createdContent).toContain('sys="rt"');
        expect(createdContent).toContain('skill="survival"');
    });

    it('refuses on Imperium Maledictum even when role is "Ace"', async () => {
        const actor = makeActor({ gameSystem: 'im', role: 'Ace', fateValue: 2, agilityBonus: 3 });
        const res = await spendRightStuff(actor, 'operate');
        expect(res).toBeNull();
    });

    it('still spends when Agility bonus is 0 — auto-success itself is the value', async () => {
        const actor = makeActor({ role: 'Ace', fateValue: 1, agilityBonus: 0 });
        const res = await spendRightStuff(actor, 'operate');
        expect(res).not.toBeNull();
        expect(res?.degrees).toBe(0);
        expect(res?.hasDegrees).toBe(false);
        expect(createdContent).toContain('dos="0"');
    });
});
