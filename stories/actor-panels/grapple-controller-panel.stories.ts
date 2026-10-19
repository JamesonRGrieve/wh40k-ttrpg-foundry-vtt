/**
 * Storybook stories for the grapple panel (#120).
 *
 * The panel shows each role's own options, as the actor's line prints them
 * (`grappleRules` on the line's game-system config): the controller sees the
 * controller's options and the grappled target sees the target's. The GM sees both
 * groups. The stories build the panel context the way the character sheet does
 * (`grapplePanelSections`) for every line and both roles, and assert the options
 * each one offers and the action each button sends.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { grappleRulesFor } from '../../src/module/config/game-systems/index';
import { type GrappleState, grapplePanelSections } from '../../src/module/rules/grapple';
import panelSrc from '../../src/templates/actor/panel/grapple-controller-panel.hbs?raw';
import { captureActionClicks, renderSheet } from '../test-helpers';

type Line = 'bc' | 'dh1' | 'dh2' | 'dw' | 'ow' | 'rt';
const LINES: readonly Line[] = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'];

/** Each line's printed options per role, in the book's order. */
const PRINTED: Readonly<Record<Line, { controller: string[]; target: string[] }>> = {
    dh1: { controller: ['damage-opponent'], target: ['break-free', 'slip-free', 'take-control'] },
    dh2: {
        controller: ['damage-opponent', 'throw-down-opponent', 'push-opponent', 'ready', 'stand', 'use-item'],
        target: ['break-free', 'slip-free', 'take-control'],
    },
    rt: {
        controller: ['damage-opponent', 'throw-down-opponent', 'push-opponent', 'ready', 'stand', 'use-item'],
        target: ['break-free', 'slip-free', 'take-control'],
    },
    bc: {
        controller: ['damage-opponent', 'throw-down-opponent', 'push-opponent', 'ready', 'stand', 'use-item'],
        target: ['break-free', 'slip-free', 'take-control'],
    },
    dw: {
        controller: ['damage-opponent', 'throw-down-opponent', 'push-opponent', 'ready', 'stand', 'use-item'],
        target: ['break-free', 'slip-free', 'take-control'],
    },
    ow: {
        controller: ['damage-opponent', 'throw-down-opponent', 'push-opponent', 'ready', 'stand', 'use-item'],
        target: ['break-free', 'slip-free', 'take-control'],
    },
};

const SKILL_LABELS: Readonly<Record<string, string>> = { acrobatics: 'Acrobatics', contortionist: 'Contortionist' };

interface PanelArgs {
    line: Line;
    state: GrappleState;
    isGM: boolean;
}

function renderPanel(args: PanelArgs): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = args.line;
    const grappleSections = grapplePanelSections(grappleRulesFor(args.line), args.state, args.isGM, (skill) => SKILL_LABELS[skill] ?? skill);
    wrapper.appendChild(renderSheet(panelSrc, { grappleState: args.state, grappleSections }));
    return wrapper;
}

/** The option ids each role group offers, in panel order. */
function groups(root: HTMLElement): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const section of root.querySelectorAll<HTMLElement>('[data-wh40k-hook="grapple-section"]')) {
        out[section.dataset['grappleRole'] ?? ''] = Array.from(
            section.querySelectorAll<HTMLButtonElement>('button[data-action]'),
            (button) => button.dataset['grappleOption'] ?? '',
        );
    }
    return out;
}

const meta: Meta<PanelArgs> = { title: 'Actor/Panels/GrappleControllerPanel', render: (args) => renderPanel(args) };
export default meta;
type Story = StoryObj<PanelArgs>;

/** DH2 controller: Damage, Throw Down, Push, Ready, Stand, Use Item, and no target options. */
export const Controller: Story = {
    name: 'DH2 — controller',
    args: { line: 'dh2', state: 'grappling', isGM: false },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="grapple-panel"]')?.dataset['grappleState']).toBe('grappling');
        await expect(groups(canvasElement)).toEqual({ controller: PRINTED.dh2.controller });
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('[data-grapple-option="push-opponent"]')?.click();
        await expect(clicks.map((click) => click.action)).toEqual(['grappleOption']);
        await expect(canvasElement.querySelector('[data-grapple-option="push-opponent"] [data-wh40k-hook="grapple-option-test"]')?.textContent).toContain(
            'Opposed Strength',
        );
        await expect(canvasElement.querySelector('[data-grapple-option="ready"] [data-wh40k-hook="grapple-option-test"]')?.textContent).toContain('No test');
    },
};

/** DH2 grappled target: Break Free, Slip Free (Acrobatics) and Take Control only. */
export const Target: Story = {
    name: 'DH2 — grappled target',
    args: { line: 'dh2', state: 'controlled', isGM: false },
    play: async ({ canvasElement }) => {
        await expect(groups(canvasElement)).toEqual({ target: PRINTED.dh2.target });
        await expect(canvasElement.querySelector('[data-grapple-option="slip-free"] [data-wh40k-hook="grapple-option-test"]')?.textContent).toContain(
            'Acrobatics test',
        );
        await expect(canvasElement.querySelector('[data-grapple-option="stand"]')).toBeNull();
    },
};

/** The GM sees both groups; the other role's is marked as acting for the opponent. */
export const GameMaster: Story = {
    name: 'DH2 — GM sees both roles',
    args: { line: 'dh2', state: 'grappling', isGM: true },
    play: async ({ canvasElement }) => {
        await expect(groups(canvasElement)).toEqual({ controller: PRINTED.dh2.controller, target: PRINTED.dh2.target });
        const sections = canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="grapple-section"]');
        await expect(Array.from(sections, (section) => section.dataset['grappleOwn'])).toEqual(['true', 'false']);
        await expect(Array.from(sections).at(1)?.textContent).toContain('for the opponent');
    },
};

/** Every line, both roles: each sees exactly the options its book prints. */
export const PerLineRoles: Story = {
    name: 'Per line — controller and target',
    args: { line: 'dh2', state: 'grappling', isGM: false },
    render: () => {
        const grid = document.createElement('div');
        grid.classList.add('tw-grid', 'tw-grid-cols-2', 'tw-gap-3');
        for (const line of LINES) {
            for (const state of ['grappling', 'controlled'] as const) {
                const panel = renderPanel({ line, state, isGM: false });
                panel.dataset['storyLine'] = line;
                panel.dataset['storyState'] = state;
                grid.appendChild(panel);
            }
        }
        return grid;
    },
    play: async ({ canvasElement }) => {
        for (const panel of canvasElement.querySelectorAll<HTMLElement>('[data-story-line]')) {
            const line = panel.dataset['storyLine'] as Line;
            const role = panel.dataset['storyState'] === 'grappling' ? 'controller' : 'target';
            // eslint-disable-next-line no-await-in-loop -- sequential expectations per rendered panel
            await expect(groups(panel)).toEqual({ [role]: PRINTED[line][role] });
        }
        // Slip Free rolls each line's printed skill: Contortionist in RT / DW, opposed by Strength in DH1.
        const slipFree = (line: Line): string =>
            canvasElement
                .querySelector(
                    `[data-story-line="${line}"][data-story-state="controlled"] [data-grapple-option="slip-free"] [data-wh40k-hook="grapple-option-test"]`,
                )
                ?.textContent.trim() ?? '';
        await expect(slipFree('rt')).toBe('Contortionist test');
        await expect(slipFree('dw')).toBe('Contortionist test');
        await expect(slipFree('dh1')).toBe('Contortionist vs Strength');
        await expect(slipFree('ow')).toBe('Acrobatics test');
        await expect(slipFree('bc')).toBe('Acrobatics test');
    },
};
