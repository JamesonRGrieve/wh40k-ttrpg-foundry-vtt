/**
 * Storybook story for the Rogue Trader Boarding Action chat card (#188 —
 * core.md L9997 §Ramming and Boarding Actions).
 *
 * Renders `ship-boarding-chat.hbs` against the three opposed-Command
 * outcomes produced by the pure resolver `resolveBoarding`:
 *
 *   1. Breach — attacker beats defender on Command, inflicts hull / crew
 *      / morale damage.
 *   2. Repelled — defender wins or ties.
 *   3. Boarders Lost — defender wins by 3+ DoS.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { resolveBoarding, type BoardingResolution } from '../../src/module/rules/ship-boarding.ts';
import shipBoardingChatSrc from '../../src/templates/chat/ship-boarding-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

interface CardArgs {
    attackerName: string;
    defenderName: string;
    gameSystem: string;
    resolution: BoardingResolution;
}

interface BoardingChatContext {
    attackerName: string;
    defenderName: string;
    gameSystem: string;
    opposed: BoardingResolution['opposed'];
    damage: BoardingResolution['damage'];
}

function cardContext(args: CardArgs): BoardingChatContext {
    return {
        attackerName: args.attackerName,
        defenderName: args.defenderName,
        gameSystem: args.gameSystem,
        opposed: args.resolution.opposed,
        damage: args.resolution.damage,
    };
}

const meta: Meta<CardArgs> = {
    title: 'Chat/Ship Boarding (#188)',
    render: (args) => renderSheet(shipBoardingChatSrc, cardContext(args)),
};

export default meta;

type Story = StoryObj<CardArgs>;

const ATTACKER = 'The Errant Vector';
const DEFENDER = 'Eldar Corsair "Whispering Star"';

export const Breach: Story = {
    name: 'Breach — boarders break through, inflict damage',
    args: {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution: resolveBoarding({
            opposed: { attackerRoll: 10, attackerCommandTarget: 60, defenderRoll: 80, defenderCommandTarget: 50 },
            rolledCrewD5: 3,
            rolledMoraleD5: 5,
        }),
    },
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('.wh40k-ship-boarding-card');
        await expect(card).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByText(/WH40K\.Starship\.Boarding\.HullDamage/)).toBeTruthy();
    },
};

export const Repelled: Story = {
    name: 'Repelled — defender holds, no damage inflicted',
    args: {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution: resolveBoarding({
            opposed: { attackerRoll: 55, attackerCommandTarget: 55, defenderRoll: 30, defenderCommandTarget: 50 },
            rolledCrewD5: 3,
            rolledMoraleD5: 3,
        }),
    },
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByText(/WH40K\.Starship\.Boarding\.OutcomeRepelled/)).toBeTruthy();
    },
};

export const BoardersLost: Story = {
    name: 'Boarders lost — defender wins by 3+ DoS',
    args: {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution: resolveBoarding({
            opposed: { attackerRoll: 60, attackerCommandTarget: 60, defenderRoll: 10, defenderCommandTarget: 50 },
            rolledCrewD5: 3,
            rolledMoraleD5: 3,
        }),
    },
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByText(/WH40K\.Starship\.Boarding\.OutcomeBoardersLost/)).toBeTruthy();
    },
};
