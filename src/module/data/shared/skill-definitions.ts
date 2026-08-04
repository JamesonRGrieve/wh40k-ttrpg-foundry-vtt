/**
 * @file Canonical skill catalog (#273).
 *
 * Single source of truth for the d100-family skill list: each entry's key,
 * display label, governing characteristic (short form), whether it is an
 * advanced skill, and whether it is a specialist group carrying per-specialization
 * entries.
 *
 * `CreatureTemplate.defineSchema()` builds its `skills` SchemaField from this
 * table, and `NPCData` derives its skill→characteristic fallback map from it, so
 * the skill→governing-characteristic association is authored exactly once instead
 * of being duplicated across the schema and the NPC map (which had already drifted
 * — e.g. Security/Survival differed between the two copies).
 *
 * Insertion order matches the historical CreatureTemplate schema exactly (RT/DH1e
 * standard, then DH2e/BC/OW standard, then specialist groups) so the generated
 * SchemaField is byte-identical.
 *
 * The governing characteristic is the short form (`'Ag'`, `'Int'`, …); resolve it
 * to a full key with `CHARACTERISTIC_SHORT_TO_FULL` from `./characteristics.ts`.
 */

import { CHARACTERISTIC_SHORT_TO_FULL } from './characteristics.ts';

/** One skill's catalog entry. */
export interface SkillDefinition {
    /** Display label stored in the schema's `label` field (e.g. `'Common Lore'`). */
    label: string;
    /** Governing characteristic, short form (e.g. `'Ag'`, `'Int'`); see {@link CHARACTERISTIC_SHORT_TO_FULL}. */
    char: string;
    /** Advanced skill (cannot be used untrained). */
    advanced: boolean;
    /** Specialist group — carries an `entries` array of per-specialization sub-skills. */
    hasEntries: boolean;
    /** Game systems this skill belongs to. Undefined = all systems. */
    systems?: readonly string[];
}

const DH1_RT = ['dh1', 'rt'] as const;
const DH2_PLUS = ['dh2', 'bc', 'ow', 'dw'] as const;

const def = (label: string, char: string, advanced: boolean, hasEntries = false, systems?: readonly string[]): SkillDefinition => ({
    label,
    char,
    advanced,
    hasEntries,
    ...(systems !== undefined ? { systems } : {}),
});

/** Skill key → definition. Order is schema-significant (see file header). */
export const SKILL_DEFINITIONS: Record<string, SkillDefinition> = {
    // === RT/DH1e Standard Skills ===
    acrobatics: def('Acrobatics', 'Ag', true),
    awareness: def('Awareness', 'Per', false),
    barter: def('Barter', 'Fel', false, false, DH1_RT),
    blather: def('Blather', 'Fel', true, false, DH1_RT),
    carouse: def('Carouse', 'T', false, false, DH1_RT),
    charm: def('Charm', 'Fel', false),
    chemUse: def('Chem-Use', 'Int', true, false, DH1_RT),
    climb: def('Climb', 'S', false, false, DH1_RT),
    command: def('Command', 'Fel', false),
    commerce: def('Commerce', 'Fel', true, false, DH1_RT),
    concealment: def('Concealment', 'Ag', false, false, DH1_RT),
    contortionist: def('Contortionist', 'Ag', false, false, DH1_RT),
    deceive: def('Deceive', 'Fel', false),
    demolition: def('Demolition', 'Int', true, false, DH1_RT),
    disguise: def('Disguise', 'Fel', false, false, DH1_RT),
    dodge: def('Dodge', 'Ag', false),
    evaluate: def('Evaluate', 'Int', false, false, DH1_RT),
    gamble: def('Gamble', 'Int', false, false, DH1_RT),
    inquiry: def('Inquiry', 'Fel', false),
    interrogation: def('Interrogation', 'WP', true),
    intimidate: def('Intimidate', 'S', false),
    invocation: def('Invocation', 'WP', true, false, DH1_RT),
    literacy: def('Literacy', 'Int', false, false, DH1_RT),
    logic: def('Logic', 'Int', false),
    medicae: def('Medicae', 'Int', true),
    psyniscience: def('Psyniscience', 'Per', true),
    scrutiny: def('Scrutiny', 'Per', false),
    search: def('Search', 'Per', false, false, DH1_RT),
    security: def('Security', 'Ag', true),
    shadowing: def('Shadowing', 'Ag', true, false, DH1_RT),
    silentMove: def('Silent Move', 'Ag', false, false, DH1_RT),
    sleightOfHand: def('Sleight of Hand', 'Ag', true),
    survival: def('Survival', 'Int', false),
    swim: def('Swim', 'S', false, false, DH1_RT),
    tracking: def('Tracking', 'Int', true, false, DH1_RT),
    wrangling: def('Wrangling', 'Int', true, false, DH1_RT),

    // === DH2e/BC/OW Standard Skills (not in RT) ===
    athletics: def('Athletics', 'S', false, false, DH2_PLUS),
    linguistics: def('Linguistics', 'Int', true, true, DH2_PLUS),
    navigate: def('Navigate', 'Int', true, true, DH2_PLUS),
    operate: def('Operate', 'Ag', true, true, DH2_PLUS),
    parry: def('Parry', 'WS', true, false, DH2_PLUS),
    stealth: def('Stealth', 'Ag', false, false, DH2_PLUS),

    // === Specialist Skill Groups (all systems) ===
    ciphers: def('Ciphers', 'Int', true, true, DH1_RT),
    commonLore: def('Common Lore', 'Int', true, true),
    drive: def('Drive', 'Ag', true, true, DH1_RT),
    forbiddenLore: def('Forbidden Lore', 'Int', true, true),
    navigation: def('Navigation', 'Int', true, true, DH1_RT),
    performer: def('Performer', 'Fel', true, true, DH1_RT),
    pilot: def('Pilot', 'Ag', true, true, DH1_RT),
    scholasticLore: def('Scholastic Lore', 'Int', true, true),
    secretTongue: def('Secret Tongue', 'Int', true, true, DH1_RT),
    speakLanguage: def('Speak Language', 'Int', true, true, DH1_RT),
    // DW Core p.104: Advanced, Intelligence, Skill Groups (Air Combat, Armoured
    // Tactics, Assault Doctrine, Defensive Doctrine, Orbital Drop Procedures,
    // Recon and Stealth). Absent from this catalogue until #503, so every
    // Deathwatch NPC printing "Tactics (…)" parsed to a key that matched nothing.
    tactics: def('Tactics', 'Int', true, true, ['dw']),
    techUse: def('Tech-Use', 'Int', true), // Standard in DH2e, Group in RT
    trade: def('Trade', 'Int', true, true),
};

