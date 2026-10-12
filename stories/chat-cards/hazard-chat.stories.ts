import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import type { GameSystemId } from '../../src/module/config/game-systems/types.ts';
import { resolveSuffocation, SUFFOCATION_ENDGAME_DAMAGE, SUFFOCATION_FATIGUE_PER_FAILURE } from '../../src/module/rules/hazards.ts';
import fallingSrc from '../../src/templates/chat/hazard-falling-chat.hbs?raw';
import suffocationSrc from '../../src/templates/chat/hazard-suffocation-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat cards posted by the GM environmental-hazard dialog (#118): the falling
 * card (hoverable die + fall bonus, apply button into the damage-assignment
 * path) and the suffocation card (breath allotment, per-interval test, endgame),
 * each resolved against the subject's own game line.
 */
initializeStoryHandlebars();

const ACTOR = { uuid: 'Actor.hazardStory', name: 'Interrogator Vex' };

interface FallingArgs {
    gameSystem: GameSystemId;
    metres: number;
    die: number;
    bonus: number;
}

interface FallingCardContext {
    actor: typeof ACTOR;
    gameSystem: GameSystemId;
    metres: number;
    formula: string;
    damage: number;
    damageType: string;
    location: string;
    locationLabel: string;
    tooltipData: string;
}

function fallingContext(args: FallingArgs): FallingCardContext {
    return {
        actor: ACTOR,
        gameSystem: args.gameSystem,
        metres: args.metres,
        formula: `1d10+${args.bonus}`,
        damage: args.die + args.bonus,
        damageType: 'Impact',
        location: 'rightLeg',
        locationLabel: 'Right Leg',
        tooltipData: JSON.stringify({
            title: 'Falling Damage',
            sources: [
                { name: '1d10', value: args.die },
                { name: `+1 per metre (${args.metres} m)`, value: args.bonus },
            ],
        }),
    };
}

interface SuffocationArgs {
    gameSystem: GameSystemId;
    toughnessBonus: number;
    strenuous: boolean;
}

interface SuffocationCardContext {
    actor: typeof ACTOR;
    gameSystem: GameSystemId;
    toughnessBonus: number;
    allotmentCount: number;
    isRounds: boolean;
    strenuousUnsupported: boolean;
    diesAfterTbRounds: boolean;
    roundsUntilDeath: number;
    endgameDamage: string;
    fatigue: number;
    appliedCondition: string;
}

function suffocationContext(args: SuffocationArgs): SuffocationCardContext {
    const outcome = resolveSuffocation({ toughnessBonus: args.toughnessBonus, strenuous: args.strenuous, line: args.gameSystem });
    return {
        actor: ACTOR,
        gameSystem: args.gameSystem,
        toughnessBonus: args.toughnessBonus,
        allotmentCount: outcome?.allotment.count ?? 0,
        isRounds: outcome?.allotment.unit === 'round',
        strenuousUnsupported: outcome?.allotment.strenuousUnsupported ?? false,
        diesAfterTbRounds: outcome?.endgame === 'diesAfterTbRounds',
        roundsUntilDeath: outcome?.roundsUntilDeath ?? 0,
        endgameDamage: SUFFOCATION_ENDGAME_DAMAGE,
        fatigue: SUFFOCATION_FATIGUE_PER_FAILURE,
        appliedCondition: args.gameSystem === 'dh2' ? 'Suffocating' : '',
    };
}

const meta = {
    title: 'Chat/Hazard Cards',
} satisfies Meta;
export default meta;

/** A 6 m DH2 fall: 1d10 (7) + 6, ignores armour, to the right leg. */
export const FallingDH2: StoryObj<FallingArgs> = {
    args: { gameSystem: 'dh2', metres: 6, die: 7, bonus: 6 },
    render: (args) => renderSheet(fallingSrc, fallingContext(args)),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('13')).toBeTruthy();
        await expect(view.getByText('Right Leg')).toBeTruthy();
        const button = canvasElement.querySelector<HTMLButtonElement>('button.roll-control__apply-damage');
        await expect(button?.dataset['ignoreArmour']).toBe('true');
        await expect(button?.dataset['location']).toBe('rightLeg');
        await expect(button?.dataset['damage']).toBe('13');
        await expect(canvasElement.querySelector('[data-wh40k-tooltip="modifier"]')).toBeTruthy();
    },
};

/** The same card themed for Rogue Trader. */
export const FallingRT: StoryObj<FallingArgs> = {
    args: { gameSystem: 'rt', metres: 12, die: 3, bonus: 12 },
    render: (args) => renderSheet(fallingSrc, fallingContext(args)),
};

/** DH2 strenuous suffocation: 2 × TB rounds, dies after TB rounds, condition applied. */
export const SuffocationDH2: StoryObj<SuffocationArgs> = {
    args: { gameSystem: 'dh2', toughnessBonus: 4, strenuous: true },
    render: (args) => renderSheet(suffocationSrc, suffocationContext(args)),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('8 rounds')).toBeTruthy();
        await expect(view.getByText(/dies after 4 rounds/)).toBeTruthy();
        await expect(view.getByText(/Suffocating applied/)).toBeTruthy();
    },
};

/** DH1: only the conserving allotment exists, and the endgame is 1d10 a round. */
export const SuffocationDH1: StoryObj<SuffocationArgs> = {
    args: { gameSystem: 'dh1', toughnessBonus: 3, strenuous: true },
    render: (args) => renderSheet(suffocationSrc, suffocationContext(args)),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('3 minutes')).toBeTruthy();
        await expect(view.getByText(/only the conserving-oxygen allotment/)).toBeTruthy();
        await expect(view.getByText(/suffers 1d10 damage each round/)).toBeTruthy();
    },
};
