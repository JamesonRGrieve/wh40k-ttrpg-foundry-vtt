/**
 * @file MedicaeMechadendriteDialog — surfaces the errata p. 183
 * Half-Action "Staunch Blood Loss" button for an actor that owns a
 * Medicae Mechadendrite cybernetic (#104).
 *
 * The dialog is a thin UI shell over `staunchBloodLoss()` in
 * `src/module/rules/medicae-mechadendrite.ts`. Eligibility
 * (`actorHasMedicaeMechadendrite`) is checked before opening and again
 * in context so the button disables if the cybernetic was removed mid
 * session. The roll, AE removal, and chat card all live in the rule
 * module; this file owns no game logic.
 */

import { MEDICAE_MECHADENDRITE, actorHasMedicaeMechadendrite, staunchBloodLoss } from '../../rules/medicae-mechadendrite.ts';
import type { WH40KBaseActorDocument } from '../../types/global.d.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface MedicaeMechadendriteContext extends Record<string, unknown> {
    actorName: string;
    eligible: boolean;
    medicaeBonus: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class MedicaeMechadendriteDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare actor: WH40KBaseActorDocument | null;

    constructor(options: ApplicationV2Config.DefaultOptions & { actor?: WH40KBaseActorDocument } = {}) {
        super(options);
        this.actor = (options as { actor?: WH40KBaseActorDocument }).actor ?? null;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'medicae-mechadendrite-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            staunchBloodLoss: MedicaeMechadendriteDialog.#onStaunch,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: MedicaeMechadendriteDialog.#onCancel,
        },
        position: { width: 460 },
        window: {
            title: 'WH40K.MedicaeMechadendrite.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/medicae-mechadendrite-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<MedicaeMechadendriteContext> {
        const context = (await super._prepareContext(options)) as MedicaeMechadendriteContext;
        const eligible = this.actor !== null && actorHasMedicaeMechadendrite(this.actor);
        return {
            ...context,
            actorName: this.actor?.name ?? '',
            eligible,
            medicaeBonus: MEDICAE_MECHADENDRITE.medicaeBonus,
        };
    }

    static async #onStaunch(this: MedicaeMechadendriteDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        if (this.actor === null || !actorHasMedicaeMechadendrite(this.actor)) {
            await this.close();
            return;
        }
        await staunchBloodLoss(this.actor);
        await this.close();
    }

    static async #onCancel(this: MedicaeMechadendriteDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener; sheets / chat-card buttons hook into this. */
export function openMedicaeMechadendriteDialog(opts: { actor?: WH40KBaseActorDocument } = {}): void {
    const dialog = new MedicaeMechadendriteDialog(opts);
    void dialog.render({ force: true });
}
