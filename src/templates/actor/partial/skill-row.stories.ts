/**
 * Stories for the Statistics tab's skill rows at a narrow panel width (#267).
 *
 * A row is its own size container: narrower than 22rem, the rank pips and value
 * left the name too little room and clipped it ("Acrobatic", "Awarene"). The name
 * now takes the whole first line and the pips and value drop to a second.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsLib from 'handlebars';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import skillsSrc from '../panel/skills-panel.hbs?raw';
import specialistSrc from '../panel/skills-specialist-panel.hbs?raw';

initializeStoryHandlebars();
// The live helper resolves a skill's icon from the system's icon registry; a story only needs a URL.
HbsLib.registerHelper('skillIcon', () => 'icons/svg/d20-black.svg');

/** A panel width at which a two-tier skill row clipped its name. */
const NARROW_PX = 300;

const GAME_LINES = ['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'] as const;

const indicators = [
    { label: 'Kn', tooltip: 'Known', active: true },
    { label: 'Tr', tooltip: 'Trained', active: true },
    { label: 'Ex', tooltip: 'Experienced', active: false },
    { label: 'Ve', tooltip: 'Veteran', active: false },
];

function skill(label: string, charShort: string): object {
    return {
        label,
        charShort,
        characteristic: charShort,
        trainingLevel: 2,
        tooltipData: '{}',
        current: 45,
        breakdown: '',
        isFavorite: false,
        trainingIndicators: indicators,
    };
}

const ctx = {
    skillLists: {
        standard: [
            ['acrobatics', skill('Acrobatics', 'Ag')],
            ['awareness', skill('Awareness', 'Per')],
            ['interrogation', skill('Interrogation', 'WP')],
            ['sleightOfHand', skill('Sleight of Hand', 'Ag')],
        ],
        specialist: [
            [
                'commonLore',
                {
                    label: 'Common Lore',
                    charShort: 'Int',
                    advanced: false,
                    entries: [
                        {
                            skillKey: 'commonLore',
                            entryIndex: 0,
                            name: 'Common Lore (Adeptus Administratum)',
                            current: 40,
                            breakdown: '',
                            isFavorite: false,
                            trainingIndicators: indicators,
                        },
                    ],
                },
            ],
        ],
        advancedUntrained: [],
    },
    inEditMode: false,
};

const meta: Meta = { title: 'Actor/Character/SkillRowsNarrow' };
export default meta;
type Story = StoryObj;

/** Every skill and specialisation name shows in full at 300px, under each line's theme. */
export const NoNameClippedAtNarrowWidth: Story = {
    render: () => {
        const host = document.createElement('div');
        host.className = 'tw-flex tw-flex-col tw-gap-4';
        for (const line of GAME_LINES) {
            const wrapper = document.createElement('div');
            wrapper.className = 'wh40k-rpg';
            wrapper.dataset['wh40kSystem'] = line;
            wrapper.style.width = `${NARROW_PX}px`;
            wrapper.append(renderSheet(skillsSrc, ctx), renderSheet(specialistSrc, ctx));
            host.append(wrapper);
        }
        return host;
    },
    play: async ({ canvasElement }) => {
        const names = [...canvasElement.querySelectorAll<HTMLElement>('[data-testid="skill-name"]')];
        await expect(names.length).toBe(GAME_LINES.length * 5);
        const clipped = names.filter((name) => name.scrollWidth > name.clientWidth + 1).map((name) => name.textContent.trim());
        await expect(clipped).toEqual([]);
        // The name cell takes the row's whole first line.
        const cell = canvasElement.querySelector<HTMLElement>('[data-testid="skill-name-cell"]');
        const row = cell?.parentElement;
        await expect((cell?.getBoundingClientRect().width ?? 0) > (row?.getBoundingClientRect().width ?? 0) * 0.8).toBe(true);
    },
};
