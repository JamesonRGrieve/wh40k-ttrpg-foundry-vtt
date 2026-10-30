/**
 * Storybook stories for the Rogue Trader Boarding Action chat card (#188).
 *
 * Renders `ship-boarding-chat.hbs` against contexts built by the same pure
 * rules (`rules/ship-boarding.ts`) and view builders (`ship-assault-card.ts`)
 * the live flow uses:
 *
 *   1. Lock on — the Hard (−20) Pilot + Manoeuvrability Test, with every
 *      target component as a hoverable provenance row.
 *   2. Round won — opposed Command Tests with Crew / Hull / Turret bonuses,
 *      the winner's per-degree damage and the loser's Morale check.
 *   3. RT degrees — each full 10 of margin, no base degree, with the degrees
 *      formula under each test; a bare pass (0 degrees) still beats a failure.
 *   4. Defender wins — a tie resolves for the boarded ship by 0 degrees.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { buildDamageView, buildTestView } from '../../src/module/applications/ship-assault/ship-assault-card.ts';
import { composePilotManoeuvrabilityTest, resolveShipTest } from '../../src/module/rules/ship-assault.ts';
import {
    allocateBoardingDegrees,
    BOARDING_KEYS,
    BOARDING_LOCK_DIFFICULTY,
    composeBoardingCommand,
    computeBoardingDamage,
    resolveBoardingRound,
} from '../../src/module/rules/ship-boarding.ts';
import shipBoardingChatSrc from '../../src/templates/chat/ship-boarding-chat.hbs?raw';
import { ATTACKER_SHIP, DEFENDER_SHIP, storyLocalize } from '../mocks/ship-assault';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

// eslint-disable-next-line no-restricted-syntax -- boundary: the chat template's Handlebars context is an open bag
type CardContext = Record<string, unknown>;

const SOURCE = storyLocalize('WH40K.Voidcraft.Boarding.Citation');
const BASE = { gameSystem: 'rt', attackerName: ATTACKER_SHIP.name, defenderName: DEFENDER_SHIP.name };

function lockContext(roll: number): CardContext {
    const derivation = composePilotManoeuvrabilityTest({
        pilotSkill: 45,
        ship: ATTACKER_SHIP,
        difficulty: BOARDING_LOCK_DIFFICULTY,
        difficultyKey: BOARDING_KEYS.lockDifficulty,
        situational: { value: 20, label: 'Trakta Field' },
    });
    const test = resolveShipTest(derivation, roll, 'gen1');
    return { ...BASE, lock: { test: buildTestView(storyLocalize('WH40K.Voidcraft.Boarding.LockTestTitle'), test, SOURCE, storyLocalize) } };
}

function roundContext(attackerRoll: number, defenderRoll: number, hullDegrees: number): CardContext {
    const attacker = resolveShipTest(
        composeBoardingCommand({ ship: ATTACKER_SHIP, commandSkill: 50, failedBreakFree: false }, DEFENDER_SHIP),
        attackerRoll,
        'gen1',
    );
    const defender = resolveShipTest(
        composeBoardingCommand({ ship: DEFENDER_SHIP, commandSkill: 45, failedBreakFree: true }, ATTACKER_SHIP),
        defenderRoll,
        'gen1',
    );
    const round = resolveBoardingRound(attacker, defender);
    const winner = round.winner === 'attacker' ? ATTACKER_SHIP : DEFENDER_SHIP;
    const loser = round.winner === 'attacker' ? DEFENDER_SHIP : ATTACKER_SHIP;
    const allocation = allocateBoardingDegrees(round.degrees, hullDegrees);
    const crewDice = Array.from({ length: allocation.crewDegrees }, (_, index) => (index % 5) + 1);
    const damage = computeBoardingDamage({ allocation, crewD5s: crewDice, moraleD5s: crewDice });
    const dieRows = crewDice.map((value, index) => ({ labelKey: 'WH40K.Voidcraft.Boarding.Component.CrewDegree', value, data: { degree: index + 1 } }));
    return {
        ...BASE,
        round: {
            attackerTest: buildTestView(`Command — ${ATTACKER_SHIP.name}`, attacker, SOURCE, storyLocalize),
            defenderTest: buildTestView(`Command — ${DEFENDER_SHIP.name}`, defender, SOURCE, storyLocalize),
            winnerName: winner.name,
            degrees: round.degrees,
        },
        damage:
            round.degrees > 0
                ? {
                      hull:
                          damage.hullDamage > 0
                              ? buildDamageView(
                                    storyLocalize('WH40K.Voidcraft.Boarding.HullDamage'),
                                    [
                                        {
                                            labelKey: 'WH40K.Voidcraft.Boarding.Component.ChargeDegrees',
                                            value: damage.hullDamage,
                                            data: { degrees: damage.hullDamage },
                                        },
                                    ],
                                    SOURCE,
                                    storyLocalize,
                                )
                              : null,
                      crew: dieRows.length > 0 ? buildDamageView(storyLocalize('WH40K.Voidcraft.Boarding.CrewDamage'), dieRows, SOURCE, storyLocalize) : null,
                      morale:
                          dieRows.length > 0 ? buildDamageView(storyLocalize('WH40K.Voidcraft.Boarding.MoraleDamage'), dieRows, SOURCE, storyLocalize) : null,
                  }
                : null,
        morale: { loserName: loser.name, roll: 72, value: loser.morale - damage.moraleDamage, fightsOn: 72 <= loser.morale - damage.moraleDamage },
        unapplied: false,
    };
}

const meta: Meta<CardContext> = {
    title: 'Chat/Ship Boarding (#188)',
    render: (args) => renderSheet(shipBoardingChatSrc, args),
};

export default meta;

type Story = StoryObj<CardContext>;

export const LockOn: Story = {
    name: 'Lock on — Hard Pilot + Manoeuvrability with provenance rows',
    args: lockContext(22),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
        await expect(view.getByText('Hard (−20)')).toBeTruthy();
        await expect(view.getByText('Trakta Field')).toBeTruthy();
        // Every modifier row is hoverable to its provenance.
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(3);
        const sources = Array.from(rows, (row) => {
            const payload = JSON.parse(row.getAttribute('data-wh40k-tooltip-data') ?? '{}') as { sources?: { name: string }[] };
            return payload.sources?.[0]?.name;
        });
        await expect(sources).toEqual([SOURCE, SOURCE, SOURCE]);
        await expect(view.getByText(/locked/i)).toBeTruthy();
    },
};

export const LockFailed: Story = {
    name: 'Lock on — helmsman fails',
    args: lockContext(91),
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/no boarding action begins/i)).toBeTruthy();
    },
};

export const RoundWon: Story = {
    name: 'Boarding round — attacker wins, splits degrees between hull and crew',
    args: roundContext(8, 60, 1),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Larger Crew Population/)).toBeTruthy();
        await expect(view.getByText(/Failed to break free/)).toBeTruthy();
        await expect(view.getByText(/wins the Command Test by/)).toBeTruthy();
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="ship-assault-damage"]').length).toBe(3);
        await expect(view.getByText(/tests Morale/)).toBeTruthy();
    },
};

/** The attacker's Command target in {@link roundContext}, so a story can roll exactly on it. */
const ATTACKER_COMMAND_TARGET = composeBoardingCommand({ ship: ATTACKER_SHIP, commandSkill: 50, failedBreakFree: false }, DEFENDER_SHIP).target;

