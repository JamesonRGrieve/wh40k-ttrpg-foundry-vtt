import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { listBeyondHomeworlds } from '../../src/module/rules/beyond-homeworlds';
import templateSrc from '../../src/templates/prompt/beyond-homeworld-info-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

/**
 * Storybook stories for BeyondHomeworldInfoDialog (GitHub #140).
 *
 * Renders the three Beyond home-worlds (Daemon World, Penal Colony,
 * Quarantine World) as a grid of cards using the typed registry as
 * the source of truth — no hand-authored card data. The play function
 * verifies all three cards render and that the Quarantine subtlety-
 * clamp rider + Daemon corruption rider surface on their cards.
 */

interface Args {
    showAllRiders: boolean;
}

function buildContext(): Record<string, unknown> {
    return {
        homeworlds: listBeyondHomeworlds().map((def) => ({
            id: def.id,
            label: def.label,
            accent: def.id === 'daemonWorld' ? 'crimson' : def.id === 'penalColony' ? 'grey' : 'green',
            bonusesLabel: def.characteristicMods.bonuses.map((b) => `+${b.charAt(0).toUpperCase()}${b.slice(1)}`).join(', '),
            penaltiesLabel: def.characteristicMods.penalties.map((p) => `-${p.charAt(0).toUpperCase()}${p.slice(1)}`).join(', '),
            fateLabel: `${def.fateThreshold.base} (Emperor's Blessing ${def.fateThreshold.emperorsBlessing}+)`,
            woundsLabel: `${def.wounds.base} + 1d${def.wounds.dieFaces}`,
            aptitude: def.aptitude,
            keyTalents: def.keyTalents,
            recommendedBackgrounds: def.recommendedBackgrounds,
            mechanicalHook: def.mechanicalHook,
            corruptionRiderLabel: def.corruptionRider ? `1d${def.corruptionRider.dieFaces} + ${def.corruptionRider.base} Corruption Points` : null,
            subtletyClampLabel: def.subtletyClamp
                ? `Subtlety decreases reduced by ${def.subtletyClamp.reducedBy} (min reduction ${def.subtletyClamp.minimumReduction})`
                : null,
        })),
    };
}

const meta = {
    title: 'Dialogs/BeyondHomeworldInfoDialog',
    render: () => renderSheet(templateSrc, buildContext()),
    args: { showAllRiders: true },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const AllCardsPresent: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // All three cards render.
        const daemon = canvasElement.querySelector('[data-homeworld-id="daemonWorld"]');
        const penal = canvasElement.querySelector('[data-homeworld-id="penalColony"]');
        const quarantine = canvasElement.querySelector('[data-homeworld-id="quarantineWorld"]');
        expect(daemon).not.toBeNull();
        expect(penal).not.toBeNull();
        expect(quarantine).not.toBeNull();

        // Riders surface only on the cards that declare them.
        expect(daemon?.querySelector('[data-rider="corruption"]')).not.toBeNull();
        expect(quarantine?.querySelector('[data-rider="subtlety-clamp"]')).not.toBeNull();
        expect(penal?.querySelector('[data-rider="corruption"]')).toBeNull();
        expect(penal?.querySelector('[data-rider="subtlety-clamp"]')).toBeNull();
        expect(daemon?.querySelector('[data-rider="subtlety-clamp"]')).toBeNull();
        expect(quarantine?.querySelector('[data-rider="corruption"]')).toBeNull();

        // Aptitudes appear on their respective cards.
        expect(canvas.getByText('Willpower')).toBeTruthy();
        expect(canvas.getByText('Toughness')).toBeTruthy();
        expect(canvas.getByText('Fieldcraft')).toBeTruthy();
    },
};
