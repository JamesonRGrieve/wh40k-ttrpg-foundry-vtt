/**
 * Prerequisites shared by talents and psychic powers (#673, #675): the structured
 * shape the `prerequisites` schema field (data/shared/prerequisites-field.ts) stores,
 * reading any stored value into it, and checking it against an actor.
 *
 * - `text`: the Prerequisite line as printed, shown on the sheet.
 * - `characteristics`: characteristic key → minimum total (`{ willpower: 40 }`).
 * - `skills`: skill labels, a specialist skill with its specialisation in brackets, and an
 *   optional `+10/+20/+30` for the training level (`"Psyniscience"` = Known,
 *   `"Forbidden Lore (Warp) +20"` = Experienced).
 * - `talents`: talent names the actor must own, exactly.
 * - `talentsAny`: talents of which any specialisation will do ("Hatred (any)" → `"Hatred"`).
 * - `alignment`: the Chaos alignment the actor must hold ('' for none; Black Crusade).
 * - `thresholds`: an actor stat → minimum (`{ corruption: 30, infamy: 40, insanity: 5, rank: 3 }`).
 *
 * Values come from the compendium (Direction #7); nothing here names a characteristic,
 * skill, talent or alignment.
 */

import { alignmentLabelKey } from '../config/game-systems/bc-advancement-config.ts';
import type { I18nKey } from '../types/i18n-keys';

/** The Chaos alignments a prerequisite can require; '' requires none. */
export const PREREQUISITE_ALIGNMENTS = ['', 'khorne', 'nurgle', 'slaanesh', 'tzeentch', 'unaligned'] as const;
type PrerequisiteAlignment = (typeof PREREQUISITE_ALIGNMENTS)[number];

/** The actor stats a threshold can name. */
const PREREQUISITE_THRESHOLDS = ['corruption', 'infamy', 'insanity', 'rank'] as const;
type PrerequisiteThreshold = (typeof PREREQUISITE_THRESHOLDS)[number];

/**
 * How an unmet prerequisite is worded. The caller supplies the langpack labels, so
 * this module stays free of `game` and the list never shows a raw key ("willpower 40+").
 */
export interface PrerequisiteLabels {
    /** A characteristic minimum, from its key ("Willpower 40+"). */
    characteristic: (key: string, min: number) => string;
    /** A talent of which any specialisation will do ("Hatred (any)"). */
    anySpecialisation: (talent: string) => string;
    /** A required Chaos alignment, from its id ("Aligned to Nurgle"). */
    alignment: (alignment: Exclude<PrerequisiteAlignment, ''>) => string;
    /** An actor-stat minimum ("Corruption 30+"). */
    threshold: (stat: PrerequisiteThreshold, min: number) => string;
}

/** A langpack formatter: a key and its substitutions → the localized string (`t`, or a story's). */
export type PrerequisiteFormat = (key: I18nKey, data?: Record<string, string | number>) => string;

const THRESHOLD_LABEL_KEYS: Readonly<Record<PrerequisiteThreshold, I18nKey>> = {
    corruption: 'WH40K.Advancement.Prereq.Chip.Threshold.Corruption',
    infamy: 'WH40K.Advancement.Prereq.Chip.Threshold.Infamy',
    insanity: 'WH40K.Advancement.Prereq.Chip.Threshold.Insanity',
    rank: 'WH40K.Advancement.Prereq.Chip.Threshold.Rank',
};

/**
 * The langpack wording of unmet prerequisites.
 * @param format          Resolves a langpack key with its substitutions.
 * @param characteristic  A characteristic key's localized label ("willpower" → "Willpower").
 */
export function prerequisiteLabels(format: PrerequisiteFormat, characteristic: (key: string) => string): PrerequisiteLabels {
    const minimum = (label: string, min: number): string => format('WH40K.Advancement.Prereq.Chip.Minimum', { label, min });
    return {
        characteristic: (key, min) => minimum(characteristic(key), min),
        anySpecialisation: (talent) => format('WH40K.Advancement.Prereq.Chip.AnySpecialisation', { talent }),
        alignment: (alignment) => format('WH40K.Advancement.Prereq.Chip.Aligned', { alignment: format(alignmentLabelKey(alignment)) }),
        threshold: (stat, min) => minimum(format(THRESHOLD_LABEL_KEYS[stat]), min),
    };
}

/** A document's prerequisites, structured. */
export interface StructuredPrerequisites {
    text: string;
    characteristics: Record<string, number>;
    skills: string[];
    talents: string[];
    talentsAny: string[];
    alignment: PrerequisiteAlignment;
    thresholds: Partial<Record<PrerequisiteThreshold, number>>;
}

/** The string entries of a list some sources store as a record (`{0: "x"}`) rather than an array. */
// eslint-disable-next-line no-restricted-syntax -- boundary: value is the raw source list this guard narrows
function stringList(value: unknown): string[] {
    const items = Array.isArray(value) ? value : value !== null && typeof value === 'object' ? Object.values(value) : [];
    return items.filter((item): item is string => typeof item === 'string');
}

