import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-lead-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import { leadStatusSelectOptions } from '../../config/lead-status.ts';

interface LeadArgs {
    item: {
        name: string;
        img: string;
        system: {
            state: string;
            stateLabel: string;
            stateIcon: string;
            leadType: string;
            leadTypeLabel: string;
            leadTypeIcon: string;
            sourceClue: string;
            notes: string;
            description: { value: string };
        };
    };
    system: LeadArgs['item']['system'];
}

const baseSystem = (): LeadArgs['item']['system'] => ({
    state: 'active',
    stateLabel: 'Active',
    stateIcon: 'fa-magnifying-glass',
    leadType: 'witness',
    leadTypeLabel: 'Witness',
    leadTypeIcon: 'fa-user',
    sourceClue: 'Bloodstained sermon-card recovered from the chapel.',
    notes: 'Follow up with Sister Mira after the next vox-window.',
    description: { value: 'A lay-cleric saw the suspect leaving the rectory after Compline.' },
});

const meta = {
    title: 'Item Sheets/LeadSheet',
    // `states` mirrors the sheet's registry-derived select options so the
    // state dropdown renders its full set of <option>s in isolation.
    render: (args) => renderSheet(templateSrc, { ...args, states: leadStatusSelectOptions() }),
    args: {
        item: { name: 'Sister Mira, Lay-Cleric', img: 'icons/svg/eye.svg', system: baseSystem() },
        system: baseSystem(),
    },
} satisfies Meta<LeadArgs>;

export default meta;
type Story = StoryObj<LeadArgs>;

export const Default: Story = {};

export const Pursued: Story = {
    args: {
        item: {
            name: 'Hab-block 17 ledger entry',
            img: 'icons/svg/book.svg',
            system: {
                ...baseSystem(),
                state: 'pursued',
                stateLabel: 'Pursued',
                stateIcon: 'fa-route',
                leadType: 'document',
                leadTypeLabel: 'Document',
                leadTypeIcon: 'fa-file-lines',
                sourceClue: 'Reagent test on the requisition slip — entry 04-Σ.',
            },
        },
        system: {
            ...baseSystem(),
            state: 'pursued',
            stateLabel: 'Pursued',
            stateIcon: 'fa-route',
            leadType: 'document',
            leadTypeLabel: 'Document',
            leadTypeIcon: 'fa-file-lines',
            sourceClue: 'Reagent test on the requisition slip — entry 04-Σ.',
        },
    },
};

export const DeadEnd: Story = {
    args: {
        item: {
            name: 'Vacant promethium tank',
            img: 'icons/svg/cancel.svg',
            system: {
                ...baseSystem(),
                state: 'dead-end',
                stateLabel: 'Dead End',
                stateIcon: 'fa-ban',
                leadType: 'location',
                leadTypeLabel: 'Location',
                leadTypeIcon: 'fa-map-location-dot',
                sourceClue: 'Anonymous data-slate intercept.',
            },
        },
        system: {
            ...baseSystem(),
            state: 'dead-end',
            stateLabel: 'Dead End',
            stateIcon: 'fa-ban',
            leadType: 'location',
            leadTypeLabel: 'Location',
            leadTypeIcon: 'fa-map-location-dot',
            sourceClue: 'Anonymous data-slate intercept.',
        },
    },
};

export const Resolved: Story = {
    args: {
        item: {
            name: 'Recovered cipher-key',
            img: 'icons/svg/circle.svg',
            system: {
                ...baseSystem(),
                state: 'resolved',
                stateLabel: 'Resolved',
                stateIcon: 'fa-circle-check',
                leadType: 'document',
                leadTypeLabel: 'Document',
                leadTypeIcon: 'fa-file-lines',
                sourceClue: 'Decrypted the slate — it named the safehouse.',
            },
        },
        system: {
            ...baseSystem(),
            state: 'resolved',
            stateLabel: 'Resolved',
            stateIcon: 'fa-circle-check',
            leadType: 'document',
            leadTypeLabel: 'Document',
            leadTypeIcon: 'fa-file-lines',
            sourceClue: 'Decrypted the slate — it named the safehouse.',
        },
    },
};

export const RendersFields: Story = {
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        void expect(cv.getByPlaceholderText('Which clue produced this lead?')).toBeTruthy();
        // The select for state/type should be in the DOM.
        const stateSelect = canvasElement.querySelector('select[name="system.state"]');
        const typeSelect = canvasElement.querySelector('select[name="system.leadType"]');
        void expect(stateSelect).toBeTruthy();
        void expect(typeSelect).toBeTruthy();
        // State options derive from the shared registry — all four, including the
        // distinct `resolved` outcome, must render.
        const stateValues = Array.from(stateSelect?.querySelectorAll('option') ?? []).map((o) => o.value);
        void expect(stateValues).toEqual(['active', 'pursued', 'resolved', 'dead-end']);
    },
};
