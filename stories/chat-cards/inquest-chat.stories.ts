import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { DH2_INQUEST_RULES } from '../../src/module/config/game-systems/dh2-config.ts';
import { createInquest, inquestInfluenceOutcome, inquestProgress } from '../../src/module/rules/inquest.ts';
import inquestChatSrc from '../../src/templates/chat/inquest-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat cards posted by the GM Inquest tracker (#90 — DH2 Enemies Within
 * pp. 66–69): the Revelation card (posted when the IP total crosses a
 * threshold) and the resolution card (each Acolyte's Influence change, with
 * its scope reward, surplus bonus and shortfall penalty). The values come from
 * the same pure resolvers the tracker calls. The card carries
 * `data-wh40k-system` because chat renders outside a sheet root.
 */
initializeStoryHandlebars();

const rules = DH2_INQUEST_RULES;

function wrap(node: HTMLElement): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg';
    root.append(node);
    return root;
}

function resolutionCard(points: number, goalsMet: boolean): HTMLElement {
    const inquest = createInquest('story', { target: 'Lord Karheit Vorf', scope: 'minoris', investigationPoints: points });
    const outcome = inquestInfluenceOutcome(rules, inquest, goalsMet);
    return wrap(
        renderSheet(inquestChatSrc, {
            kind: 'resolution',
            gameSystem: 'dh2',
            target: inquest.target,
            scopeLabel: 'Hereticus Minoris',
            points,
            required: inquestProgress(rules, inquest).required,
            goalsMet,
            influenceTotal: outcome.total,
            scopeReward: outcome.scopeReward,
            surplusBonus: outcome.surplusBonus,
            shortfallPenalty: outcome.shortfallPenalty,
        }),
    );
}

const meta: Meta = { title: 'Chat Cards/Inquest' };
export default meta;
type Story = StoryObj;

export const Revelation: Story = {
    render: () =>
        wrap(
            renderSheet(inquestChatSrc, {
                kind: 'revelation',
                gameSystem: 'dh2',
                target: 'The Childes of Kappellax',
                scopeLabel: 'Hereticus Extremis',
                points: 420,
                required: 1200,
                revelation: 2,
                revelationCount: 5,
                isFinal: false,
            }),
        ),
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="inquest-chat"]');
        await expect(card?.dataset['inquestCard']).toBe('revelation');
        await expect(card?.dataset['wh40kSystem']).toBe('dh2');
        await expect(card?.textContent).toContain('Revelation 2 of 5');
        await expect(card?.textContent).toContain('420 / 1200 IP');
    },
};

export const ResolutionGoalsMetWithSurplus: Story = {
    render: () => resolutionCard(950, true),
    play: async ({ canvasElement }) => {
        // Minoris 3 + 1 for a full 300 surplus IP.
        await expect(canvasElement.querySelector('[data-wh40k-hook="inquest-influence"]')?.textContent.trim()).toBe('4');
    },
};

export const ResolutionGoalsFailed: Story = {
    render: () => resolutionCard(600, false),
    play: async ({ canvasElement }) => {
        // Half of 3, rounded down.
        await expect(canvasElement.querySelector('[data-wh40k-hook="inquest-influence"]')?.textContent.trim()).toBe('1');
    },
};

export const ResolutionShortfall: Story = {
    render: () => resolutionCard(250, true),
    play: async ({ canvasElement }) => {
        // 350 IP short → −2.
        await expect(canvasElement.querySelector('[data-wh40k-hook="inquest-influence"]')?.textContent.trim()).toBe('-2');
    },
};
