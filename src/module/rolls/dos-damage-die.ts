/**
 * Whether a damage card offers the Degrees-of-Success damage die (#737).
 *
 * The line's config declares whether it has the rule (`dosDamageDie`); the
 * attack's damage data records whether the one die it grants is spent.
 */
import { SystemConfigRegistry } from '../config/game-systems/index.ts';

/** True when the attacker's line has the rule and this attack has not spent its die. */
export function dosDamageDieOffered(gameSystemId: string | undefined, used: boolean): boolean {
    if (used || gameSystemId === undefined) return false;
    return SystemConfigRegistry.getOrNull(gameSystemId)?.dosDamageDie ?? false;
}
