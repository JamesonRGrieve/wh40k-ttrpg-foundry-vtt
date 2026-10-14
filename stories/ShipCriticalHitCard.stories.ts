/**
 * Storybook story for the Rogue Trader Ship Critical Hit chat card
 * (issue #187).
 *
 * The runtime path is `WH40KVoidcraft.rollShipCriticalHit`: it rolls the
 * weapon's 1d5 and draws that result from the world `RollTable` "Ship
 * Critical Hits", else the `wh40k-rpg.rt-core-rolltables` compendium (RT Core
 * Table 8-12), and only when neither exists posts the
 * `WH40K.Voidcraft.Critical.TableUnavailable` message. The card is
 * `ship-critical-hit-chat.hbs`, a thin shell over `partial/chat-card-shell.hbs`
 * that shows the drawn result's name, its rules text (the table's HTML) and
 * the source roll.
 *
 * One story per 1d5 result of Table 8-12 (Holed, Internal Damage, Sensors
 * Damaged, Thrusters Damaged, Fire!) plus the table-unavailable fallback, so
 * `tests/storybook/issue-187-critical-hit-chart.spec.ts` can dump a screenshot.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import shipCriticalHitChatSrc from '../src/templates/chat/ship-critical-hit-chat.hbs?raw';
import { storyLocalize } from './mocks/ship-assault';
import { renderSheet } from './test-helpers';

interface CardArgs {
    actorName: string;
    resultName: string;
    resultText: string;
    statusLabel: string;
    rolled: number;
    rollLabel: string;
    image: string;
    gameSystem: string;
}

/** One Table 8-12 result as the compendium table draws it: its name and its HTML text. */
function result(rolled: number, name: string, text: string): CardArgs {
    return {
        actorName: 'Whispering Star',
        resultName: name,
        resultText: `<p><b>${name}</b>: ${text}</p>`,
        statusLabel: name,
        rolled,
        rollLabel: storyLocalize('WH40K.Voidcraft.Critical.RollLabel', { rolled }),
        image: 'icons/svg/explosion.svg',
        gameSystem: 'rt',
    };
}

const meta: Meta<CardArgs> = {
    title: 'Chat/Ship Critical Hit',
    render: (args) => renderSheet(shipCriticalHitChatSrc, args),
    play: async ({ canvasElement, args }) => {
        const view = within(canvasElement);
        await expect(view.getAllByText(args.statusLabel).length).toBeGreaterThanOrEqual(1);
        await expect(view.getByText(args.rollLabel)).toBeTruthy();
        // The table's HTML renders as markup, not as escaped tags.
        await expect(canvasElement.textContent).not.toContain('<p>');
    },
};

export default meta;

type Story = StoryObj<CardArgs>;

/** Rolled a 1. */
export const Holed: Story = {
    args: result(1, 'Holed', "A lucky hit has wrenched open the ship's hull, exposing it to space."),
};

/** Rolled a 2. */
export const InternalDamage: Story = {
    args: result(2, 'Internal Damage', 'The force of the hit ruptures bulkheads and smashes machinery.'),
};

/** Rolled a 3. */
export const SensorsDamaged: Story = {
    args: result(3, 'Sensors Damaged', "The ship's auspex arrays have been knocked out, leaving the vessel blind."),
};

/** Rolled a 4. */
export const ThrustersDamaged: Story = {
    args: result(4, 'Thrusters Damaged', "The ship's manoeuvring thrusters are smashed, venting randomly and leaking fuel."),
};

/** Rolled a 5. */
export const Fire: Story = {
    args: { ...result(5, 'Fire!', 'Alarms scream through the hull as hungry flames roar through passageways and compartments.'), image: 'icons/svg/fire.svg' },
};

/**
 * Neither the world nor the compendium holds the table: the roll is posted
 * with the table-unavailable message, labelled by its number.
 */
export const TableUnavailableFallback: Story = {
    args: {
        ...result(1, storyLocalize('WH40K.Voidcraft.Critical.ResultLabel', { rolled: 1 }), ''),
        resultText: storyLocalize('WH40K.Voidcraft.Critical.TableUnavailable', { rolled: 1 }),
    },
};
