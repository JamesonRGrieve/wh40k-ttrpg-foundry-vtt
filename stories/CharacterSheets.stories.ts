import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import headerSrc from '../src/templates/actor/player/header-dh.hbs?raw';
import npcTabSrc from '../src/templates/actor/npc/tab-npc.hbs?raw';
import biographyTabSrc from '../src/templates/actor/player/tab-biography.hbs?raw';
import tabsSrc from '../src/templates/actor/player/tabs.hbs?raw';
import { renderTemplate, type MockItem } from './mocks';
import { mockNpcSheetContext, mockPlayerSheetContext, type SheetContextLike } from './mocks/sheet-contexts';
import type { GameSystemId } from '../src/module/config/game-systems/types';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const headerTemplate = Handlebars.compile(headerSrc);
const tabsTemplate = Handlebars.compile(tabsSrc);
const biographyTemplate = Handlebars.compile(biographyTabSrc);
const npcTemplate = Handlebars.compile(npcTabSrc);

/** Story args alias the canonical sheet-context shape. */
type CharacterSheetArgs = SheetContextLike;

function buildPlayerArgs(systemId: GameSystemId): CharacterSheetArgs {
    return mockPlayerSheetContext({
        systemId,
        actorOverrides: {
            items: [
                {
                    _id: 'peer-1',
                    id: 'peer-1',
                    name: 'Peer (Arbites)',
                    img: 'icons/svg/book.svg',
                    type: 'peer',
                    isPeer: true,
                    system: { modifier: 10 },
                } as MockItem,
                {
                    _id: 'enemy-1',
                    id: 'enemy-1',
                    name: 'Enemy (Cultists)',
                    img: 'icons/svg/book.svg',
                    type: 'enemy',
                    isEnemy: true,
                    system: { modifier: -10 },
                } as MockItem,
            ],
            system: {
                bio: {
                    age: '31',
                    gender: 'Non-binary',
                    build: 'Lean',
                    complexion: 'Pale',
                    hair: 'Black',
                    eyes: 'Grey',
                    quirks: 'Meticulous note-taker.',
                    superstition: 'Recites the Litany of Accuracy before every shot.',
                    mementos: 'Worn Inquisitorial seal.',
                },
            },
        },
    });
}

function buildNpcArgs(): CharacterSheetArgs {
    return mockNpcSheetContext({ systemId: 'im' });
}

function renderCharacterSheet(args: CharacterSheetArgs, bodyTemplate: HandlebarsTemplateDelegate) {
    const template = Handlebars.compile(`
        <div class="tw-grid tw-grid-cols-[280px_minmax(0,1fr)]">
            <aside class="wh40k-sidebar tw-flex tw-min-h-full tw-flex-col tw-bg-[var(--color-bg-secondary,#252525)]">
                ${headerTemplate(args)}
                ${tabsTemplate(args)}
            </aside>
            <main class="wh40k-body tw-min-w-0 tw-p-2">
                ${bodyTemplate(args)}
            </main>
        </div>
    `);
    return renderTemplate(template, args);
}

const meta: Meta<CharacterSheetArgs> = {
    title: 'Actor/Character Sheets',
};

export default meta;
type Story = StoryObj<CharacterSheetArgs>;

export const DarkHeresy2Biography: Story = {
    name: 'Dark Heresy 2 Biography',
    args: buildPlayerArgs('dh2e'),
    render: (args) => renderCharacterSheet(args, biographyTemplate),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
        await expect(canvas.getByText('Character Journal')).toBeVisible();
    },
};

export const ImperiumMaledictumBiography: Story = {
    name: 'Imperium Maledictum Biography',
    args: buildPlayerArgs('im'),
    render: (args) => renderCharacterSheet(args, biographyTemplate),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('House Varonius')).toBeVisible();
        await expect(canvas.getByDisplayValue('Recover a lost ledger')).toBeVisible();
    },
};

export const ImperiumMaledictumNpc: Story = {
    name: 'Imperium Maledictum NPC',
    args: buildNpcArgs(),
    render: (args) => renderCharacterSheet(args, npcTemplate),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Cult Demagogue')).toBeVisible();
        await expect(canvas.getByText('GM Tools')).toBeVisible();
        await expect(canvas.getByText('Scale to Threat')).toBeVisible();
    },
};
