/**
 * The occult rows a psychic cast can add to its card (DH2 Enemies Beyond):
 *
 * - Malefic Daemonology (a92810cbc, beyond.md p. 56): a successful cast taints the
 *   psyker with Corruption equal to the Psy Rating used, printed as its own effect
 *   row. Only lines whose config sets `maleficCorruptionOnManifest` charge it.
 * - Sanctic Purity (7fc6b6332, #131): a Sanctic psyker who spends a Fate point to
 *   negate the Phenomena gets a "Phenomena Negated" card and the cast card records
 *   the negation instead of the warp convulsing.
 *
 * Rows are built with the real rules (`getMaleficCorruptionCost`) and langpack.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { SystemConfigRegistry } from '../../src/module/config/game-systems';
import type { GameSystemId } from '../../src/module/config/game-systems/types';
import { getMaleficCorruptionCost } from '../../src/module/rules/malefic-corruption';
import { SANCTIC_PURITY_FATE_COST } from '../../src/module/rules/sanctic-purity';
import psychicChatSrc from '../../src/templates/chat/psychic-action-chat.hbs?raw';
import sancticNegatedSrc from '../../src/templates/chat/sanctic-purity-negated-chat.hbs?raw';
import { randomId, seedRandom } from '../mocks/extended';
import { formatKey, localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

/** Psy Rating the psyker manifests at. */
const PSY_RATING = 3;

/** Fixed seed so the card id the template keys its collapsible on is stable. */
const STORY_SEED = 131;

interface PsychicCardArgs {
    gameSystem: GameSystemId;
    powerName: string;
    discipline: 'malefic' | 'sanctic';
    success: boolean;
    phenomenaNegated: boolean;
    /** Offer the Spend-Fate re-roll (a third control on a successful cast). */
    withReroll?: boolean;
}

/** The effect rows the cast pipeline adds for these args. */
function effectRows(args: PsychicCardArgs): { name: string; effect: string }[] {
    const rows: { name: string; effect: string }[] = [];
    if (args.phenomenaNegated)
        rows.push({ name: localizeKey('WH40K.ActionEffect.Title.PsychicPhenomena'), effect: localizeKey('WH40K.SancticPurity.NegatedChatBody') });
    const charged = SystemConfigRegistry.get(args.gameSystem).maleficCorruptionOnManifest;
    const corruption = charged ? getMaleficCorruptionCost(args.discipline, PSY_RATING, args.success) : 0;
    if (corruption > 0) {
        rows.push({
            name: localizeKey('WH40K.ActionEffect.Title.Malefic'),
            effect: formatKey('WH40K.ActionEffect.MaleficCorruption', { corruption: String(corruption), pr: String(PSY_RATING) }),
        });
    }
    return rows;
}

function renderPsychicCard(args: PsychicCardArgs): HTMLElement {
    const rng = seedRandom(STORY_SEED);
    const context = {
        id: randomId('roll', rng),
        label: 'Acolyte Vex',
        effectOutput: effectRows(args),
        rerollOptions: args.withReroll === true ? [{ id: 'fate', kind: 'fate', label: 'Spend Fate', modifier: 0, disabled: false }] : [],
        rollData: {
            name: args.powerName,
            action: 'Focus Power',
            effectString: '',
            baseTarget: 45,
            activeModifiers: {},
            modifiedTarget: 45,
            success: args.success,
            dos: args.success ? 3 : 0,
            dof: args.success ? 0 : 2,
            roll: { total: args.success ? 11 : 66 },
        },
        psychicEffect: '',
    };
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'theme-dark');
    wrapper.dataset['wh40kSystem'] = args.gameSystem;
    wrapper.style.maxWidth = '380px';
    wrapper.appendChild(renderSheet(psychicChatSrc, context));
    return wrapper;
}

/** Find the effect row whose title is `titleKey`'s string. */
function effectRow(root: HTMLElement, titleKey: string): HTMLElement | null {
    const title = localizeKey(titleKey);
    return (
        Array.from(root.querySelectorAll<HTMLElement>('div')).find((row) => row.firstElementChild?.textContent.trim() === title && row.children.length === 2) ??
        null
    );
}

const meta = {
    id: 'chat-psychic-occult-effects',
    title: 'Chat/Psychic/Occult Effects',
    render: (args) => renderPsychicCard(args),
    args: { gameSystem: 'dh2', powerName: 'Dark Flame', discipline: 'malefic', success: true, phenomenaNegated: false },
} satisfies Meta<PsychicCardArgs>;
export default meta;
type Story = StoryObj<PsychicCardArgs>;

