/**
 * @file BeyondHomeworldInfoDialog — GM-only reference dialog displaying
 * the three Beyond-supplement home-worlds (Daemon World, Penal Colony,
 * Quarantine World) as cards for use during character creation.
 *
 * Per Direction #7 (#338), the basic mechanical VALUES (characteristic
 * mods, Fate threshold + Emperor's Blessing trigger, starting wounds,
 * aptitude) are read from the compendium pack `dh2-beyond-origins-homeworlds`
 * via {@link readHomeworldMechanics}; the supplement-specific data (key
 * talents, recommended backgrounds, mechanical hook, and the structured
 * Corruption / subtlety-clamp riders) comes from the slimmed registry in
 * `src/module/rules/beyond-homeworlds.ts`. Each card joins the two by the
 * registry entry's `compendiumId`. Quarantine World's subtlety-clamp rider
 * and Daemon World's Corruption-Points rider are surfaced as side-notes on
 * their respective cards.
 *
 * See GitHub issue #140.
 */

import { listBeyondHomeworlds, type BeyondHomeworldDef } from '../../rules/beyond-homeworlds.ts';
import { readHomeworldMechanics, type HomeworldMechanics } from '../../rules/homeworld-compendium.ts';
import { capitalize } from '../../utils/format.ts';
import { defineInfoCardDialog } from './define-info-card-dialog.ts';

/** Fully-qualified compendium pack id holding the Beyond home-world `originPath` documents. */
const BEYOND_HOMEWORLD_PACK = 'wh40k-rpg.dh2-beyond-origins-homeworlds';

/** Per-card accent palette — drives the themed border / heading on each card. */
type AccentKey = 'crimson' | 'grey' | 'green';

const ACCENT_BY_ID: Record<BeyondHomeworldDef['id'], AccentKey> = {
    daemonWorld: 'crimson',
    penalColony: 'grey',
    quarantineWorld: 'green',
};

interface BeyondHomeworldCardContext {
    readonly id: BeyondHomeworldDef['id'];
    readonly label: string;
    readonly accent: AccentKey;
    readonly bonusesLabel: string;
    readonly penaltiesLabel: string;
    readonly fateLabel: string;
    readonly woundsLabel: string;
    readonly aptitude: string;
    readonly keyTalents: readonly string[];
    readonly recommendedBackgrounds: readonly string[];
    readonly mechanicalHook: string;
    readonly corruptionRiderLabel: string | null;
    readonly subtletyClampLabel: string | null;
}

function formatBonuses(bonuses: readonly string[]): string {
    return bonuses.map((b) => `+${capitalize(b)}`).join(', ');
}

function formatPenalties(penalties: readonly string[]): string {
    return penalties.map((p) => `-${capitalize(p)}`).join(', ');
}

/** Join a slimmed registry entry with its compendium-sourced mechanical basics. */
function buildCardContext(def: BeyondHomeworldDef, mechanics: HomeworldMechanics): BeyondHomeworldCardContext {
    const corruptionRiderLabel = def.corruptionRider ? `1d${def.corruptionRider.dieFaces} + ${def.corruptionRider.base} Corruption Points` : null;
    const subtletyClampLabel = def.subtletyClamp
        ? `Subtlety decreases reduced by ${def.subtletyClamp.reducedBy} (min reduction ${def.subtletyClamp.minimumReduction})`
        : null;
    return {
        id: def.id,
        label: def.label,
        accent: ACCENT_BY_ID[def.id],
        bonusesLabel: formatBonuses(mechanics.charModsPositive),
        penaltiesLabel: formatPenalties(mechanics.charModsNegative),
        fateLabel: `${mechanics.fateBase} (Emperor's Blessing ${mechanics.emperorsBlessingMin}+)`,
        woundsLabel: `${mechanics.woundsFlat} + ${mechanics.woundsDice}d${mechanics.woundsFaces}`,
        aptitude: mechanics.aptitudes.join(', '),
        keyTalents: def.keyTalents,
        recommendedBackgrounds: def.recommendedBackgrounds,
        mechanicalHook: def.mechanicalHook,
        corruptionRiderLabel,
        subtletyClampLabel,
    };
}

/**
 * Build the card view-models, joining each slimmed registry entry with the
 * compendium document that carries its mechanical basics. Entries whose
 * compendium document is absent are skipped.
 */
async function buildBeyondCards(): Promise<BeyondHomeworldCardContext[]> {
    const mechanicsById = await readHomeworldMechanics(BEYOND_HOMEWORLD_PACK);
    const cards: BeyondHomeworldCardContext[] = [];
    for (const def of listBeyondHomeworlds()) {
        const mechanics = mechanicsById.get(def.compendiumId);
        if (mechanics === undefined) continue;
        cards.push(buildCardContext(def, mechanics));
    }
    return cards;
}

/**
 * GM-only info dialog presenting the three Beyond home-worlds as
 * side-by-side cards. Read-only; closes via the standard ApplicationV2
 * window chrome.
 */
const BeyondHomeworldInfoDialog = defineInfoCardDialog({
    id: 'beyond-homeworld-info-dialog',
    titleKey: 'WH40K.BeyondHomeworld.DialogTitle',
    template: 'systems/wh40k-rpg/templates/prompt/beyond-homeworld-info-dialog.hbs',
    contextKey: 'homeworlds',
    cards: buildBeyondCards,
});
export default BeyondHomeworldInfoDialog;

/** Convenience opener for menu entries / macros. */
export function openBeyondHomeworldInfoDialog(): void {
    void new BeyondHomeworldInfoDialog().render({ force: true });
}
