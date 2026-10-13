import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    closeEvasionPrompt,
    defenderWeaponsCanParry,
    type EvasionOutcome,
    type EvasionPromptContext,
    evasionGateFor,
    evasionOutcomeSummary,
    evasionRecipients,
    findEvasionOutcome,
    forcedAttackEvasion,
    openAttackEvasion,
    readEvasionOutcome,
    readEvasionPrompt,
    resolvedAttackEvasion,
} from './evasion-flow.ts';

/** Echo localiser: a format renders `key{param=value,…}` so the test can see what was asked for. */
function echoI18n(): { localize: (key: string) => string; format: (key: string, data: Record<string, string>) => string } {
    return {
        localize: (key: string) => key,
        format: (key: string, data: Record<string, string>) =>
            `${key}{${Object.entries(data)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')}}`,
    };
}

const PROMPT: EvasionPromptContext = {
    attackId: 'atk-1',
    attackerName: 'Heretic',
    weaponName: 'Autogun',
    defenderUuid: 'Actor.def',
    defenderName: 'Lucius',
    action: 'Full Auto Burst',
    hitsLanded: 4,
    isMeleeAttack: false,
    storm: false,
    twinLinked: false,
    attackerPreventsParry: false,
    parryPenalty: 0,
};

const OUTCOME: EvasionOutcome = {
    attackId: 'atk-1',
    defenderName: 'Lucius',
    skill: 'dodge',
    success: true,
    hitsLanded: 4,
    negated: 3,
    remaining: 1,
    parts: [
        { key: 'hit', value: 1 },
        { key: 'degrees', value: 2 },
    ],
};

