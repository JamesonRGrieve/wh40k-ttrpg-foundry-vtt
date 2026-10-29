/**
 * @file ServicesDialog — GM dialog for hiring a service.
 *
 * Lists every service in the actor's line's services packs (selected by their
 * declared flags) with its availability, threat and Subtlety cost, runs the
 * Influence Requisition test against the chosen service's availability through
 * the line's acquisition ladder, and on success emits a chat card and applies
 * the service's Subtlety change. Every value is read from the service documents
 * (`rules/service-hire.ts`).
 */

import { acquisitionLadderFor } from '../../config/game-systems/index.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { availabilityLabelKey, requisitionProvenanceRows } from '../../integrations/armoury-requisition.ts';
import { hireOutcome, type ServiceDocLike, type ServiceOffer, serviceOffers, serviceRequisition } from '../../rules/service-hire.ts';
import { firstSystemId } from '../../utils/chat-system-id.ts';
import { lineBookPacks, type PackMetadataLike } from '../../utils/line-packs.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Threat-level → Tailwind background utility (1 = safe green, 4+ = danger red). */
const THREAT_BADGE_CLASSES = ['tw-bg-emerald-400', 'tw-bg-yellow-400', 'tw-bg-orange-400', 'tw-bg-red-500'] as const;

function threatBadgeClass(level: number): string {
    return THREAT_BADGE_CLASSES.at(Math.min(Math.max(level, 1), THREAT_BADGE_CLASSES.length) - 1) ?? 'tw-bg-yellow-400';
}

/** The part of a compendium pack the dialog loads services from. */
interface ServicePack {
    readonly metadata: PackMetadataLike;
    getDocuments?: (() => Promise<ServiceDocLike[]>) | undefined;
}

/** Every service in `line`'s services packs. */
async function loadServices(line: string): Promise<ServiceOffer[]> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs is Foundry's CompendiumCollection (untyped document shape); narrowed to the ServicePack surface read here
    const packs = lineBookPacks(game.packs as unknown as Iterable<ServicePack>, line, 'services');
    const docs = await Promise.all(packs.map(async (pack) => (pack.getDocuments === undefined ? [] : pack.getDocuments.call(pack))));
    return serviceOffers(docs.flat());
}

interface ServiceRow {
    uuid: string;
    label: string;
    availabilityLabel: string;
    threatLevel: number;
    threatBadgeClass: string;
    subtlety: number;
    target: number | null;
    selected: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context bag matches the mixin's Record<string, unknown> return type
interface ServicesContext extends Record<string, unknown> {
    actor: WH40KBaseActor;
    influence: number;
    services: ServiceRow[];
    selectedServiceUuid: string | null;
}

type ActionHandler = (this: ServicesDialog, event: Event, target: HTMLElement) => Promise<void>;

/**
 * GM dialog for picking and rolling a service Requisition.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
class ServicesDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare actor: WH40KBaseActor;
    declare selectedServiceUuid: string | null;
    /** The services loaded on first render, kept for the roll. */
    declare offers: ServiceOffer[];

    constructor(actor: WH40KBaseActor, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;
        this.selectedServiceUuid = null;
        this.offers = [];
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'services-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectService: ServicesDialog.#onSelectService,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            attemptRequisition: ServicesDialog.#onAttemptRequisition as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: ServicesDialog.#onCancel as ActionHandler,
        },
        position: { width: 560 },
        window: {
            title: 'WH40K.Services.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/services-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ServicesContext> {
        const context = (await super._prepareContext(options)) as ServicesContext;
        if (this.offers.length === 0) this.offers = await loadServices(this.#line());
        const influence = this.#getInfluence();
        const services = this.offers.map((offer): ServiceRow => {
            const target = this.#target(influence, offer);
            return {
                uuid: offer.uuid,
                label: offer.name,
                availabilityLabel: offer.availability === null ? '' : game.i18n.localize(availabilityLabelKey(offer.availability)),
                threatLevel: offer.threatLevel,
                threatBadgeClass: threatBadgeClass(offer.threatLevel),
                subtlety: offer.subtlety,
                target,
                selected: this.selectedServiceUuid === offer.uuid,
            };
        });

        return { ...context, actor: this.actor, influence, services, selectedServiceUuid: this.selectedServiceUuid };
    }

    /* -------------------------------------------- */
    /*  Helpers                                     */
    /* -------------------------------------------- */

    #line(): string {
        return firstSystemId(this.actor) ?? '';
    }

    #getInfluence(): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: influence lives on character.ts only
        const sys = this.actor.system as { influence?: number };
        return Math.trunc(sys.influence ?? 0);
    }

    /** The requisition test for `offer`, or null when the line has no ladder or the test is not a roll. */
    #requisition(influence: number, offer: ServiceOffer): ReturnType<typeof serviceRequisition> {
        const ladder = acquisitionLadderFor(this.#line());
        return ladder === null ? null : serviceRequisition(influence, ladder, offer);
    }

    #target(influence: number, offer: ServiceOffer): number | null {
        const requisition = this.#requisition(influence, offer);
        return requisition?.kind === 'test' ? requisition.target : null;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onSelectService(this: ServicesDialog, _event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset['serviceUuid'];
        if (uuid === undefined || !this.offers.some((offer) => offer.uuid === uuid)) return;
        this.selectedServiceUuid = uuid;
        await this.render();
    }

    static async #onAttemptRequisition(this: ServicesDialog, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const offer = this.offers.find((candidate) => candidate.uuid === this.selectedServiceUuid);
        if (offer === undefined) return;
        const influence = this.#getInfluence();
        const requisition = this.#requisition(influence, offer);
        if (requisition?.kind !== 'test') return;

        const roll = new Roll('1d100');
        await roll.evaluate();
        const total = roll.total ?? 0;
        const outcome = hireOutcome(total, requisition.target);

        if (outcome.success && offer.subtlety !== 0) {
            await this.actor.applySubtlety(offer.subtlety, 'manual');
        }

        const templateData = {
            _gameSystemId: firstSystemId(this.actor),
            actor: this.actor,
            service: {
                uuid: offer.uuid,
                label: offer.name,
                availabilityLabel: offer.availability === null ? '' : game.i18n.localize(availabilityLabelKey(offer.availability)),
                threatLevel: offer.threatLevel,
            },
            requisition: {
                baseTarget: requisition.breakdown.find((component) => component.source === 'rating')?.value ?? influence,
                modifierSources: requisitionProvenanceRows(requisition.breakdown),
                target: requisition.target,
                roll: total,
                ...outcome,
            },
            subtletyDelta: outcome.success ? offer.subtlety : 0,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/services-chat.hbs', templateData);

        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: html,
            rolls: [roll],
            flavor: game.i18n.localize('WH40K.Services.ChatTitle'),
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts loose document-data shape
        await ChatMessage.create(chatData);

        await this.close();
    }

    static async #onCancel(this: ServicesDialog, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

export function openServicesDialog(actor: WH40KBaseActor): void {
    const dialog = new ServicesDialog(actor);
    void dialog.render({ force: true });
}
