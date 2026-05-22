/**
 * Stories for ThreatScalerDialog — the NPC rescale tool that previews how
 * raising / lowering an NPC's threat level changes its characteristics,
 * wounds, and armour. Renders the dialog's `.hbs` against a prepared
 * before/after context, covering a routine scale, a large-jump warning, and
 * the adjust/reset action handles.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/threat-scaler.hbs?raw';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';

interface Tier {
    label: string;
    color: string;
}

interface CharacteristicChange {
    short: string;
    current: number;
    new: number;
    change: number;
    percentChange: number;
}

interface Args {
    actor: { name: string; img: string };
    currentThreat: number;
    newThreat: number;
    currentTier: Tier;
    newTier: Tier;
    threatDifference: number;
    scaleCharacteristics: boolean;
    scaleWounds: boolean;
    scaleSkills: boolean;
    scaleWeapons: boolean;
    scaleArmour: boolean;
    characteristicChanges: CharacteristicChange[];
    currentWounds: number;
    newWounds: number;
    woundsChange: number;
    currentArmour: number;
    newArmour: number;
    armourChange: number;
}

const CHANGES: CharacteristicChange[] = [
    { short: 'WS', current: 35, new: 45, change: 10, percentChange: 29 },
    { short: 'BS', current: 30, new: 38, change: 8, percentChange: 27 },
    { short: 'S', current: 40, new: 50, change: 10, percentChange: 25 },
];

const meta = {
    title: 'NPC/ThreatScalerDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        actor: { name: 'Chaos Marauder', img: 'icons/svg/mystery-man.svg' },
        currentThreat: 8,
        newThreat: 12,
        currentTier: { label: 'Standard', color: '#ff9800' },
        newTier: { label: 'Tough', color: '#f44336' },
        threatDifference: 4,
        scaleCharacteristics: true,
        scaleWounds: true,
        scaleSkills: true,
        scaleWeapons: false,
        scaleArmour: true,
        characteristicChanges: CHANGES,
        currentWounds: 12,
        newWounds: 18,
        woundsChange: 6,
        currentArmour: 4,
        newArmour: 6,
        armourChange: 2,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Chaos Marauder')).toBeTruthy();
        await expect(scope.getByText('Tough')).toBeTruthy();
        clickAction(canvasElement, 'resetThreat');
        clickAction(canvasElement, 'cancel');
    },
};

export const LargeJumpWarning: Story = {
    args: {
        newThreat: 25,
        newTier: { label: 'Elite', color: '#9c27b0' },
        threatDifference: 17,
        characteristicChanges: CHANGES.map((c) => ({ ...c, new: c.current + 25, change: 25, percentChange: 60 })),
        newWounds: 40,
        woundsChange: 28,
    },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(/Large threat change/)).toBeTruthy();
    },
};