beforeEach(() => {
    vi.stubGlobal('game', { i18n: echoI18n(), combat: null, messages: [] });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('flag payloads (#414)', () => {
    it('a prompt and an outcome survive the round trip through message flags', () => {
        expect(readEvasionPrompt(JSON.parse(JSON.stringify(PROMPT)))).toEqual(PROMPT);
        expect(readEvasionOutcome(JSON.parse(JSON.stringify(OUTCOME)))).toEqual(OUTCOME);
    });

    it('anything else reads as no payload', () => {
        expect(readEvasionPrompt(undefined)).toBeNull();
        expect(readEvasionPrompt({ attackId: 'x' })).toBeNull();
        expect(readEvasionOutcome({ attackId: 'x', negated: 'two' })).toBeNull();
    });

    it('drops unknown negation parts rather than trusting them', () => {
        const outcome = readEvasionOutcome({
            ...OUTCOME,
            parts: [
                { key: 'hit', value: 1 },
                { key: 'bogus', value: 9 },
            ],
        });
        expect(outcome?.parts).toEqual([{ key: 'hit', value: 1 }]);
    });
});

describe('who answers', () => {
    it('the defender’s owners and every GM, nobody else', () => {
        const users = [
            { id: 'gm', isGM: true },
            { id: 'owner', isGM: false },
            { id: 'other', isGM: false },
        ];
        expect(evasionRecipients(users, (user) => user.id === 'owner')).toEqual(['gm', 'owner']);
    });
});

describe('the defender’s state', () => {
    it('out of combat there is no Reaction budget; a grapple flag closes the window', () => {
        expect(evasionGateFor({ id: 'a', flags: {} })).toEqual({ reactionRemaining: null, actionLimit: 'none', inGrapple: false });
        expect(evasionGateFor({ id: 'a', flags: { 'wh40k-rpg': { grapple: { state: 'controlled' } } } }).inGrapple).toBe(true);
        expect(evasionGateFor({ id: 'a', flags: { 'wh40k-rpg': { grapple: { state: 'none' } } } }).inGrapple).toBe(false);
    });

    it('lists whether each equipped melee weapon can parry', () => {
        const items = [
            { isMelee: true, equipped: true, system: { special: new Set(['unwieldy']) } },
            { isMelee: true, equipped: true, system: { special: new Set(['balanced']) } },
            { isMelee: true, equipped: false, system: { special: new Set<string>() } },
            { isMelee: false, equipped: true, system: { special: new Set<string>() } },
        ];
        expect(defenderWeaponsCanParry(items)).toEqual([false, true]);
    });
});

describe('card text', () => {
    it('states a partial negation, a full evasion, a failure and a declined hit', () => {
        expect(evasionOutcomeSummary(OUTCOME)).toBe('WH40K.Evasion.Summary.Negated{defender=Lucius,skill=WH40K.Combat.AttemptDodge,negated=3,landed=4}');
        expect(evasionOutcomeSummary({ ...OUTCOME, negated: 4, remaining: 0 })).toBe(
            'WH40K.Evasion.Summary.Evaded{defender=Lucius,skill=WH40K.Combat.AttemptDodge}',
        );
        expect(evasionOutcomeSummary({ ...OUTCOME, success: false, negated: 0, remaining: 4 })).toBe(
            'WH40K.Evasion.Summary.Failed{defender=Lucius,skill=WH40K.Combat.AttemptDodge}',
        );
        expect(evasionOutcomeSummary({ ...OUTCOME, skill: null, success: false, negated: 0, remaining: 4 })).toBe(
            'WH40K.Evasion.Summary.Declined{defender=Lucius}',
        );
    });

    it('a resolved window renders each part as a hoverable row naming its rule', () => {
        const evasion = resolvedAttackEvasion(OUTCOME);
        expect(evasion.status).toBe('resolved');
        expect(evasion.fullyEvaded).toBe(false);
        expect(evasion.rows.map((row) => [row.label, row.value])).toEqual([
            ['WH40K.Evasion.Part.Hit', 1],
            ['WH40K.Evasion.Part.Degrees', 2],
        ]);
        const tooltip = JSON.parse(evasion.rows[1]?.tooltipData ?? '{}') as { sources: { name: string }[] };
        expect(tooltip.sources[0]?.name).toBe('WH40K.Evasion.Source.Degrees');
        expect(resolvedAttackEvasion({ ...OUTCOME, negated: 4, remaining: 0 }).fullyEvaded).toBe(true);
    });

    it('an open window is pending, or blocked with the reason; the GM can force past it', () => {
        expect(openAttackEvasion('Lucius', 2, null).status).toBe('pending');
        const blocked = openAttackEvasion('Lucius', 2, 'WH40K.Combat.ReactionUsed');
        expect(blocked.status).toBe('blocked');
        expect(blocked.summary).toBe('WH40K.Evasion.Summary.Blocked{defender=Lucius,reason=WH40K.Combat.ReactionUsed}');
        expect(forcedAttackEvasion(openAttackEvasion('Lucius', 2, null)).status).toBe('forced');
    });
});

describe('answered prompts', () => {
    it('finds the outcome already posted for an attack', () => {
        const message = { getFlag: (_scope: string, key: string) => (key === 'evasionOutcome' ? OUTCOME : undefined) };
        vi.stubGlobal('game', { i18n: echoI18n(), messages: [message] });
        expect(findEvasionOutcome('atk-1')?.negated).toBe(3);
        expect(findEvasionOutcome('atk-2')).toBeNull();
    });

    it('closes the prompt for that attack and leaves others open', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <div data-evasion-prompt="atk-1"><button>Dodge</button><p data-evasion-status hidden></p></div>
            <div data-evasion-prompt="atk-2"><button>Dodge</button></div>`;
        closeEvasionPrompt(root, 'atk-1', 'answered');
        const buttons = root.querySelectorAll('button');
        expect(buttons.item(0).disabled).toBe(true);
        expect(buttons.item(1).disabled).toBe(false);
        expect(root.querySelector<HTMLElement>('[data-evasion-status]')?.hidden).toBe(false);
    });
});
