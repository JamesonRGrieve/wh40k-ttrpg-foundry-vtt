/**
 * Inquests (DH2 Enemies Within pp. 62–69, #90).
 *
 * An Inquest is a warband's targeted, long-running investigation. Its
 * **scope** fixes the Investigation points (IP) needed to complete it
 * (p. 63). Clues are worth IP by significance (Table 2–7, p. 65). Lead tests
 * add or remove IP per degree (p. 65). A **Revelation** happens at each IP
 * threshold: every 300 IP by default, which the GM may tailor (p. 66).
 * Resolution pays Influence by scope (Table 2–9, p. 69), with extra Influence
 * for surplus IP and a loss for a shortfall.
 *
 * The printed tables are line data, so they live on the line's game-system
 * config (`BaseSystemConfig.inquestRules`). Only DH2 declares them. This module
 * holds the content-agnostic math and the persisted-record shape.
 */

import { nonNegInt } from './_num.ts';

export const INQUEST_SCOPES = ['minoris', 'majoris', 'extremis'] as const;
export type InquestScope = (typeof INQUEST_SCOPES)[number];

export const CLUE_SIGNIFICANCES = ['minor', 'major', 'vital'] as const;
export type ClueSignificance = (typeof CLUE_SIGNIFICANCES)[number];

/** Whether the warband pursues the Inquest openly or covertly (p. 64, "Approach"). */
export const INQUEST_APPROACHES = ['covert', 'open'] as const;
export type InquestApproach = (typeof INQUEST_APPROACHES)[number];

/**
 * `active` while the warband is prosecuting it. On resolution it becomes
 * `goalsMet` or `goalsFailed`, because the reward depends on whether the
 * warband achieved its objective (p. 69).
 */
export const INQUEST_STATUSES = ['active', 'goalsMet', 'goalsFailed'] as const;
export type InquestStatus = (typeof INQUEST_STATUSES)[number];

/** A line's printed Inquest tables. */
export interface InquestRules {
    /** Per scope: IP to complete (p. 63) and the Influence reward (Table 2–9). */
    scopes: Readonly<Record<InquestScope, { requiredPoints: number; influenceReward: number }>>;
    /** Default IP between Revelations (p. 66). */
    revelationInterval: number;
    /** IP per clue by significance (Table 2–7). */
    clueValues: Readonly<Record<ClueSignificance, number>>;
    /** IP gained per degree of success (or lost per degree of failure) on a lead test (p. 65). */
    pointsPerLeadDegree: number;
    /** Extra IP from a clue relevant to the lead investigator's background or home world (p. 64). */
    leadInvestigatorClueBonus: number;
    /** IP per Influence step for surplus (bonus) and shortfall (loss) at resolution (p. 69). */
    rewardPointStep: number;
    /** Cap on the surplus Influence bonus (p. 69). */
    maxSurplusInfluence: number;
}

/** One warband Inquest as persisted in the world setting. */
export interface InquestState {
    id: string;
    /** The heresy targeted (p. 63, "Selecting a Heresy"). */
    target: string;
    objective: string;
    requirements: string;
    /** Free-text name of the nominated lead investigator (p. 64). */
    leadInvestigator: string;
    scope: InquestScope;
    approach: InquestApproach;
    investigationPoints: number;
    /** IP added to the scope total by events such as the Catspaws complication (Table 2–8). */
    extraRequiredPoints: number;
    /**
     * GM-tailored Revelation thresholds (p. 66). Empty means the default
     * ladder of one Revelation every `revelationInterval` IP.
     */
    revelationThresholds: number[];
    status: InquestStatus;
}

function isOneOf<T extends string>(values: readonly T[], raw: string): raw is T {
    return (values as readonly string[]).includes(raw);
}

/** IP needed to complete the Inquest: the scope total plus any added requirement. */
export function inquestRequiredPoints(rules: InquestRules, state: Pick<InquestState, 'scope' | 'extraRequiredPoints'>): number {
    return rules.scopes[state.scope].requiredPoints + nonNegInt(state.extraRequiredPoints);
}

/**
 * The ascending Revelation thresholds for an Inquest. The last threshold is
 * always the completion total, because reaching it triggers the final
 * Revelation (p. 69). GM-tailored thresholds at or past the total are dropped.
 */
export function inquestRevelationThresholds(
    rules: InquestRules,
    state: Pick<InquestState, 'scope' | 'extraRequiredPoints' | 'revelationThresholds'>,
): number[] {
    const required = inquestRequiredPoints(rules, state);
    const tailored = state.revelationThresholds.map(nonNegInt).filter((t) => t > 0 && t < required);
    const base = tailored.length > 0 ? tailored : defaultThresholdsBelow(rules.revelationInterval, required);
    return [...new Set([...base, required])].sort((a, b) => a - b);
}

function defaultThresholdsBelow(interval: number, required: number): number[] {
    const step = nonNegInt(interval);
    if (step === 0) return [];
    const out: number[] = [];
    for (let t = step; t < required; t += step) out.push(t);
    return out;
}

/**
 * How many thresholds the IP total crossed going from `oldPoints` to
 * `newPoints`. Only upward crossings count. A drop never un-reveals anything.
 */
