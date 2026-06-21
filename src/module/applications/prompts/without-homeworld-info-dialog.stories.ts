import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { listWithoutHomeworlds } from '../../../../src/module/rules/without-homeworlds';
import templateSrc from '../../../../src/templates/prompt/without-homeworld-info-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

/**
 * Storybook stories for WithoutHomeworldInfoDialog (GitHub #102 / #338).
 *
 * Renders the three Without home-worlds (Death World, Garden World,
 * Research Station) as a grid of cards. The dialog joins the slimmed
 * registry (riders + prose) with compendium-sourced mechanical basics
 * at render time; stories don't run the compendium stack, so the basics
 * are declared inline here mirroring `readHomeworldMechanics` output.
 * The play function verifies all three cards render and that each rider
 * (Death surprise suppression, Garden serenity, Research Pursuit-of-Data)
 * surfaces on its own card and only on its own card.
 */

interface Args {
    showAllRiders: boolean;
}

function accentFor(id: string): 'crimson' | 'green' | 'grey' {
    if (id === 'deathWorld') return 'crimson';
    if (id === 'gardenWorld') return 'green';
    return 'grey';
}

/** Projected compendium basics per compendium identifier (mirrors the reader). */
const BASICS: Record<string, { bonuses: string[]; penalties: string[]; fateBase: number; blessing: number; aptitude: string; woundsFlat: number }> = {
    'death-world': { bonuses: ['Agility', 'Perception'], penalties: ['Fellowship'], fateBase: 2, blessing: 5, aptitude: 'Fieldcraft', woundsFlat: 9 },
    'garden-world': { bonuses: ['Fellowship', 'Agility'], penalties: ['Toughness'], fateBase: 2, blessing: 4, aptitude: 'Social', woundsFlat: 7 },
    'research-station': { bonuses: ['Intelligence', 'Perception'], penalties: ['Fellowship'], fateBase: 3, blessing: 8, aptitude: 'Knowledge', woundsFlat: 8 },
};

interface WithoutHomeworldCardCtx {
    id: string;
    label: string;
    accent: 'crimson' | 'green' | 'grey';
    bonusesLabel: string;
    penaltiesLabel: string;
    fateLabel: string;
    woundsLabel: string;
    aptitude: string;
    keyTalents: readonly string[];
    recommendedBackgrounds: readonly string[];
    mechanicalHook: string;
    surpriseSuppressionLabel: string | null;
    serenityLabel: string | null;
    pursuitOfDataLabel: string | null;
}

function buildContext(): { homeworlds: WithoutHomeworldCardCtx[] } {
    return {
        homeworlds: listWithoutHomeworlds().map((def) => {
            const basics = BASICS[def.compendiumId] ?? { bonuses: [], penalties: [], fateBase: 0, blessing: 0, aptitude: '', woundsFlat: 0 };
            return {
                id: def.id,
                label: def.label,
                accent: accentFor(def.id),
                bonusesLabel: basics.bonuses.map((b) => `+${b}`).join(', '),
                penaltiesLabel: basics.penalties.map((p) => `−${p}`).join(', '),
                fateLabel: `${basics.fateBase} (Emperor's Blessing ${basics.blessing}+)`,
                woundsLabel: `${basics.woundsFlat} + 1d5`,
                aptitude: basics.aptitude,
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
            };
        }),
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
        const storyCanvas = within(canvasElement);
        // All three cards render.
        const death = canvasElement.querySelector('[data-homeworld-id="deathWorld"]');
        const garden = canvasElement.querySelector('[data-homeworld-id="gardenWorld"]');
        const research = canvasElement.querySelector('[data-homeworld-id="researchStation"]');
        await expect(death).not.toBeNull();
        await expect(garden).not.toBeNull();
        await expect(research).not.toBeNull();

        // Riders surface only on the cards that declare them.
        await expect(death?.querySelector('[data-rider="surprise-suppression"]')).not.toBeNull();
        await expect(garden?.querySelector('[data-rider="serenity"]')).not.toBeNull();
        await expect(research?.querySelector('[data-rider="pursuit-of-data"]')).not.toBeNull();
        await expect(death?.querySelector('[data-rider="serenity"]')).toBeNull();
        await expect(death?.querySelector('[data-rider="pursuit-of-data"]')).toBeNull();
        await expect(garden?.querySelector('[data-rider="surprise-suppression"]')).toBeNull();
        await expect(garden?.querySelector('[data-rider="pursuit-of-data"]')).toBeNull();
        await expect(research?.querySelector('[data-rider="surprise-suppression"]')).toBeNull();
        await expect(research?.querySelector('[data-rider="serenity"]')).toBeNull();

        // Aptitudes appear on their respective cards.
        await expect(storyCanvas.getByText('Fieldcraft')).toBeTruthy();
        await expect(storyCanvas.getByText('Social')).toBeTruthy();
        await expect(storyCanvas.getByText('Knowledge')).toBeTruthy();
    },
};
