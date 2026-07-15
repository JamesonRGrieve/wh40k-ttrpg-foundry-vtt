import type { Meta, StoryObj } from '@storybook/html-vite';
import chatSrc from '../../../../src/templates/chat/daemon-weapon-attribute-chat.hbs?raw';
import dialogSrc from '../../../../src/templates/prompt/daemon-weapon-attribute-dialog.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import type { ChaosAlignment } from '../../config/game-systems/types.ts';
import {
    DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS,
    type DaemonWeaponAttribute,
    type DaemonWeaponAttributeRollResult,
    type DaemonWeaponAttributeTable,
    type DaemonWeaponAttributeTables,
    rollDaemonWeaponAttributes,
} from '../../rules/daemon-weapon-attribute-tables.ts';
import { BINDING_STRENGTH_PROFILES, type BindingStrength } from '../../rules/daemon-weapon.ts';
import { ALIGNMENT_ACCENT_CLASS } from './daemon-weapon-attribute-dialog.ts';

initializeStoryHandlebars();

/**
 * Mock stand-in for the compendium-hosted Attribute tables. The real content
 * (GW-copyrighted names + effects) lives only in the packs submodule and is
 * loaded at runtime via `readDaemonWeaponAttributeTables`; Storybook has no
 * `game.packs`, so these placeholder entries exercise the render path without
 * reproducing the rulebook text.
 */
const FIXTURE_RANGES: readonly (readonly [number, number])[] = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 9],
    [10, 10],
];

function makeFixtureTables(): DaemonWeaponAttributeTables {
    const tables = new Map<DaemonWeaponAttributeTable, readonly DaemonWeaponAttribute[]>();
    for (const table of DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS) {
        const entries: DaemonWeaponAttribute[] = FIXTURE_RANGES.map((range, index) => ({
            id: `${table}.attribute-${index + 1}`,
            roll: range,
            label: `${table} Attribute ${index + 1}`,
            effect: `Sample ${table} effect ${index + 1} for layout preview.`,
        }));
        tables.set(table, entries);
    }
    return tables;
}

const FIXTURE_TABLES = makeFixtureTables();

interface Args {
    alignment: ChaosAlignment;
    bindingStrength: BindingStrength;
    rolled: boolean;
    seed: number;
}

function seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
    };
}

interface BindingChoice {
    value: BindingStrength;
    label: string;
}

interface DaemonWeaponDialogContext {
    alignment: ChaosAlignment;
    bindingStrength: BindingStrength;
    alignmentChoices: readonly ChaosAlignment[];
    bindingChoices: BindingChoice[];
    accentClass: string;
    result: DaemonWeaponAttributeRollResult | null;
    hasResult: boolean;
}

interface DaemonWeaponChatContext {
    alignment: ChaosAlignment;
    bindingStrength: BindingStrength;
    bindingLabel: string;
    accentClass: string;
    result: DaemonWeaponAttributeRollResult;
    gameSystem: string;
}

function buildDialogContext(args: Args): DaemonWeaponDialogContext {
    const result = args.rolled ? rollDaemonWeaponAttributes(args.alignment, args.bindingStrength, FIXTURE_TABLES, seededRng(args.seed)) : null;
    return {
        alignment: args.alignment,
        bindingStrength: args.bindingStrength,
        alignmentChoices: ['unaligned', 'khorne', 'nurgle', 'slaanesh', 'tzeentch'],
        bindingChoices: (['minor', 'lesser', 'normal', 'greater', 'major'] satisfies BindingStrength[]).map((s) => ({
            value: s,
            label: BINDING_STRENGTH_PROFILES[s].label,
        })),
        accentClass: ALIGNMENT_ACCENT_CLASS[args.alignment],
        result,
        hasResult: result !== null,
    };
}

function buildChatContext(args: Args): DaemonWeaponChatContext {
    const result = rollDaemonWeaponAttributes(args.alignment, args.bindingStrength, FIXTURE_TABLES, seededRng(args.seed));
    return {
        alignment: args.alignment,
        bindingStrength: args.bindingStrength,
        bindingLabel: BINDING_STRENGTH_PROFILES[args.bindingStrength].label,
        accentClass: ALIGNMENT_ACCENT_CLASS[args.alignment],
        result,
        gameSystem: 'dh2',
    };
}

const meta: Meta<Args> = {
    title: 'Dialogs/Daemon Weapon Attribute Roller',
    argTypes: {
        alignment: { control: 'inline-radio', options: ['unaligned', 'khorne', 'nurgle', 'slaanesh', 'tzeentch'] satisfies ChaosAlignment[] },
        bindingStrength: { control: 'inline-radio', options: ['minor', 'lesser', 'normal', 'greater', 'major'] satisfies BindingStrength[] },
        rolled: { control: 'boolean' },
        seed: { control: { type: 'number', min: 1, max: 9999, step: 1 } },
    },
    args: { alignment: 'khorne', bindingStrength: 'normal', rolled: true, seed: 142 },
    render: (args) => renderSheet(dialogSrc, buildDialogContext(args)),
};

export default meta;

type Story = StoryObj<Args>;

export const PreRoll: Story = {
    name: 'Pre-roll (selection only)',
    args: { rolled: false },
};

export const KhorneNormal: Story = {
    name: 'Khorne — Normal binding (3 attributes)',
    args: { alignment: 'khorne', bindingStrength: 'normal' },
};

export const NurgleMajor: Story = {
    name: 'Nurgle — Major binding (5 attributes)',
    args: { alignment: 'nurgle', bindingStrength: 'major' },
};

export const SlaaneshGreater: Story = {
    name: 'Slaanesh — Greater binding (4 attributes)',
    args: { alignment: 'slaanesh', bindingStrength: 'greater' },
};

export const TzeentchLesser: Story = {
    name: 'Tzeentch — Lesser binding (2 attributes)',
    args: { alignment: 'tzeentch', bindingStrength: 'lesser' },
};

export const UnalignedMinor: Story = {
    name: 'Unaligned — Minor binding (1 attribute, general table only)',
    args: { alignment: 'unaligned', bindingStrength: 'minor' },
};

export const ChatCard: Story = {
    name: 'Chat card output',
    args: { alignment: 'tzeentch', bindingStrength: 'major', rolled: true, seed: 7 },
    render: (args) => renderSheet(chatSrc, buildChatContext(args)),
};
