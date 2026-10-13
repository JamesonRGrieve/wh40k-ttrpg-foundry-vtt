/**
 * Daemonology ritual orchestration — Exorcism (#83) and Summoning (#80),
 * DH2 Enemies Beyond pp. 59 and 71.
 *
 * The rules (targets, thresholds, the extended-test step, the opposed Mastery
 * contest) live in `rules/exorcism.ts` / `rules/summoning-ritual.ts`. This
 * module rolls the dice through an injected {@link RitualDice}, drives those
 * rules to a settled outcome, and shapes the chat-card context: every test
 * prints `base ± each sourced component = target` through the shared
 * `chat/partial/modifier-breakdown.hbs` rows, each hoverable via the
 * `wh40k-tooltip` "modifier" type.
 *
 * The dialog (`applications/prompts/daemonology-ritual-dialog.ts`) gathers the
 * inputs, calls these, applies the actor writes and posts the card.
 */

import { prepareModifierTooltipData } from '../applications/components/wh40k-tooltip.ts';
import { circumstanceFactor, type DaemonicMasteryFactor, type RitualTestComposition } from '../rules/daemonic-mastery.ts';
import {
    EXORCISM_MODIFIERS,
    getExorcismThreshold,
    getHostSurvivalTarget,
    prepareExorcismAttempt,
    prepareExorcismLoreTest,
    startExorcism,
    stepExorcism,
    type ExorcismModifierId,
    type ExorcismState,
} from '../rules/exorcism.ts';
import { prepareSummoningRitual, resolveMasteryContest, resolveTest, type MasteryContestResult, type TestOutcome } from '../rules/summoning-ritual.ts';

/** Dice source: one evaluated formula total per call. */
export interface RitualDice {
    roll: (formula: '1d100' | '1d10' | '1d5') => Promise<number>;
}

/** Translate a langpack key. */
export type Localize = (key: string) => string;

/* -------------------------------------------- */
/*  Actor surface                               */
/* -------------------------------------------- */

/** One specialist-skill row as the character DataModel exposes it. */
interface SpecialistEntry {
    readonly name?: string;
    readonly specialization?: string;
    readonly current: number;
}

/** The parts of a character the rituals read. */
export interface RitualActorSystem {
    readonly characteristics: Readonly<Record<string, { readonly total: number; readonly bonus: number }>>;
    readonly skills: Readonly<Record<string, { readonly current: number; readonly entries?: readonly SpecialistEntry[] | undefined }>>;
    readonly fatigue: { readonly value: number; readonly max: number };
    readonly corruption: number;
}

