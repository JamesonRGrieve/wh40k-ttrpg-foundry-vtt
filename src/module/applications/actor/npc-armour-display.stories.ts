/**
 * The NPC armour panel (#611) — the shared Combat-tab armour silhouette fed by
 * an NPC's armour block. The silhouette used to read the PC shape off an NPC and
 * show 0 on every location; worn armour also never reached an NPC that carried a
 * stat block. Each story derives the armour exactly as the sheet does
 * (`deriveNpcArmour` → `npcArmourAtLocation`), so the numbers shown are the
 * computation's, not hand-written ones.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import armourZoneSrc from '../../../templates/actor/partial/armour-zone.hbs?raw';
import { deriveNpcArmour } from '../../data/actor/npc-armour-derive.ts';
import type { NpcArmour } from '../../data/actor/npc-armour-edit.ts';
import { asBaseActor } from '../../testing/actor-stub.ts';
import { npcArmourAtLocation } from './npc-armour-display.ts';

const HIT_LOCATIONS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
const GAME_LINES = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'] as const;

/** The Adeptus Arbites Arbitrator's Toughness bonus (DH2 core bestiary). */
const TOUGHNESS_BONUS = 3;

interface ArmourItemStub {
    type: 'armour';
    name: string;
    system: { state: { equipped: boolean }; armourPoints: Record<string, number> };
}

/** The DH2 Enforcer Light Carapace: AP 5 on every location. */
function carapace(equipped: boolean): ArmourItemStub {
    const armourPoints = Object.fromEntries(HIT_LOCATIONS.map((loc) => [loc, 5]));
    return { type: 'armour', name: 'Enforcer Light Carapace', system: { state: { equipped }, armourPoints } };
}

/** A stat-block armour line: AP 2 everywhere, authored. */
const STAT_BLOCK: NpcArmour = {
    mode: 'locations',
    total: 2,
    authored: true,
    locations: { head: 2, body: 2, leftArm: 2, rightArm: 2, leftLeg: 2, rightLeg: 2 },
};

interface PanelArgs {
    armourDisplay: Record<string, { total: number; items: never[]; tooltipData: string }>;
    equippedGear: never[];
    compact: boolean;
}

/** The silhouette context for an NPC wearing `items` with stat block `statBlock`. */
function panelArgs(items: ArmourItemStub[], statBlock: NpcArmour): PanelArgs {
    const actor = asBaseActor({
        characteristics: { toughness: { bonus: TOUGHNESS_BONUS } },
        items: Object.assign([...items], { filter: (predicate: (i: ArmourItemStub) => boolean) => items.filter(predicate) }),
        getFlag: () => false,
    });
    const derived = deriveNpcArmour(actor, statBlock.authored);
    const armour = derived === null ? statBlock : { ...statBlock, ...derived };
    const armourDisplay = Object.fromEntries(
        HIT_LOCATIONS.map((loc) => [loc, { total: npcArmourAtLocation(armour, loc, TOUGHNESS_BONUS).total, items: [], tooltipData: '{}' }]),
    );
    return { armourDisplay, equippedGear: [], compact: false };
}

/** The total the silhouette shows at one location: the location's round badge (its label is the first span). */
function shownTotal(root: HTMLElement, location: string): string {
    return root.querySelector(`[data-location="${location}"] > span:nth-of-type(2)`)?.textContent.trim() ?? '';
}

async function expectEveryLocation(root: HTMLElement, total: number): Promise<void> {
    for (const loc of HIT_LOCATIONS) {
        // eslint-disable-next-line no-await-in-loop -- sequential: one assertion per location, in reading order
        await expect(shownTotal(root, loc)).toBe(String(total));
    }
}

const meta: Meta<PanelArgs> = {
    title: 'Actor/NPC/Armour Panel',
    render: (args) => renderSheet(armourZoneSrc, args),
};
export default meta;
type Story = StoryObj<PanelArgs>;

/** Before equipping: the stat block (AP 2) stands while the carapace is only carried. Shown: 2 + TB 3. */
export const StatBlockBeforeEquipping: Story = {
    args: panelArgs([carapace(false)], STAT_BLOCK),
    play: async ({ canvasElement }) => expectEveryLocation(canvasElement, 5),
};

/** After equipping: the worn carapace (AP 5) sets the stat block aside — never added to it. Shown: 5 + TB 3. */
export const CarapaceEquipped: Story = {
    args: panelArgs([carapace(true)], STAT_BLOCK),
    play: async ({ canvasElement }) => expectEveryLocation(canvasElement, 8),
};

/** A bestiary NPC with no stat-block AP wears the armour it lists (the Arbitrator's carapace). */
export const BestiaryListedArmour: Story = {
    args: panelArgs([carapace(false)], {
        ...STAT_BLOCK,
        authored: false,
        total: 0,
        locations: { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },
    }),
    play: async ({ canvasElement }) => expectEveryLocation(canvasElement, 8),
};

/** Every line's NPC reads the same armour block the same way (homologation). */
export const AllLines: Story = {
    render: () => {
        const host = document.createElement('div');
        for (const line of GAME_LINES) {
            const wrapper = document.createElement('div');
            wrapper.dataset['wh40kSystem'] = line;
            wrapper.append(renderSheet(armourZoneSrc, panelArgs([carapace(true)], STAT_BLOCK)));
            host.append(wrapper);
        }
        return host;
    },
    play: async ({ canvasElement }) => {
        const wrappers = GAME_LINES.map((line) => canvasElement.querySelector<HTMLElement>(`[data-wh40k-system="${line}"]`));
        await expect(wrappers.every((wrapper) => wrapper !== null)).toBe(true);
        await Promise.all(wrappers.map(async (wrapper) => (wrapper === null ? Promise.resolve() : expectEveryLocation(wrapper, 8))));
    },
};
