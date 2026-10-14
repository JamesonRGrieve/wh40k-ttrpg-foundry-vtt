/**
 * @file GrenadeThrowDialog — the throw prompt for a grenade that carries a rider (#135).
 *
 * Opened by the actor sheet's Throw on a grenade whose compendium document authors a
 * rider (`system.rider`). Lists every rider grenade the thrower carries, the thrown one
 * selected, and on "Throw" posts a chat card with the grenade's area, damage, qualities,
 * test, duration and effect. Every value comes from the grenade's own data; the view
 * model is `grenade-throw-view.ts`.
 */

import { activeTokenOf, placeRiderTemplate } from '../../canvas/area-template-canvas.ts';
import { t } from '../../i18n/t.ts';
import { type RiderThrowFlag, riderThrowFlags } from '../../rolls/grenade-rider-flag.ts';
import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import { resolveThrow } from '../../rules/combat-actions.ts';
import { riderArea, riderRadiusMetres } from '../../rules/grenade-rider.ts';
import { ownerGameLine } from '../../utils/item-variant-utils.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { GRENADE_LABELS } from './grenade-labels.ts';
import { buildGrenadeThrowContext, type GrenadeItemView, type GrenadeThrowViewContext } from './grenade-throw-view.ts';

const { ApplicationV2 } = foundry.applications.api;

/** The thrower the dialog reads its grenades from, and places a rider's area from (#623). */
export interface GrenadeThrower {
    name: string;
    type: string;
    /** Null only before the actor is persisted; such a thrower places no rider area. */
    uuid: string | null;
    items: Iterable<{ id: string | null; name: string; isThrown: boolean; system: GrenadeItemView['system'] }>;
    getActiveTokens: () => foundry.canvas.placeables.Token[];
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

    /**
     * Place the thrown grenade's rider area (#623) on the user's target, or on the thrower
     * to drag into place, and return the flag its card carries so Resolve Rider finds it.
     * Null when the grenade prints no area or there is no canvas to place it on.
     */
    async #placeRiderArea(grenade: GrenadeItemView): Promise<RiderThrowFlag | null> {
        const { rider, effectiveSpecial = new Set<string>() } = grenade.system;
        const area = rider == null ? null : riderArea(rider, effectiveSpecial);
        const thrower = activeTokenOf(this.#actor);
        const actorUuid = this.#actor.uuid;
        if (area === null || thrower === null || actorUuid === null) return null;
        const printed = Number(area.size);
        // A dice-sized area (a 3d10 m smokescreen) is rolled where it lands.
        const size = Number.isFinite(printed) ? printed : (await new Roll(area.size).evaluate()).total;
        const ref = await placeRiderTemplate(riderRadiusMetres(size, area.measure), thrower, game.user.targets.first() ?? null);
        if (ref === null) return null;
        ui.notifications.info(t('WH40K.GrenadeRider.Placed', { grenade: grenade.name }));
        return { ...ref, actorUuid, itemId: grenade.id };
    }

    static async #onThrow(this: GrenadeThrowDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const grenades = riderGrenades(this.#actor);
        const { selectedGrenade } = buildGrenadeThrowContext(grenades, this.#selectedId, GRENADE_LABELS);
        const thrown = grenades.find((item) => item.id === selectedGrenade?.id);
        if (selectedGrenade === null || thrown === undefined) return;
        const gameSystem = this.#gameSystem;
        // A rider with a test or a condition resolves against the creatures in its area,
        // from this card (a grenade that deals no damage, #622): place that area now.
        const flag = selectedGrenade.resolvable ? await this.#placeRiderArea(thrown) : null;
        await emitChatFromTemplate(
            'systems/wh40k-rpg/templates/chat/grenade-throw-chat.hbs',
            { rider: selectedGrenade, canResolve: flag !== null, gameSystem, _gameSystemId: gameSystem },
            { speaker: { alias: this.#actor.name }, ...(flag === null ? {} : { flags: riderThrowFlags(flag) }) },
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
