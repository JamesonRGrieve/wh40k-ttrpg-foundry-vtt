/**
 * Storybook story for the Rogue Trader Hit-and-Run chat card (#188 —
 * core.md L10093-10097).
 *
 * Renders `ship-hit-and-run-chat.hbs` against the four phase outcomes
 * the pure resolver `resolveHitAndRun` can produce:
 *
 *   1. Shot Down — approach test failed by 4+ DoF, craft destroyed.
 *   2. Approach Miss — approach failed under 4 DoF, raid aborted.
 *   3. Command Lost — approach landed but defender repelled the
 *      Command test.
 *   4. Critical Success — pick-worse-of-two 1d5 crit applied + 1 Hull
 *      damage per DoS.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import { expect, within } from 'storybook/test';
import { resolveHitAndRun, type HitAndRunResolution } from '../../src/module/rules/ship-hit-and-run.ts';
import shipHarChatSrc from '../../src/templates/chat/ship-hit-and-run-chat.hbs?raw';
import { renderTemplate as renderStoryTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

const shipHarTemplate = HbsStory.compile(shipHarChatSrc);

interface CardArgs {
    attackerName: string;
    defenderName: string;
    gameSystem: string;
    resolution: HitAndRunResolution;
    rolledCritA: number;
    rolledCritB: number;
}

interface HitAndRunChatContext {
    attackerName: string;
    defenderName: string;
    gameSystem: string;
    approach: HitAndRunResolution['approach'];
    command: HitAndRunResolution['command'];
    appliedCrit: HitAndRunResolution['appliedCrit'];
    hullDamage: HitAndRunResolution['hullDamage'];
    rolledCritA: number;
    rolledCritB: number;
}

function cardContext(args: CardArgs): HitAndRunChatContext {
    return {
        attackerName: args.attackerName,
        defenderName: args.defenderName,
        gameSystem: args.gameSystem,
        approach: args.resolution.approach,
        command: args.resolution.command,
        appliedCrit: args.resolution.appliedCrit,
        hullDamage: args.resolution.hullDamage,
        rolledCritA: args.rolledCritA,
        rolledCritB: args.rolledCritB,
    };
}

const meta: Meta<CardArgs> = {
    title: 'Chat/Ship Hit-and-Run (#188)',
    render: (args) => renderStoryTemplate(shipHarTemplate, cardContext(args)),
};

export default meta;

type Story = StoryObj<CardArgs>;

const ATTACKER = 'The Errant Vector';
const DEFENDER = 'Chaos Raider "Bone Tithe"';

function buildArgs(opts: {
    pilotRoll: number;
    pilotSkill: number;
    targetTurret: number;
    atkCmdRoll: number;
    atkCmd: number;
    defCmdRoll: number;
    defCmd: number;
    critA: number;
    critB: number;
}): CardArgs {
    const resolution = resolveHitAndRun({
        approach: { pilotRoll: opts.pilotRoll, pilotSkill: opts.pilotSkill, targetTurretRating: opts.targetTurret },
        command: {
            attackerRoll: opts.atkCmdRoll,
            attackerCommandTarget: opts.atkCmd,
            defenderRoll: opts.defCmdRoll,
            defenderCommandTarget: opts.defCmd,
        },
        rolledCritA: opts.critA,
        rolledCritB: opts.critB,
    });
    return {
        attackerName: ATTACKER,
        defenderName: DEFENDER,
        gameSystem: 'rt',
        resolution,
        rolledCritA: opts.critA,
        rolledCritB: opts.critB,
    };
}

export const ShotDown: Story = {
    name: 'Shot down — approach failed by 4+ DoF',
    args: buildArgs({
        pilotRoll: 95,
        pilotSkill: 50,
        targetTurret: 2,
        atkCmdRoll: 50,
        atkCmd: 50,
        defCmdRoll: 50,
        defCmd: 50,
        critA: 1,
        critB: 5,
    }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-ship-har-card')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
        const view = within(canvasElement);
        await expect(view.getByText(/WH40K\.Starship\.HitAndRun\.OutcomeShotDown/)).toBeTruthy();
    },
};

export const ApproachMiss: Story = {
    name: 'Approach miss — boarders forced back, no shot down',
    args: buildArgs({
        pilotRoll: 60,
        pilotSkill: 50,
        targetTurret: 1,
        atkCmdRoll: 50,
        atkCmd: 50,
        defCmdRoll: 50,
        defCmd: 50,
        critA: 2,
        critB: 4,
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/WH40K\.Starship\.HitAndRun\.OutcomeApproachMiss/)).toBeTruthy();
    },
};

export const CommandLost: Story = {
    name: 'Approach landed, defender wins the Command test',
    args: buildArgs({
        pilotRoll: 20,
        pilotSkill: 50,
        targetTurret: 1,
        atkCmdRoll: 70,
        atkCmd: 40,
        defCmdRoll: 10,
        defCmd: 50,
        critA: 3,
        critB: 4,
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/WH40K\.Starship\.HitAndRun\.OutcomeCommandLose/)).toBeTruthy();
    },
};

export const CriticalSuccess: Story = {
    name: 'Critical success — pick worse 1d5 + hull damage',
    args: buildArgs({
        pilotRoll: 10,
        pilotSkill: 50,
        targetTurret: 1,
        atkCmdRoll: 10,
        atkCmd: 50,
        defCmdRoll: 90,
        defCmd: 40,
        critA: 2,
        critB: 5,
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/WH40K\.Starship\.HitAndRun\.AppliedCrit/)).toBeTruthy();
        await expect(view.getByText(/WH40K\.Starship\.HitAndRun\.HullDamage/)).toBeTruthy();
    },
};
