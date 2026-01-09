/**
 * @file Prompt/Dialog exports for ApplicationV2-based prompts
 */

// Base class
export { default as BaseRollDialog } from "./base-roll-dialog.mjs";

// Roll dialogs
export { default as WeaponAttackDialog, prepareWeaponRoll } from "./weapon-attack-dialog.mjs";
export { default as PsychicPowerDialog, preparePsychicPowerRoll } from "./psychic-power-dialog.mjs";
export { default as ForceFieldDialog, prepareForceFieldRoll } from "./force-field-dialog.mjs";
export { default as AssignDamageDialog, prepareAssignDamageRoll } from "./assign-damage-dialog.mjs";
export { default as DamageRollDialog, prepareDamageRoll } from "./damage-roll-dialog.mjs";
export { default as SimpleRollDialog, prepareSimpleRoll } from "./simple-roll-dialog.mjs";
export { default as EnhancedSkillDialog, prepareEnhancedSkillRoll } from "./enhanced-skill-dialog.mjs";
export { default as SpecialistSkillDialog, prepareCreateSpecialistSkillPrompt } from "./specialist-skill-dialog.mjs";

// Utility dialogs
export { default as AddXPDialog, openAddXPDialog } from "./add-xp-dialog.mjs";
