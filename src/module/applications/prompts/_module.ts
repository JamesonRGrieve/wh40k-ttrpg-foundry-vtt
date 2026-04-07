/**
 * @file Prompt/Dialog exports for ApplicationV2-based prompts
 */

// Base class
export { default as BaseRollDialog } from './base-roll-dialog.ts';

// Roll dialogs
export { default as WeaponAttackDialog, prepareWeaponRoll } from './weapon-attack-dialog.ts';
export { default as PsychicPowerDialog, preparePsychicPowerRoll } from './psychic-power-dialog.ts';
export { default as ForceFieldDialog, prepareForceFieldRoll } from './force-field-dialog.ts';
export { default as AssignDamageDialog, prepareAssignDamageRoll } from './assign-damage-dialog.ts';
export { default as DamageRollDialog, prepareDamageRoll } from './damage-roll-dialog.ts';
export { default as SimpleRollDialog, prepareSimpleRoll } from './simple-roll-dialog.ts';
export { default as EnhancedSkillDialog, prepareEnhancedSkillRoll } from './enhanced-skill-dialog.ts';
export { default as SpecialistSkillDialog, prepareCreateSpecialistSkillPrompt } from './specialist-skill-dialog.ts';

// Utility dialogs
export { default as AddXPDialog, openAddXPDialog } from './add-xp-dialog.ts';

// Unified Roll Dialog
export { default as UnifiedRollDialog, prepareUnifiedRoll } from './unified-roll-dialog.ts';

// Effect creation
export { default as EffectCreationDialog } from './effect-creation-dialog.ts';
