import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { listWithoutHomeworlds } from '../../src/module/rules/without-homeworlds';
import templateSrc from '../../src/templates/prompt/without-homeworld-info-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

/**
 * Storybook stories for WithoutHomeworldInfoDialog (GitHub #102).
 *
 * Renders the three Without home-worlds (Death World, Garden World,
 * Research Station) as a grid of cards using the typed registry as
 * the source of truth — no hand-authored card data. The play function
 * verifies all three cards render and that each rider (Death surprise
 * suppression, Garden serenity, Research Pursuit-of-Data) surfaces on
 * its own card and only on its own card.
 */

interface Args {
    showAllRiders: boolean;
}

function accentFor(id: string): 'crimson' | 'green' | 'grey' {
    if (id === 'deathWorld') return 'crimson';
    if (id === 'gardenWorld') return 'green';
    return 'grey';
}

function buildContext(): Record<string, unknown> {
    return {
        homeworlds: listWithoutHomeworlds().map((def) => ({
            id: def.id,
            label: def.label,
            accent: accentFor(def.id),
            bonusesLabel: def.characteristicMods.bonuses.map((b) => `+${b.charAt(0).toUpperCase()}${b.slice(1)}`).join(', '),
            penaltiesLabel: def.characteristicMods.penalties.map((p) => `-${p.charAt(0).toUpperCase()}${p.slice(1)}`).join(', '),
            fateLabel: `${def.fateThreshold.base} (Emperor's Blessing ${def.fateThreshold.emperorsBlessing}+)`,
            woundsLabel: `${def.wounds.base} + 1d${def.wounds.dieFaces}`,
            aptitude: def.aptitude,
            keyTalents: def.keyTalents,
            recommendedBackgrounds: def.recommendedBackgrounds,
            mechanicalHook: def.mechanicalHook,
            surpriseSuppressionLabel: def.surpriseBonusSuppression
                ? `Suppresses +${def.surpriseBonusSuppression.suppressedBonus} WS/BS bonus from non-Surprised attackers`
                : null,
            serenityLabel: def.serenityRider
                ? `Shock/Trauma duration ×${def.serenityRider.durationMultiplier} (round ${def.serenityRider.rounding}); Insanity removal ${def.serenityRider.insanityRemovalCost} XP/pt (was ${def.serenityRider.baselineInsanityRemovalCost})`
                : null,
            pursuitOfDataLabel: def.pursuitOfDataRider
                ? `Scholastic Lore Rank ${def.pursuitOfDataRider.triggerScholasticRank} → Forbidden Lore Rank ${def.pursuitOfDataRider.grantedForbiddenRank} (related specialisation, GM arbitrates)`
                : null,
        })),
    };
}

const meta = {
    title: 'Dialogs/WithoutHomeworldInfoDialog',
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
        const death = canvasElement.querySelector('[data-homeworld-id="deathWorld"]');
        const garden = canvasElement.querySelector('[data-homeworld-id="gardenWorld"]');
        const research = canvasElement.querySelector('[data-homeworld-id="researchStation"]');
        expect(death).not.toBeNull();
        expect(garden).not.toBeNull();
        expect(research).not.toBeNull();

        // Riders surface only on the cards that declare them.
        expect(death?.querySelector('[data-rider="surprise-suppression"]')).not.toBeNull();
        expect(garden?.querySelector('[data-rider="serenity"]')).not.toBeNull();
        expect(research?.querySelector('[data-rider="pursuit-of-data"]')).not.toBeNull();
        expect(death?.querySelector('[data-rider="serenity"]')).toBeNull();
        expect(death?.querySelector('[data-rider="pursuit-of-data"]')).toBeNull();
        expect(garden?.querySelector('[data-rider="surprise-suppression"]')).toBeNull();
        expect(garden?.querySelector('[data-rider="pursuit-of-data"]')).toBeNull();
        expect(research?.querySelector('[data-rider="surprise-suppression"]')).toBeNull();
        expect(research?.querySelector('[data-rider="serenity"]')).toBeNull();

        // Aptitudes appear on their respective cards.
        expect(canvas.getByText('Fieldcraft')).toBeTruthy();
        expect(canvas.getByText('Social')).toBeTruthy();
        expect(canvas.getByText('Knowledge')).toBeTruthy();
    },
};
