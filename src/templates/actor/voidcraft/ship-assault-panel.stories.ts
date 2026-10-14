/**
 * Storybook stories for the voidcraft sheet's Ship Assault Actions panel
 * (#188 — ramming, boarding, Hit and Run).
 *
 *   1. Manoeuvres — the Rogue Trader Manoeuvres-tab buttons, each opening the
 *      assault dialog through `data-action="openShipAssault"`.
 *   2. ExtendedActions — the Extended Actions tab's single button, Hit and Run.
 *   3. PerSystem — the panel framed under every game line: only Rogue Trader
 *      offers the actions; the other lines' sheets pass an empty list and the
 *      panel renders nothing (the gate is explicit, never accidental).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { SystemId } from '../../../../stories/mocks/extended';
import { storyLocalize } from '../../../../stories/mocks/ship-assault';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { shipAssaultButtons } from '../../../module/applications/ship-assault/ship-assault-registry.ts';
import { supportsShipAssault } from '../../../module/rules/ship-assault.ts';
import panelSrc from './ship-assault-panel.hbs?raw';

initializeStoryHandlebars();

const SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

function renderPanel(systemId: SystemId): HTMLElement {
    const frame = document.createElement('div');
    frame.classList.add('wh40k-rpg', 'sheet');
    frame.dataset['wh40kSystem'] = systemId;
    frame.dataset['storySystem'] = systemId;
    const assaults = supportsShipAssault(systemId) ? shipAssaultButtons('manoeuvre', storyLocalize) : [];
    frame.append(renderSheet(panelSrc, { assaults }));
    return frame;
}

const meta: Meta = {
    title: 'Actor/Voidcraft/ShipAssaultPanel (#188)',
};
export default meta;

type Story = StoryObj;

export const Manoeuvres: Story = {
    render: () => renderPanel('rt'),
    play: async ({ canvasElement }) => {
        const buttons = canvasElement.querySelectorAll<HTMLElement>('[data-action="openShipAssault"]');
        await expect(buttons.length).toBeGreaterThan(0);
        await expect(Array.from(buttons).every((button) => (button.dataset['assault'] ?? '') !== '')).toBe(true);
        await expect(canvasElement.querySelector('[data-assault="board"]')).toBeTruthy();
    },
};

export const ExtendedActions: Story = {
    render: () => {
        const frame = document.createElement('div');
        frame.classList.add('wh40k-rpg', 'sheet');
        frame.dataset['wh40kSystem'] = 'rt';
        frame.append(renderSheet(panelSrc, { assaults: shipAssaultButtons('extended', storyLocalize) }));
        return frame;
    },
    play: async ({ canvasElement }) => {
        // Hit and Run is an Extended Action; ramming and boarding stay on the Manoeuvres tab.
        const ids = [...canvasElement.querySelectorAll<HTMLElement>('[data-action="openShipAssault"]')].map((button) => button.dataset['assault']);
        await expect(ids).toEqual(['hit-and-run']);
        await expect(canvasElement.textContent).toContain('Hit and Run');
    },
};

export const PerSystem: Story = {
    render: () => {
        const wrapper = document.createElement('div');
        for (const system of SYSTEMS) wrapper.append(renderPanel(system));
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const withPanel = SYSTEMS.filter(
            (system) => canvasElement.querySelector(`[data-story-system="${system}"] [data-wh40k-hook="ship-assault-panel"]`) !== null,
        );
        await expect(withPanel).toEqual(['rt']);
    },
};
