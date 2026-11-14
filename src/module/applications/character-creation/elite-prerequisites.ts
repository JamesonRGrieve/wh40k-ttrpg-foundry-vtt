/**
 * Elite Advance prerequisites (#717): pure reads over an origin's plain data.
 *
 * The builder asks the prerequisite validator about the gates these return;
 * characteristic gates wait for the characteristics step and are checked at
 * commit, the rest are checked when the elite is offered.
 */
import type { Prerequisite } from '../../config/game-systems/types.ts';
import type { NormalizedOrigin } from './normalized-origin.ts';

const PREREQUISITE_TYPES: ReadonlySet<string> = new Set(['characteristic', 'skill', 'talent', 'influence', 'origin', 'notOrigin']);

/** An elite's structured prerequisites (`system.prerequisites`), the well-formed entries only. */
export function elitePrerequisites(system: NormalizedOrigin['system']): Prerequisite[] {
    const raw = system['prerequisites'];
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (entry): entry is Prerequisite =>
            entry !== null &&
            typeof entry === 'object' &&
            'type' in entry &&
            typeof entry.type === 'string' &&
            PREREQUISITE_TYPES.has(entry.type) &&
            'key' in entry &&
            typeof entry.key === 'string',
    );
}

/** The gates checked when the elite is offered: every prerequisite but the characteristic ones. */
export function offerGates(prerequisites: readonly Prerequisite[]): Prerequisite[] {
    return prerequisites.filter((p) => p.type !== 'characteristic');
}

/** The gates checked at commit, once characteristics are set. */
export function characteristicGates(prerequisites: readonly Prerequisite[]): Prerequisite[] {
    return prerequisites.filter((p) => p.type === 'characteristic');
}

/** The XP an elite costs beyond the budget, or null when the budget covers it. */
export function xpShortfall(cost: number, budget: number): { cost: number; available: number } | null {
    return cost > budget ? { cost, available: budget } : null;
}
