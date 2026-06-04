/**
 * Storybook story for the Rogue Trader Ship Critical Hit chat card
 * (issue #187).
 *
 * The runtime path lives in `starship-sheet.ts::#rollShipCriticalHit`:
 * it consults the world `RollTable.getName("Critical Hit")`, then the
 * `rt-core-rolltables-ship-combat` compendium pack, and finally falls
 * back to a bare 1d5 with the `WH40K.Starship.Critical.TableUnavailable`
 * message. The chat card itself is `ship-critical-hit-chat.hbs`,
 * a thin shell over `partial/chat-card-shell.hbs` that surfaces the
 * rolled effect text, the persistent status label, and the source roll.
 *
 * The story renders the card directly with realistic context values for
 * each of the 5 Battlefleet Koronus chart entries (Vacuum, Fire, Bridge,
 * Drive, Crew) plus a Table-Unavailable fallback story, so the
 * Playwright spec at
 * `tests/storybook/issue-187-critical-hit-chart.spec.ts` can dump a
 * screenshot and assert the rendered body is attached.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import shipCriticalHitChatSrc from '../src/templates/chat/ship-critical-hit-chat.hbs?raw';
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

function baseArgs(): CardArgs {
    return {
        actorName: 'The Errant Vector',
        resultName: 'Vacuum / Hull Breach',
        resultText:
            'Vacuum / Hull Breach — The hull is breached. Depressurisation begins in the affected compartment. Crew exposed to the void take damage each round until the breach is sealed.',
        statusLabel: 'Vacuum / Hull Breach',
        rolled: 1,
        rollLabel: 'Rolled 1 on 1d5',
        image: 'icons/svg/explosion.svg',
        gameSystem: 'rt',
    };
}

const meta: Meta<CardArgs> = {
    title: 'Chat/Ship Critical Hit',
    render: (args) => renderSheet(shipCriticalHitChatSrc, args),
    args: baseArgs(),
};

export default meta;

type Story = StoryObj<CardArgs>;

/** Rolled a 1 — vacuum / hull breach. */
export const Vacuum: Story = {
    args: baseArgs(),
};

/** Rolled a 2 — fire breaks out aboard the ship. */
export const Fire: Story = {
    args: {
        ...baseArgs(),
        resultName: 'Fire',
        statusLabel: 'Fire',
        rolled: 2,
        rollLabel: 'Rolled 2 on 1d5',
        resultText:
            'Fire — A fire breaks out aboard the vessel. The blaze burns crew each round until extinguished by an Emergency Repair or damage-control action.',
        image: 'icons/svg/fire.svg',
    },
};

/** Rolled a 3 — bridge damage; pilot/command tests suffer a penalty. */
export const Bridge: Story = {
    args: {
        ...baseArgs(),
        resultName: 'Bridge Damage',
        statusLabel: 'Bridge Damage',
        rolled: 3,
        rollLabel: 'Rolled 3 on 1d5',
        resultText: 'Bridge Damage — The bridge is struck. All pilot and command tests suffer a penalty until the damage is repaired.',
        image: 'icons/svg/tower.svg',
    },
};

/** Rolled a 4 — plasma drive damaged; speed reduced. */
export const Drive: Story = {
    args: {
        ...baseArgs(),
        resultName: 'Drive Damage',
        statusLabel: 'Drive Damage',
        rolled: 4,
        rollLabel: 'Rolled 4 on 1d5',
        resultText: "Drive Damage — The plasma drive is damaged. The ship's Speed is reduced until the drive is repaired.",
        image: 'icons/svg/lightning.svg',
    },
};

/** Rolled a 5 — crew casualties; population & morale drop. */
export const CrewCasualties: Story = {
    args: {
        ...baseArgs(),
        resultName: 'Crew Casualties',
        statusLabel: 'Crew Casualties',
        rolled: 5,
        rollLabel: 'Rolled 5 on 1d5',
        resultText: 'Crew Casualties — Shrapnel and decompression cut through the crew. Crew Population is reduced and Morale suffers from the loss.',
        image: 'icons/svg/blood.svg',
    },
};

/**
 * Compendium roll-table was not found at runtime: the action handler
 * fell back to a bare 1d5 and posted the table-unavailable string.
 */
export const TableUnavailableFallback: Story = {
    args: {
        ...baseArgs(),
        resultName: 'Vacuum / Hull Breach',
        rolled: 1,
        rollLabel: 'Rolled 1 on 1d5',
        resultText: 'The Critical Hit roll table is unavailable — rolled 1 on 1d5. Apply the corresponding effect from Battlefleet Koronus by hand.',
    },
};
