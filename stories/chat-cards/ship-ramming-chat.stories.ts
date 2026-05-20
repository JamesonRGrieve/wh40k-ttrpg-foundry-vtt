/**
 * Storybook story for the Rogue Trader Ramming chat card (#188 —
 * core.md L9997 §Ramming and Boarding Actions, with the Imposing /
 * Good an' Ard +1d10 bonus from L9453 / L9778).
 *
 * Renders `ship-ramming-chat.hbs` against four canonical outcomes
 * driven by the pure resolver `resolveRamming`:
 *
 *   1. Hit — straightforward damage exchange.
 *   2. Miss — defender outpiloted the rammer.
 *   3. Tie — defender wins per `RAMMING_RESOLUTION_FAVORS_DEFENDER`.
 *   4. Hit with Imposing prow bonus (+1d10 damage on the rammer).
 *
 * Card carries `data-wh40k-system` so per-system Tailwind variants
 * fire outside the sheet root.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { resolveRamming, type RammingResolution } from '../../src/module/rules/ship-ramming.ts';
import shipRammingChatSrc from '../../src/templates/chat/ship-ramming-chat.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

const shipRammingTemplate = Handlebars.compile(shipRammingChatSrc);

interface CardArgs {
    attackerName: string;
    defenderName: string;
    gameSystem: string;
    resolution: RammingResolution;
}

function cardContext(args: CardArgs): Record<string, unknown> {
    return {
        attackerName: args.attackerName,
        defenderName: args.defenderName,
        gameSystem: args.gameSystem,
        toHit: args.resolution.toHit,
        damage: args.resolution.damage,
    };
}

const meta: Meta<CardArgs> = {
    title: 'Chat/Ship Ramming (#188)',
    render: (args) => renderTemplate(shipRammingTemplate, cardContext(args)),
};

export default meta;

type Story = StoryObj<CardArgs>;

const ATTACKER = 'The Errant Vector';
const DEFENDER = 'Ork Kroozer "Grimskull"';

export const Hit: Story = {
    name: 'Ram lands — defender takes the hit through armour',
    args: {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution: resolveRamming({
            toHit: { attackerRoll: 20, attackerTarget: 50, defenderRoll: 80, defenderTarget: 40 },
            damage: { rolledD10: 8, attackerSpeed: 7, defenderArmour: 12, attackerArmour: 16 },
        }),
    },
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('.wh40k-ship-ramming-card');
        expect(card).toBeTruthy();
        expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
        // Damage block must render hull-damage rows when the ram lands.
        const canvas = within(canvasElement);
        expect(canvas.getByText(/WH40K\.Starship\.Ramming\.DefenderHull/)).toBeTruthy();
    },
};

export const Miss: Story = {
    name: 'Ram misses — defender outpiloted the rammer',
    args: {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution: resolveRamming({
            toHit: { attackerRoll: 80, attackerTarget: 40, defenderRoll: 20, defenderTarget: 50 },
            damage: { rolledD10: 8, attackerSpeed: 7, defenderArmour: 12, attackerArmour: 16 },
        }),
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText(/WH40K\.Starship\.Ramming\.OutcomeMiss/)).toBeTruthy();
        expect(canvas.getByText(/WH40K\.Starship\.Ramming\.MissExplain/)).toBeTruthy();
    },
};

export const Tie: Story = {
    name: 'Tie — defender wins per tie-handling rule',
    args: {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution: resolveRamming({
            toHit: { attackerRoll: 30, attackerTarget: 50, defenderRoll: 30, defenderTarget: 50 },
            damage: { rolledD10: 6, attackerSpeed: 7, defenderArmour: 12, attackerArmour: 16 },
        }),
    },
};

export const ImposingProwBonus: Story = {
    name: 'Imposing / Good an Ard prow — +1d10 to ram damage',
    args: {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution: resolveRamming({
            toHit: { attackerRoll: 15, attackerTarget: 55, defenderRoll: 70, defenderTarget: 40 },
            damage: {
                rolledD10: 7,
                attackerSpeed: 8,
                defenderArmour: 14,
                attackerArmour: 18,
                attackerExtraRamDamage: true,
                bonusRolledD10: 9,
            },
        }),
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText(/WH40K\.Starship\.Ramming\.BonusDamage/)).toBeTruthy();
    },
};
