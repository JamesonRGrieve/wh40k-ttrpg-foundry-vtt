/**
 * Stories for the Medal sheet (content#32): an Only War medal's description,
 * what it is Awarded For, its Squad Bonus and its honour type, in the shared
 * content-block template.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface MedalArgs {
    item: { name: string; img: string; system: { description: { value: string } } };
    system: { description: { value: string }; notes: string };
    contentFields: Array<{ name: string; labelKey: string; value: string }>;
    contentScalars: Array<{
        kind: 'select';
        name: string;
        labelKey: string;
        value: string;
        options: Array<{ value: string; labelKey: string; selected: boolean }>;
    }>;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
}

/** A sample medal (invented description). */
function args(canEdit: boolean, inEditMode: boolean): MedalArgs {
    const description = {
        value: '<p>Given to an officer whose leadership turned the tide of a hard-fought engagement.</p>',
    };
    return {
        item: { name: 'Winged Skull', img: 'https://cdn.jsdelivr.net/gh/game-icons/icons@master/delapouite/star-medal.svg', system: { description } },
        system: { description, notes: '' },
        contentFields: [
            { name: 'system.awardedFor', labelKey: 'WH40K.Medal.AwardedFor', value: '<p>Inspirational leadership leading to righteous victory.</p>' },
            { name: 'system.squadBonus', labelKey: 'WH40K.Medal.SquadBonus', value: '<p>+10 to all Command Tests.</p>' },
        ],
        contentScalars: [
            {
                kind: 'select',
                name: 'system.honourType',
                labelKey: 'WH40K.Medal.HonourType',
                value: 'imperial',
                options: [
                    { value: 'imperial', labelKey: 'WH40K.Medal.Honour.Imperial', selected: true },
                    { value: 'campaign', labelKey: 'WH40K.Medal.Honour.Campaign', selected: false },
                    { value: 'regimental', labelKey: 'WH40K.Medal.Honour.Regimental', selected: false },
                ],
            },
        ],
        canEdit,
        inEditMode,
        editable: canEdit,
    };
}

const meta = {
    title: 'Item Sheets/MedalSheet',
    render: (story) => {
        const el = renderSheet(templateSrc, story);
        el.dataset['wh40kSystem'] = 'ow';
        return el;
    },
    args: args(false, false),
} satisfies Meta<MedalArgs>;
export default meta;

type Story = StoryObj<MedalArgs>;

export const ReadOnly: Story = {
    args: args(false, false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Awarded For');
        await expect(canvasElement.textContent).toContain('Inspirational leadership leading to righteous victory.');
        await expect(canvasElement.textContent).toContain('Squad Bonus');
        await expect(canvasElement.textContent).toContain('+10 to all Command Tests.');
        await expect(canvasElement.querySelector('select[name="system.honourType"]')).toBeNull();
    },
};

export const EditMode: Story = {
    args: args(true, true),
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.honourType"]');
        await expect(select?.value).toBe('imperial');
        await expect([...(select?.options ?? [])].map((option) => option.value)).toEqual(['imperial', 'campaign', 'regimental']);
    },
};
