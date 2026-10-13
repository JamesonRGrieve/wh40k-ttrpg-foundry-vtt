/**
 * @file The runtime localisers the Scene Environment widget and window hand to
 * the pure `buildSceneEnvironmentView` (#604). Shared so neither surface imports
 * the other.
 */

import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';

/** Localise a langpack key; a key with data is formatted. */
export function formatEnvironmentKey(key: string, data?: Record<string, string>): string {
    return data === undefined ? game.i18n.localize(key) : game.i18n.format(key, data);
}

/** The localised display name of the world's primary game line. */
export function primaryLineLabel(): string {
    return game.i18n.localize(SystemConfigRegistry.get(WH40KSettings.getPrimaryGameSystem()).label);
}
