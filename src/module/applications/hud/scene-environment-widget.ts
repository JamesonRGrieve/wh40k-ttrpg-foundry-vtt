/**
 * @file SceneEnvironmentWidget — the viewed scene's environment for the whole
 * table (#604): gravity, harsh weather or unnatural conditions, and the air, with
 * the effects the world's game line applies under them.
 *
 * A small floating panel that sits beside the world-time widget. Everyone sees
 * it; the GM also gets the button that opens the Scene Environment window. In
 * zero gravity it offers the Agility test a Charge or Run demands, rolled for the
 * user's controlled tokens. The effects are listed for the world's primary line;
 * each actor still resolves them against its own line (actor data prep and the
 * roll path), so a line with no printed rule gets nothing.
 *
 * The derivation is the pure `buildSceneEnvironmentView`; this class is the thin
 * ApplicationV2 shell.
 */
import { t } from '../../i18n/t.ts';
import { readSceneEnvironment } from '../../rules/scene-environment.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import SceneEnvironmentDialog from '../dialogs/scene-environment-dialog.ts';
import { pinToHudLayer } from './hud-layer.ts';
import { formatEnvironmentKey, primaryLineLabel } from './scene-environment-format.ts';
import { buildSceneEnvironmentView } from './scene-environment-view.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Left edge of the world-time widget plus its width and a gutter, so the two sit side by side. */
const BESIDE_WORLD_TIME_LEFT = 398;

export default class SceneEnvironmentWidget extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'wh40k-scene-environment-widget',
        classes: ['wh40k-rpg', 'scene-environment-widget'],
        tag: 'aside',
        window: {
            title: 'WH40K.Environment.WidgetTitle',
            icon: 'fa-solid fa-globe',
            minimizable: true,
            resizable: false,
            positioned: true,
        },
        position: {
            top: 8,
            left: BESIDE_WORLD_TIME_LEFT,
            width: 260,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V2 accepts the literal 'auto' though the upstream type narrows to number.
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            editEnvironment: SceneEnvironmentWidget.#editEnvironment,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollZeroGravity: SceneEnvironmentWidget.#rollZeroGravity,
        },
    };

    /** @override */
    static PARTS = {
        panel: {
            template: 'systems/wh40k-rpg/templates/hud/scene-environment-widget.hbs',
        },
    };

    /** Re-declared: HandlebarsApplicationMixin flattens the base type and drops the getter (mirrors WorldTimeWidget). */
    declare rendered: boolean;

    /**
     * A table-wide readout beside the world-time widget: it stays on the UI layer
     * below every sheet and dialog, so it never covers a window (#639). Overrides
     * ApplicationV2#bringToFront, which the shipped typings omit.
     */
    bringToFront(): void {
        pinToHudLayer(this.element);
    }

    static #instance: SceneEnvironmentWidget | null = null;

    /** Show the singleton widget, rendering it if not already open. */
    static show(): SceneEnvironmentWidget {
        let instance = SceneEnvironmentWidget.#instance;
        if (instance === null) {
            instance = new SceneEnvironmentWidget();
            SceneEnvironmentWidget.#instance = instance;
        }
        void instance.render(true);
        return instance;
    }

    /** Re-render the widget if it is open (no-op otherwise). */
    static refresh(): void {
        const instance = SceneEnvironmentWidget.#instance;
        if (instance?.rendered === true) void instance.render(false);
    }

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext signature is framework-defined.
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const scene = canvas.scene;
        const view = buildSceneEnvironmentView(readSceneEnvironment(scene), WH40KSettings.getPrimaryGameSystem(), primaryLineLabel(), formatEnvironmentKey);
        return { ...context, ...view, hasScene: scene !== null, sceneName: scene?.name ?? '', isGM: game.user.isGM };
    }

    /** Open the GM's Scene Environment window for the viewed scene. */
    static #editEnvironment(this: SceneEnvironmentWidget): void {
        SceneEnvironmentDialog.open();
    }

    /** Roll the zero-gravity Charge / Run Agility test for each of the user's controlled tokens. */
    static #rollZeroGravity(this: SceneEnvironmentWidget): void {
        const tokens = canvas.tokens?.controlled ?? [];
        if (tokens.length === 0) {
            ui.notifications.info(t('WH40K.Environment.NoTokens'));
            return;
        }
        // An explicit request always rolls (and stamps the turn for the automatic prompts).
        for (const token of tokens) void token.actor?.rollZeroGravityManoeuvreTest(false);
    }
}
