import type { Meta, StoryObj } from '@storybook/html-vite';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/prompt/batch-xp-prompt.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xba7c4);

interface Args {
    characters: Array<{ id: string; name: string; img: string; currentXP: number; selected: boolean }>;
    xpAmount: number;
    isAddition: boolean;
    absAmount: number;
    selectedCount: number;
}

const meta = {
    title: 'Prompts/BatchXpDialog',
    render: (args) => renderSheet(templateSrc, args),
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    args: {
        characters: [
            { id: randomId('chr', rng), name: 'Character Alpha', img: 'icons/svg/cowled.svg', currentXP: 4200, selected: true },
            { id: randomId('chr', rng), name: 'Character Beta', img: 'icons/svg/angel.svg', currentXP: 3800, selected: true },
            { id: randomId('chr', rng), name: 'Character Gamma', img: 'icons/svg/combat.svg', currentXP: 4100, selected: true },
            { id: randomId('chr', rng), name: 'Character Delta', img: 'icons/svg/clockwork.svg', currentXP: 3900, selected: false },
        ],
        xpAmount: 500,
        isAddition: true,
        absAmount: 500,
        selectedCount: 3,
    },
};