export const RoundDegreesCountedTheRtWay: Story = {
    name: 'Boarding round — RT degrees: each full 10 of margin, no base degree (#188)',
    args: roundContext(ATTACKER_COMMAND_TARGET - 25, 99, 0),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // A 25-point margin is two RT degrees (the +1 count would say three), and the
        // failed defender scores none, so the attacker wins by exactly two.
        await expect(view.getByText(new RegExp(`${ATTACKER_SHIP.name} wins the Command Test by 2 degree`))).toBeTruthy();
        await expect(view.getByText('Success — 2 DoS')).toBeTruthy();
        const formulas = Array.from(canvasElement.querySelectorAll('[data-wh40k-hook="result-formula"]'), (el) => el.textContent.trim());
        await expect(formulas[0]).toBe(`2 DoS = ⌊25 ÷ 10⌋ (roll ${ATTACKER_COMMAND_TARGET - 25} vs target ${ATTACKER_COMMAND_TARGET})`);
        await expect(formulas).toHaveLength(2);
    },
};

export const BarePassBeatsAFailure: Story = {
    name: 'Boarding round — a bare pass (0 RT degrees) still beats a failure (#188)',
    args: roundContext(ATTACKER_COMMAND_TARGET, 99, 0),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(new RegExp(`${ATTACKER_SHIP.name} wins the Command Test by 0 degree`))).toBeTruthy();
        await expect(view.getByText('Success — 0 DoS')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-assault-damage"]')).toBeNull();
    },
};

export const DefenderHolds: Story = {
    name: 'Boarding round — tie resolves for the defender by 0 degrees',
    args: roundContext(95, 96, 0),
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(new RegExp(`${DEFENDER_SHIP.name} wins the Command Test by 0`))).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-assault-damage"]')).toBeNull();
    },
};
