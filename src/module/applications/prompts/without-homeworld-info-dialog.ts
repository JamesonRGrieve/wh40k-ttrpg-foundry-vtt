/**
 * @file WithoutHomeworldInfoDialog — GM-only reference dialog displaying
 * the three Without-supplement home-worlds (Death World, Garden World,
 * Research Station) as cards for use during character creation.
 *
 * Per Direction #7 (#338), the basic mechanical VALUES (characteristic
 * mods, Fate threshold + Emperor's Blessing trigger, starting wounds,
 * aptitude) are read from the compendium pack `dh2-without-origins-homeworlds`
 * via {@link readHomeworldMechanics}; the supplement-specific data (key
 * talents, recommended backgrounds, mechanical hook, and the structured
 * surprise-suppression / Serenity / Pursuit-of-Data riders) comes from the
 * slimmed registry in `src/module/rules/without-homeworlds.ts`. Each card
 * joins the two by the registry entry's `compendiumId`. Death World's
 * surprise-bonus suppression rider, Garden World's Serenity rider, and
 * Research Station's Pursuit-of-Data rider are surfaced as side-notes on
 * their respective cards.
 *
 * See GitHub issue #102.
 */

import { formatCharacteristicMods, formatWounds } from '../../helpers/characteristic-labels.ts';
import { readHomeworldMechanics, type HomeworldMechanics } from '../../rules/homeworld-compendium.ts';
import { listWithoutHomeworlds, type WithoutHomeworldDef } from '../../rules/without-homeworlds.ts';
import { defineInfoCardDialog } from './define-info-card-dialog.ts';

/** Fully-qualified compendium pack id holding the Without home-world `originPath` documents. */
const WITHOUT_HOMEWORLD_PACK = 'wh40k-rpg.dh2-without-origins-homeworlds';

/** Per-card accent palette — drives the themed border / heading on each card. */
type AccentKey = 'crimson' | 'green' | 'grey';

const ACCENT_BY_ID: Record<WithoutHomeworldDef['id'], AccentKey> = {
    deathWorld: 'crimson',
    gardenWorld: 'green',
    researchStation: 'grey',
};

interface WithoutHomeworldCardContext {
    readonly id: WithoutHomeworldDef['id'];
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
    readonly surpriseSuppressionLabel: string | null;
    readonly serenityLabel: string | null;
    readonly pursuitOfDataLabel: string | null;
}

/** Join a slimmed registry entry with its compendium-sourced mechanical basics. */
function buildCardContext(def: WithoutHomeworldDef, mechanics: HomeworldMechanics): WithoutHomeworldCardContext {
    const surpriseSuppressionLabel = def.surpriseBonusSuppression
        ? `Suppresses +${def.surpriseBonusSuppression.suppressedBonus} WS/BS bonus from non-Surprised attackers`
        : null;
    const serenityLabel = def.serenityRider
        ? `Shock/Trauma duration ×${def.serenityRider.durationMultiplier} (round ${def.serenityRider.rounding}); Insanity removal ${def.serenityRider.insanityRemovalCost} XP/pt (was ${def.serenityRider.baselineInsanityRemovalCost})`
        : null;
    const pursuitOfDataLabel = def.pursuitOfDataRider
        ? `Scholastic Lore Rank ${def.pursuitOfDataRider.triggerScholasticRank} → Forbidden Lore Rank ${def.pursuitOfDataRider.grantedForbiddenRank} (related specialisation, GM arbitrates)`
        : null;
    return {
        id: def.id,
        label: def.label,
        accent: ACCENT_BY_ID[def.id],
        bonusesLabel: formatCharacteristicMods(mechanics.charModsPositive, []),
        penaltiesLabel: formatCharacteristicMods([], mechanics.charModsNegative),
        fateLabel: `${mechanics.fateBase} (Emperor's Blessing ${mechanics.emperorsBlessingMin}+)`,
        woundsLabel: formatWounds(mechanics.woundsFlat, mechanics.woundsDice, mechanics.woundsFaces),
        aptitude: mechanics.aptitudes.join(', '),
        keyTalents: def.keyTalents,
        recommendedBackgrounds: def.recommendedBackgrounds,
        mechanicalHook: def.mechanicalHook,
        surpriseSuppressionLabel,
        serenityLabel,
        pursuitOfDataLabel,
    };
}

/**
 * Build the card view-models, joining each slimmed registry entry with the
 * compendium document that carries its mechanical basics. Entries whose
 * compendium document is absent are skipped.
 */
async function buildWithoutCards(): Promise<WithoutHomeworldCardContext[]> {
    const mechanicsById = await readHomeworldMechanics(WITHOUT_HOMEWORLD_PACK);
    const cards: WithoutHomeworldCardContext[] = [];
    for (const def of listWithoutHomeworlds()) {
        const mechanics = mechanicsById.get(def.compendiumId);
        if (mechanics === undefined) continue;
        cards.push(buildCardContext(def, mechanics));
    }
    return cards;
}

/**
 * GM-only info dialog presenting the three Without home-worlds as side-by-side
 * cards. Read-only; built from the shared info-card-dialog factory (#287).
 */
const WithoutHomeworldInfoDialog = defineInfoCardDialog({
    id: 'without-homeworld-info-dialog',
    titleKey: 'WH40K.WithoutHomeworld.DialogTitle',
    template: 'systems/wh40k-rpg/templates/prompt/without-homeworld-info-dialog.hbs',
    contextKey: 'homeworlds',
    cards: buildWithoutCards,
});
export default WithoutHomeworldInfoDialog;

/** Convenience opener for menu entries / macros. */
export function openWithoutHomeworldInfoDialog(): void {
    void new WithoutHomeworldInfoDialog().render({ force: true });
}