/** A characteristic's total and bonus (0 when the actor lacks it). */
export function ritualCharacteristic(system: RitualActorSystem, key: 'willpower' | 'toughness'): { total: number; bonus: number } {
    const characteristic = system.characteristics[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types characteristics[key] as possibly undefined, tsconfig.test.json does not
    return characteristic === undefined ? { total: 0, bonus: 0 } : { total: characteristic.total, bonus: characteristic.bonus };
}

function forbiddenLoreSkill(system: RitualActorSystem): { readonly current: number; readonly entries?: readonly SpecialistEntry[] | undefined } | undefined {
    return system.skills['forbiddenLore'];
}

/** The specialisation the rituals test (Forbidden Lore (Daemonology), pp. 59 / 71). */
const DAEMONOLOGY_SPECIALISATION = 'daemonology';

function entryLabel(entry: SpecialistEntry): string {
    const name = entry.name ?? '';
    return (name === '' ? entry.specialization ?? '' : name).trim().toLowerCase();
}

/** The actor's Forbidden Lore (Daemonology) row, or undefined when it has none. */
export function findDaemonologyLore(system: RitualActorSystem): SpecialistEntry | undefined {
    return forbiddenLoreSkill(system)?.entries?.find((entry) => entryLabel(entry) === DAEMONOLOGY_SPECIALISATION);
}

/** Forbidden Lore (Daemonology) total; an actor without the row tests the untrained parent skill. */
export function daemonologyLoreTotal(system: RitualActorSystem): number {
    return findDaemonologyLore(system)?.current ?? forbiddenLoreSkill(system)?.current ?? 0;
}

/* -------------------------------------------- */
/*  Card rows                                   */
/* -------------------------------------------- */

/** A provenance row in the shape `modifier-breakdown.hbs` renders. */
interface CardModifierRow {
    readonly label: string;
    readonly value: number;
    readonly source: string;
    readonly tooltipData: string;
}

/** The shared breakdown-partial context for one composed test. */
export interface CardTest {
    readonly baseTarget: number;
    readonly baseLabel: string;
    readonly modifiedTarget: number;
    readonly modifierSources: readonly CardModifierRow[];
    readonly activeModifiers: Record<string, number>;
    readonly modifierCapFired: boolean;
    readonly rawModifierTotal: number;
    readonly modifierTotal: number;
}

/** Shape a composed test into the breakdown partial's hash params, localising every row. */
export function toCardTest(composition: RitualTestComposition, baseLabel: string, localize: Localize): CardTest {
    const modifierSources = composition.components.map((component) => {
        const label = component.label ?? localize(component.labelKey);
        return {
            label,
            value: component.value,
            source: component.id,
            tooltipData: prepareModifierTooltipData(label, [{ name: label, value: component.value }]),
        };
    });
    return {
        baseTarget: composition.base,
        baseLabel,
        modifiedTarget: composition.target,
        modifierSources,
        activeModifiers: {},
        modifierCapFired: composition.capFired,
        rawModifierTotal: composition.rawModifierTotal,
        modifierTotal: composition.modifierTotal,
    };
}

/* -------------------------------------------- */
/*  Exorcism                                    */
/* -------------------------------------------- */

export interface ExorcismInputs {
    /** Table 2–21 rows that apply. */
    readonly modifiers: readonly ExorcismModifierId[];
    readonly daemonWillpowerBonus: number;
    readonly possessedCorruptionBonus: number;
    /** GM circumstance row. */
    readonly circumstanceLabel: string;
    readonly circumstanceValue: number;
}

export interface ExorcismOutcome {
    readonly lore: RitualTestComposition;
    readonly loreTest: TestOutcome;
    readonly attempt: RitualTestComposition;
    readonly state: ExorcismState;
    /** 1d10 Corruption when the exorcist collapsed, else 0. */
    readonly corruptionGained: number;
    /** The possessed individual's Toughness test, when the Daemon was cast out and a host is known. */
    readonly hostTest: TestOutcome | null;
}

function isExorcismModifierId(value: string): value is ExorcismModifierId {
    return Object.hasOwn(EXORCISM_MODIFIERS, value);
}

/** A form field read as a non-negative integer (blank / garbage → 0). */
function formInt(data: FormData, name: string, options: { signed?: boolean } = {}): number {
    const raw = data.get(name);
    const value = typeof raw === 'string' ? Math.trunc(Number(raw)) : 0;
    if (!Number.isFinite(value)) return 0;
    return options.signed === true ? value : Math.max(0, value);
}

/** A form field read as trimmed text. */
function formText(data: FormData, name: string): string {
    const raw = data.get(name);
    return typeof raw === 'string' ? raw.trim() : '';
}

/** Read the exorcism dialog's form. Unknown modifier ids are ignored. */
export function parseExorcismForm(data: FormData): ExorcismInputs {
    const modifiers = data
        .getAll('modifiers')
        .filter((value): value is string => typeof value === 'string')
        .filter(isExorcismModifierId);
    return {
        modifiers,
        daemonWillpowerBonus: formInt(data, 'daemonWillpowerBonus'),
        possessedCorruptionBonus: formInt(data, 'possessedCorruptionBonus'),
        circumstanceLabel: formText(data, 'circumstanceLabel'),
        circumstanceValue: formInt(data, 'circumstanceValue', { signed: true }),
    };
}

/** Collect the Table 2–21 and GM factors for the attempts. */
export function exorcismFactors(inputs: ExorcismInputs): DaemonicMasteryFactor[] {
    const factors: DaemonicMasteryFactor[] = inputs.modifiers.map((id) => EXORCISM_MODIFIERS[id]);
    factors.push(circumstanceFactor('circumstance', inputs.circumstanceLabel, inputs.circumstanceValue));
    return factors;
}

/**
 * Perform the whole exorcism: the preparatory lore test, then the extended
 * Mastery test until the Daemon is cast out or the exorcist collapses, then
 * (on success) the host's survival test.
 */
export async function runExorcism(
    exorcist: RitualActorSystem,
    host: { readonly toughness: number } | null,
    inputs: ExorcismInputs,
    dice: RitualDice,
): Promise<ExorcismOutcome> {
    const lore = prepareExorcismLoreTest(daemonologyLoreTotal(exorcist));
    const loreTest = resolveTest(await dice.roll('1d100'), lore.target);
    const attempt = prepareExorcismAttempt({
        exorcistWillpower: ritualCharacteristic(exorcist, 'willpower').total,
        loreDos: loreTest.dos,
        factors: exorcismFactors(inputs),
    });
    let state = startExorcism({
        threshold: getExorcismThreshold(inputs.daemonWillpowerBonus, inputs.possessedCorruptionBonus),
        attemptTarget: attempt.target,
        startingFatigue: exorcist.fatigue.value,
        fatigueThreshold: exorcist.fatigue.max,
    });
    // Terminates: every success adds ≥1 DoS toward a finite threshold, every failure ≥1 Fatigue toward a finite one.
    while (state.status === 'in-progress') {
        // eslint-disable-next-line no-await-in-loop -- sequential by design: each attempt of the extended test is its own roll
        const roll = await dice.roll('1d100');
        // eslint-disable-next-line no-await-in-loop -- sequential by design: each attempt takes its own 1d5 hours
        const hours = await dice.roll('1d5');
        state = stepExorcism(state, roll, hours);
    }
    const corruptionGained = state.status === 'collapsed' ? await dice.roll('1d10') : 0;
    const hostTest = state.status === 'banished' && host !== null ? resolveTest(await dice.roll('1d100'), getHostSurvivalTarget(host.toughness)) : null;
    return { lore, loreTest, attempt, state, corruptionGained, hostTest };
}

/** The actor writes an exorcism outcome implies for the exorcist. */
export function exorcistUpdate(exorcist: RitualActorSystem, outcome: ExorcismOutcome): Record<string, number> {
    const update: Record<string, number> = {};
    if (outcome.state.fatigueGained > 0) update['system.fatigue.value'] = exorcist.fatigue.value + outcome.state.fatigueGained;
    if (outcome.corruptionGained > 0) update['system.corruption'] = exorcist.corruption + outcome.corruptionGained;
    return update;
}

/** The exorcism chat card's context (`chat/daemonology-ritual-chat.hbs`). */
export interface ExorcismCardContext {
    readonly mode: 'exorcism';
    readonly gameSystem: string;
    readonly actorName: string;
    readonly hostName: string | null;
    readonly loreTest: CardTest;
    readonly loreResult: TestOutcome;
    readonly attemptTest: CardTest;
    readonly threshold: number;
    readonly attempts: readonly (ExorcismState['attempts'][number] & { readonly number: number })[];
    readonly totalDos: number;
    readonly hours: number;
    readonly fatigueGained: number;
    readonly banished: boolean;
    readonly collapsed: boolean;
    readonly corruptionGained: number;
    readonly hostTest: TestOutcome | null;
    /** True when the cast-out Daemon's host had its possession track cleared. */
    readonly hostCleared: boolean;
}

/** Card context for an exorcism. */
export function buildExorcismCard(args: {
    exorcistName: string;
    hostName: string | null;
    outcome: ExorcismOutcome;
    localize: Localize;
    gameSystem: string;
    hostCleared: boolean;
}): ExorcismCardContext {
    const { outcome, localize } = args;
    return {
        mode: 'exorcism',
        gameSystem: args.gameSystem,
        actorName: args.exorcistName,
        hostName: args.hostName,
        hostCleared: args.hostCleared,
        loreTest: toCardTest(outcome.lore, localize('WH40K.Daemonology.Card.LoreBase'), localize),
        loreResult: outcome.loreTest,
        attemptTest: toCardTest(outcome.attempt, localize('WH40K.Daemonology.Card.WillpowerBase'), localize),
        threshold: outcome.state.threshold,
        attempts: outcome.state.attempts.map((attempt, index) => ({ ...attempt, number: index + 1 })),
        totalDos: outcome.state.totalDos,
        hours: outcome.state.hours,
        fatigueGained: outcome.state.fatigueGained,
        banished: outcome.state.status === 'banished',
        collapsed: outcome.state.status === 'collapsed',
        corruptionGained: outcome.corruptionGained,
        hostTest: outcome.hostTest,
    };
}

/* -------------------------------------------- */
/*  Summoning                                   */
/* -------------------------------------------- */

export interface SummoningInputs {
    readonly hasTrueName: boolean;
    readonly servesPatron: boolean;
    readonly daemonWillpower: number;
    readonly daemonWillpowerBonus: number;
    readonly loreCircumstanceLabel: string;
    readonly loreCircumstanceValue: number;
    readonly masteryCircumstanceLabel: string;
    readonly masteryCircumstanceValue: number;
}

/** Read the summoning dialog's form. */
export function parseSummoningForm(data: FormData): SummoningInputs {
    const daemonWillpower = formInt(data, 'daemonWillpower');
    return {
        hasTrueName: data.get('hasTrueName') !== null,
        servesPatron: data.get('servesPatron') !== null,
        daemonWillpower,
        daemonWillpowerBonus: Math.floor(daemonWillpower / 10),
        loreCircumstanceLabel: formText(data, 'loreCircumstanceLabel'),
        loreCircumstanceValue: formInt(data, 'loreCircumstanceValue', { signed: true }),
        masteryCircumstanceLabel: formText(data, 'masteryCircumstanceLabel'),
        masteryCircumstanceValue: formInt(data, 'masteryCircumstanceValue', { signed: true }),
    };
}

export interface SummoningOutcome {
    readonly lore: RitualTestComposition;
    readonly mastery: RitualTestComposition;
    readonly loreTest: TestOutcome;
    /** The Mastery contest — only when the ritual succeeded and the Daemon appeared. */
    readonly contest: MasteryContestResult | null;
}

/** Perform the ritual, then — if the Daemon appears — the opposed Daemonic Mastery test. */
export async function runSummoning(summoner: RitualActorSystem, inputs: SummoningInputs, dice: RitualDice): Promise<SummoningOutcome> {
    const willpower = ritualCharacteristic(summoner, 'willpower');
    const { lore, mastery } = prepareSummoningRitual({
        forbiddenLoreTotal: daemonologyLoreTotal(summoner),
        willpowerTotal: willpower.total,
        hasTrueName: inputs.hasTrueName,
        servesPatron: inputs.servesPatron,
        loreFactors: [circumstanceFactor('lore-circumstance', inputs.loreCircumstanceLabel, inputs.loreCircumstanceValue)],
        masteryFactors: [circumstanceFactor('mastery-circumstance', inputs.masteryCircumstanceLabel, inputs.masteryCircumstanceValue)],
    });
    const loreTest = resolveTest(await dice.roll('1d100'), lore.target);
    if (!loreTest.success) return { lore, mastery, loreTest, contest: null };
    const summonerRoll = await dice.roll('1d100');
    const daemonRoll = await dice.roll('1d100');
    const contest = resolveMasteryContest({
        summonerRoll,
        summonerTarget: mastery.target,
        summonerWillpowerBonus: willpower.bonus,
        daemonRoll,
        daemonWillpower: inputs.daemonWillpower,
        daemonWillpowerBonus: inputs.daemonWillpowerBonus,
    });
    return { lore, mastery, loreTest, contest };
}

/** The summoning chat card's context (`chat/daemonology-ritual-chat.hbs`). */
export interface SummoningCardContext {
    readonly mode: 'summoning';
    readonly gameSystem: string;
    readonly actorName: string;
    readonly daemonName: string | null;
    readonly loreTest: CardTest;
    readonly loreResult: TestOutcome;
    readonly masteryTest: CardTest;
    readonly contest: MasteryContestResult | null;
    readonly summonerWon: boolean;
    readonly daemonWon: boolean;
    readonly stalemate: boolean;
}

/** Card context for a summoning. */
export function buildSummoningCard(args: {
    summonerName: string;
    daemonName: string | null;
    outcome: SummoningOutcome;
    localize: Localize;
    gameSystem: string;
}): SummoningCardContext {
    const { outcome, localize } = args;
    return {
        mode: 'summoning',
        gameSystem: args.gameSystem,
        actorName: args.summonerName,
        daemonName: args.daemonName,
        loreTest: toCardTest(outcome.lore, localize('WH40K.Daemonology.Card.LoreBase'), localize),
        loreResult: outcome.loreTest,
        masteryTest: toCardTest(outcome.mastery, localize('WH40K.Daemonology.Card.WillpowerBase'), localize),
        contest: outcome.contest,
        summonerWon: outcome.contest?.winner === 'summoner',
        daemonWon: outcome.contest?.winner === 'daemon',
        stalemate: outcome.contest?.winner === 'stalemate',
    };
}
