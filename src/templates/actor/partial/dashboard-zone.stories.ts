import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderTemplate } from '../../../../stories/mocks';
import templateSrc from './dashboard-zone.hbs?raw';

initializeStoryHandlebars();

// Wrap as a block partial caller — dashboard-zone uses `{{> @partial-block }}`.
// We compile a small parent template that invokes it.
function renderZone(args: {
    title: string;
    icon: string;
    body: string;
    zoneClass?: string;
    contentClass?: string;
}): HTMLElement {
    // Register the body as an inline partial under a stable name, then call
    // the dashboard-zone block partial with that body.
    const wrapper = `{{#> systems/wh40k-rpg/templates/actor/partial/dashboard-zone title=title icon=icon zoneClass=zoneClass contentClass=contentClass}}{{{body}}}{{/systems/wh40k-rpg/templates/actor/partial/dashboard-zone}}`;
    const tpl = Handlebars.compile(wrapper);
    return renderTemplate(tpl, args);
}

interface Args {
    title: string;
    icon: string;
    body: string;
    zoneClass?: string;
    contentClass?: string;
}

const meta = {
    title: 'Actor/Partials/DashboardZone',
    render: (args) => renderZone(args),
    args: {
        title: 'Vitals',
        icon: 'fa-heartbeat',
        body: '<div class="tw-text-sm">Wounds 12/12 · Fate 3/3</div>',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Combat: Story = {
    args: {
        title: 'Combat',
        icon: 'fa-crosshairs',
        body: '<div>Initiative · Movement · Actions</div>',
        zoneClass: 'tw-border-l-[3px] tw-border-l-[var(--wh40k-accent-combat)]',
    },
};

export const CustomContentClass: Story = {
    args: {
        title: 'Skills',
        icon: 'fa-list',
        body: '<div>Awareness</div><div>Stealth</div>',
        contentClass: 'tw-p-3 tw-grid tw-grid-cols-2 tw-gap-1',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Title rendered, icon class threaded.
        expect(canvas.getByText('Skills')).toBeTruthy();
        const icon = canvasElement.querySelector('.fa-list');
        expect(icon).toBeTruthy();
        // Custom content class overrode the default.
        const grid = canvasElement.querySelector('.tw-grid');
        expect(grid).toBeTruthy();
    },
};
