import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from './panel.hbs?raw';

initializeStoryHandlebars();

interface Args {
    label: string;
    icon?: string;
    count?: number;
    rootClass?: string;
    rootAttrs?: string;
    headerClass?: string;
    bodyClass?: string;
    headerActionIcon?: string;
    headerAction?: string;
    headerActionTitle?: string;
    headerActionTone?: 'info' | 'gold';
    body?: string;
}

const renderWithBody = (args: Args) => {
    const body =
        args.body ??
        '<div class="tw-text-xs tw-text-[var(--wh40k-text-muted)]">Body content goes here.</div>';
    const wrapped = templateSrc.replace('{{> @partial-block}}', body);
    return renderSheet(wrapped, args as unknown as Record<string, unknown>);
};

const meta = {
    title: 'Actor/Partials/Panel',
    render: (args) => renderWithBody(args as Args),
    args: {
        label: 'Armour',
        icon: 'fa-shield-alt',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const NoIcon: Story = {
    args: { label: 'Notes', icon: undefined },
};

export const WithCount: Story = {
    args: { label: 'Talents', icon: 'fa-medal', count: 12 },
};

export const WithHeaderActionInfo: Story = {
    args: {
        label: 'Wounds',
        icon: 'fa-heart-pulse',
        headerActionIcon: 'fa-sliders',
        headerAction: 'openWoundsEditor',
        headerActionTitle: 'Configure wounds',
    },
};

export const WithHeaderActionGold: Story = {
    args: {
        label: 'Fate',
        icon: 'fa-star',
        headerActionIcon: 'fa-plus',
        headerAction: 'addFatePoint',
        headerActionTitle: 'Add fate point',
        headerActionTone: 'gold',
    },
};

export const WithDropZone: Story = {
    args: {
        label: 'Traits',
        icon: 'fa-dna',
        rootClass: 'wh40k-traits-panel',
        rootAttrs: 'data-drop-zone="general" data-accepts="trait"',
        body: '<div class="tw-flex tw-flex-col tw-gap-1"><div class="tw-px-2 tw-py-1 tw-bg-[var(--wh40k-panel-bg)] tw-rounded">Touched by the Fates</div></div>',
    },
};

export const FullList: Story = {
    args: {
        label: 'Equipment',
        icon: 'fa-briefcase',
        count: 4,
        body: `
            <div class="tw-flex tw-flex-col tw-gap-1">
                <div class="tw-px-2 tw-py-1 tw-bg-[var(--wh40k-panel-bg)] tw-rounded">Boltgun</div>
                <div class="tw-px-2 tw-py-1 tw-bg-[var(--wh40k-panel-bg)] tw-rounded">Chainsword</div>
                <div class="tw-px-2 tw-py-1 tw-bg-[var(--wh40k-panel-bg)] tw-rounded">Frag Grenades</div>
                <div class="tw-px-2 tw-py-1 tw-bg-[var(--wh40k-panel-bg)] tw-rounded">Carapace Armour</div>
            </div>
        `,
    },
};

/**
 * Asserts the header action button dispatches the configured `data-action`.
 * The live sheet routes this attribute verbatim into Foundry's static-actions
 * resolver, so a regression in the rendered attribute is a real regression.
 */
export const HeaderActionDispatch: Story = {
    args: {
        label: 'Wounds',
        icon: 'fa-heart-pulse',
        headerActionIcon: 'fa-sliders',
        headerAction: 'openWoundsEditor',
        headerActionTitle: 'Configure wounds',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const btn = canvasElement.querySelector('[data-action="openWoundsEditor"]');
        expect(btn).toBeTruthy();
        expect((btn as HTMLElement).getAttribute('title')).toBe('Configure wounds');
        clickAction(canvasElement, 'openWoundsEditor');
        void canvas;
    },
};
