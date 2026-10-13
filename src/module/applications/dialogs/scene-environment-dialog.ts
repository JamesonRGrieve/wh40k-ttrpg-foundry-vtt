/**
 * @file SceneEnvironmentDialog — the GM's window for the viewed scene's
 * environment (#604): gravity, harsh weather or unnatural conditions, and the
 * air (breathable, the vacuum of space, or a venting atmosphere).
 *
 * The setting is the scene's own `flags.wh40k-rpg.environment` flag, so moving
 * the party to another scene changes it and two scenes can differ. A change
 * previews live — the effects the world's game line applies under it — and Save
 * writes the flag; every client's widget, roll path and actor data then follow
 * (`scene-environment-hooks.ts`). Opened from the Scene Environment widget.
 */

import { SYSTEM_ID } from '../../constants.ts';
import { t } from '../../i18n/t.ts';
import { isAtmosphereKind, isGravityKind, readSceneEnvironment, SCENE_ENVIRONMENT_FLAG, type SceneEnvironment } from '../../rules/scene-environment.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import { formatEnvironmentKey, primaryLineLabel } from '../hud/scene-environment-format.ts';
import { buildSceneEnvironmentView, type SceneEnvironmentView } from '../hud/scene-environment-view.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context is a free-form template payload; Record<string, unknown> is the correct base shape
interface SceneEnvironmentContext extends Record<string, unknown>, SceneEnvironmentView {
    sceneName: string;
}

/** The scene the window edits: the one the GM was viewing when it opened. */
type EditedScene = NonNullable<typeof canvas.scene>;

export default class SceneEnvironmentDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'wh40k-scene-environment-dialog',
        classes: ['wh40k-rpg', 'scene-environment-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.Environment.Title',
            icon: 'fa-solid fa-globe',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 420,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry accepts 'auto' at runtime but types declare number
            height: 'auto' as unknown as number,
        },
        form: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            handler: SceneEnvironmentDialog.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            save: SceneEnvironmentDialog.#onSave,
        },
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/scene-environment.hbs',
        },
    };

    readonly #scene: EditedScene;

    /** The environment being edited (seeded from the scene, changed by the form). */
    #env: SceneEnvironment;

    constructor(scene: EditedScene) {
        super({});
        this.#scene = scene;
        this.#env = readSceneEnvironment(scene);
    }

    /** @override */
    get title(): string {
        return t('WH40K.Environment.Title');
    }

    /** Open the window for the viewed scene (GM only). */
    static open(): SceneEnvironmentDialog | null {
        if (!game.user.isGM) {
            ui.notifications.warn(t('WH40K.Environment.GmOnly'));
            return null;
        }
        const scene = canvas.scene;
        if (scene === null) {
            ui.notifications.warn(t('WH40K.Environment.NoScene'));
            return null;
        }
        const dialog = new SceneEnvironmentDialog(scene);
        void dialog.render(true);
        return dialog;
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<SceneEnvironmentContext> {
        const context = await super._prepareContext(options);
        const view = buildSceneEnvironmentView(this.#env, WH40KSettings.getPrimaryGameSystem(), primaryLineLabel(), formatEnvironmentKey);
        return { ...context, ...view, sceneName: this.#scene.name };
    }

    /** Fold a form change into the edited environment and refresh the preview. */
    static async #onFormChange(this: SceneEnvironmentDialog, _event: Event, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const data = formData.object;
        const gravity = data['gravity'];
        const atmosphere = data['atmosphere'];
        this.#env = {
            gravity: typeof gravity === 'string' && isGravityKind(gravity) ? gravity : this.#env.gravity,
            harshConditions: data['harshConditions'] === true,
            atmosphere: typeof atmosphere === 'string' && isAtmosphereKind(atmosphere) ? atmosphere : this.#env.atmosphere,
        };
        await this.render();
    }

    /** Write the environment onto the scene and close. */
    static async #onSave(this: SceneEnvironmentDialog): Promise<void> {
        await this.#scene.setFlag(SYSTEM_ID, SCENE_ENVIRONMENT_FLAG, { ...this.#env });
        await this.close();
    }
}
