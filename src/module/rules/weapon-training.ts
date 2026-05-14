/**
 * @file weapon-training.mjs - Weapon Training talent integration
 * Handles checking if an actor has the required Weapon Training talent for a weapon.
 */

import type { WH40KBaseActorDocument, WH40KItemDocument } from '../types/global.d.ts';

type WeaponTrainingTalent = WH40KItemDocument & { type: string; name: string };
type WeaponTrainingWeapon = WH40KItemDocument & {
    system: WH40KItemDocument['system'] & {
        requiredTraining?: string;
        special?: string;
    };
};

type WeaponTrainingResult = {
    trained: boolean;
    talent: WeaponTrainingTalent | null;
};

/**
 * Check if an actor has the required weapon training for a weapon.
 * @param {WH40KActor} actor - The actor using the weapon
 * @param {WH40KItem} weapon - The weapon being used
 * @returns {{trained: boolean, talent: WH40KItem|null}} Training status and talent if found
 */
export function checkWeaponTraining(actor: WH40KBaseActorDocument, weapon: WeaponTrainingWeapon): WeaponTrainingResult {
    const requiredTraining = weapon.system.requiredTraining;

    // No training required (e.g., primitive weapons, unarmed)
    if (requiredTraining === undefined || requiredTraining === '' || requiredTraining === '-') {
        return { trained: true, talent: null };
    }

    // Grenades don't require weapon training
    const isGrenade = weapon.system.special?.includes('grenade') ?? false;
    if (isGrenade) {
        return { trained: true, talent: null };
    }

    // Search actor's talents for matching Weapon Training
    const talents = Array.from(actor.items).filter((item) => item.type === 'talent') as WeaponTrainingTalent[];

    // Look for exact match first (e.g., "Weapon Training (Las)")
    const exactMatch = talents.find((talent: WeaponTrainingTalent) => {
        const name = talent.name.toLowerCase();
        const required = requiredTraining.toLowerCase();

        // Direct name match
        if (name === required) return true;

        // Check for "Weapon Training (X)" pattern
        if (name.includes('weapon training')) {
            // Extract specialization from talent name
            const specializationMatch = name.match(/weapon training\s*\(([^)]+)\)/i);
            const talentSpecRaw = specializationMatch?.[1];
            if (talentSpecRaw !== undefined) {
                const talentSpec = talentSpecRaw.trim().toLowerCase();
                // Check if required training matches the specialization
                if (required.includes(talentSpec)) return true;
                // Or if required training is in "Weapon Training (X)" format
                const requiredMatch = required.match(/weapon training\s*\(([^)]+)\)/i);
                const requiredSpecRaw = requiredMatch?.[1];
                if (requiredSpecRaw !== undefined) {
                    const requiredSpec = requiredSpecRaw.trim().toLowerCase();
                    if (talentSpec === requiredSpec) return true;
                }
            }
        }

        return false;
    });

    if (exactMatch) {
        return { trained: true, talent: exactMatch };
    }

    // Check for universal weapon training talents (if any exist in system)
    const universalTraining = talents.find((talent: WeaponTrainingTalent) => {
        const name = talent.name.toLowerCase();
        return name === 'weapon training' || name === 'weapon master' || name.includes('all weapons');
    });

    if (universalTraining) {
        return { trained: true, talent: universalTraining };
    }

    // Not trained
    return { trained: false, talent: null };
}

/**
 * Get the weapon training modifier for a weapon roll.
 * Returns -20 if untrained, 0 if trained.
 *
 * @param {WH40KActor} actor - The actor using the weapon
 * @param {WH40KItem} weapon - The weapon being used
 * @returns {number} The modifier to apply (-20 or 0)
 */
export function getWeaponTrainingModifier(actor: WH40KBaseActorDocument, weapon: WeaponTrainingWeapon): number {
    const { trained } = checkWeaponTraining(actor, weapon);
    return trained ? 0 : -20;
}

/**
 * Get a human-readable description of weapon training status.
 *
 * @param {WH40KActor} actor - The actor using the weapon
 * @param {WH40KItem} weapon - The weapon being used
 * @returns {string} Description of training status
 */
export function getWeaponTrainingDescription(actor: WH40KBaseActorDocument, weapon: WeaponTrainingWeapon): string {
    const { trained, talent } = checkWeaponTraining(actor, weapon);

    if (trained && talent) {
        return `Trained (${talent.name})`;
    } else if (trained) {
        return 'No training required';
    } else {
        const requiredTraining = weapon.system.requiredTraining;
        const required = requiredTraining === undefined || requiredTraining === '' ? 'Unknown' : requiredTraining;
        return `Untrained (-20 penalty, requires: ${required})`;
    }
}
