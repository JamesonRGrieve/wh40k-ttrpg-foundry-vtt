/**
 * Daemon weapon binding (beyond.md p. 50).
 *
 * Binding Strength tiers govern the weapon's stat baseline, the number
 * of Attributes the wielder may select, and personality traits that
 * trigger conditional effects. Pact with the bound entity carries an
 * always-on Subtlety penalty while wielded.
 */

export type BindingStrength = 'minor' | 'lesser' | 'normal' | 'greater' | 'major';

export interface BindingStrengthProfile {
    strength: BindingStrength;
    label: string;
    /** Attributes the wielder may choose / are baked in. */
    attributes: number;
    /** Subtlety modifier applied while the weapon is wielded. */
    subtletyPenalty: number;
    /** Difficulty modifier on the Daemonic Mastery binding test. */
    bindingDifficulty: number;
}

export const BINDING_STRENGTH_PROFILES: Record<BindingStrength, BindingStrengthProfile> = {
    minor: { strength: 'minor', label: 'Minor', attributes: 1, subtletyPenalty: -1, bindingDifficulty: 0 },
    lesser: { strength: 'lesser', label: 'Lesser', attributes: 2, subtletyPenalty: -2, bindingDifficulty: -10 },
    normal: { strength: 'normal', label: 'Normal', attributes: 3, subtletyPenalty: -3, bindingDifficulty: -20 },
    greater: { strength: 'greater', label: 'Greater', attributes: 4, subtletyPenalty: -5, bindingDifficulty: -30 },
    major: { strength: 'major', label: 'Major', attributes: 5, subtletyPenalty: -8, bindingDifficulty: -40 },
};

export type DaemonPersonality = 'jealous' | 'prideful' | 'vindictive' | 'overbearing';

/** Per-personality flavour hooks. The engine consumer applies the matching effect when its trigger condition is met. */
export const DAEMON_PERSONALITY_TRIGGERS: Record<DaemonPersonality, { trigger: string; effect: string }> = {
    jealous: { trigger: 'Wielder uses a different weapon in their main hand', effect: '−10 on all WS tests until the daemon weapon is wielded again.' },
    prideful: { trigger: 'Wielder hides the weapon from others', effect: '+1 Corruption per day of concealment.' },
    vindictive: { trigger: 'Wielder is wounded in melee', effect: 'Next attack adds Vengeful (8) for that strike only.' },
    overbearing: { trigger: 'Combat begins', effect: 'Willpower test or attack the nearest sentient creature for one round.' },
};