export function inquestRevelationsCrossed(thresholds: readonly number[], oldPoints: number, newPoints: number): number {
    const a = nonNegInt(oldPoints);
    const b = nonNegInt(newPoints);
    if (b <= a) return 0;
    return thresholds.filter((t) => a < t && b >= t).length;
}

/** Revelations reached so far (0 … thresholds.length). */
export function inquestRevelationsReached(thresholds: readonly number[], points: number): number {
    const v = nonNegInt(points);
    return thresholds.filter((t) => v >= t).length;
}

/** IP for one clue (Table 2–7), plus the lead-investigator bonus when the clue is relevant to them. */
export function clueInvestigationPoints(rules: InquestRules, significance: ClueSignificance, leadInvestigatorRelevant: boolean): number {
    return rules.clueValues[significance] + (leadInvestigatorRelevant ? rules.leadInvestigatorClueBonus : 0);
}

/**
 * IP change from a lead test (p. 65): positive `degrees` are degrees of
 * success, negative are degrees of failure.
 */
export function leadTestInvestigationPoints(rules: InquestRules, degrees: number): number {
    if (!Number.isFinite(degrees)) return 0;
    return Math.trunc(degrees) * rules.pointsPerLeadDegree;
}

/** Apply an IP delta, flooring the running total at 0. */
export function applyInvestigationPoints(points: number, delta: number): number {
    const d = Number.isFinite(delta) ? Math.trunc(delta) : 0;
    return Math.max(0, nonNegInt(points) + d);
}

/** The Influence each Acolyte gains (positive) or loses (negative) at resolution, with its parts. */
export interface InquestInfluenceOutcome {
    /** Net Influence change per Acolyte. */
    total: number;
    /** Scope reward actually paid: full, halved, or 0 when the IP total fell short. */
    scopeReward: number;
    /** Bonus for surplus IP, capped (0 unless the goals were met). */
    surplusBonus: number;
    /** Influence lost for the IP shortfall (≤ 0). */
    shortfallPenalty: number;
}

/**
 * Influence at resolution (p. 69):
 *  - IP met and goals met: the scope reward, +1 per full `rewardPointStep` surplus IP (capped);
 *  - IP met, goals failed: half the scope reward, rounded down;
 *  - IP short: −1 per `rewardPointStep` IP (or part thereof) short.
 */
export function inquestInfluenceOutcome(
    rules: InquestRules,
    state: Pick<InquestState, 'scope' | 'extraRequiredPoints' | 'investigationPoints'>,
    goalsMet: boolean,
): InquestInfluenceOutcome {
    const required = inquestRequiredPoints(rules, state);
    const points = nonNegInt(state.investigationPoints);
    const step = Math.max(1, nonNegInt(rules.rewardPointStep));
    const reward = rules.scopes[state.scope].influenceReward;
    if (points < required) {
        const shortfallPenalty = -Math.ceil((required - points) / step);
        return { total: shortfallPenalty, scopeReward: 0, surplusBonus: 0, shortfallPenalty };
    }
    if (!goalsMet) {
        const scopeReward = Math.floor(reward / 2);
        return { total: scopeReward, scopeReward, surplusBonus: 0, shortfallPenalty: 0 };
    }
    const surplusBonus = Math.min(nonNegInt(rules.maxSurplusInfluence), Math.floor((points - required) / step));
    return { total: reward + surplusBonus, scopeReward: reward, surplusBonus, shortfallPenalty: 0 };
}

/** A fresh, active Inquest with the given identity and defaults for everything else. */
export function createInquest(id: string, fields: Partial<Omit<InquestState, 'id'>> = {}): InquestState {
    return {
        id,
        target: fields.target ?? '',
        objective: fields.objective ?? '',
        requirements: fields.requirements ?? '',
        leadInvestigator: fields.leadInvestigator ?? '',
        scope: fields.scope ?? 'minoris',
        approach: fields.approach ?? 'covert',
        investigationPoints: nonNegInt(fields.investigationPoints ?? 0),
        extraRequiredPoints: nonNegInt(fields.extraRequiredPoints ?? 0),
        revelationThresholds: (fields.revelationThresholds ?? []).map(nonNegInt).filter((t) => t > 0),
        status: fields.status ?? 'active',
    };
}

/**
 * Parse a GM-typed threshold list ("300, 500, 600") into positive integers.
 * Anything that isn't a positive number is ignored.
 */
