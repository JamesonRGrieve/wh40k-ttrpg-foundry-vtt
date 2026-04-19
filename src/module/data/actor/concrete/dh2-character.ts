import CharacterBaseData from '../bases/character-base.ts';

/**
 * DH2 Character (Acolyte) data model.
 * Inherits the full PC schema from CharacterBaseData (characteristics, skills,
 * XP, origin path, aptitudes, fate/corruption/insanity, etc.). Add DH2-specific
 * fields here via defineSchema override if/when they diverge.
 */
export default class DH2CharacterData extends CharacterBaseData {
    static gameSystem = 'dh2e';
}
