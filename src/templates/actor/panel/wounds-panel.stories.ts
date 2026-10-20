/**
 * Storybook stories for the Wounds panel's danger state (#685).
 *
 * At 0 wounds with critical damage the panel shows a "Critically Wounded" banner
 * and a Critical Damage counter. Those read crimson on every line. They wrote
 * `tw-text-crimson-l40` glued to the line's accent class, which made one unknown
 * class, so the danger text took no colour of its own.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { type SystemId, withSystem } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './wounds-panel.hbs?raw';

initializeStoryHandlebars();

/** `tw-text-crimson-l40` (tailwind.config.js `crimson.l40`, #ff5a5a). */
const DANGER_CRIMSON = 'rgb(255, 90, 90)';

interface WoundsState {
    value: number;
    max: number;
    critical: number;
}

function criticallyWounded(systemId: SystemId): HTMLElement {
    const wounds: WoundsState = { value: 0, max: 12, critical: 3 };
    const actor = withSystem(mockActor({ system: { wounds } }), systemId);
    const root = renderSheet(panelSrc, { _gameSystemId: systemId, actor, system: { ...actor.system, wounds }, source: { wounds } });
    root.dataset['wh40kSystem'] = systemId;
    return root;
}

/** The danger elements: the Critically Wounded banner and the Critical Damage label and count. */
function dangerColours(canvasElement: HTMLElement): string[] {
    return [...canvasElement.querySelectorAll<HTMLElement>('.tw-text-crimson-l40')].map((el) => getComputedStyle(el).color);
}

const meta: Meta = {
    title: 'Actor/Panels/WoundsPanel',
};
export default meta;

type Story = StoryObj;

function dangerStory(systemId: SystemId): Story {
    return {
        name: `Critically wounded · ${systemId.toUpperCase()}`,
        render: () => criticallyWounded(systemId),
        play: async ({ canvasElement }) => {
            const colours = dangerColours(canvasElement);
            // Banner, Critical Damage label, its count (the editor input is in the closed edit body).
            await expect(colours.length).toBeGreaterThanOrEqual(3);
            await expect(colours.every((colour) => colour === DANGER_CRIMSON)).toBe(true);
        },
    };
}

export const CriticallyWoundedDH2: Story = dangerStory('dh2');
export const CriticallyWoundedRT: Story = dangerStory('rt');