/** DH2: a manifested Malefic power prints its Corruption — the Psy Rating used. */
export const MaleficCorruptionCharged: Story = {
    play: async ({ canvasElement }) => {
        const row = effectRow(canvasElement, 'WH40K.ActionEffect.Title.Malefic');
        await expect(row).not.toBeNull();
        await expect(row?.textContent).toContain(`+${PSY_RATING} Corruption`);
        await expect(row?.textContent).toContain(`Psy Rating ${PSY_RATING}`);
    },
};

/** A successful cast with a re-roll offer: three controls in a 300px chat log wrap rather than clip the last one. */
export const ControlsWrapAtChatWidth: Story = {
    args: { withReroll: true },
    render: (args) => {
        const card = renderPsychicCard(args);
        card.style.maxWidth = '300px';
        return card;
    },
    play: async ({ canvasElement }) => {
        const row = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="psychic-card-controls"]');
        await expect(row).not.toBeNull();
        await expect(row?.className).toContain('tw-flex-wrap');
        await expect(row?.querySelectorAll('button').length).toBe(3);
        // No control extends past the row's right edge.
        const right = row?.getBoundingClientRect().right ?? 0;
        const overflowing = [...(row?.querySelectorAll('button') ?? [])].filter((button) => button.getBoundingClientRect().right > right + 1);
        await expect(overflowing).toEqual([]);
    },
};

/** A failed Malefic cast manifests nothing, so it costs nothing. */
export const MaleficFailedNoCharge: Story = {
    args: { success: false },
    play: async ({ canvasElement }) => {
        await expect(effectRow(canvasElement, 'WH40K.ActionEffect.Title.Malefic')).toBeNull();
    },
};

/** DH1 prints Malefic powers but its cost rule is unverified, so the line does not charge: no row. */
export const MaleficOnUnchargedLine: Story = {
    args: { gameSystem: 'dh1' },
    play: async ({ canvasElement }) => {
        await expect(SystemConfigRegistry.get('dh1').maleficCorruptionOnManifest).toBe(false);
        await expect(effectRow(canvasElement, 'WH40K.ActionEffect.Title.Malefic')).toBeNull();
    },
};

/** A Sanctic power costs no Corruption; with the Phenomena negated the card records the negation. */
export const SancticPhenomenaNegated: Story = {
    args: { powerName: 'Psychic Communion', discipline: 'sanctic', phenomenaNegated: true },
    play: async ({ canvasElement }) => {
        await expect(effectRow(canvasElement, 'WH40K.ActionEffect.Title.Malefic')).toBeNull();
        const row = effectRow(canvasElement, 'WH40K.ActionEffect.Title.PsychicPhenomena');
        await expect(row?.textContent).toContain(localizeKey('WH40K.SancticPurity.NegatedChatBody'));
        await expect(canvasElement.textContent).not.toContain(localizeKey('WH40K.ActionEffect.PsychicPhenomena'));
    },
};

/** The "Phenomena Negated" card Sanctic Purity posts: the Fate spent, before and after. */
export const SancticPurityNegatedCard: Story = {
    render: () => {
        const wrapper = document.createElement('div');
        wrapper.style.maxWidth = '380px';
        wrapper.appendChild(
            renderSheet(sancticNegatedSrc, {
                gameSystem: 'dh2',
                actorName: 'Sister Ophelia',
                fateCost: SANCTIC_PURITY_FATE_COST,
                fateBefore: 2,
                fateAfter: 2 - SANCTIC_PURITY_FATE_COST,
            }),
        );
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-wh40k-system="dh2"]');
        await expect(card?.textContent).toContain(localizeKey('WH40K.SancticPurity.NegatedChatTitle'));
        await expect(card?.textContent).toContain('Sister Ophelia');
        await expect(card?.textContent).toContain(`-${SANCTIC_PURITY_FATE_COST}`);
        await expect(card?.textContent.replace(/\s+/g, ' ')).toContain('2 → 1');
        // Legibility: the card is its own dark surface on DH2 too (it used to wash to a 30% amber, putting the gold title on tan).
        await expect(card?.getAttribute('data-wh40k-surface')).toBe('dark');
        await expect(card?.className).not.toContain('tw-bg-amber-900/30');
    },
};
