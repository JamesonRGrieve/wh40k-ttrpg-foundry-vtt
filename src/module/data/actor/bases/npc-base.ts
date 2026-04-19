/**
 * @file NPCBaseData — shared data model for all NPCs.
 *
 * This is the "NPCMixin" in the hierarchy: every system's concrete NPC data
 * model (DH2NPC, RTNPC, etc.) extends this class. It already contains the full
 * NPC schema — simplified characteristics, threat level, type/role
 * classification, sparse trainedSkills, simple weapons array, armour locations,
 * horde mechanics (via HordeTemplate), dispositions, relationships, faction
 * metadata, custom-stats overrides, tags, specialAbilities, quickNotes,
 * tactics, personality, etc. — so per-system subclasses typically only need
 * to override defineSchema to add a few system-specific fields on top.
 *
 * Historically this class was named NPCDataV2; it keeps that name as an alias
 * below for back-compat while the codebase migrates to the new naming.
 */

import NPCDataV2 from '../npc-v2.ts';

export default class NPCBaseData extends NPCDataV2 {}
