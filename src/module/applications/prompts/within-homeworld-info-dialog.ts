/**
 * @file WithinHomeworldInfoDialog — GM-only reference card grid for
 * the three new homeworld traits introduced by the Within supplement
 * (within.md L632-808): Agri World, Feudal World, Frontier World.
 *
 * This is a read-only surface: it displays each homeworld's
 * characteristic modifiers, fate threshold (with Emperor's Blessing
 * breakpoint), home-world bonus rules text, key aptitude(s), and
 * starting wounds expression. No actor mutation, no chat card —
 * application of a homeworld to a fresh character lives in its own
 * flow (the registry in `within-homeworlds.ts` is the data source).
 *
 * See GitHub issue #139.
 */

import {
    WITHIN_HOMEWORLDS,
    WITHIN_HOMEWORLD_IDS,
    type WithinCharacteristic,
    type WithinHomeworldDef,
    type WithinHomeworldId,
} from '../../rules/within-homeworlds.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Action handler bound with a `this` context, matching the Mixin's expectations. */
type ActionHandler = (this: WithinHomeworldInfoDialog, event: Event, target: HTMLElement) => Promise<void>;

/** i18n label keys for each homeworld id. */
const HOMEWORLD_LABEL_KEYS: Record<WithinHomeworldId, string> = {
    agriWorld: 'WH40K.WithinHomeworld.AgriWorld',
    feudalWorld: 'WH40K.WithinHomeworld.FeudalWorld',
    frontierWorld: 'WH40K.WithinHomeworld.FrontierWorld',
};

/**
 * Accent palette per homeworld — drives the card border / accent
 * color so each Within homeworld reads distinctly at a glance.
 *
 *   - Agri    → wheat / amber  (golden harvest fields)
 *   - Feudal  → emerald        (knightly heraldry / verdant fiefdoms)
 *   - Frontier → desert / tan   (arid borderworlds)
 */
interface AccentClasses {
    readonly border: string;
    readonly accentText: string;
    readonly accentBg: string;
}

const HOMEWORLD_ACCENTS: Record<WithinHomeworldId, AccentClasses> = {
    agriWorld: {
        border: 'tw-border-amber-600',
        accentText: 'tw-text-amber-300',
        accentBg: 'tw-bg-amber-900/30',
    },
    feudalWorld: {
        border: 'tw-border-emerald-600',
        accentText: 'tw-text-emerald-300',
        accentBg: 'tw-bg-emerald-900/30',
    },
    frontierWorld: {
        border: 'tw-border-yellow-700',
        accentText: 'tw-text-yellow-200',
        accentBg: 'tw-bg-yellow-900/30',
    },
};

/** i18n label keys for each Characteristic — short, capitalised. */
const CHARACTERISTIC_LABEL_KEYS: Record<WithinCharacteristic, string> = {
    weaponSkill: 'WH40K.Characteristic.WeaponSkill',
    ballisticSkill: 'WH40K.Characteristic.BallisticSkill',
    strength: 'WH40K.Characteristic.Strength',
    toughness: 'WH40K.Characteristic.Toughness',
    agility: 'WH40K.Characteristic.Agility',
    intelligence: 'WH40K.Characteristic.Intelligence',
    perception: 'WH40K.Characteristic.Perception',
    willpower: 'WH40K.Characteristic.Willpower',
    fellowship: 'WH40K.Characteristic.Fellowship',
};

/** Card view-model — one entry per homeworld rendered in the grid. */
interface HomeworldCard {
    id: WithinHomeworldId;
    labelKey: string;
    label: string;
    bonusName: string;
    bonusDescription: string;
    characteristicModsLabel: string;
    fateThresholdLabel: string;
    woundsLabel: string;
    keyAptitudes: readonly string[];
    accent: AccentClasses;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface WithinHomeworldInfoContext extends Record<string, unknown> {
    cards: HomeworldCard[];
}

function localize(key: string): string {
    return game.i18n?.localize?.(key) ?? key;
}

function formatCharacteristicMods(def: WithinHomeworldDef): string {
    const positives = def.characteristicMods.positive.map((c) => `+${localize(CHARACTERISTIC_LABEL_KEYS[c])}`);
    const negatives = def.characteristicMods.negative.map((c) => `−${localize(CHARACTERISTIC_LABEL_KEYS[c])}`);
    return [...positives, ...negatives].join(', ');
}

function formatFateThreshold(def: WithinHomeworldDef): string {
    return `${String(def.fateThreshold.base)} (${def.fateThreshold.emperorsBlessingMin.toString()}+)`;
}

function formatWounds(def: WithinHomeworldDef): string {
    return `${String(def.wounds.flat)} + ${String(def.wounds.dice)}d${String(def.wounds.faces)}`;
}

/**
 * GM-only reference dialog. Three Tailwind-styled cards, each
 * themed in a distinct palette so the homeworlds read as a set at
 * a glance. No action handlers beyond Close.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class WithinHomeworldInfoDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    constructor(options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'within-homeworld-info-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            close: WithinHomeworldInfoDialog.#onClose,
        },
        position: {
            width: 880,
        },
        window: {
            title: 'WH40K.WithinHomeworld.DialogTitle',
            resizable: true,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/within-homeworld-info-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<WithinHomeworldInfoContext> {
        const context = (await super._prepareContext(options)) as WithinHomeworldInfoContext;
        const cards: HomeworldCard[] = WITHIN_HOMEWORLD_IDS.map((id) => {
            const def = WITHIN_HOMEWORLDS[id];
            return {
                id,
                labelKey: HOMEWORLD_LABEL_KEYS[id],
                label: localize(HOMEWORLD_LABEL_KEYS[id]),
                bonusName: def.homeWorldBonus.name,
                bonusDescription: def.homeWorldBonus.description,
                characteristicModsLabel: formatCharacteristicMods(def),
                fateThresholdLabel: formatFateThreshold(def),
                woundsLabel: formatWounds(def),
                keyAptitudes: def.keyAptitudes.map((c) => localize(CHARACTERISTIC_LABEL_KEYS[c])),
                accent: HOMEWORLD_ACCENTS[id],
            };
        });
        return { ...context, cards };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onClose(this: WithinHomeworldInfoDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener for the dialog. */
export function openWithinHomeworldInfoDialog(): void {
    const dialog = new WithinHomeworldInfoDialog();
    void dialog.render({ force: true });
}
