/**
 * @file WarpTravelDialog — GM-only dialog for resolving the RT 5-stage
 * Warp Travel workflow (#193, core.md §"NAVIGATING THE WARP").
 *
 * The GM enters a base voyage duration (days), the Navigator's Awareness
 * + Navigation (Warp) characteristics, and the per-stage d100 rolls. The
 * dialog drives `resolveWarpJourney()` and emits a chat card summarising
 * each of the five stages plus the final elapsed duration / off-course /
 * Perils-of-the-Warp follow-ups.
 *
 * The dialog state is stored on an instance property named `journey` —
 * NOT `state` — because `state` is an accessor on ApplicationV2's base
 * class and an instance property would clash (TS2416 / TS2610).
 *
 * Pure resolution math lives in `src/module/rules/warp-travel.ts`; this
 * file is a thin UI shell.
 */

import { type WarpJourneyResult, resolveWarpJourney, rollPeril } from '../../rules/warp-travel.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface JourneyInputs {
    baseDays: number;
    awareness: number;
    navigationWarp: number;
    locateRoll: number;
    chartRoll: number;
    steerRoll: number;
    leaveRoll: number;
}

const DEFAULT_INPUTS: JourneyInputs = Object.freeze({
    baseDays: 30,
    awareness: 40,
    navigationWarp: 40,
    locateRoll: 50,
    chartRoll: 50,
    steerRoll: 50,
    leaveRoll: 50,
});

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface WarpTravelContext extends Record<string, unknown> {
    inputs: JourneyInputs;
    result: WarpJourneyResult | null;
}

function readNumber(form: HTMLElement, name: string, fallback: number): number {
    const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (el === null) return fallback;
    const value = Number(el.value);
    return Number.isFinite(value) ? value : fallback;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class WarpTravelDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /**
     * The dialog's per-render state. Named `journey` (NOT `state`) to
     * avoid clashing with ApplicationV2's `state` accessor.
     */
    declare journey: { inputs: JourneyInputs; result: WarpJourneyResult | null };

    constructor(options: ApplicationV2Config.DefaultOptions & { inputs?: Partial<JourneyInputs> } = {}) {
        super(options);
        const seed = (options as { inputs?: Partial<JourneyInputs> }).inputs ?? {};
        this.journey = {
            inputs: { ...DEFAULT_INPUTS, ...seed },
            result: null,
        };
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'warp-travel-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            resolveJourney: WarpTravelDialog.#onResolveJourney,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            postChat: WarpTravelDialog.#onPostChat,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollPeril: WarpTravelDialog.#onRollPeril,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: WarpTravelDialog.#onCancel,
        },
        position: { width: 560 },
        window: {
            title: 'WH40K.WarpTravel.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/warp-travel-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<WarpTravelContext> {
        const context = (await super._prepareContext(options)) as WarpTravelContext;
        return {
            ...context,
            inputs: this.journey.inputs,
            result: this.journey.result,
        };
    }

    static async #onResolveJourney(this: WarpTravelDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const form = this.element;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety: ApplicationV2.element can be null before first render
        if (form === null) return;
        const inputs: JourneyInputs = {
            baseDays: readNumber(form, 'baseDays', this.journey.inputs.baseDays),
            awareness: readNumber(form, 'awareness', this.journey.inputs.awareness),
            navigationWarp: readNumber(form, 'navigationWarp', this.journey.inputs.navigationWarp),
            locateRoll: readNumber(form, 'locateRoll', this.journey.inputs.locateRoll),
            chartRoll: readNumber(form, 'chartRoll', this.journey.inputs.chartRoll),
            steerRoll: readNumber(form, 'steerRoll', this.journey.inputs.steerRoll),
            leaveRoll: readNumber(form, 'leaveRoll', this.journey.inputs.leaveRoll),
        };
        this.journey = {
            inputs,
            result: resolveWarpJourney(inputs),
        };
        await this.render();
    }

    static async #onPostChat(this: WarpTravelDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const result = this.journey.result;
        if (result === null) return;
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/warp-travel-chat.hbs', {
            inputs: this.journey.inputs,
            result,
            gameSystem: 'rt',
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
        await this.close();
    }

    static async #onRollPeril(this: WarpTravelDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const { rolled, peril } = rollPeril();
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/warp-travel-peril-chat.hbs', {
            rolled,
            peril,
            gameSystem: 'rt',
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
    }

    static async #onCancel(this: WarpTravelDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener; sheets / chat buttons hook into this. */
export function openWarpTravelDialog(opts: { inputs?: Partial<JourneyInputs> } = {}): void {
    const dialog = new WarpTravelDialog(opts);
    void dialog.render({ force: true });
}
