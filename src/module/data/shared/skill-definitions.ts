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
interface SkillDefinition {
    /** Display label stored in the schema's `label` field (e.g. `'Common Lore'`). */
    label: string;
    /** Governing characteristic, short form (e.g. `'Ag'`, `'Int'`); see {@link CHARACTERISTIC_SHORT_TO_FULL}. */
    char: string;
    /** Advanced skill (cannot be used untrained). */
    advanced: boolean;
    /** Specialist group — carries an `entries` array of per-specialization sub-skills. */
    hasEntries: boolean;
}

const def = (label: string, char: string, advanced: boolean, hasEntries = false): SkillDefinition => ({ label, char, advanced, hasEntries });

/** Skill key → definition. Order is schema-significant (see file header). */
export const SKILL_DEFINITIONS: Record<string, SkillDefinition> = {
    // === RT/DH1e Standard Skills ===
    acrobatics: def('Acrobatics', 'Ag', true),
    awareness: def('Awareness', 'Per', false),
    barter: def('Barter', 'Fel', false), // RT/DH1e only
    blather: def('Blather', 'Fel', true), // RT/DH1e only
    carouse: def('Carouse', 'T', false), // RT/DH1e only
    charm: def('Charm', 'Fel', false),
    chemUse: def('Chem-Use', 'Int', true), // RT/DH1e only
    climb: def('Climb', 'S', false), // RT/DH1e only
    command: def('Command', 'Fel', false),
    commerce: def('Commerce', 'Fel', true),
    concealment: def('Concealment', 'Ag', false), // RT/DH1e only
    contortionist: def('Contortionist', 'Ag', false), // RT/DH1e only
    deceive: def('Deceive', 'Fel', false),
    demolition: def('Demolition', 'Int', true), // RT/DH1e only
    disguise: def('Disguise', 'Fel', false), // RT/DH1e only
    dodge: def('Dodge', 'Ag', false),
    evaluate: def('Evaluate', 'Int', false), // RT/DH1e only
    gamble: def('Gamble', 'Int', false), // RT/DH1e only
    inquiry: def('Inquiry', 'Fel', false),
    interrogation: def('Interrogation', 'WP', true),
    intimidate: def('Intimidate', 'S', false),
    invocation: def('Invocation', 'WP', true), // RT/DH1e only
    literacy: def('Literacy', 'Int', false), // RT/DH1e only
    logic: def('Logic', 'Int', false),
    medicae: def('Medicae', 'Int', true),
    psyniscience: def('Psyniscience', 'Per', true),
    scrutiny: def('Scrutiny', 'Per', false),
    search: def('Search', 'Per', false), // RT/DH1e only
    security: def('Security', 'Ag', true),
    shadowing: def('Shadowing', 'Ag', true), // RT/DH1e only
    silentMove: def('Silent Move', 'Ag', false), // RT/DH1e only
    sleightOfHand: def('Sleight of Hand', 'Ag', true),
    survival: def('Survival', 'Int', false),
    swim: def('Swim', 'S', false), // RT/DH1e only
    tracking: def('Tracking', 'Int', true), // RT/DH1e only
    wrangling: def('Wrangling', 'Int', true), // RT/DH1e only

    // === DH2e/BC/OW Standard Skills (not in RT) ===
    athletics: def('Athletics', 'S', false), // DH2e/BC/OW
    linguistics: def('Linguistics', 'Int', true, true), // DH2e/BC/OW, Group
    navigate: def('Navigate', 'Int', true, true), // DH2e/BC/OW, Group
    operate: def('Operate', 'Ag', true, true), // DH2e/BC/OW, Group
    parry: def('Parry', 'WS', true), // DH2e/BC/OW
    stealth: def('Stealth', 'Ag', false), // DH2e/BC/OW

    // === Specialist Skill Groups (all systems) ===
    ciphers: def('Ciphers', 'Int', true, true), // RT/DH1e only
    commonLore: def('Common Lore', 'Int', true, true),
    drive: def('Drive', 'Ag', true, true), // RT/DH1e only
    forbiddenLore: def('Forbidden Lore', 'Int', true, true),
    navigation: def('Navigation', 'Int', true, true), // RT/DH1e only
    performer: def('Performer', 'Fel', true, true), // RT/DH1e only
    pilot: def('Pilot', 'Ag', true, true), // RT/DH1e only
    scholasticLore: def('Scholastic Lore', 'Int', true, true),
    secretTongue: def('Secret Tongue', 'Int', true, true), // RT/DH1e only
    speakLanguage: def('Speak Language', 'Int', true, true), // RT/DH1e only
    techUse: def('Tech-Use', 'Int', true), // Standard in DH2e, Group in RT
    trade: def('Trade', 'Int', true, true),
};

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
