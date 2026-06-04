/**
 * @file WithoutHomeworldInfoDialog — GM-only reference dialog displaying
 * the three Without-supplement home-worlds (Death World, Garden World,
 * Research Station) as cards for use during character creation.
 *
 * The dialog is a read-only surface over the typed registry in
 * `src/module/rules/without-homeworlds.ts`. Each card shows the
 * characteristic mods, Fate threshold (base + Emperor's Blessing
 * trigger), starting wounds, aptitude, key talents, recommended
 * backgrounds, and the mechanical-hook description. Death World's
 * surprise-bonus suppression rider, Garden World's Serenity rider,
 * and Research Station's Pursuit-of-Data rider are surfaced as
 * side-notes on their respective cards.
 *
 * See GitHub issue #102.
 */

import { formatCharacteristicMods, formatWounds } from '../../helpers/characteristic-labels.ts';
import { listWithoutHomeworlds, type WithoutHomeworldDef } from '../../rules/without-homeworlds.ts';
import { defineInfoCardDialog } from './define-info-card-dialog.ts';

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

function buildCardContext(def: WithoutHomeworldDef): WithoutHomeworldCardContext {
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
        bonusesLabel: formatCharacteristicMods(def.characteristicMods.bonuses, []),
        penaltiesLabel: formatCharacteristicMods([], def.characteristicMods.penalties),
        fateLabel: `${def.fateThreshold.base} (Emperor's Blessing ${def.fateThreshold.emperorsBlessing}+)`,
        woundsLabel: formatWounds(def.wounds.base, 1, def.wounds.dieFaces),
        aptitude: def.aptitude,
        keyTalents: def.keyTalents,
        recommendedBackgrounds: def.recommendedBackgrounds,
        mechanicalHook: def.mechanicalHook,
        surpriseSuppressionLabel,
        serenityLabel,
        pursuitOfDataLabel,
    };
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
    cards: () => listWithoutHomeworlds().map(buildCardContext),
});
export default WithoutHomeworldInfoDialog;

/** Convenience opener for menu entries / macros. */
export function openWithoutHomeworldInfoDialog(): void {
    void new WithoutHomeworldInfoDialog().render({ force: true });
}
