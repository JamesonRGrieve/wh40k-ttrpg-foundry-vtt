import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsLib from 'handlebars';
import { expect, within } from 'storybook/test';
import criticalDamageChatSrc from '../../src/templates/chat/critical-damage-chat.hbs?raw';
import { renderTemplate as renderStoryTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Chat-card story for the DH2 Critical Damage table lookup (#108 —
 * core.md §"Critical Damage", Tables 7–7 … 7–22).
 *
 * Exercises the (damageType × bodyPart × severity) → effect + rider
 * card across all four damage types and a representative low / mid /
 * high severity, so per-system theme cascade and the rider-pill list
 * are visible in review.
 */
initializeStoryHandlebars();

const criticalDamageTemplate = HbsLib.compile(criticalDamageChatSrc);

interface CriticalDamageCardArgs {
    damageType: 'Energy' | 'Explosive' | 'Impact' | 'Rending';
    bodyPart: 'Arm' | 'Body' | 'Head' | 'Leg';
    severity: number;
    effect: string;
    riderLabels: string[];
    gameSystem: string;
}

interface CriticalDamageCardContext {
    gameSystem: string;
    damageTypeKey: string;
    bodyPartKey: string;
    severityLabel: string;
    effect: string;
    riderLabels: string[];
}

function buildContext(args: CriticalDamageCardArgs): CriticalDamageCardContext {
    return {
        gameSystem: args.gameSystem,
        damageTypeKey: `WH40K.CriticalDamage.DamageType.${args.damageType}`,
        bodyPartKey: `WH40K.CriticalDamage.BodyPart.${args.bodyPart}`,
        severityLabel: args.severity >= 10 ? '10+' : String(args.severity),
        effect: args.effect,
        riderLabels: args.riderLabels,
    };
}

const meta: Meta<CriticalDamageCardArgs> = {
    title: 'Chat/Critical Damage (#108)',
    render: (args) => renderStoryTemplate(criticalDamageTemplate, buildContext(args)),
    args: {
        damageType: 'Energy',
        bodyPart: 'Arm',
        severity: 5,
        effect: 'Energy courses through the arm. He is Stunned for 1 round, and the arm is Useless until the target receives medical treatment.',
        riderLabels: ['WH40K.CriticalDamage.Rider.Stunned', 'WH40K.CriticalDamage.Rider.LostLimb'],
        gameSystem: 'dh2',
    },
};
export default meta;

type Story = StoryObj<CriticalDamageCardArgs>;

export const EnergyArmMid: Story = {
    name: 'Energy / Arm / 5 — Stunned + Lost Limb',
};

export const ExplosiveLegLow: Story = {
    name: 'Explosive / Leg / 1 — Prone',
    args: {
        damageType: 'Explosive',
        bodyPart: 'Leg',
        severity: 1,
        effect: 'A glancing blast sends the character backwards one metre. The target must make a Challenging (+0) Toughness test or be knocked Prone.',
        riderLabels: ['WH40K.CriticalDamage.Rider.Prone'],
    },
};

export const ImpactHeadHighFatal: Story = {
    name: 'Impact / Head / 8 — Fatal',
    args: {
        damageType: 'Impact',
        bodyPart: 'Head',
        severity: 8,
        effect: "With a sickening crunch, the target's head snaps around to face the opposite direction. His death is instantaneous.",
        riderLabels: ['WH40K.CriticalDamage.Rider.Fatal'],
    },
};

export const RendingBodyFatalRT: Story = {
    name: 'Rending / Body / 9 — Fatal (RT theme)',
    args: {
        damageType: 'Rending',
        bodyPart: 'Body',
        severity: 9,
        effect: 'The powerful blow cleaves the target from gullet to groin, revealing his internal organs. The target is now quite dead.',
        riderLabels: ['WH40K.CriticalDamage.Rider.BloodLoss', 'WH40K.CriticalDamage.Rider.Fatal'],
        gameSystem: 'rt',
    },
};

export const PackAbsentDegrades: Story = {
    name: 'Compendium absent — graceful degrade',
    args: {
        damageType: 'Energy',
        bodyPart: 'Body',
        severity: 5,
        effect: '',
        riderLabels: [],
    },
};

export const RenderSmoke: Story = {
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // Card root carries the per-system anchor and wh40k-rpg scope.
        const card = canvasElement.querySelector('.wh40k-critdmg-card');
        void expect(card).toBeTruthy();
        void expect(card?.getAttribute('data-wh40k-system')).toBe('dh2');
        void expect(card?.classList.contains('wh40k-rpg')).toBe(true);
        // Effect text surfaces.
        void expect(storyCanvas.getByText(/Stunned for 1 round/i)).toBeTruthy();
        // Rider pills render (two for the default args).
        const pills = canvasElement.querySelectorAll('.wh40k-critdmg-card span.tw-rounded-full');
        void expect(pills.length).toBe(2);
    },
};
