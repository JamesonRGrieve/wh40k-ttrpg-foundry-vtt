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

interface FakeAceActor {
    name: string;
    system: {
        gameSystem: string;
        originPath: { role: string };
        fate: FakeFate;
        characteristics: { agility: { bonus: number } };
    };
    update: ReturnType<typeof vi.fn>;
}

function makeActor(opts: { gameSystem?: string; role?: string | undefined; fateValue?: number; agilityBonus?: number }): FakeAceActor {
    return {
        name: 'Vex Tannor',
        system: {
            gameSystem: opts.gameSystem ?? 'dh2e',
            originPath: { role: opts.role ?? '' },
            fate: { value: opts.fateValue ?? 0 },
            characteristics: { agility: { bonus: opts.agilityBonus ?? 0 } },
        },
        update: vi.fn(() => undefined),
    };
}

/** Cast a FakeAceActor to the Foundry WH40KBaseActorDocument surface the rule helpers consume. */
function asActor(a: FakeAceActor): WH40KBaseActorDocument {
    // eslint-disable-next-line no-restricted-syntax -- boundary: FakeAceActor is a structural subset of Foundry's WH40KBaseActorDocument; the rule helpers only read the listed fields
    return a as unknown as WH40KBaseActorDocument;
}

describe('actorIsAce', () => {
    it('matches a DH2 actor whose role is "Ace"', () => {
        expect(actorIsAce(asActor(makeActor({ role: 'Ace' })))).toBe(true);
        expect(actorIsAce(asActor(makeActor({ role: 'ace' })))).toBe(true);
    });

    it('matches when the role name has descriptive prefix / suffix (word-boundary, e.g. "Tank Ace")', () => {
        expect(actorIsAce(asActor(makeActor({ role: 'Tank Ace' })))).toBe(true);
        expect(actorIsAce(asActor(makeActor({ role: 'Ace Operator' })))).toBe(true);
        expect(actorIsAce(asActor(makeActor({ role: 'Ace (Pilot)' })))).toBe(true);
    });

    it('rejects when the role is empty / unrelated', () => {
        expect(actorIsAce(asActor(makeActor({ role: '' })))).toBe(false);
        expect(actorIsAce(asActor(makeActor({ role: 'Assassin' })))).toBe(false);
        expect(actorIsAce(asActor(makeActor({ role: 'Acolyte' })))).toBe(false);
    });

    it('rejects on Imperium Maledictum even with role "Ace" (homologation gate)', () => {
        expect(actorIsAce(asActor(makeActor({ gameSystem: 'im', role: 'Ace' })))).toBe(false);
    });

    it('matches across the other five FFG systems', () => {
        for (const sys of ['dh1e', 'bc', 'dw', 'ow', 'rt']) {
            expect(actorIsAce(asActor(makeActor({ gameSystem: sys, role: 'Ace' })))).toBe(true);
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
        expect(canSpendRightStuff(asActor(makeActor({ role: 'Ace', fateValue: 1 })))).toBe(true);
        expect(canSpendRightStuff(asActor(makeActor({ role: 'Ace', fateValue: 0 })))).toBe(false);
        expect(canSpendRightStuff(asActor(makeActor({ role: 'Assassin', fateValue: 3 })))).toBe(false);
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
            create: vi.fn((data: { content: string }) => {
                createdContent = data.content;
                return data;
            }),
            getWhisperRecipients: () => [],
        });
        interface RightStuffCardContext {
            actorName?: string;
            skillRaw?: string;
            degrees?: number;
            gameSystem?: string;
        }
        vi.stubGlobal('foundry', {
            applications: {
                handlebars: {
                    renderTemplate: vi.fn(
                        (_tpl: string, ctx: RightStuffCardContext) =>
                            `<card actor="${String(ctx.actorName)}" skill="${String(ctx.skillRaw)}" dos="${String(ctx.degrees)}" sys="${String(
                                ctx.gameSystem,
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
        const res = await spendRightStuff(asActor(actor), 'operate');

        expect(res).not.toBeNull();
        expect(res?.degrees).toBe(4);

        expect(actor.update).toHaveBeenCalledTimes(1);
        expect(actor.update.mock.calls[0]?.[0]).toEqual({ system: { fate: { value: 2 } } });
        expect(createdContent).toContain('skill="operate"');
        expect(createdContent).toContain('dos="4"');
    });

    it('refuses to spend when the actor is not an Ace', async () => {
        const actor = makeActor({ role: 'Assassin', fateValue: 3, agilityBonus: 4 });
        const res = await spendRightStuff(asActor(actor), 'operate');
        expect(res).toBeNull();
        expect(actor.update).not.toHaveBeenCalled();
        expect(createdContent).toBeNull();
    });

    it('refuses to spend when the actor has no Fate points', async () => {
        const actor = makeActor({ role: 'Ace', fateValue: 0, agilityBonus: 4 });
        const res = await spendRightStuff(asActor(actor), 'operate');
        expect(res).toBeNull();
        expect(actor.update).not.toHaveBeenCalled();
    });

    it('refuses to spend on a non-applicable skill', async () => {
        const actor = makeActor({ role: 'Ace', fateValue: 3, agilityBonus: 4 });
        // The runtime guard rejects non-applicable skills; cast through string narrowed to the parameter union.
        const res = await spendRightStuff(asActor(actor), 'dodge' as 'operate' | 'survival');
        expect(res).toBeNull();
    });

    it('propagates the actor game system onto the chat card for per-system theming', async () => {
        const actor = makeActor({ gameSystem: 'rt', role: 'Ace', fateValue: 2, agilityBonus: 3 });
        await spendRightStuff(asActor(actor), 'survival');
        expect(createdContent).toContain('sys="rt"');
        expect(createdContent).toContain('skill="survival"');
    });

    it('refuses on Imperium Maledictum even when role is "Ace"', async () => {
        const actor = makeActor({ gameSystem: 'im', role: 'Ace', fateValue: 2, agilityBonus: 3 });
        const res = await spendRightStuff(asActor(actor), 'operate');
        expect(res).toBeNull();
    });

    it('still spends when Agility bonus is 0 — auto-success itself is the value', async () => {
        const actor = makeActor({ role: 'Ace', fateValue: 1, agilityBonus: 0 });
        const res = await spendRightStuff(asActor(actor), 'operate');
        expect(res).not.toBeNull();
        expect(res?.degrees).toBe(0);
        expect(res?.hasDegrees).toBe(false);
        expect(createdContent).toContain('dos="0"');
    });
});