const skillKeyCache = new Map<string, Set<string>>();

/**
 * Return the set of skill keys belonging to the given game system.
 * Memoized — SKILL_DEFINITIONS is a module constant and there are ~6 system IDs.
 */
export function skillKeysForSystem(systemId: string): Set<string> {
    let cached = skillKeyCache.get(systemId);
    if (cached !== undefined) return cached;
    cached = new Set(
        Object.entries(SKILL_DEFINITIONS)
            .filter(([, d]) => d.systems === undefined || d.systems.includes(systemId))
            .map(([key]) => key),
    );
    skillKeyCache.set(systemId, cached);
    return cached;
}

/**
 * Derive a `skillKey → full-characteristic-key` map from {@link SKILL_DEFINITIONS}
 * (e.g. `dodge → 'agility'`). Used as the NPC skill-target fallback when an
 * individual skill has no `characteristic` set. Unknown short codes fall through
 * to the raw value (defensive; every catalog entry uses a known short code).
 */
export function skillCharacteristicMap(): Record<string, string> {
    return Object.fromEntries(Object.entries(SKILL_DEFINITIONS).map(([key, d]) => [key, CHARACTERISTIC_SHORT_TO_FULL[d.char] ?? d.char]));
}

/**
 * Derive the display-label → key map from {@link SKILL_DEFINITIONS}
 * (e.g. `'Common Lore' → 'commonLore'`). Single source for SkillKeyHelper's
 * name→key lookup.
 */
export function skillNameToKeyMap(): Record<string, string> {
    return Object.fromEntries(Object.entries(SKILL_DEFINITIONS).map(([key, d]) => [d.label, key]));
}

/**
 * Derive the set of specialist-group keys (those carrying per-specialization
 * `entries`) from {@link SKILL_DEFINITIONS} — i.e. every entry with `hasEntries`.
 */
export function specialistSkillKeys(): Set<string> {
    return new Set(
        Object.entries(SKILL_DEFINITIONS)
            .filter(([, d]) => d.hasEntries)
            .map(([key]) => key),
    );
}

/**
 * Derive a `skillKey → short-characteristic-code` map from {@link SKILL_DEFINITIONS}
 * (e.g. `dodge → 'Ag'`). Short form, unlike {@link skillCharacteristicMap}.
 */
export function skillCharacteristicShortMap(): Record<string, string> {
    return Object.fromEntries(Object.entries(SKILL_DEFINITIONS).map(([key, d]) => [key, d.char]));
}

/**
 * Derive a `skillKey → isAdvanced` map from {@link SKILL_DEFINITIONS}.
 */
export function skillAdvancedMap(): Record<string, boolean> {
    return Object.fromEntries(Object.entries(SKILL_DEFINITIONS).map(([key, d]) => [key, d.advanced]));
}
