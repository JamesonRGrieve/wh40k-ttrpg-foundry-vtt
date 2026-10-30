/**
 * Stories for InquestTrackerDialog (#90): the GM's editor for the warband's
 * Inquests. The stories render the dialog's `.hbs` against the context that
 * `_prepareContext` builds, using the same pure helpers (`rowFromInquest`,
 * `inquestProgress`, `inquestScopeOptions`) and DH2's printed tables. The
 * dialog is DH2-only (`inquestRulesFor` is null on every other line), so the
 * wrapper carries `data-wh40k-system="dh2"`.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/inquest-tracker.hbs?raw';
import { randomId, seedRandom } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { DH2_INQUEST_RULES } from '../../config/game-systems/dh2-config.ts';
import { CLUE_SIGNIFICANCES, createInquest, INQUEST_APPROACHES, inquestProgress, type InquestState, rowFromInquest } from '../../rules/inquest.ts';
import { inquestScopeOptions } from './inquest-view.ts';

initializeStoryHandlebars();

const rng = seedRandom(0x1a91);
const rules = DH2_INQUEST_RULES;

const SCOPE_NAMES: Record<string, string> = { minoris: 'Hereticus Minoris', majoris: 'Hereticus Majoris', extremis: 'Hereticus Extremis' };
const STATUS_NAMES: Record<InquestState['status'], string> = { active: 'Under way', goalsMet: 'Resolved — goals met', goalsFailed: 'Resolved — goals failed' };

interface Args {
    inquests: InquestState[];
}

function render(args: Args): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg inquest-tracker-dialog';
    root.dataset['wh40kSystem'] = 'dh2';
    root.append(
        renderSheet(templateSrc, {
            inquests: args.inquests.map((inquest, index) => ({
                ...rowFromInquest(inquest),
                index,
                isActive: inquest.status === 'active',
                progress: inquestProgress(rules, inquest),
                statusLabel: STATUS_NAMES[inquest.status],
            })),
            scopeOptions: inquestScopeOptions(rules).map((o) => ({ value: o.value, label: `${SCOPE_NAMES[o.value] ?? o.value} (${o.points} IP)` })),
            approachOptions: INQUEST_APPROACHES.map((value) => ({ value, label: value === 'open' ? 'Open' : 'Covert' })),
            clueButtons: CLUE_SIGNIFICANCES.map((significance) => ({ significance, label: significance, points: rules.clueValues[significance] })),
            leadInvestigatorClueBonus: rules.leadInvestigatorClueBonus,
            pointsPerLeadDegree: rules.pointsPerLeadDegree,
        }),
    );
    return root;
}

const meta = {
    title: 'Dialogs/InquestTrackerDialog',
    render,
    args: {
        inquests: [
            createInquest(randomId('inq', rng), {
                target: 'Lord Karheit Vorf',
                objective: 'Stop the production and distribution of phoria.',
                requirements: 'Knowledge of the oath system; de-tox.',
                leadInvestigator: 'Ibnad',
                scope: 'minoris',
                investigationPoints: 350,
            }),
            createInquest(randomId('inq', rng), { target: 'Zethor', scope: 'majoris', approach: 'open', investigationPoints: 950, status: 'goalsMet' }),
        ],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="inquest-card"]')).toHaveLength(2);
        const active = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="inquest-card"][data-inquest-status="active"]');
        const resolved = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="inquest-card"][data-inquest-status="goalsMet"]');
        // Every field round-trips into its data-field input.
        await expect(active?.querySelector<HTMLInputElement>('[data-field="target"]')?.value).toBe('Lord Karheit Vorf');
        await expect(active?.querySelector<HTMLSelectElement>('[data-field="scope"]')?.value).toBe('minoris');
        await expect(active?.querySelector<HTMLInputElement>('[data-field="investigationPoints"]')?.value).toBe('350');
        await expect(active?.textContent).toContain('350 / 600 IP');
        // Clue buttons carry the printed clue values and the card's index.
        const clues = Array.from(active?.querySelectorAll<HTMLElement>('[data-action="addClue"]') ?? []);
        await expect(clues.map((b) => b.dataset['significance'])).toEqual(['minor', 'major', 'vital']);
        await expect(clues.at(2)?.textContent).toContain('+200');
        await expect(clues.at(0)?.dataset['index']).toBe('0');
        await expect(active?.querySelectorAll('[data-action="leadTest"]')).toHaveLength(2);
        await expect(active?.querySelectorAll('[data-action="resolveInquest"]')).toHaveLength(2);
        // A resolved Inquest offers Reopen instead of the clue / resolve controls.
        await expect(resolved?.querySelector('[data-action="addClue"]')).toBeNull();
        await expect(resolved?.querySelector('[data-action="reopenInquest"]')?.getAttribute('data-index')).toBe('1');
        await expect(resolved?.querySelector('[data-wh40k-hook="inquest-status"]')?.textContent).toContain('goals met');
    },
};

export const Empty: Story = {
    args: { inquests: [] },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="inquest-empty"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="addInquest"]')).not.toBeNull();
    },
};
