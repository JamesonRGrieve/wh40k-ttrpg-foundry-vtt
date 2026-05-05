import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from './section-card.hbs?raw';

initializeStoryHandlebars();

interface Args {
    title?: string;
    titleKey?: string;
    icon: string;
    addAction?: string;
    addType?: string;
    addTitle?: string;
    addTitleKey?: string;
    addIcon?: string;
    cardClass?: string;
    headerClass?: string;
    actionBtnBgClass?: string;
    actionBtnBorderClass?: string;
    iconColor?: string;
    body?: string;
}

const renderWithBody = (args: Args) => {
    const body = args.body ?? '<div class="tw-text-xs tw-text-[var(--wh40k-text-muted)]">Body content goes here.</div>';
    const wrapped = templateSrc.replace('{{> @partial-block}}', body);
    return renderSheet(wrapped, args as unknown as Record<string, unknown>);
};

const meta = {
    title: 'Actor/Partials/SectionCard',
    render: (args) => renderWithBody(args as Args),
    args: {
        title: 'Critical Injuries',
        icon: 'fa-notes-medical',
        addAction: 'itemCreate',
        addType: 'criticalInjury',
        addTitle: 'Add Critical Injury',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const NoAddButton: Story = {
    args: { addAction: undefined, addType: undefined, addTitle: undefined },
};

export const WithList: Story = {
    args: {
        title: 'Malignancies',
        icon: 'fa-biohazard',
        addAction: 'itemCreate',
        addType: 'malignancy',
        addTitle: 'Add Malignancy',
        body: `
            <div class="tw-flex tw-flex-col tw-gap-1">
                <div class="tw-px-2 tw-py-1 tw-bg-[var(--wh40k-panel-bg)] tw-rounded">Tainted Soul</div>
                <div class="tw-px-2 tw-py-1 tw-bg-[var(--wh40k-panel-bg)] tw-rounded">Whispers in the Warp</div>
            </div>
        `,
    },
};

export const EmptyState: Story = {
    args: {
        title: 'Mental Disorders',
        icon: 'fa-brain',
        addAction: 'itemCreate',
        addType: 'mentalDisorder',
        addTitle: 'Add Mental Disorder',
        body: `
            <div class="tw-flex tw-flex-col tw-items-center tw-gap-1 tw-p-2 tw-border tw-border-dashed tw-border-[var(--wh40k-border-color-light)] tw-rounded">
                <i class="fas fa-shield-alt tw-text-2xl tw-opacity-50"></i>
                <span class="tw-text-xs tw-italic tw-text-[var(--wh40k-text-muted)]">No disorders</span>
            </div>
        `,
    },
};

/**
 * Asserts that the add button dispatches the configured `data-action` and
 * `data-type` attributes — the live sheet routes both verbatim into Foundry's
 * static-actions resolver, so a regression in the rendered attributes is a
 * real regression.
 */
export const AddButtonDispatch: Story = {
    args: {
        title: 'Critical Injuries',
        icon: 'fa-notes-medical',
        addAction: 'itemCreate',
        addType: 'criticalInjury',
        addTitle: 'Add Critical Injury',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const btn = canvasElement.querySelector('[data-action="itemCreate"]');
        expect(btn).toBeTruthy();
        expect((btn as HTMLElement).getAttribute('data-type')).toBe('criticalInjury');
        clickAction(canvasElement, 'itemCreate');
        void canvas;
    },
};
