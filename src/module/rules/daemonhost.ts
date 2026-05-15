/**
 * Daemonhost creation + Binding Strength tables (beyond.md p. 66).
 *
 * A Daemonhost is bound by the same `BindingStrength` tiers used for
 * daemon weapons (see `daemon-weapon.ts`). Each tier sets the host's
 * stat baseline, the number of Unholy Changes applied, and the
 * Influence cost to call the host in as a Reinforcement.
 */

import type { BindingStrength } from './daemon-weapon.ts';

export interface DaemonhostTier {
    strength: BindingStrength;
    label: string;
    /** Unholy Changes rolled when the host is bound. */
    unholyChanges: number;
    /** Influence target modifier when calling this host as a Reinforcement. */
    reinforcementModifier: number;
    /** Minimum Influence required to even attempt to call this tier. */
    minimumInfluence: number;
}

export const DAEMONHOST_TIERS: Record<BindingStrength, DaemonhostTier> = {
    minor: { strength: 'minor', label: 'Minor Daemonhost', unholyChanges: 1, reinforcementModifier: 0, minimumInfluence: 20 },
    lesser: { strength: 'lesser', label: 'Lesser Daemonhost', unholyChanges: 2, reinforcementModifier: -10, minimumInfluence: 30 },
    normal: { strength: 'normal', label: 'Daemonhost', unholyChanges: 3, reinforcementModifier: -20, minimumInfluence: 50 },
    greater: { strength: 'greater', label: 'Greater Daemonhost', unholyChanges: 4, reinforcementModifier: -30, minimumInfluence: 70 },
    major: { strength: 'major', label: 'Major Daemonhost', unholyChanges: 5, reinforcementModifier: -40, minimumInfluence: 90 },
};
