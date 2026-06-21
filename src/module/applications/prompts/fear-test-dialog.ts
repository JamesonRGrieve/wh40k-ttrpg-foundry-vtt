/**
 * @file FearTestDialog — GM-only dialog for triggering a Fear (X)
 * Willpower test against a target observer actor.
 *
 * Inputs: observer's Willpower total + the source creature's Fear
 * rating. Composes the resist target via `resolveFearTest()` from
 * `src/module/rules/fear.ts`, rolls 1d100, and emits a chat card with
 * the WP target, the rolled die, success/failure, and the additive
 * Shock-table 1d100 modifier on failure.
 *
 * See GitHub issue #65.
 */

import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import { MAX_FEAR_RATING, getShockTableRollModifier, resolveFearTest } from '../../rules/fear.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface ObserverOption {
    id: string;
    name: string;
    willpower: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface FearTestContext extends Record<string, unknown> {
    observers: ObserverOption[];
    selectedObserverId: string | null;
    willpower: number;
    fearRating: number;
    maxFearRating: number;
    target: number;
    isNoOp: boolean;
    pips: Array<{ index: number; on: boolean }>;
    fearRatingHigh: boolean;
}

interface AnyActor {
    id: string;
    name?: string;
    system?: {
        characteristics?: {
            willpower?: { total?: number; value?: number };
        };
    };
}

interface AnyGame {
    actors?: { contents?: AnyActor[] };
    user?: { id?: string; isGM?: boolean };
    i18n?: { localize?: (k: string) => string };
}

/**
 * Read the active GM-owned actors list — used to populate the
 * observer picker. Filters to actors that expose a Willpower stat.
 */
function listObserverOptions(): ObserverOption[] {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `game` global is not typed on globalThis
    const g = globalThis as unknown as { game?: AnyGame };
    const actors = g.game?.actors?.contents ?? [];
    const out: ObserverOption[] = [];
    for (const a of actors) {
        const wp = a.system?.characteristics?.willpower;
        const total = Number(wp?.total ?? wp?.value ?? 0);
        if (!Number.isFinite(total)) continue;
        out.push({ id: a.id, name: a.name ?? a.id, willpower: total });
    }
    return out;
}

function findObserver(id: string | null): ObserverOption | null {
    if (id === null || id === '') return null;
    const opts = listObserverOptions();
    return opts.find((o) => o.id === id) ?? null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class FearTestDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare selectedObserverId: string | null;
    declare willpower: number;
    declare fearRating: number;

    constructor(options: ApplicationV2Config.DefaultOptions & { fearRating?: number } = {}) {
        super(options);
        this.selectedObserverId = null;
        this.willpower = 30;
        const initial = Number((options as { fearRating?: number }).fearRating ?? 1);
        this.fearRating = Math.max(0, Math.min(MAX_FEAR_RATING, Math.trunc(Number.isFinite(initial) ? initial : 1)));
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'fear-test-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectObserver: FearTestDialog.#onSelectObserver,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            updateInputs: FearTestDialog.#onUpdateInputs,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollTest: FearTestDialog.#onRollTest,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: FearTestDialog.#onCancel,
        },
        position: { width: 520 },
        window: {
            title: 'WH40K.Fear.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/fear-test-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<FearTestContext> {
        const context = (await super._prepareContext(options)) as FearTestContext;

        const observers = listObserverOptions();
        const observer = findObserver(this.selectedObserverId);
        if (observer !== null) this.willpower = observer.willpower;

        const { target, isNoOp } = resolveFearTest({
            willpowerTotal: this.willpower,
            fearRating: this.fearRating,
        });

        const pips = Array.from({ length: MAX_FEAR_RATING }, (_v, i) => ({
            index: i + 1,
            on: i + 1 <= this.fearRating,
        }));

        return {
            ...context,
            observers,
            selectedObserverId: this.selectedObserverId,
            willpower: this.willpower,
            fearRating: this.fearRating,
            maxFearRating: MAX_FEAR_RATING,
            target,
            isNoOp,
            pips,
            fearRatingHigh: this.fearRating >= 3,
        };
    }

    static async #onSelectObserver(this: FearTestDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const select = target as HTMLSelectElement;
        const next = select.value;
        this.selectedObserverId = next === '' ? null : next;
        const observer = findObserver(this.selectedObserverId);
        if (observer !== null) this.willpower = observer.willpower;
        await this.render();
    }

    static async #onUpdateInputs(this: FearTestDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const root = target.closest('form, .application') ?? target.ownerDocument;
        const wpInput = root.querySelector<HTMLInputElement>('input[name="willpower"]');
        const frInput = root.querySelector<HTMLInputElement>('input[name="fearRating"]');
        if (wpInput !== null) {
            const wp = Number(wpInput.value);
            this.willpower = Math.max(0, Math.trunc(Number.isFinite(wp) ? wp : 0));
        }
        if (frInput !== null) {
            const fr = Number(frInput.value);
            this.fearRating = Math.max(0, Math.min(MAX_FEAR_RATING, Math.trunc(Number.isFinite(fr) ? fr : 0)));
        }
        await this.render();
    }

    static async #onRollTest(this: FearTestDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const observer = findObserver(this.selectedObserverId);
        const observerName = observer?.name ?? game.i18n.localize('WH40K.Fear.ObserverLabel');

        const { target, isNoOp } = resolveFearTest({
            willpowerTotal: this.willpower,
            fearRating: this.fearRating,
        });

        // 1d100 roll-under WP test.
        const rolled = Math.floor(Math.random() * 100) + 1;
        const success = !isNoOp && rolled <= target;
        const diff = rolled - target;
        const degreesOfFailure = success || isNoOp ? 0 : Math.max(1, Math.floor(diff / 10) + 1);
        const shockModifier = success || isNoOp ? 0 : getShockTableRollModifier(degreesOfFailure);

        const templateData = {
            observerName,
            willpower: this.willpower,
            fearRating: this.fearRating,
            target,
            isNoOp,
            rolled,
            success,
            degreesOfFailure,
            shockModifier,
            shockModifierLabel: shockModifier > 0 ? `+${shockModifier}` : String(shockModifier),
            gameSystem: 'dh2',
        };

        await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/fear-test-chat.hbs', templateData);
        await this.close();
    }

    static async #onCancel(this: FearTestDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener; the trait sheet hooks into this when the GM clicks the Fear badge. */
export function openFearTestDialog(opts: { fearRating?: number } = {}): void {
    const dialog = new FearTestDialog(opts);
    void dialog.render({ force: true });
}
