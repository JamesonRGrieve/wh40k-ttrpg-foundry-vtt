/**
 * @file defineInfoCardDialog — factory for the read-only "grid of cards over a
 * registry" GM dialogs (#287). The within / without / beyond homeworld info
 * dialogs each hand-rolled the same ApplicationV2 shell: the mixin scaffold,
 * a `tag: 'div'` DEFAULT_OPTIONS with a 720px auto-height window, a single
 * `cards` PART, and a `_prepareContext` that spreads the built card list into the
 * Handlebars context. This factory owns that shell; each caller supplies only its
 * id / title / template / card-builder (and the few points where they diverge:
 * the context key, extra classes, and scroll selector).
 */

import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Configuration for an {@link defineInfoCardDialog} dialog. */
export interface InfoCardDialogConfig {
    /** Kebab id — becomes the root CSS class and the default scroll-selector base. */
    id: string;
    /** Window-title localization key. */
    titleKey: string;
    /** Handlebars template path for the cards PART. */
    template: string;
    /** Context key the template iterates (e.g. `'homeworlds'`). */
    contextKey: string;
    /**
     * Builds the card view-models injected under `contextKey` on each render.
     * May be async — compendium-sourced dialogs read `game.packs` at render time.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: card view-models are heterogeneous Handlebars context objects with no single shared shape
    cards: () => readonly unknown[] | Promise<readonly unknown[]>;
    /** Extra root classes beyond `['wh40k-rpg', 'dialog', id]`. */
    extraClasses?: readonly string[];
    /** Scrollable selectors for the cards PART (default `['.{id}__scroll']`). */
    scrollable?: string[];
}

/**
 * Build a read-only info-card dialog class from a config. The returned class is a
 * standard ApplicationV2 dialog; instantiate + `render({ force: true })` to show it.
 */
export function defineInfoCardDialog(config: InfoCardDialogConfig): ApplicationV2Ctor {
    // eslint-disable-next-line no-restricted-syntax -- boundary: the ApplicationV2 global lacks the typed constructor the Mixin needs; cast through unknown is the established pattern
    class InfoCardDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
        static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
            tag: 'div',
            classes: ['wh40k-rpg', 'dialog', config.id, ...(config.extraClasses ?? [])],
            position: {
                width: 720,
                // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 position.height accepts the literal 'auto' at runtime but the type is `number`
                height: 'auto' as unknown as number,
            },
            window: { title: config.titleKey, resizable: true },
        };

        static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
            cards: { template: config.template, classes: [], scrollable: config.scrollable ?? [`.${config.id}__scroll`] },
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns a free-form Handlebars context bag
        override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = await super._prepareContext(options);
            return { ...context, [config.contextKey]: await config.cards() };
        }
    }

    // V14: factory-returned anonymous classes all report name="" and can collide in
    // registries keyed by class name; set it explicitly (mirrors the registerSheet fix).
    Object.defineProperty(InfoCardDialog, 'name', { value: `InfoCardDialog_${config.id}` });
    return InfoCardDialog;
}
