import { describe, expect, it } from 'vitest';
import {
    buildExorcismCard,
    buildSummoningCard,
    daemonologyLoreTotal,
    exorcismFactors,
    exorcistUpdate,
    findDaemonologyLore,
    parseExorcismForm,
    parseSummoningForm,
    runExorcism,
    runSummoning,
    toCardTest,
    type RitualActorSystem,
    type RitualDice,
} from './daemonology-actions';

/** Exorcism orchestration (#83 — DH2 Enemies Beyond p. 71). */

function actor(
    overrides: Partial<{ lore: number | null; willpower: number; fatigue: number; fatigueMax: number; corruption: number }> = {},
): RitualActorSystem {
    const lore = overrides.lore === undefined ? 45 : overrides.lore;
    return {
        characteristics: { willpower: { total: overrides.willpower ?? 50, bonus: 5 }, toughness: { total: 40, bonus: 4 } },
        skills: {
            forbiddenLore: {
                current: 20,
                entries:
                    lore === null
                        ? [{ name: 'Xenos', current: 41 }]
                        : [
                              { name: 'Xenos', current: 41 },
                              { name: '', specialization: 'Daemonology', current: lore },
                          ],
            },
        },
        fatigue: { value: overrides.fatigue ?? 0, max: overrides.fatigueMax ?? 4 },
        corruption: overrides.corruption ?? 12,
    };
}

/** Scripted dice: each formula pops the next value from its own queue. */
function scripted(queues: Partial<Record<'1d100' | '1d10' | '1d5', number[]>>): RitualDice & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        async roll(formula): Promise<number> {
            calls.push(formula);
            const next = queues[formula]?.shift();
            if (next === undefined) throw new Error(`no scripted ${formula}`);
            return Promise.resolve(next);
        },
    };
}

const NO_MODIFIERS = { modifiers: [], daemonWillpowerBonus: 1, possessedCorruptionBonus: 1, circumstanceLabel: '', circumstanceValue: 0 } as const;

describe('Forbidden Lore (Daemonology) lookup', () => {
    it('finds the row by name or specialisation, case-insensitively', () => {
        expect(findDaemonologyLore(actor())?.current).toBe(45);
        expect(daemonologyLoreTotal(actor())).toBe(45);
    });

    it('falls back to the untrained parent skill', () => {
        expect(findDaemonologyLore(actor({ lore: null }))).toBeUndefined();
        expect(daemonologyLoreTotal(actor({ lore: null }))).toBe(20);
    });

    // A DH2 NPC's system has no PC skill rows; the NPC sheet shares this lookup, and
    // reading `skills.forbiddenLore` off it threw, so a blank DH2 NPC's sheet never rendered.
    it('finds nothing, and does not throw, on a system with no skill rows (an NPC)', () => {
        const { skills: _rows, ...npc } = actor();
        expect(findDaemonologyLore(npc)).toBeUndefined();
        expect(daemonologyLoreTotal(npc)).toBe(0);
    });
});

describe('parseExorcismForm', () => {
    it('reads the toggles, threshold inputs and GM row; drops unknown ids', () => {
        const data = new FormData();
        data.append('modifiers', 'SACRED_GROUND');
        data.append('modifiers', 'TRUE_NAME');
        data.append('modifiers', 'NOT_A_ROW');
        data.set('daemonWillpowerBonus', '6');
        data.set('possessedCorruptionBonus', '-2');
        data.set('circumstanceLabel', ' Relic ');
        data.set('circumstanceValue', '-15');
        expect(parseExorcismForm(data)).toEqual({
            modifiers: ['SACRED_GROUND', 'TRUE_NAME'],
            daemonWillpowerBonus: 6,
            possessedCorruptionBonus: 0,
            circumstanceLabel: 'Relic',
            circumstanceValue: -15,
        });
    });

    it('defaults blank fields to zero', () => {
        expect(parseExorcismForm(new FormData())).toMatchObject({ modifiers: [], daemonWillpowerBonus: 0, circumstanceValue: 0 });
    });
});

describe('runExorcism', () => {
    it('lore DoS feed +5 each into every Mastery attempt and DoS accumulate past the threshold', async () => {
        // Lore 45 rolled 24 → 3 DoS (+15). Attempt target 50 − 30 + 15 = 35. Threshold 1 + 1 = 2.
        const dice = scripted({ '1d100': [24, 20, 30, 50], '1d5': [3, 2] });
        const outcome = await runExorcism(actor(), { toughness: 40 }, NO_MODIFIERS, dice);
        expect(outcome.attempt.target).toBe(35);
        expect(outcome.state.status).toBe('banished');
        expect(outcome.state.totalDos).toBe(3); // 20 vs 35 → 2, 30 vs 35 → 1
        expect(outcome.state.hours).toBe(5);
        expect(outcome.hostTest).toMatchObject({ roll: 50, target: 40, success: false });
        expect(outcome.corruptionGained).toBe(0);
    });

    it('collapse costs 1d10 Corruption and skips the host test', async () => {
        // Lore fails (99). Target 50 − 30 = 20. 80 vs 20 → 7 DoF > Fatigue 4.
        const dice = scripted({ '1d100': [99, 80], '1d5': [1], '1d10': [6] });
        const outcome = await runExorcism(actor(), { toughness: 40 }, NO_MODIFIERS, dice);
        expect(outcome.state.status).toBe('collapsed');
        expect(outcome.corruptionGained).toBe(6);
        expect(outcome.hostTest).toBeNull();
        expect(exorcistUpdate(actor(), outcome)).toEqual({ 'system.fatigue.value': 7, 'system.corruption': 18 });
    });

    it('rolls no survival test when no host is targeted', async () => {
        const dice = scripted({ '1d100': [99, 1, 1, 1], '1d5': [1, 1, 1] });
        const outcome = await runExorcism(actor(), null, NO_MODIFIERS, dice);
        expect(outcome.state.status).toBe('banished');
        expect(outcome.hostTest).toBeNull();
        expect(exorcistUpdate(actor(), outcome)).toEqual({});
    });

    it('applies Table 2–21 rows and the GM row', () => {
        const factors = exorcismFactors({ ...NO_MODIFIERS, modifiers: ['WEAK_VEIL'], circumstanceLabel: 'Relic', circumstanceValue: 5 });
        expect(factors.map((f) => [f.id, f.modifier])).toEqual([
            ['weak-veil', -10],
            ['circumstance', 5],
        ]);
    });
});

