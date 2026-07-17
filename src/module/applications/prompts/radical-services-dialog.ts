/**
 * @file RadicalServicesDialog — GM dialog for hiring a Radical Service
 * (within.md p. 72, Table 2-10). Lists the 9 services with availability /
 * threat / Subtlety cost, runs the Influence Requisition test against the
 * chosen service's availability rating, and on success emits a chat card
 * and applies the Subtlety hit.
 */

import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import { RADICAL_SERVICES, type RadicalServiceDefinition, type RadicalServiceId } from '../../rules/radical-services.ts';
import { getRequisitionTestTarget } from '../../rules/requisition-test.ts';
import { firstSystemId } from '../../utils/chat-system-id.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Threat-level → Tailwind background utility (1 = safe green, 4 = danger red). */
const THREAT_BADGE_CLASSES: Record<number, string> = {
    1: 'tw-bg-emerald-400',
    2: 'tw-bg-yellow-400',
    3: 'tw-bg-orange-400',
    4: 'tw-bg-red-500',
};

function threatBadgeClass(level: number): string {
    return THREAT_BADGE_CLASSES[level] ?? 'tw-bg-yellow-400';
}

interface ServiceRow {
    id: RadicalServiceId;
    label: string;
    availability: RadicalServiceDefinition['availability'];
    availabilityLabel: string;
    threatLevel: number;
    threatBadgeClass: string;
    subtletyOnHire: number;
    target: number;
    selected: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context bag matches the mixin's Record<string, unknown> return type
interface RadicalServicesContext extends Record<string, unknown> {
    actor: WH40KAcolyte;
    influence: number;
    services: ServiceRow[];
    selectedServiceId: RadicalServiceId | null;
}

type ActionHandler = (this: RadicalServicesDialog, event: Event, target: HTMLElement) => Promise<void>;

/**
 * GM dialog for picking and rolling a Radical Services Requisition.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class RadicalServicesDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare actor: WH40KAcolyte;
    declare selectedServiceId: RadicalServiceId | null;

    constructor(actor: WH40KAcolyte, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;
        this.selectedServiceId = null;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'radical-services-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectService: RadicalServicesDialog.#onSelectService,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            attemptRequisition: RadicalServicesDialog.#onAttemptRequisition as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: RadicalServicesDialog.#onCancel as ActionHandler,
        },
        position: { width: 560 },
        window: {
            title: 'WH40K.RadicalServices.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/radical-services-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<RadicalServicesContext> {
        const context = (await super._prepareContext(options)) as RadicalServicesContext;
        const influence = this.#getInfluence();
        const services: ServiceRow[] = Object.values(RADICAL_SERVICES).map((s) => {
            const { target } = getRequisitionTestTarget({ influence, availability: s.availability });
            return {
                id: s.id,
                label: game.i18n.localize(`WH40K.RadicalServices.Names.${s.id}`),
                availability: s.availability,
                availabilityLabel: game.i18n.localize(`WH40K.RadicalServices.Availability.${s.availability}`),
                threatLevel: s.threatLevel,
                threatBadgeClass: threatBadgeClass(s.threatLevel),
                subtletyOnHire: s.subtletyOnHire,
                target,
                selected: this.selectedServiceId === s.id,
            };
        });

        return {
            ...context,
            actor: this.actor,
            influence,
            services,
            selectedServiceId: this.selectedServiceId,
        };
    }

    /* -------------------------------------------- */
    /*  Helpers                                     */
    /* -------------------------------------------- */

    #getInfluence(): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: influence lives on character.ts only
        const sys = this.actor.system as { influence?: number };
        return Math.trunc(sys.influence ?? 0);
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onSelectService(this: RadicalServicesDialog, _event: Event, target: HTMLElement): Promise<void> {
        const id = target.dataset['serviceId'] as RadicalServiceId | undefined;
        if (id === undefined || !(id in RADICAL_SERVICES)) return;
        this.selectedServiceId = id;
        await this.render();
    }

    static async #onAttemptRequisition(this: RadicalServicesDialog, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const id = this.selectedServiceId;
        if (id === null) return;
        const service = RADICAL_SERVICES[id];
        const influence = this.#getInfluence();
        const { target } = getRequisitionTestTarget({ influence, availability: service.availability });

        const roll = new Roll('1d100');
        await roll.evaluate();
        const total = roll.total ?? 0;
        const success = total <= target;
        const margin = Math.floor(Math.abs(total - target) / 10);
        const dos = success ? Math.max(1, margin) : 0;
        const dof = success ? 0 : Math.max(1, margin);

        if (success) {
            await this.actor.applySubtlety(service.subtletyOnHire, 'manual');
        }

        const templateData = {
            _gameSystemId: firstSystemId(this.actor),
            actor: this.actor,
            service: {
                id: service.id,
                label: game.i18n.localize(`WH40K.RadicalServices.Names.${service.id}`),
                availabilityLabel: game.i18n.localize(`WH40K.RadicalServices.Availability.${service.availability}`),
                threatLevel: service.threatLevel,
            },
            requisition: {
                target,
                roll: total,
                success,
                dos,
                dof,
            },
            subtletyDelta: success ? service.subtletyOnHire : 0,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/radical-services-chat.hbs', templateData);

        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: html,
            rolls: [roll],
            flavor: game.i18n.localize('WH40K.RadicalServices.ChatTitle'),
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts loose document-data shape
        await ChatMessage.create(chatData);

        await this.close();
    }

    static async #onCancel(this: RadicalServicesDialog, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

export function openRadicalServicesDialog(actor: WH40KAcolyte): void {
    const dialog = new RadicalServicesDialog(actor);
    void dialog.render({ force: true });
}
