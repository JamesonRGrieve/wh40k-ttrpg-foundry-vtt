/**
 * @file MutationRollDialog — GM-only dialog for rolling on the
 * Mutation table (Table 8–16) after a failed Malignancy Test.
 *
 * Inputs: the active track (Minor / Major) — biases the d100 sample
 * range as defined in `rules/mutation-table.ts`. Rolling emits a chat
 * card with the rolled mutation, its mechanical effect, and a flag
 * indicating whether the manifestation is visible or hidden.
 *
 * See GitHub issue #117.
 */

import { type MutationDef, type MutationTrack, TRACK_RANGES, rollMutation } from '../../rules/mutation-table.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface MutationRollContext extends Record<string, unknown> {
    track: MutationTrack;
    trackIsMinor: boolean;
    trackIsMajor: boolean;
    rangeMin: number;
    rangeMax: number;
}

interface AnyGame {
    user?: { id?: string; isGM?: boolean };
    i18n?: { localize?: (k: string) => string };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class MutationRollDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare track: MutationTrack;

    constructor(options: ApplicationV2Config.DefaultOptions & { track?: MutationTrack } = {}) {
        super(options);
        const initial = (options as { track?: MutationTrack }).track ?? 'minor';
        this.track = initial === 'major' ? 'major' : 'minor';
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'mutation-roll-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectTrack: MutationRollDialog.#onSelectTrack,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollMutation: MutationRollDialog.#onRollMutation,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: MutationRollDialog.#onCancel,
        },
        position: { width: 520 },
        window: {
            title: 'WH40K.MutationRoll.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/mutation-roll-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<MutationRollContext> {
        const context = (await super._prepareContext(options)) as MutationRollContext;
        const range = TRACK_RANGES[this.track];
        return {
            ...context,
            track: this.track,
            trackIsMinor: this.track === 'minor',
            trackIsMajor: this.track === 'major',
            rangeMin: range.min,
            rangeMax: range.max,
        };
    }

    static async #onSelectTrack(this: MutationRollDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const value = target.getAttribute('data-track');
        if (value === 'minor' || value === 'major') {
            this.track = value;
            await this.render();
        }
    }

    static async #onRollMutation(this: MutationRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const result = rollMutation(this.track);
        const mutation: MutationDef | null = result.mutation;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `game` global is not typed on globalThis
        const g = globalThis as unknown as { game?: AnyGame };
        const localize = g.game?.i18n?.localize?.bind(g.game.i18n);

        const visibleLabel =
            mutation?.visible === true ? localize?.('WH40K.MutationRoll.VisibleFlag') ?? 'Visible' : localize?.('WH40K.MutationRoll.HiddenFlag') ?? 'Hidden';

        const templateData = {
            track: result.track,
            trackIsMajor: result.track === 'major',
            roll: result.roll,
            mutationName: mutation?.name ?? localize?.('WH40K.MutationRoll.NoMutation') ?? 'No mutation (re-roll)',
            mutationEffect: mutation?.effect ?? '',
            mutationVisible: mutation?.visible ?? false,
            mutationKnown: mutation !== null,
            visibleLabel,
            gameSystem: 'dh2e',
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/mutation-roll-chat.hbs', templateData);

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: g.game?.user?.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
        await this.close();
    }

    static async #onCancel(this: MutationRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener — GM hooks (e.g., a failed Malignancy chat card button) call this. */
export function openMutationRollDialog(opts: { track?: MutationTrack } = {}): void {
    const dialog = new MutationRollDialog(opts);
    void dialog.render({ force: true });
}
