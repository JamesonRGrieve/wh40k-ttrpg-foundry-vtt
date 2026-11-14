/**
 * A line's RAW / homebrew ruleset variant (#715).
 *
 * Only a line whose config declares `rulesetVariants` (DH2 today) has one; for
 * it the `dh2-ruleset` setting picks the variant. Character creation and the
 * character sheet ask here instead of writing `gameSystem === 'dh2' &&
 * isHomebrew()` at each site, so a line that gains a homebrew variant changes
 * its config, not the UI.
 */
import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';

/** The active ruleset variant of `systemId`, or null for a line without variants. */
export function activeRulesetVariant(systemId: string | null | undefined): 'raw' | 'homebrew' | null {
    if (SystemConfigRegistry.getOrNull(systemId ?? '')?.rulesetVariants !== true) return null;
    return WH40KSettings.getRuleset();
}

/** Whether `systemId` is playing its homebrew variant. */
export function isHomebrewVariant(systemId: string | null | undefined): boolean {
    return activeRulesetVariant(systemId) === 'homebrew';
}
