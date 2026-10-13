/**
 * The Malignancy Test roll card (35092c9ab, #91): a Willpower test whose Corruption
 * Track modifier (Table 8-14) is its own sourced, hoverable row, and whose effect
 * row reports what the test did — the taint held, a Malignancy gained, or (Twisted
 * Flesh, within.md p. 32) a Mutation rolled instead.
 *
 * Every number comes from the real rules (`corruptionTrackModifier`,
 * `getMalignancyTestTarget`) and every string from the langpack, so the card
 * here is the card the pipeline posts.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { prepareModifierTooltipData } from '../../src/module/applications/components/wh40k-tooltip';
import type { GameSystemId } from '../../src/module/config/game-systems/types';
import { corruptionTrackModifier, getMalignancyTestTarget } from '../../src/module/rules/malignancy-test';
import simpleRollChatSrc from '../../src/templates/chat/simple-roll-chat.hbs?raw';
import { mockRollData } from '../mocks';
import { localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

/** The psyker-free acolyte the cards are rolled for. */
const WILLPOWER = 38;

type Outcome = 'resisted' | 'manifests' | 'mutation';

const OUTCOME_KEYS: Record<Outcome, string> = {
    resisted: 'WH40K.Malignancy.Resisted',
    manifests: 'WH40K.Malignancy.Manifests',
    mutation: 'WH40K.Malignancy.TwistedFlesh.MutationInstead',
};

interface CardArgs {
    gameSystem: GameSystemId;
    corruption: number;
    outcome: Outcome;
    roll: number;
}

function renderCard(args: CardArgs): HTMLElement {
    const trackLabel = localizeKey('WH40K.Roll.ModifierSource.CorruptionTrack');
    const track = corruptionTrackModifier(args.corruption);
    const target = getMalignancyTestTarget(WILLPOWER, args.corruption);
    const success = args.outcome === 'resisted';
    const degrees = Math.floor(Math.abs(target - args.roll) / 10) + 1;
    const context = mockRollData({
        gameSystem: args.gameSystem,
        rollData: {
            sheetName: 'Acolyte Vex',
            name: localizeKey('WH40K.Malignancy.TestLabel'),
            type: 'Characteristic',
            baseTarget: WILLPOWER,
            activeModifiers: {},
            modifierSources: [
                {
                    label: trackLabel,
                    value: track,
                    source: 'corruption-track',
                    tooltipData: prepareModifierTooltipData(trackLabel, [{ name: trackLabel, value: track }]),
                },
            ],
            modifiedTarget: target,
            success,
            dos: success ? degrees : 0,
            dof: success ? 0 : degrees,
            roll: { total: args.roll },
        },
        effectOutput: [{ name: localizeKey('WH40K.ActionEffect.Title.Malignancy'), effect: localizeKey(OUTCOME_KEYS[args.outcome]) }],
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'theme-dark');
    wrapper.dataset['wh40kSystem'] = args.gameSystem;
    wrapper.style.maxWidth = '380px';
    wrapper.appendChild(renderSheet(simpleRollChatSrc, context));
    return wrapper;
}

const meta = {
    id: 'chat-malignancy-test',
    title: 'Chat/Corruption/Malignancy Test',
    render: (args) => renderCard(args),
    args: { gameSystem: 'dh2', corruption: 42, outcome: 'manifests', roll: 71 },
} satisfies Meta<CardArgs>;
export default meta;
type Story = StoryObj<CardArgs>;

/** Read the card's sourced Corruption Track row. */
function trackRow(root: HTMLElement): HTMLElement | null {
    return root.querySelector<HTMLElement>('[data-wh40k-tooltip="modifier"]');
}

/** Soiled (42 CP): the −10 row is its own hoverable component, and the target is Willpower − 10. */
export const ManifestsSoiled: Story = {
    play: async ({ canvasElement }) => {
        const row = trackRow(canvasElement);
        await expect(row?.textContent).toContain('Corruption Track');
        await expect(row?.textContent).toContain('-10');
        await expect(canvasElement.textContent).toContain(String(WILLPOWER - 10));
        await expect(canvasElement.querySelector('[data-roll-effect]')?.textContent).toContain(localizeKey('WH40K.Malignancy.Manifests'));
    },
};

/** Tainted (≤30 CP) adds nothing, and a pass holds the taint at bay. */
export const ResistedTainted: Story = {
    args: { corruption: 18, outcome: 'resisted', roll: 12 },
    play: async ({ canvasElement }) => {
        await expect(trackRow(canvasElement)?.textContent).toContain('0');
        await expect(canvasElement.querySelector('[data-roll-effect]')?.textContent).toContain(localizeKey('WH40K.Malignancy.Resisted'));
    },
};

/** Twisted Flesh (within.md p. 32): the Mutant took a Mutation instead of the Malignancy. */
export const TwistedFleshMutationInstead: Story = {
    args: { corruption: 64, outcome: 'mutation', roll: 88 },
    play: async ({ canvasElement }) => {
        await expect(trackRow(canvasElement)?.textContent).toContain('-20');
        const effect = canvasElement.querySelector('[data-roll-effect]')?.textContent ?? '';
        await expect(effect).toContain(localizeKey('WH40K.Malignancy.TwistedFlesh.MutationInstead'));
        await expect(effect).not.toContain(localizeKey('WH40K.Malignancy.Manifests'));
    },
};

/**
 * The lines that test for Malignancies (DH2, DH1, Only War, Rogue Trader) post the
 * same card, each anchored to its own line for the per-system variants.
 */
export const AcrossTestingLines: Story = {
    render: () => {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(2, 380px)';
        grid.style.gap = '12px';
        for (const gameSystem of ['dh2', 'dh1', 'ow', 'rt'] as const) {
            grid.appendChild(renderCard({ gameSystem, corruption: 42, outcome: 'manifests', roll: 71 }));
        }
        return grid;
    },
    play: async ({ canvasElement }) => {
        const lines = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-system]'), (el) => el.dataset['wh40kSystem']);
        await expect(new Set(lines)).toEqual(new Set(['dh2', 'dh1', 'ow', 'rt']));
        await expect(canvasElement.querySelectorAll('[data-roll-effect]').length).toBe(4);
    },
};
