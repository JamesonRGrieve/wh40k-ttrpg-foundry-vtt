/**
 * Stories for SceneEnvironmentDialog (#604) — the GM's window for the viewed
 * scene's gravity, weather and air, with a live preview of the effects the
 * world's game line applies. Renders the window's `.hbs` against the context
 * `_prepareContext` produces (the pure `buildSceneEnvironmentView` through the
 * real langpack, plus the scene name). The `.wh40k-rpg` wrapper resolves the
 * scoped `tw-*` utilities.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/scene-environment.hbs?raw';
import { formatKey, localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import type { GameSystemId } from '../../config/game-systems/types.ts';
import { DEFAULT_SCENE_ENVIRONMENT, type SceneEnvironment } from '../../rules/scene-environment.ts';
import { buildSceneEnvironmentView } from '../hud/scene-environment-view.ts';

initializeStoryHandlebars();

interface Args {
    environment: SceneEnvironment;
    line: GameSystemId;
}

function render(args: Args): HTMLElement {
    const view = buildSceneEnvironmentView(args.environment, args.line, localizeKey(`WH40K.SETTINGS.PrimaryGameSystem.Choices.${args.line}`), formatKey);
    const root = document.createElement('form');
    root.className = 'wh40k-rpg scene-environment-dialog';
    root.append(renderSheet(templateSrc, { ...view, sceneName: 'The Errant Vector' }));
    return root;
}

const meta = {
    title: 'Dialogs/SceneEnvironmentDialog',
    render,
    args: { environment: { ...DEFAULT_SCENE_ENVIRONMENT }, line: 'dh2' },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** A fresh scene: standard gravity, calm, breathable — nothing previewed. */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="gravity"]')?.value).toBe('standard');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="harshConditions"]')?.checked).toBe(false);
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="atmosphere"]')?.value).toBe('breathable');
        await expect(canvasElement.querySelector('[data-wh40k-hook="env-none"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="save"]')).not.toBeNull();
    },
};

/** A crippled voidship: zero gravity, vacuum, and the preview lists every printed effect. */
export const ZeroGravityVacuum: Story = {
    args: { environment: { gravity: 'zero', harshConditions: false, atmosphere: 'vacuum' } },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="gravity"]')?.value).toBe('zero');
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="atmosphere"]')?.value).toBe('vacuum');
        await expect(view.getByText('Difficult terrain: movement halved')).toBeTruthy();
        await expect(view.getByText('Vacuum: resolve exposure with the Environmental Hazards tool')).toBeTruthy();
        // The GM can change a field; the form posts it under the name the handler reads.
        const harsh = canvasElement.querySelector<HTMLInputElement>('input[name="harshConditions"]');
        harsh?.click();
        await expect(harsh?.checked).toBe(true);
    },
};

/** The same zero gravity previewed for Dark Heresy 1e, which prints no push-off rule. */
export const ZeroGravityDH1: Story = {
    args: { environment: { ...DEFAULT_SCENE_ENVIRONMENT, gravity: 'zero' }, line: 'dh1' },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Charge or Run: Agility test -20; failure falls Prone')).toBeTruthy();
        await expect(view.queryByText('A Move must start beside a surface to push off from')).toBeNull();
    },
};
