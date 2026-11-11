/**
 * Storybook story for the Statistics-tab panels whose headers were unified to
 * the shared panel.hbs scaffold (#238): Specialist Skills + Talents. Rendered
 * together (empty state) so the heading treatment can be compared at a glance —
 * both should now show the same gradient + display-font header as the
 * Characteristics / Skills / Traits panels.
 *
 * A second story fills the Specialist Skills panel with an NPC's stored
 * specialisation rows (#725).
 *
 * Values fixed for screenshot-diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import specialistSrc from './skills-specialist-panel.hbs?raw';
import talentSrc from './talent-panel.hbs?raw';

initializeStoryHandlebars();

/** One training pip of a specialisation row, as `_augmentSkillData` attaches it. */
interface TrainingPip {
    label: string;
    tooltip: string;
    active: boolean;
}

/** One specialisation row of the panel, in the shape the sheet's specialist feed emits. */
interface SpecialistRow {
    name: string;
    skillKey: string;
    /** The row's stored position, or blank for the skill's own row. */
    entryIndex: string;
    current: number;
    breakdown: string;
    isFavorite: boolean;
    trainingIndicators: TrainingPip[];
}

interface SpecialistGroup {
    label: string;
    charShort: string;
    advanced: boolean;
    entries: SpecialistRow[];
}

interface StatsHeadingsCtx {
    skillLists: { specialist: Array<[string, SpecialistGroup]> };
    talents: never[];
    talentsCount: number;
    inEditMode: boolean;
}

function renderPanels(ctx: StatsHeadingsCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    wrapper.style.maxWidth = '420px';
    wrapper.appendChild(renderSheet(specialistSrc, ctx));
    wrapper.appendChild(renderSheet(talentSrc, ctx));
    return wrapper;
}

const meta: Meta<StatsHeadingsCtx> = {
    title: 'Actor/Character/StatsTabHeadings',
};
export default meta;
type Story = StoryObj<StatsHeadingsCtx>;

export const UnifiedHeaders: Story = {
    name: 'Specialist Skills + Talents share the panel.hbs header (#238)',
    args: {
        skillLists: { specialist: [] },
        talents: [],
        talentsCount: 0,
        inEditMode: false,
    },
    render: (args) => renderPanels(args),
};

const RANK_LABELS = ['T', '+10', '+20', '+30'] as const;

/** The four rank pips, lit up to `rank`. */
function pips(rank: number): TrainingPip[] {
    return RANK_LABELS.map((label, index) => ({ label, tooltip: label, active: rank > index }));
}

function specialistRow(skillKey: string, entryIndex: string, name: string, rank: number, current: number): SpecialistRow {
    return { name, skillKey, entryIndex, current, breakdown: `${name}: ${current}`, isFavorite: false, trainingIndicators: pips(rank) };
}

/**
 * An NPC's stored specialisations (#725). The NPC sheet fed this panel an empty
 * list, so an imported NPC's specialisation rows were stored and never shown.
 * Each row now prints its name, its rank pips and its own target, and its roll
 * button carries the stored position the roll reads the entry back by; the
 * skill's own row carries none and rolls the skill.
 */
export const NpcSpecialisationRows: Story = {
    name: 'NPC specialisation rows show and carry their roll position (#725)',
    args: {
        skillLists: {
            specialist: [
                [
                    'commonLore',
                    {
                        label: 'Common Lore',
                        charShort: 'Int',
                        advanced: false,
                        entries: [specialistRow('commonLore', '0', 'Imperium', 1, 35), specialistRow('commonLore', '1', 'Tech', 4, 65)],
                    },
                ],
                [
                    'trade',
                    {
                        label: 'Trade',
                        charShort: 'Int',
                        advanced: false,
                        entries: [specialistRow('trade', '', 'Armourer', 2, 45)],
                    },
                ],
            ],
        },
        talents: [],
        talentsCount: 0,
        inEditMode: false,
    },
    render: (args) => renderPanels(args),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        const names = scope.getAllByTestId('skill-name').map((el) => el.textContent.trim());
        await expect(names).toEqual(['Imperium', 'Tech', 'Armourer']);

        const row = (skill: string, index: string): HTMLElement => {
            const el = canvasElement.querySelector<HTMLElement>(`[data-skill="${skill}"][data-index="${index}"]`);
            if (el === null) throw new Error(`no specialisation row ${skill}[${index}]`);
            return el;
        };
        const rollButton = (el: HTMLElement): HTMLElement => {
            const button = el.querySelector<HTMLElement>('[data-action="roll"]');
            if (button === null) throw new Error('row has no roll button');
            return button;
        };

        // Each row prints its own target, not the skill's.
        await expect(row('commonLore', '0').textContent).toContain('35');
        await expect(row('commonLore', '1').textContent).toContain('65');

        // The roll button names the skill and the entry's stored position.
        const tech = rollButton(row('commonLore', '1'));
        await expect(tech.dataset['rollType']).toBe('skill');
        await expect(tech.dataset['rollTarget']).toBe('commonLore');
        await expect(tech.dataset['specialty']).toBe('1');
        await expect(rollButton(row('commonLore', '0')).dataset['specialty']).toBe('0');

        // The skill's own row sends no position, so it rolls the skill.
        await expect(rollButton(row('trade', '')).dataset['specialty']).toBe('');

        // The fourth rank lights all four pips; the first lights one.
        await expect(row('commonLore', '1').querySelectorAll('span.active')).toHaveLength(4);
        await expect(row('commonLore', '0').querySelectorAll('span.active')).toHaveLength(1);
    },
};
