/**
 * Stories for the Scene Environment HUD widget (#604) — the viewed scene's
 * gravity, weather and air beside the world-time widget, with the effects the
 * world's game line applies under them.
 *
 * Renders the widget's `.hbs` against the context `_prepareContext` produces: the
 * pure `buildSceneEnvironmentView` (resolved through the real langpack) plus the
 * scene name and the `isGM` gate. The `.wh40k-rpg` wrapper the live panel carries
 * (DEFAULT_OPTIONS.classes) resolves the scoped `tw-*` utilities. Per-line
 * stories run the same environment through other lines so a DH2-only assumption
 * surfaces: DH1 drops Initiative and the push-off rule, IM is unmodelled.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/hud/scene-environment-widget.hbs?raw';
import { formatKey, localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, renderSheet } from '../../../../stories/test-helpers';
import type { GameSystemId } from '../../config/game-systems/types.ts';
import { DEFAULT_SCENE_ENVIRONMENT, type SceneEnvironment } from '../../rules/scene-environment.ts';
import { buildSceneEnvironmentView } from './scene-environment-view.ts';

initializeStoryHandlebars();

interface Args {
    environment: SceneEnvironment;
    line: GameSystemId;
    isGM: boolean;
    hasScene: boolean;
}

function render(args: Args): HTMLElement {
    const view = buildSceneEnvironmentView(args.environment, args.line, localizeKey(`WH40K.SETTINGS.PrimaryGameSystem.Choices.${args.line}`), formatKey);
    const root = document.createElement('div');
    root.className = 'wh40k-rpg scene-environment-widget';
    root.append(renderSheet(templateSrc, { ...view, hasScene: args.hasScene, sceneName: 'Hab District 4 Undertunnels', isGM: args.isGM }));
    return root;
}

const meta = {
    title: 'HUD/SceneEnvironmentWidget',
    render,
    args: { environment: { ...DEFAULT_SCENE_ENVIRONMENT }, line: 'dh2', isGM: false, hasScene: true },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** A standard scene: the readout, no effects, and players get no GM button. */
export const Standard: Story = {
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="env-gravity"]')?.textContent.trim()).toBe('Standard gravity');
        await expect(canvasElement.querySelector('[data-wh40k-hook="env-none"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="editEnvironment"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="rollZeroGravity"]')).toBeNull();
    },
};

/** A venting voidship in zero gravity during a storm, seen by the GM. */
export const ZeroGravityGm: Story = {
    args: { environment: { gravity: 'zero', harshConditions: true, atmosphere: 'venting' }, isGM: true },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="env-gravity"]')?.dataset['gravity']).toBe('zero');
        await expect(view.getByText('Charge or Run: Agility test -20; failure falls Prone')).toBeTruthy();
        await expect(view.getByText('A Move must start beside a surface to push off from')).toBeTruthy();
        await expect(view.getByText('Weapon Skill and Ballistic Skill attack tests -20')).toBeTruthy();
        await expect(canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="env-atmosphere"]')?.dataset['atmosphere']).toBe('venting');
        // Zero gravity offers the Charge / Run test; the GM gets the editor button.
        await expect(canvasElement.querySelector('[data-action="rollZeroGravity"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="editEnvironment"]')).not.toBeNull();
        // #701: the label is its own span on one line, its icon centred beside it.
        const label = canvasElement.querySelector<HTMLElement>('[data-action="rollZeroGravity"] [data-wh40k-hook="env-zero-g-label"]');
        await expect(label?.textContent).toBe('Roll the zero-gravity Agility test');
        await expect(label?.parentElement?.classList.contains('tw-whitespace-nowrap')).toBe(true);
        await expect(label?.parentElement?.classList.contains('tw-items-center')).toBe(true);
    },
};

/** The GM's two buttons dispatch the actions the widget class answers: open the window, roll the test. */
export const GmControlsDispatch: Story = {
    args: { environment: { ...DEFAULT_SCENE_ENVIRONMENT, gravity: 'zero' }, isGM: true },
    play: async ({ canvasElement }) => {
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'rollZeroGravity');
        clickAction(canvasElement, 'editEnvironment');
        await expect(clicks.map((c) => c.action)).toEqual(['rollZeroGravity', 'editEnvironment']);
    },
};

/** DH1 in low gravity: Agility for movement only, no Initiative. */
export const LowGravityDH1: Story = {
    args: { environment: { ...DEFAULT_SCENE_ENVIRONMENT, gravity: 'low' }, line: 'dh1' },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Agility Bonus +2 for movement')).toBeTruthy();
        await expect(view.queryByText('Agility Bonus +2 for movement and Initiative')).toBeNull();
        await expect(view.getByText('Jumping and leaping distances doubled')).toBeTruthy();
    },
};

/** Rogue Trader in high gravity: the same rule names Initiative. */
export const HighGravityRT: Story = {
    args: { environment: { ...DEFAULT_SCENE_ENVIRONMENT, gravity: 'high' }, line: 'rt' },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Agility Bonus -2 for movement and Initiative')).toBeTruthy();
        await expect(view.getByText('Strength + Toughness Bonus -4 for carrying, lifting and pushing')).toBeTruthy();
    },
};

/** Imperium Maledictum: the rules are not modelled, so nothing is listed or offered. */
export const UnmodelledLine: Story = {
    args: { environment: { gravity: 'zero', harshConditions: true, atmosphere: 'vacuum' }, line: 'im' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="env-unmodelled"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-wh40k-hook="env-effects"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="rollZeroGravity"]')).toBeNull();
    },
};

/** No scene on the canvas. */
export const NoScene: Story = {
    args: { hasScene: false, isGM: true },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="env-no-scene"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-wh40k-hook="env-gravity"]')).toBeNull();
    },
};
