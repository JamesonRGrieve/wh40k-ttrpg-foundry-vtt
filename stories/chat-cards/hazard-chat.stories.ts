import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import type { GameSystemId } from '../../src/module/config/game-systems/types.ts';
import { resolveSuffocation, SUFFOCATION_ENDGAME_DAMAGE, SUFFOCATION_FATIGUE_PER_FAILURE } from '../../src/module/rules/hazards.ts';
import { resolveVacuum } from '../../src/module/rules/scene-environment.ts';
import fallingSrc from '../../src/templates/chat/hazard-falling-chat.hbs?raw';
import suffocationSrc from '../../src/templates/chat/hazard-suffocation-chat.hbs?raw';
import vacuumSrc from '../../src/templates/chat/hazard-vacuum-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat cards posted by the GM environmental-hazard dialog (#118, #604): the
 * falling card (hoverable die + fall bonus, apply button into the
 * damage-assignment path), the suffocation card (breath allotment,
 * per-interval test, endgame) and the vacuum card (safe rounds,
 * depressurisation, the cold, the suffocation it composes with), each resolved
 * against the subject's own game line.
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

interface VacuumArgs {
    gameSystem: GameSystemId;
    toughnessBonus: number;
    gradual: boolean;
    inSpace: boolean;
    oxygenSource: boolean;
}

function vacuumContext(args: VacuumArgs): object {
    const vacuum = resolveVacuum({ ...args, exposure: args.gradual ? 'gradual' : 'sudden', strenuous: false, line: args.gameSystem });
    return {
        actor: ACTOR,
        gameSystem: args.gameSystem,
        toughnessBonus: args.toughnessBonus,
        gradual: args.gradual,
        vacuum,
        suffocationIsRounds: vacuum?.suffocation?.unit === 'round',
        diesAfterTbRounds: vacuum?.suffocation?.endgame === 'diesAfterTbRounds',
        endgameDamage: SUFFOCATION_ENDGAME_DAMAGE,
        appliedCondition: args.oxygenSource ? '' : 'Suffocating',
    };
}

/** DH2 vacuum of space (#604): TB rounds, 1d10 ignoring Armour and TB, the cold, suffocation. */
export const VacuumDH2: StoryObj<VacuumArgs> = {
    args: { gameSystem: 'dh2', toughnessBonus: 4, gradual: false, inSpace: true, oxygenSource: false },
    render: (args) => renderSheet(vacuumSrc, vacuumContext(args)),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('[data-wh40k-hook="vacuum-safe-rounds"]')?.textContent.trim()).toBe('4 rounds');
        await expect(view.getByText(/1d10 Explosive damage from depressurisation/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="vacuum-cold"]')).not.toBeNull();
        await expect(view.getByText('This damage ignores Armour and Toughness Bonus.')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="vacuum-suffocation"]')).not.toBeNull();
    },
};

/** Rogue Trader, a venting voidship with a rebreather: twice TB, the cumulative test, no cold, no suffocation. */
export const VacuumVentingRT: StoryObj<VacuumArgs> = {
    args: { gameSystem: 'rt', toughnessBonus: 3, gradual: true, inSpace: false, oxygenSource: true },
    render: (args) => renderSheet(vacuumSrc, vacuumContext(args)),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('[data-wh40k-hook="vacuum-safe-rounds"]')?.textContent.trim()).toBe('6 rounds');
        await expect(view.getByText(/cumulative -10; success deals 1d5 Explosive damage, failure 1d10/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="vacuum-cold"]')).toBeNull();
        await expect(view.getByText('Armour does not reduce this damage.')).toBeTruthy();
        await expect(view.getByText('An oxygen source spares the character from suffocation.')).toBeTruthy();
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