describe('card shaping', () => {
    const localize = (key: string): string => `«${key}»`;

    it('localises each sourced row and carries a parseable tooltip payload', () => {
        const card = toCardTest(
            {
                base: 50,
                components: [{ id: 'true-name', labelKey: 'WH40K.Daemonology.Factor.TrueName', value: 30 }],
                rawModifierTotal: 30,
                modifierTotal: 30,
                capFired: false,
                target: 80,
            },
            'WP',
            localize,
        );
        expect(card.modifierSources[0]?.label).toBe('«WH40K.Daemonology.Factor.TrueName»');
        expect(JSON.parse(card.modifierSources[0]?.tooltipData ?? '{}')).toEqual({
            title: '«WH40K.Daemonology.Factor.TrueName»',
            sources: [{ name: '«WH40K.Daemonology.Factor.TrueName»', value: 30 }],
        });
        expect(card.modifiedTarget).toBe(80);
    });

    it('prefers a GM row label over its key', () => {
        const card = toCardTest(
            {
                base: 10,
                components: [{ id: 'circumstance', labelKey: 'k', label: 'Relic', value: 5 }],
                rawModifierTotal: 5,
                modifierTotal: 5,
                capFired: false,
                target: 15,
            },
            'WP',
            localize,
        );
        expect(card.modifierSources[0]?.label).toBe('Relic');
    });

    it('numbers the attempts and flags the outcome', async () => {
        const dice = scripted({ '1d100': [99, 80], '1d5': [1], '1d10': [6] });
        const outcome = await runExorcism(actor(), null, NO_MODIFIERS, dice);
        const card = buildExorcismCard({ exorcistName: 'Ana', hostName: null, outcome, localize, gameSystem: 'dh2', hostCleared: false });
        expect(card).toMatchObject({ mode: 'exorcism', collapsed: true, banished: false, corruptionGained: 6, threshold: 2 });
        expect(card.attempts[0]?.number).toBe(1);
    });
});

/** Summoning orchestration (#80 — DH2 Enemies Beyond p. 59). */
describe('parseSummoningForm', () => {
    it('reads the checkboxes, derives the Daemon WP bonus and the two GM rows', () => {
        const data = new FormData();
        data.set('hasTrueName', 'on');
        data.set('daemonWillpower', '47');
        data.set('loreCircumstanceLabel', 'Summoning power');
        data.set('loreCircumstanceValue', '30');
        data.set('masteryCircumstanceValue', '-10');
        expect(parseSummoningForm(data)).toEqual({
            hasTrueName: true,
            servesPatron: false,
            daemonWillpower: 47,
            daemonWillpowerBonus: 4,
            loreCircumstanceLabel: 'Summoning power',
            loreCircumstanceValue: 30,
            masteryCircumstanceLabel: '',
            masteryCircumstanceValue: -10,
        });
    });
});

describe('runSummoning', () => {
    const inputs = {
        hasTrueName: true,
        servesPatron: false,
        daemonWillpower: 40,
        daemonWillpowerBonus: 4,
        loreCircumstanceLabel: '',
        loreCircumstanceValue: 0,
        masteryCircumstanceLabel: '',
        masteryCircumstanceValue: 0,
    };

    it('a failed ritual stops before the Mastery test', async () => {
        // Lore 45 − 60 + 30 = 15; roll 50 fails.
        const dice = scripted({ '1d100': [50] });
        const outcome = await runSummoning(actor(), inputs, dice);
        expect(outcome.lore.target).toBe(15);
        expect(outcome.loreTest.success).toBe(false);
        expect(outcome.contest).toBeNull();
        expect(dice.calls).toEqual(['1d100']);
        expect(buildSummoningCard({ summonerName: 'Ana', daemonName: null, outcome, localize: (k) => k, gameSystem: 'dh2' })).toMatchObject({
            contest: null,
            summonerWon: false,
        });
    });

    it('a successful ritual rolls the opposed Mastery test and binds on a win', async () => {
        // Mastery 50 − 30 + 30 = 50; summoner 15 → 4 DoS, Daemon 60 vs 40 fails.
        const dice = scripted({ '1d100': [5, 15, 60] });
        const outcome = await runSummoning(actor(), inputs, dice);
        expect(outcome.mastery.target).toBe(50);
        expect(outcome.contest).toMatchObject({ winner: 'summoner', bound: true, boundHours: 4 });
        expect(buildSummoningCard({ summonerName: 'Ana', daemonName: 'Ka’zhar', outcome, localize: (k) => k, gameSystem: 'dh2' })).toMatchObject({
            mode: 'summoning',
            summonerWon: true,
            daemonWon: false,
        });
    });
});
