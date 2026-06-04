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
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

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

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface WithoutHomeworldInfoContext extends Record<string, unknown> {
    homeworlds: readonly WithoutHomeworldCardContext[];
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
 * GM-only info dialog presenting the three Without home-worlds as
 * side-by-side cards. Read-only; closes via the standard ApplicationV2
 * window chrome.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class WithoutHomeworldInfoDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'div',
        classes: ['wh40k-rpg', 'dialog', 'without-homeworld-info-dialog'],
        position: {
            width: 720,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 position.height accepts the literal 'auto' at runtime but the type is `number`
            height: 'auto' as unknown as number,
        },
        window: {
            title: 'WH40K.WithoutHomeworld.DialogTitle',
            resizable: true,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        cards: {
            template: 'systems/wh40k-rpg/templates/prompt/without-homeworld-info-dialog.hbs',
            classes: [],
            scrollable: ['.without-homeworld-info-dialog__scroll'],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<WithoutHomeworldInfoContext> {
        const context = (await super._prepareContext(options)) as WithoutHomeworldInfoContext;
        return {
            ...context,
            homeworlds: listWithoutHomeworlds().map(buildCardContext),
        };
    }
}

/* -------------------------------------------- */
/*  Helper                                      */
/* -------------------------------------------- */

/** Convenience opener for menu entries / macros. */
export function openWithoutHomeworldInfoDialog(): void {
    const dialog = new WithoutHomeworldInfoDialog();
    void dialog.render({ force: true });
}
