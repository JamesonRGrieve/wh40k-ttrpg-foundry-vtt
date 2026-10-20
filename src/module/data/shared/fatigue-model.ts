/**
 * The fatigue rule set an actor of a game line plays under (#114): the line's RAW
 * model (halving / flat / condition) unless the world "fatigue mode" setting
 * forces one. Shared by the PC (creature) and NPC DataModels (#420), so both read
 * the same model.
 */

import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { FatigueModelDef } from '../../config/game-systems/types.ts';
import { FATIGUE_MODES, resolveFatigueModel } from '../../rules/fatigue.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';

/** The active fatigue model for a line; the flat model when the line is unknown. */
export function fatigueModelForLine(gameSystem: string | undefined): FatigueModelDef {
    const config = gameSystem !== undefined ? SystemConfigRegistry.getOrNull(gameSystem) : null;
    return resolveFatigueModel(config?.getFatigueModel() ?? FATIGUE_MODES.flat, WH40KSettings.getFatigueMode());
}
