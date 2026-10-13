/**
 * @file ShipActionDialog — rolls one RT starship action with an authored
 * effect (Hold Fast!, Triage, Lock on Target, …) from the voidcraft sheet
 * (#186, #189).
 *
 * The dialog asks for the acting character's skill, a situational modifier
 * and any choice the effect leaves open (which stat, which Weapon Component);
 * Roll resolves the test, applies the effect on a success and posts the card.
 */

import type { WH40KVoidcraft } from '../../documents/voidcraft.ts';
import { resolveDegreesMethod } from '../../rolls/roll-helpers.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { readAssaultForm } from '../ship-assault/ship-assault-fields.ts';
import { foundryLocalize, ShipAssaultInputError, type AssaultFieldGroup } from '../ship-assault/ship-assault-flow.ts';
import { isRollableShipAction, rollShipAction, shipActionInputGroups, type ShipActionContext, type ShipActionOrder } from './ship-action-flow.ts';

const { ApplicationV2 } = foundry.applications.api;

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface ShipActionDialogContext extends Record<string, unknown> {
    title: string;
    requirements: string;
    groups: AssaultFieldGroup[];
}

interface ShipActionDialogOptions extends ApplicationV2Config.DefaultOptions {
    ship: WH40KVoidcraft;
    order: ShipActionOrder;
    requirements: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
class ShipActionDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    readonly ship: WH40KVoidcraft;
    readonly order: ShipActionOrder;
    readonly requirements: string;

    constructor(options: ShipActionDialogOptions) {
        super(options);
        this.ship = options.ship;
        this.order = options.order;
        this.requirements = options.requirements;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'ship-action-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 binds `this` at click time
            rollShipAction: ShipActionDialog.#onRoll,
        },
        position: { width: 460 },
        window: { title: 'WH40K.Voidcraft.ShipAction.DialogTitle', resizable: true },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: { template: 'systems/wh40k-rpg/templates/prompt/ship-action-dialog.hbs', classes: [], scrollable: [''] },
    };

    #context(): ShipActionContext {
        return { ship: this.ship, order: this.order, localize: foundryLocalize, degreesMethod: resolveDegreesMethod(this.ship.system.gameSystem) };
    }

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ShipActionDialogContext> {
        const context = await super._prepareContext(options);
        return { ...context, title: this.order.name, requirements: this.requirements, groups: shipActionInputGroups(this.#context()) };
    }

    static async #onRoll(this: ShipActionDialog, event: Event): Promise<void> {
        event.preventDefault();
        let rolled: Awaited<ReturnType<typeof rollShipAction>>;
        try {
            rolled = await rollShipAction(this.#context(), readAssaultForm(this.element));
        } catch (err) {
            if (!(err instanceof ShipAssaultInputError)) throw err;
            ui.notifications.warn(err.message);
            return;
        }
        const html = await foundry.applications.handlebars.renderTemplate(rolled.card.template, rolled.card.data);
        await ChatMessage.create({
            // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker requires Actor.Implementation; WH40KVoidcraft extends it but the typings widen
            speaker: ChatMessage.getSpeaker({ actor: this.ship as unknown as Actor.Implementation }),
            content: html,
            rolls: rolled.rolls,
        });
        await this.close();
    }
}

/**
 * Open the roll dialog for a ship action. Refuses (with a notification) for a
 * non-RT ship or an action with no automated effect.
 */
export function openShipActionDialog(ship: WH40KVoidcraft, order: ShipActionOrder, requirements: string): void {
    if (!ship.usesRTCrewEconomy) {
        ui.notifications.warn(foundryLocalize('WH40K.Voidcraft.ShipAction.Unsupported'));
        return;
    }
    if (!isRollableShipAction(order)) {
        ui.notifications.warn(foundryLocalize('WH40K.Voidcraft.ShipAction.NotRollable'));
        return;
    }
    void new ShipActionDialog({ ship, order, requirements }).render({ force: true });
}
