/**
 * @file GrenadeThrowDialog — the throw prompt for a grenade that carries a rider (#135).
 *
 * Opened by the actor sheet's Throw on a grenade whose compendium document authors a
 * rider (`system.rider`). Lists every rider grenade the thrower carries, the thrown one
 * selected, and on "Throw" posts a chat card with the grenade's area, damage, qualities,
 * test, duration and effect. Every value comes from the grenade's own data; the view
 * model is `grenade-throw-view.ts`.
 */

import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import { resolveThrow } from '../../rules/combat-actions.ts';
import { ownerGameLine } from '../../utils/item-variant-utils.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { GRENADE_LABELS } from './grenade-labels.ts';
import { buildGrenadeThrowContext, type GrenadeItemView, type GrenadeThrowViewContext } from './grenade-throw-view.ts';

const { ApplicationV2 } = foundry.applications.api;

/** The thrower the dialog reads its grenades from. */
export interface GrenadeThrower {
    name: string;
    type: string;
    items: Iterable<{ id: string | null; name: string; isThrown: boolean; system: GrenadeItemView['system'] }>;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface GrenadeThrowContext extends Record<string, unknown>, GrenadeThrowViewContext {
    gameSystem: string;
}

/**
 * The rider grenades the thrower carries: thrown weapons whose Throw opens this dialog.
 * A rider grenade that deals damage takes the weapon roll instead (#622), so it is not listed.
 */
function riderGrenades(actor: GrenadeThrower): GrenadeItemView[] {
    return Array.from(actor.items).flatMap((item) =>
        item.id !== null && item.isThrown && resolveThrow(item.system).path === 'grenade-dialog' ? [{ id: item.id, name: item.name, system: item.system }] : [],
    );
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class GrenadeThrowDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    readonly #actor: GrenadeThrower;

    #selectedId: string;

    constructor(options: ApplicationV2Config.DefaultOptions & { actor: GrenadeThrower; itemId: string }) {
        super(options);
        this.#actor = options.actor;
        this.#selectedId = options.itemId;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'grenade-throw-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectGrenade: GrenadeThrowDialog.#onSelectGrenade,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            throw: GrenadeThrowDialog.#onThrow,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: GrenadeThrowDialog.#onCancel,
        },
        position: { width: 560 },
        window: {
            title: 'WH40K.GrenadeRider.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/grenade-throw-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** The thrower's line, which scopes the per-system styling of the dialog and its card. */
    get #gameSystem(): string {
        return ownerGameLine(this.#actor) ?? '';
    }

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<GrenadeThrowContext> {
        const context = await super._prepareContext(options);
        const view = buildGrenadeThrowContext(riderGrenades(this.#actor), this.#selectedId, GRENADE_LABELS);
        this.#selectedId = view.selectedId;
        return { ...context, ...view, gameSystem: this.#gameSystem };
    }

    static async #onSelectGrenade(this: GrenadeThrowDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const next = target.dataset['grenadeId'] ?? '';
        if (next === '' || !riderGrenades(this.#actor).some((item) => item.id === next)) return;
        this.#selectedId = next;
        await this.render();
    }

    static async #onThrow(this: GrenadeThrowDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const { selectedGrenade } = buildGrenadeThrowContext(riderGrenades(this.#actor), this.#selectedId, GRENADE_LABELS);
        if (selectedGrenade === null) return;
        const gameSystem = this.#gameSystem;
        await emitChatFromTemplate(
            'systems/wh40k-rpg/templates/chat/grenade-throw-chat.hbs',
            { rider: selectedGrenade, gameSystem, _gameSystemId: gameSystem },
            { speaker: { alias: this.#actor.name } },
        );
        await this.close();
    }

    static async #onCancel(this: GrenadeThrowDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Open the throw dialog for `actor`, on the grenade `itemId`. */
export function openGrenadeThrowDialog(opts: { actor: GrenadeThrower; itemId: string }): void {
    const dialog = new GrenadeThrowDialog(opts);
    void dialog.render({ force: true });
}