/** The finite numeric members of a raw record, optionally only the allowed keys. */
// eslint-disable-next-line no-restricted-syntax -- boundary: value is the raw source record this guard narrows
function numberRecord(value: unknown, allowed?: readonly string[]): Record<string, number> {
    const out: Record<string, number> = {};
    if (value === null || typeof value !== 'object') return out;
    for (const [key, number] of Object.entries(value)) {
        if (typeof number === 'number' && Number.isFinite(number) && (allowed === undefined || allowed.includes(key))) out[key] = number;
    }
    return out;
}

function isAlignment(value: string): value is PrerequisiteAlignment {
    return (PREREQUISITE_ALIGNMENTS as readonly string[]).includes(value);
}

/**
 * Any stored prerequisites as the structured shape: a legacy flat string becomes the
 * text, a missing value the empty set, and a minimum that is not a number, a threshold
 * on an unknown stat or an unknown alignment is dropped rather than compared.
 * @param raw  The stored `prerequisites`, already collapsed to the active line.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: raw is an unmigrated source value narrowed here
export function toStructuredPrerequisites(raw: unknown): StructuredPrerequisites {
    const none: StructuredPrerequisites = { text: '', characteristics: {}, skills: [], talents: [], talentsAny: [], alignment: '', thresholds: {} };
    if (typeof raw === 'string') return { ...none, text: raw };
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return none;
    // eslint-disable-next-line no-restricted-syntax -- boundary: an unmigrated _migrateData / CompendiumCollection.getIndex value; each member is narrowed below
    const source = raw as Partial<Record<keyof StructuredPrerequisites, unknown>>;
    const alignment = typeof source.alignment === 'string' && isAlignment(source.alignment) ? source.alignment : '';
    return {
        text: typeof source.text === 'string' ? source.text : '',
        characteristics: numberRecord(source.characteristics),
        skills: stringList(source.skills),
        talents: stringList(source.talents),
        talentsAny: stringList(source.talentsAny),
        alignment,
        thresholds: numberRecord(source.thresholds, PREREQUISITE_THRESHOLDS),
    };
}

/** What the prerequisite check reads from an actor. */
export interface PrerequisiteActorView {
    /** Characteristic key → current total. */
    characteristics: Record<string, number>;
    /** Skill label (any case) → rank (1 Known … 4 Veteran); a specialist skill as "Label (Specialisation)". */
    skillRanks: Record<string, number>;
    /** Names of owned talents, any case; a specialised one as "Name (Specialisation)". */
    talents: readonly string[];
    /** The actor's Chaos alignment, '' when the line has none. */
    alignment: string;
    /** The actor's value of each threshold stat it has. */
    thresholds: Partial<Record<PrerequisiteThreshold, number>>;
}

/** The rank a skill prerequisite's training suffix asks for: none = Known (1), +10 = 2, +20 = 3, +30 = 4. */
const RANK_FOR_BONUS: Readonly<Record<string, number>> = { '': 1, '10': 2, '20': 3, '30': 4 };

/** A skill label compared case-blind, with a leading "The" dropped from a specialisation ("(The Warp)" = "(Warp)"). */
function skillKey(label: string): string {
    return label
        .toLowerCase()
        .replace(/\(\s*the\s+/, '(')
        .trim();
}

/** A talent's name without its specialisation ("Hatred (Orks)" → "hatred"). */
function talentBase(name: string): string {
    return name.replace(/\s*\(.*\)\s*$/, '').toLowerCase();
}

/**
 * The prerequisites `actor` does not meet, each as a display string. Empty when all are met.
 * Skills and talents print as the compendium spells them; the rest are worded by `labels`.
 * @param prereqs  The structured prerequisites.
 * @param actor    The actor's characteristics, skills, talents, alignment and thresholds.
 * @param labels   The langpack wording of characteristics, alignments and thresholds.
 */
export function unmetPrerequisites(prereqs: StructuredPrerequisites, actor: PrerequisiteActorView, labels: PrerequisiteLabels): string[] {
    const unmet: string[] = [];
    for (const [key, min] of Object.entries(prereqs.characteristics)) {
        if ((actor.characteristics[key] ?? 0) < min) unmet.push(labels.characteristic(key, min));
    }
    const ranks = new Map(Object.entries(actor.skillRanks).map(([label, rank]) => [skillKey(label), rank]));
    for (const skill of prereqs.skills) {
        const match = /^(.+?)\s*(?:\+(\d+))?$/.exec(skill.trim());
        const needed = RANK_FOR_BONUS[match?.[2] ?? ''] ?? 1;
        if ((ranks.get(skillKey(match?.[1] ?? skill)) ?? 0) < needed) unmet.push(skill);
    }
    const owned = actor.talents.map((name) => name.toLowerCase());
    for (const talent of prereqs.talents) {
        if (!owned.includes(talent.toLowerCase())) unmet.push(talent);
    }
    const ownedBases = new Set(actor.talents.map(talentBase));
    for (const talent of prereqs.talentsAny) {
        if (!ownedBases.has(talent.toLowerCase())) unmet.push(labels.anySpecialisation(talent));
    }
    if (prereqs.alignment !== '' && actor.alignment !== prereqs.alignment) unmet.push(labels.alignment(prereqs.alignment));
    for (const stat of PREREQUISITE_THRESHOLDS) {
        const min = prereqs.thresholds[stat];
        if (min !== undefined && (actor.thresholds[stat] ?? 0) < min) unmet.push(labels.threshold(stat, min));
    }
    return unmet;
}
