/**
 * @file DaemonhostBindingDialog — GM dialog for selecting a Binding
 * Strength tier when a Daemonhost is summoned and bound. Emits a chat
 * card describing the bound tier on confirm.
 *
 * No actor creation here — that lands as a compendium follow-up. This
 * surface is the tier-selection card grid plus the resulting chat
 * announcement, driven from `DAEMONHOST_TIERS` in
 * `src/module/rules/daemonhost.ts`.
 *
 * See GitHub issue #85.
 */

import type { BindingStrength } from '../../rules/daemon-weapon.ts';
import { DAEMONHOST_TIERS, type DaemonhostTier } from '../../rules/daemonhost.ts';
import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Tier ids in display order — matches the brief's "five tier cards in a grid". */
const TIER_ORDER: readonly BindingStrength[] = ['minor', 'lesser', 'normal', 'greater', 'major'] as const;

/** i18n label keys keyed by tier id; static so the lookup stays inference-friendly. */
const TIER_LABEL_KEYS: Record<BindingStrength, string> = {
    minor: 'WH40K.Daemonhost.TierMinor',
    lesser: 'WH40K.Daemonhost.TierLesser',
    normal: 'WH40K.Daemonhost.TierNormal',
    greater: 'WH40K.Daemonhost.TierGreater',
    major: 'WH40K.Daemonhost.TierMajor',
};

/** Card view-model — one entry per tier card rendered in the grid. */
interface TierCard {
    id: BindingStrength;
    label: string;
    unholyChanges: number;
    reinforcementModifier: number;
    minimumInfluence: number;
    /** Signed string form of the modifier, e.g. "+0", "-20". */
    reinforcementModifierLabel: string;
    selected: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface DaemonhostBindingContext extends Record<string, unknown> {
    tiers: TierCard[];
    selected: BindingStrength;
    canBind: boolean;
}

/**
 * GM-only dialog: pick a Binding Strength tier, click Bind, post a chat
 * card. The chat card is system-themed via `data-wh40k-system="dh2"`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class DaemonhostBindingDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /** Currently selected tier id (defaults to the lowest tier). */
    declare selectedTier: BindingStrength;

    constructor(options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.selectedTier = 'minor';
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'daemonhost-binding-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectTier: DaemonhostBindingDialog.#onSelectTier,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            bind: DaemonhostBindingDialog.#onBind,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: DaemonhostBindingDialog.#onCancel,
        },
        position: {
            width: 640,
        },
        window: {
            title: 'WH40K.Daemonhost.DialogTitle',
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/daemonhost-binding-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<DaemonhostBindingContext> {
        const context = (await super._prepareContext(options)) as DaemonhostBindingContext;

        const tiers: TierCard[] = TIER_ORDER.map((id) => {
            const tier: DaemonhostTier = DAEMONHOST_TIERS[id];
            const label = game.i18n.localize(TIER_LABEL_KEYS[id]);
            const mod = tier.reinforcementModifier;
            return {
                id,
                label,
                unholyChanges: tier.unholyChanges,
                reinforcementModifier: mod,
                reinforcementModifierLabel: mod > 0 ? `+${mod}` : String(mod),
                minimumInfluence: tier.minimumInfluence,
                selected: id === this.selectedTier,
            };
        });

        return {
            ...context,
            tiers,
            selected: this.selectedTier,
            canBind: true,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onSelectTier(this: DaemonhostBindingDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const next = target.dataset['tier'];
        if (next === undefined) return;
        if (!TIER_ORDER.includes(next as BindingStrength)) return;
        this.selectedTier = next as BindingStrength;
        await this.render();
    }

    /* -------------------------------------------- */

    static async #onBind(this: DaemonhostBindingDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const tier: DaemonhostTier = DAEMONHOST_TIERS[this.selectedTier];
        const label = game.i18n.localize(TIER_LABEL_KEYS[this.selectedTier]);
        const mod = tier.reinforcementModifier;
        const modLabel = mod > 0 ? `+${mod}` : String(mod);

        const templateData = {
            label,
            tierId: this.selectedTier,
            unholyChanges: tier.unholyChanges,
            reinforcementModifier: mod,
            reinforcementModifierLabel: modLabel,
            minimumInfluence: tier.minimumInfluence,
            gameSystem: 'dh2',
        };

        await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/daemonhost-binding-chat.hbs', templateData);
        await this.close();
    }

    /* -------------------------------------------- */

    static async #onCancel(this: DaemonhostBindingDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper                                      */
/* -------------------------------------------- */

/** Convenience opener for the dialog. */
export function openDaemonhostBindingDialog(): void {
    const dialog = new DaemonhostBindingDialog();
    void dialog.render({ force: true });
}
