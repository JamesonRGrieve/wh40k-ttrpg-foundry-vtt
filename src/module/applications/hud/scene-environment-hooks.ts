/**
 * @file Runtime wiring for the per-scene environment (#604).
 *
 * - Shows the Scene Environment widget on `ready` and adds a scene-control button
 *   that reopens it (closing the panel must never be a one-way door).
 * - Re-prepares the actors standing in a scene when its environment changes, or
 *   when the viewed scene changes, so the gravity-derived movement, Initiative,
 *   jumping and carrying values follow — and re-renders their open sheets.
 * - Declaring a Charge or Run as a token's move in zero gravity prompts that
 *   user's Agility test (Hard, −20 — every line), carried as a named Environment
 *   row on the card.
 */

import { SYSTEM_ID } from '../../constants.ts';
import { MOVE_MODE_FLAG } from '../../rules/movement-budget.ts';
import { readSceneEnvironment, SCENE_ENVIRONMENT_FLAG } from '../../rules/scene-environment.ts';
import { hooksOn } from '../../utils/hooks-on.ts';
import SceneEnvironmentWidget from './scene-environment-widget.ts';

/** The move modes that demand the zero-gravity Agility test. */
const MANOEUVRE_MODES: ReadonlySet<string> = new Set(['charge', 'run']);

/** The actor surface re-preparation touches. */
interface RefreshableActor {
    reset: () => void;
    sheet?: { rendered?: boolean; render: (force?: boolean) => Promise<object> | object } | null;
}

/** A scene's tokens, as the refresh reads them. */
interface EnvironmentHookScene {
    tokens: Iterable<{ actor: RefreshableActor | null }>;
}

/** A token document, as the move-mode trigger reads it. */
interface EnvironmentHookToken {
    parent: Parameters<typeof readSceneEnvironment>[0];
    actor: { rollZeroGravityManoeuvreTest: (oncePerTurn: boolean) => Promise<void> } | null;
}

/** The slice of a scene / token update the hooks inspect. */
interface FlagChange {
    flags?: Record<string, Record<string, string | object | null> | undefined>;
}

/** Re-prepare every actor standing in `scene` and re-render its open sheet. */
function refreshSceneActors(scene: EnvironmentHookScene | null): void {
    if (scene === null) return;
    for (const token of scene.tokens) {
        const actor = token.actor;
        if (actor === null) continue;
        actor.reset();
        if (actor.sheet?.rendered === true) void actor.sheet.render(false);
    }
}

/** True when a scene update touched its environment flag. */
function environmentChanged(changed: FlagChange): boolean {
    const flags = changed.flags?.[SYSTEM_ID];
    return flags !== undefined && (SCENE_ENVIRONMENT_FLAG in flags || `-=${SCENE_ENVIRONMENT_FLAG}` in flags);
}

/** The move mode a token update declared, or undefined when it set none. */
function declaredMoveMode(changed: FlagChange): string | undefined {
    const mode = changed.flags?.[SYSTEM_ID]?.[MOVE_MODE_FLAG];
    return typeof mode === 'string' ? mode : undefined;
}

/** The viewed scene, narrowed to what the refresh reads. */
function viewedScene(): EnvironmentHookScene | null {
    return canvas.scene as EnvironmentHookScene | null;
}

/** Register the scene-environment hooks (called once at init). */
export function registerSceneEnvironment(): void {
    hooksOn('ready', () => {
        SceneEnvironmentWidget.show();
    });
    hooksOn('canvasReady', () => {
        refreshSceneActors(viewedScene());
        SceneEnvironmentWidget.refresh();
    });
    hooksOn('updateScene', (scene: EnvironmentHookScene, changed: FlagChange) => {
        if (!environmentChanged(changed)) return;
        refreshSceneActors(scene);
        SceneEnvironmentWidget.refresh();
    });
    // A linked actor takes the environment of the scene its token is placed in.
    const refreshTokenActor = (token: { actor: RefreshableActor | null }): void => {
        token.actor?.reset();
    };
    hooksOn('createToken', refreshTokenActor);
    hooksOn('deleteToken', refreshTokenActor);
    hooksOn('updateToken', (token: EnvironmentHookToken, changed: FlagChange, _options: object, userId: string) => {
        if (userId !== game.user.id) return;
        const mode = declaredMoveMode(changed);
        if (mode === undefined || !MANOEUVRE_MODES.has(mode)) return;
        if (readSceneEnvironment(token.parent).gravity !== 'zero') return;
        // Once per turn: a Charge attack from the dialog in the same turn won't ask again.
        void token.actor?.rollZeroGravityManoeuvreTest(true);
    });
    hooksOn('getSceneControlButtons', (controls: Record<string, foundry.applications.ui.SceneControls.Control>) => {
        // Absent only if the group's own registration was skipped; then there is nowhere to add the button.
        if (!('wh40k' in controls)) return;
        const group = controls['wh40k'];
        group.tools['sceneEnvironment'] = {
            name: 'sceneEnvironment',
            title: 'WH40K.Environment.WidgetTitle',
            icon: 'fa-solid fa-globe',
            visible: true,
            onChange: () => {
                SceneEnvironmentWidget.show();
            },
            button: true,
            order: Object.keys(group.tools).length,
        };
    });
}
