import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import criticalInjuryCardSrc from '../../src/templates/chat/critical-injury-card.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat-card story for the Critical Injury card (critical-injury-card.hbs).
 * Posted when a critical-injury table result resolves; e2e-covered, this adds
 * the storybook surface across damage types and the permanent/fatal severity
 * treatments.
 */
initializeStoryHandlebars();

interface InjuryArgs {
    damageType: 'impact' | 'explosive' | 'energy' | 'rending';
    severity: 'minor' | 'major' | 'fatal';
    bodyPart: 'head' | 'body' | 'arm' | 'leg';
    permanent: boolean;
}

interface InjuryContext {
    gameSystem: string;
    damageType: string;
    damageTypeIcon: string;
    damageTypeLabel: string;
    bodyPartIcon: string;
    bodyPartLabel: string;
    severityClass: string;
    severityLabel: string;
    permanent: boolean;
    img: string;
    name: string;
    sourceReference: string;
    effect: string;
    notes: string;
    description: string;
}

const DAMAGE = {
    impact: { icon: 'fa-hammer', label: 'Impact' },
    explosive: { icon: 'fa-bomb', label: 'Explosive' },
    energy: { icon: 'fa-bolt', label: 'Energy' },
    rending: { icon: 'fa-khanda', label: 'Rending' },
};
const BODY = {
    head: { icon: 'fa-head-side', label: 'Head' },
    body: { icon: 'fa-shirt', label: 'Body' },
    arm: { icon: 'fa-hand-fist', label: 'Arm' },
    leg: { icon: 'fa-shoe-prints', label: 'Leg' },
};
const SEVERITY = {
    minor: { class: 'severity-minor', label: 'Minor (1–2)' },
    major: { class: 'severity-major', label: 'Major (6–8)' },
    fatal: { class: 'severity-fatal', label: 'Fatal (9–10)' },
};

function buildContext(args: InjuryArgs): InjuryContext {
    const d = DAMAGE[args.damageType];
    const b = BODY[args.bodyPart];
    const s = SEVERITY[args.severity];
    return {
        gameSystem: 'dh2',
        damageType: args.damageType,
        damageTypeIcon: d.icon,
        damageTypeLabel: d.label,
        bodyPartIcon: b.icon,
        bodyPartLabel: b.label,
        severityClass: s.class,
        severityLabel: s.label,
        permanent: args.permanent,
        img: 'icons/svg/blood.svg',
        name: `Critical ${d.label} Damage — ${b.label}`,
        sourceReference: 'Core Rulebook, Table 7–9',
        effect: '<p>The target is knocked Prone and suffers 1 level of Fatigue. They take 1d5 Rending Damage that ignores Armour.</p>',
        notes: 'Apply after reducing Wounds to 0 or below.',
        description: '<p>A vicious blow that staggers even a hardened veteran.</p>',
    };
}

const meta = {
    title: 'Chat/Critical Injury Card',
    render: (args) => renderSheet(criticalInjuryCardSrc, buildContext(args)),
    args: { damageType: 'impact', severity: 'major', bodyPart: 'body', permanent: false },
} satisfies Meta<InjuryArgs>;
export default meta;

type Story = StoryObj<InjuryArgs>;

/** A major impact injury to the body. */
export const ImpactMajor: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Critical Impact Damage/)).toBeTruthy();
        await expect(view.getByText('Impact')).toBeTruthy();
        await expect(view.getByText(/Major/)).toBeTruthy();
    },
};

/** A fatal, permanent energy injury to the head (pulse-danger badge + Permanent badge). */
export const EnergyFatalPermanent: Story = {
    args: { damageType: 'energy', severity: 'fatal', bodyPart: 'head', permanent: true },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Fatal/)).toBeTruthy();
        await expect(view.getByText('Permanent')).toBeTruthy();
    },
};

/** A rending injury to a limb. */
export const RendingArm: Story = {
    args: { damageType: 'rending', severity: 'minor', bodyPart: 'arm', permanent: false },
};
