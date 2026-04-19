/**
 * @file CharacterBaseData — shared data model for all Player Characters.
 *
 * This is the "PlayerMixin" in the hierarchy: every system's concrete
 * character data model (DH2Character, RTCharacter, etc.) extends this class
 * directly or via a per-system intermediate. It already contains the full PC
 * schema — characteristics (via CreatureTemplate), skills, experience ledger,
 * origin path chain, aptitudes, fate/corruption/insanity, bio, etc. — so
 * per-system subclasses typically only need to override defineSchema to add
 * a few system-specific fields on top.
 *
 * Historically this class was named CharacterData; it keeps that name as an
 * alias below for back-compat while the codebase migrates to the new naming.
 */

import CharacterData from '../character.ts';

export default class CharacterBaseData extends CharacterData {}