export function parseThresholdList(text: string): number[] {
    return text
        .split(/[\s,;]+/u)
        .map((part) => Number.parseInt(part, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
}

/** One parsed JSON object from the world setting, read field-by-field through the typed guards below. */
// eslint-disable-next-line no-restricted-syntax -- boundary: the shape of a JSON.parse result from the world setting, before validation
type StoredRecord = Readonly<Record<string, unknown>>;

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over one element of the JSON.parse result; the parameter is the validation surface itself
function isStoredRecord(value: unknown): value is StoredRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: StoredRecord, key: string): string {
    const v = record[key];
    return typeof v === 'string' ? v : '';
}

function readNumber(record: StoredRecord, key: string): number {
    const v = record[key];
    return typeof v === 'number' ? v : 0;
}

/**
 * Validate the persisted Inquest list (the world setting's parsed JSON).
 * Entries without an id are dropped, and unknown enum values fall back to the
 * defaults, so a hand-edited or stale setting never breaks the sheet.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: validates the untyped JSON.parse result of the world setting
export function parseInquests(raw: unknown): InquestState[] {
    if (!Array.isArray(raw)) return [];
    const out: InquestState[] = [];
    for (const entry of raw) {
        if (!isStoredRecord(entry)) continue;
        const record = entry;
        const id = readString(record, 'id');
        if (id === '') continue;
        const scope = readString(record, 'scope');
        const approach = readString(record, 'approach');
        const status = readString(record, 'status');
        const thresholds = record['revelationThresholds'];
        out.push(
            createInquest(id, {
                target: readString(record, 'target'),
                objective: readString(record, 'objective'),
                requirements: readString(record, 'requirements'),
                leadInvestigator: readString(record, 'leadInvestigator'),
                scope: isOneOf(INQUEST_SCOPES, scope) ? scope : 'minoris',
                approach: isOneOf(INQUEST_APPROACHES, approach) ? approach : 'covert',
                investigationPoints: readNumber(record, 'investigationPoints'),
                extraRequiredPoints: readNumber(record, 'extraRequiredPoints'),
                revelationThresholds: Array.isArray(thresholds) ? thresholds.filter((t): t is number => typeof t === 'number') : [],
                status: isOneOf(INQUEST_STATUSES, status) ? status : 'active',
            }),
        );
    }
    return out;
}

/** One Inquest as the tracker's form fields hold it: every value is text. */
export type InquestRow = Readonly<Record<Exclude<keyof InquestState, 'revelationThresholds'>, string>> & { readonly revelationThresholds: string };

/** Form row → Inquest, through the same validation as the stored setting. Null when the row has no id. */
export function inquestFromRow(row: InquestRow): InquestState | null {
    const toInt = (text: string): number => {
        const n = Number.parseInt(text, 10);
        return Number.isFinite(n) ? n : 0;
    };
    const parsed = parseInquests([
        {
            ...row,
            investigationPoints: toInt(row.investigationPoints),
            extraRequiredPoints: toInt(row.extraRequiredPoints),
            revelationThresholds: parseThresholdList(row.revelationThresholds),
        },
    ]);
    return parsed.at(0) ?? null;
}

/** Inquest → form row. */
export function rowFromInquest(inquest: InquestState): InquestRow {
    return {
        ...inquest,
        investigationPoints: String(inquest.investigationPoints),
        extraRequiredPoints: String(inquest.extraRequiredPoints),
        revelationThresholds: inquest.revelationThresholds.join(', '),
    };
}

/** A Revelation reached by an IP change, for the Revelation chat card. */
export interface InquestRevelationEvent {
    inquest: InquestState;
    /** 1-based number of the highest Revelation now reached. */
    revelation: number;
    revelationCount: number;
    /** True when this is the final Revelation (the completion total). */
    isFinal: boolean;
}

/**
 * Compare a stored Inquest list with its edited replacement and report each
 * active Inquest whose IP crossed at least one Revelation threshold. Inquests
 * are matched by id, and a new Inquest counts from 0 IP.
 */
export function inquestRevelationEvents(rules: InquestRules, before: readonly InquestState[], after: readonly InquestState[]): InquestRevelationEvent[] {
    const previous = new Map(before.map((q) => [q.id, q.investigationPoints]));
    const events: InquestRevelationEvent[] = [];
    for (const inquest of after) {
        if (inquest.status !== 'active') continue;
        const thresholds = inquestRevelationThresholds(rules, inquest);
        if (inquestRevelationsCrossed(thresholds, previous.get(inquest.id) ?? 0, inquest.investigationPoints) === 0) continue;
        const revelation = inquestRevelationsReached(thresholds, inquest.investigationPoints);
        events.push({ inquest, revelation, revelationCount: thresholds.length, isFinal: revelation === thresholds.length });
    }
    return events;
}

/** Display-ready progress for one Inquest, shared by the Party Overview panel and the tracker. */
export interface InquestProgress {
    required: number;
    thresholds: number[];
    revelationsReached: number;
    revelationCount: number;
    /** Next unmet threshold, or `null` once the completion total is reached. */
    nextThreshold: number | null;
    /** 0–100, for the progress bar. */
    percent: number;
}

export function inquestProgress(rules: InquestRules, state: InquestState): InquestProgress {
    const thresholds = inquestRevelationThresholds(rules, state);
    const required = inquestRequiredPoints(rules, state);
    const points = nonNegInt(state.investigationPoints);
    const revelationsReached = inquestRevelationsReached(thresholds, points);
    return {
        required,
        thresholds,
        revelationsReached,
        revelationCount: thresholds.length,
        nextThreshold: thresholds.find((t) => t > points) ?? null,
        percent: required > 0 ? Math.min(100, Math.round((points / required) * 100)) : 0,
    };
}
