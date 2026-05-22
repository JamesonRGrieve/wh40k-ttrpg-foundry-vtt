/**
 * Stories for BatchCreateDialog — the GM tool that mass-creates NPCs from a
 * name pattern + threat tier + role/type/equipment presets. Renders the
 * dialog's `.hbs` against a prepared `state` + option lists, covering the
 * default form, the randomize-stats sub-panel, and a folder-select variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/batch-create.hbs?raw';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';

interface Choice {
    key: string;
    name: string;
    description?: string;
    selected: boolean;
}

interface FolderChoice {
    id: string;
    name: string;
    selected: boolean;
}

interface DialogButton {
    type: string;
    action?: string;
    cssClass: string;
    icon: string;
    label: string;
}

interface BatchState {
    namePattern: string;
    count: number;
    threatLevel: number;
    faction: string;
    isHorde: boolean;
    randomize: boolean;
    randomizeAmount: number;
    openSheets: boolean;
}

interface Args {
    state: BatchState;
    tierName: string;
    roles: Choice[];
    types: Choice[];
    presets: Choice[];
    folders: FolderChoice[];
    previewNames: string[];
    buttons: DialogButton[];
}

const ROLES: Choice[] = [
    { key: 'minion', name: 'Minion', selected: true },
    { key: 'elite', name: 'Elite', selected: false },
];

const TYPES: Choice[] = [
    { key: 'human', name: 'Human', selected: true },
    { key: 'xenos', name: 'Xenos', selected: false },
];

const PRESETS: Choice[] = [
    { key: 'guard', name: 'Imperial Guard', description: 'Lasgun + flak', selected: true },
    { key: 'cultist', name: 'Cultist', description: 'Autopistol + knife', selected: false },
];

const BUTTONS: DialogButton[] = [
    { type: 'submit', action: 'create', cssClass: 'primary', icon: 'fa-solid fa-users', label: 'WH40K.NPC.BatchCreate.Create' },
    { type: 'button', action: 'cancel', cssClass: 'secondary', icon: 'fa-solid fa-xmark', label: 'WH40K.Cancel' },
];

const meta = {
    title: 'NPC/BatchCreateDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        state: {
            namePattern: 'Hive Ganger {n}',
            count: 4,
            threatLevel: 8,
            faction: 'Hive Scum',
            isHorde: false,
            randomize: false,
            randomizeAmount: 10,
            openSheets: false,
        },
        tierName: 'Standard',
        roles: ROLES,
        types: TYPES,
        presets: PRESETS,
        folders: [],
        previewNames: ['Hive Ganger 1', 'Hive Ganger 2', 'Hive Ganger 3', 'Hive Ganger 4'],
        buttons: BUTTONS,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Hive Ganger 1')).toBeTruthy();
        clickAction(canvasElement, 'create');
        clickAction(canvasElement, 'cancel');
    },
};

export const RandomizeStats: Story = {
    args: {
        state: {
            namePattern: 'Cultist {n}',
            count: 6,
            threatLevel: 12,
            faction: 'Chaos',
            isHorde: true,
            randomize: true,
            randomizeAmount: 20,
            openSheets: true,
        },
        tierName: 'Tough',
        previewNames: ['Cultist 1', 'Cultist 2', 'Cultist 3'],
    },
};

export const WithFolders: Story = {
    args: {
        folders: [
            { id: 'f1', name: 'Encounter A', selected: true },
            { id: 'f2', name: 'Encounter B', selected: false },
        ],
    },
};
