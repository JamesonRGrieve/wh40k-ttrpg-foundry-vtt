/**
 * The `prerequisites` schema field shared by talents and psychic powers (#673):
 * the book's printed text plus the structured gates the Advancement Dialog checks.
 *
 * - `text`: the Prerequisite line as printed, shown on the sheet.
 * - `characteristics`: characteristic key → minimum total (`{ willpower: 40 }`).
 * - `skills`: skill labels, with an optional `+10/+20/+30` for the training level
 *   (`"Psyniscience"` = Known, `"Psyniscience +10"` = Trained).
 * - `talents`: talent names the actor must own.
 *
 * Values come from the compendium (Direction #7); nothing here names a characteristic,
 * skill or talent.
 */

/** A document's prerequisites, structured. */
export interface StructuredPrerequisites {
    text: string;
    characteristics: Record<string, number>;
    skills: string[];
    talents: string[];
}

export function prerequisitesField(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
        text: new fields.StringField({ required: true, blank: true, initial: '' }),
        characteristics: new fields.ObjectField({ required: true, initial: {} }),
        skills: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),
        talents: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),
    });
}

/** The string entries of a list some sources store as a record (`{0: "x"}`) rather than an array. */
// eslint-disable-next-line no-restricted-syntax -- boundary: value is the raw source list this guard narrows
function stringList(value: unknown): string[] {
    const items = Array.isArray(value) ? value : value !== null && typeof value === 'object' ? Object.values(value) : [];
    return items.filter((item): item is string => typeof item === 'string');
}

/**
 * Any stored prerequisites as the structured shape: a legacy flat string becomes the
 * text, a missing value the empty set, and a characteristic minimum that is not a
 * number is dropped rather than compared.
 * @param raw  The stored `prerequisites`, already collapsed to the active line.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: raw is an unmigrated source value narrowed here
export function toStructuredPrerequisites(raw: unknown): StructuredPrerequisites {
    if (typeof raw === 'string') return { text: raw, characteristics: {}, skills: [], talents: [] };
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { text: '', characteristics: {}, skills: [], talents: [] };
    // eslint-disable-next-line no-restricted-syntax -- boundary: an unmigrated _migrateData / CompendiumCollection.getIndex value; each member is narrowed below
    const source = raw as { text?: unknown; characteristics?: unknown; skills?: unknown; talents?: unknown };
    const characteristics: Record<string, number> = {};
    if (source.characteristics !== null && typeof source.characteristics === 'object') {
        for (const [key, min] of Object.entries(source.characteristics)) {
            if (typeof min === 'number' && Number.isFinite(min)) characteristics[key] = min;
        }
    }
    return {
        text: typeof source.text === 'string' ? source.text : '',
        characteristics,
        skills: stringList(source.skills),
        talents: stringList(source.talents),
    };
}

/** What the prerequisite check reads from an actor. */
export interface PrerequisiteActorView {
    /** Characteristic key → current total. */
    characteristics: Record<string, number>;
    /** Skill label (any case) → rank (1 Known … 4 Veteran). */
    skillRanks: Record<string, number>;
    /** Names of owned talents, any case. */
    talents: readonly string[];
}

/** The rank a skill prerequisite's training suffix asks for: none = Known (1), +10 = 2, +20 = 3, +30 = 4. */
const RANK_FOR_BONUS: Readonly<Record<string, number>> = { '': 1, '10': 2, '20': 3, '30': 4 };

/**
 * The prerequisites `actor` does not meet, each as a display string. Empty when all are met.
 * @param prereqs  The structured prerequisites.
 * @param actor    The actor's characteristics, skill ranks and talents.
 */
export function unmetPrerequisites(prereqs: StructuredPrerequisites, actor: PrerequisiteActorView): string[] {
    const unmet: string[] = [];
    for (const [key, min] of Object.entries(prereqs.characteristics)) {
        if ((actor.characteristics[key] ?? 0) < min) unmet.push(`${key} ${min}+`);
    }
    const ranks = new Map(Object.entries(actor.skillRanks).map(([label, rank]) => [label.toLowerCase(), rank]));
    for (const skill of prereqs.skills) {
        const match = /^(.+?)\s*(?:\+(\d+))?$/.exec(skill.trim());
        const label = (match?.[1] ?? skill).toLowerCase();
        const needed = RANK_FOR_BONUS[match?.[2] ?? ''] ?? 1;
        if ((ranks.get(label) ?? 0) < needed) unmet.push(skill);
    }
    const owned = new Set(actor.talents.map((name) => name.toLowerCase()));
    for (const talent of prereqs.talents) {
        if (!owned.has(talent.toLowerCase())) unmet.push(talent);
    }
    return unmet;
}
