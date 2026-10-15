/**
 * Storybook stories for the Only War Regimental Drawbacks panel (#160 —
 * Hammer of the Emperor, Regimental Drawbacks; Multiple Comrades).
 *
 *   1. No drawbacks, RAW single Comrade — empty list, exact budget.
 *   2. Two real drawbacks (Doomed, The Few) stored as compendium UUIDs — each
 *      row shows the drawback's name. Their documents do not yet carry their
 *      Regiment Creation Points, so refunds and totals read "—", never "+0".
 *   3. Resolved descriptors with a merged penalty — the refund badge, the
 *      adjusted budget and the penalty readout. The descriptors are synthetic
 *      (layout only) and named as such.
 *   4. A drawback plus a Multiple Comrades roster, listed by Comrade name.
 *
 * Each context is built by `buildDrawbackPanel` — the builder the character
 * sheet uses — with a fixed name lookup standing in for `uuidNameCache`.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { REGIMENT_BUDGET } from '../../../module/rules/ow-regiment-creation';
import { buildDrawbackPanel, type DrawbackPanelData, type MultiComradeRoster, type RegimentDrawback } from '../../../module/rules/ow-regiment-drawback';
import panelSrc from './ow-drawback-panel.hbs?raw';

initializeStoryHandlebars();

interface DrawbackPanelCtx {
    drawbackPanel: DrawbackPanelData;
}

const DOOMED = 'Compendium.wh40k-rpg.ow-hammer-origins-regimental-drawbacks.Item.70dcc1a74d10b5dc';
const THE_FEW = 'Compendium.wh40k-rpg.ow-hammer-origins-regimental-drawbacks.Item.0e3e5f403cafdd8a';

/** Stands in for `uuidNameCache.getName`: the names those pack documents carry. */
const NAMES: Record<string, string> = {
    [DOOMED]: 'Doomed',
    [THE_FEW]: 'The Few',
    'synthetic-a': 'Synthetic drawback A',
    'synthetic-b': 'Synthetic drawback B',
};
const nameOf = (id: string): string => NAMES[id] ?? id;

function buildContext(ids: readonly string[], descriptors: readonly RegimentDrawback[], roster: MultiComradeRoster | null): DrawbackPanelCtx {
    const byId = new Map(descriptors.map((d) => [d.id, d]));
    return { drawbackPanel: buildDrawbackPanel(ids, roster, (id) => byId.get(id), nameOf, REGIMENT_BUDGET) };
}

function renderPanel(ctx: DrawbackPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/** The drawback rows as shown: name and refund label. */
function rows(root: HTMLElement): Array<{ name: string; refund: string }> {
    return Array.from(root.querySelectorAll('li[data-drawback-id]')).map((li) => ({
        name: li.querySelector('[data-field="drawback-name"]')?.textContent.trim() ?? '',
        refund: li.querySelector('[data-field="drawback-refund"]')?.textContent.trim() ?? '',
    }));
}

const meta: Meta<DrawbackPanelCtx> = {
    title: 'Actor/Character/OwDrawbackPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<DrawbackPanelCtx>;

export const NoDrawbacksRawSingleComrade: Story = {
    name: 'No drawbacks, RAW single Comrade — empty list',
    args: buildContext([], [], null),
    play: async ({ canvasElement }) => {
        await expect(rows(canvasElement)).toEqual([]);
        await expect(canvasElement.querySelector('[data-adjusted-budget]')?.textContent.trim()).toBe(`= ${REGIMENT_BUDGET}`);
    },
};

export const RealDrawbacksRefundUnknown: Story = {
    name: 'Doomed + The Few — named from their documents, refunds unknown',
    args: buildContext([DOOMED, THE_FEW], [], null),
    play: async ({ canvasElement }) => {
        await expect(rows(canvasElement)).toEqual([
            { name: 'Doomed', refund: '—' },
            { name: 'The Few', refund: '—' },
        ]);
        await expect(canvasElement.textContent).not.toContain('Compendium.');
        await expect(canvasElement.textContent).not.toContain('+0');
        await expect(canvasElement.querySelector('[data-adjusted-budget]')?.textContent.trim()).toBe('= —');
    },
};

const synthetic: readonly RegimentDrawback[] = [
    { id: 'synthetic-a', description: '', refund: 3, penalty: { characteristics: { intelligence: -3 } } },
    { id: 'synthetic-b', description: '', refund: 2, penalty: { characteristics: { toughness: -2 }, logistics: -1 } },
];

export const ResolvedWithMergedPenalty: Story = {
    name: 'Resolved descriptors — refund, adjusted budget, merged penalty (synthetic)',
    args: buildContext(['synthetic-a', 'synthetic-b'], synthetic, null),
    play: async ({ canvasElement }) => {
        await expect(rows(canvasElement)).toEqual([
            { name: 'Synthetic drawback A', refund: '+3' },
            { name: 'Synthetic drawback B', refund: '+2' },
        ]);
        await expect(canvasElement.querySelector('[data-refund-total]')?.textContent).toContain('+5');
        await expect(canvasElement.querySelector('[data-adjusted-budget]')?.textContent.trim()).toBe(`= ${REGIMENT_BUDGET + 5}`);
        await expect(canvasElement.querySelector('[data-field="merged-penalty"]')).not.toBeNull();
    },
};

export const DrawbackPlusMultiComradeRoster: Story = {
    name: 'Drawback + Multiple Comrades roster — listed by Comrade name',
    args: buildContext([DOOMED], [], { primaryId: 'Trooper Vellis', additionalIds: ['Trooper Arkos', 'Trooper Jadek'] }),
    play: async ({ canvasElement }) => {
        const roster = canvasElement.querySelector<HTMLElement>('[data-field="multi-comrade-roster"]');
        await expect(roster?.dataset['rosterCount']).toBe('3');
        await expect(roster?.textContent).toContain('Trooper Vellis');
        await expect(Array.from(roster?.querySelectorAll('[data-comrade-id]') ?? []).map((li) => li.textContent.trim())).toEqual([
            'Trooper Arkos',
            'Trooper Jadek',
        ]);
    },
};
