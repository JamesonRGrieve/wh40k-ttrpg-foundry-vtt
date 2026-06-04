/**
 * @file BeyondHomeworldInfoDialog — GM-only reference dialog displaying
 * the three Beyond-supplement home-worlds (Daemon World, Penal Colony,
 * Quarantine World) as cards for use during character creation.
 *
 * The dialog is a read-only surface over the typed registry in
 * `src/module/rules/beyond-homeworlds.ts`. Each card shows the
 * characteristic mods, Fate threshold (base + Emperor's Blessing
 * trigger), starting wounds, aptitude, key talents, recommended
 * backgrounds, and the mechanical-hook description. Quarantine
 * World's subtlety-clamp rider and Daemon World's Corruption-Points
 * rider are surfaced as side-notes on their respective cards.
 *
 * See GitHub issue #140.
 */

import { listBeyondHomeworlds, type BeyondHomeworldDef } from '../../rules/beyond-homeworlds.ts';
import { defineInfoCardDialog } from './define-info-card-dialog.ts';

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
    return bonuses.map((b) => `+${b.charAt(0).toUpperCase()}${b.slice(1)}`).join(', ');
}

function formatPenalties(penalties: readonly string[]): string {
    return penalties.map((p) => `-${p.charAt(0).toUpperCase()}${p.slice(1)}`).join(', ');
}

function buildCardContext(def: BeyondHomeworldDef): BeyondHomeworldCardContext {
    const corruptionRiderLabel = def.corruptionRider ? `1d${def.corruptionRider.dieFaces} + ${def.corruptionRider.base} Corruption Points` : null;
    const subtletyClampLabel = def.subtletyClamp
        ? `Subtlety decreases reduced by ${def.subtletyClamp.reducedBy} (min reduction ${def.subtletyClamp.minimumReduction})`
        : null;
    return {
        id: def.id,
        label: def.label,
        accent: ACCENT_BY_ID[def.id],
        bonusesLabel: formatBonuses(def.characteristicMods.bonuses),
        penaltiesLabel: formatPenalties(def.characteristicMods.penalties),
        fateLabel: `${def.fateThreshold.base} (Emperor's Blessing ${def.fateThreshold.emperorsBlessing}+)`,
        woundsLabel: `${def.wounds.base} + 1d${def.wounds.dieFaces}`,
        aptitude: def.aptitude,
        keyTalents: def.keyTalents,
        recommendedBackgrounds: def.recommendedBackgrounds,
        mechanicalHook: def.mechanicalHook,
        corruptionRiderLabel,
        subtletyClampLabel,
    };
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
    cards: () => listBeyondHomeworlds().map(buildCardContext),
});
export default BeyondHomeworldInfoDialog;

/** Convenience opener for menu entries / macros. */
export function openBeyondHomeworldInfoDialog(): void {
    void new BeyondHomeworldInfoDialog().render({ force: true });
}
