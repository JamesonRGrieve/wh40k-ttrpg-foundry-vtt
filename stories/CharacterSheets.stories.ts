import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import type { GameSystemId } from '../src/module/config/game-systems/types';
import npcTabSrc from '../src/templates/actor/npc/tab-npc.hbs?raw';
import headerSrc from '../src/templates/actor/player/header-dh.hbs?raw';
import biographyTabSrc from '../src/templates/actor/player/tab-biography.hbs?raw';
import tabsSrc from '../src/templates/actor/player/tabs.hbs?raw';
import { renderTemplate as renderTpl, type MockItem } from './mocks';
import { mockNpcSheetContext, mockPlayerSheetContext, type SheetContextLike } from './mocks/sheet-contexts';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const headerTemplate = Hbs.compile(headerSrc);
const tabsTemplate = Hbs.compile(tabsSrc);
const biographyTemplate = Hbs.compile(biographyTabSrc);
const npcTemplate = Hbs.compile(npcTabSrc);

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

function renderCharacterSheet(args: CharacterSheetArgs, bodyTemplate: HandlebarsTemplateDelegate): HTMLElement {
    const template = Hbs.compile(`
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
    return renderTpl(template, args);
}

const meta: Meta<CharacterSheetArgs> = {
    title: 'Actor/Character Sheets',
};

export default meta;
type Story = StoryObj<CharacterSheetArgs>;

export const DarkHeresy2Biography: Story = {
    args: buildPlayerArgs('dh2'),
    render: (args) => renderCharacterSheet(args, biographyTemplate),
    play: async ({ canvasElement }) => {
        const queries = within(canvasElement);
        await expect(queries.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(queries.getByText('Biography')).toBeVisible();
        await expect(queries.getByText('Character Journal')).toBeVisible();
    },
};

export const ImperiumMaledictumBiography: Story = {
    args: buildPlayerArgs('im'),
    render: (args) => renderCharacterSheet(args, biographyTemplate),
    play: async ({ canvasElement }) => {
        const queries = within(canvasElement);
        await expect(queries.getByDisplayValue('House Varonius')).toBeVisible();
        await expect(queries.getByDisplayValue('Recover a lost ledger')).toBeVisible();
    },
};

export const ImperiumMaledictumNpc: Story = {
    name: 'Imperium Maledictum NPC',
    args: buildNpcArgs(),
    render: (args) => renderCharacterSheet(args, npcTemplate),
    play: async ({ canvasElement }) => {
        const queries = within(canvasElement);
        await expect(queries.getByDisplayValue('Cult Demagogue')).toBeVisible();
        await expect(queries.getByText('GM Tools')).toBeVisible();
        await expect(queries.getByText('Scale to Threat')).toBeVisible();
    },
};
