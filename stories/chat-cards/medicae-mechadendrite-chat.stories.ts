import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import medicaeChatSrc from '../../src/templates/chat/medicae-mechadendrite-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat-card story for the Medicae Mechadendrite Half-Action Blood-Loss
 * staunch (#104 — errata p. 183).
 *
 * Exercises the success / failure branches plus a per-system (RT) theme
 * variant so the data-wh40k-system anchor and the wh40k-rpg cascade
 * scope are visible in review (the card renders outside the sheet root).
 */
initializeStoryHandlebars();

interface MedicaeCardArgs {
    actorName: string;
    roll: number;
    target: number;
    medicaeBonus: number;
    success: boolean;
    bleedStopped: boolean;
    gameSystem: string;
}

function buildContext(args: MedicaeCardArgs): MedicaeCardArgs {
    return {
        actorName: args.actorName,
        roll: args.roll,
        target: args.target,
        medicaeBonus: args.medicaeBonus,
        success: args.success,
        bleedStopped: args.bleedStopped,
        gameSystem: args.gameSystem,
    };
}

const meta: Meta<MedicaeCardArgs> = {
    title: 'Chat/Medicae Mechadendrite (#104)',
    render: (args) => renderSheet(medicaeChatSrc, buildContext(args)),
    args: {
        actorName: 'Brother Medicae Voss',
        roll: 32,
        target: 50,
        medicaeBonus: 10,
        success: true,
        bleedStopped: true,
        gameSystem: 'dh2',
    },
};
export default meta;

type Story = StoryObj<MedicaeCardArgs>;

export const StaunchSuccess: Story = {
    name: 'Success — Blood Loss staunched',
};

export const StaunchFailure: Story = {
    name: 'Failure — Blood Loss persists',
    args: {
        roll: 78,
        target: 40,
        success: false,
        bleedStopped: false,
    },
};

export const SuccessRogueTraderTheme: Story = {
    name: 'Success — RT per-system theme',
    args: {
        gameSystem: 'rt',
        actorName: 'Chirurgeon Maelis',
        roll: 11,
        target: 65,
    },
};

export const RenderSmoke: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const card = canvasElement.querySelector('.wh40k-medicae-mechadendrite-card');
        await expect(card).toBeTruthy();
        // Card carries the per-system anchor and the wh40k-rpg cascade scope.
        await expect(card?.getAttribute('data-wh40k-system')).toBe('dh2');
        await expect(card?.classList.contains('wh40k-rpg')).toBe(true);
        // Success branch surfaces the staunched-blood-loss copy.
        await expect(view.getByText(/Brother Medicae Voss/i)).toBeTruthy();
        // Roll / target / bonus rows render.
        await expect(card?.textContent).toContain('32');
        await expect(card?.textContent).toContain('50');
        await expect(card?.textContent).toContain('+10');
    },
};
