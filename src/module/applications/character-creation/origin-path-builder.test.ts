import { afterAll, describe, expect, it, vi } from 'vitest';

const ORIGINAL_GAME = (globalThis as Record<string, unknown>)['game'];
const ORIGINAL_FOUNDRY = (globalThis as Record<string, unknown>)['foundry'];
const ORIGINAL_UI = (globalThis as Record<string, unknown>)['ui'];
const ORIGINAL_ROLL = (globalThis as Record<string, unknown>)['Roll'];

class FakeApplicationV2 {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- boundary: TS mixin class spec requires `any[]` rest, not `unknown[]`
type Constructor = abstract new (...args: any[]) => object;
const fakeHandlebarsApplicationMixin = <T extends Constructor>(Base: T): T => {
    abstract class Mixed extends Base {}
    return Mixed;
};

vi.mock('../../config/game-systems/index.ts', () => ({
    SystemConfigRegistry: {
        get: () => ({
            getOriginStepConfig: () => ({
                coreSteps: [],
                optionalStep: null,
                equipmentStep: null,
            }),
        }),
    },
}));

vi.mock('../../config.ts', () => ({
    default: {},
}));

vi.mock('../../managers/grants-manager.ts', () => ({
    GrantsManager: class {},
    generateDeterministicId: () => 'grant-id',
}));

vi.mock('../../utils/origin-chart-layout.ts', () => ({
    OriginChartLayout: {
        computeFullChart: () => ({ steps: [] }),
        resolvePathPositions: () => [],
    },
}));

vi.mock('../../utils/origin-ui-labels.ts', () => ({
    getCharacteristicDisplayInfo: () => ({ label: 'Agility', short: 'Ag' }),
    getChoiceTypeLabel: () => 'Choice',
    getTrainingLabel: () => 'Trained',
}));

vi.mock('../../wh40k-rpg-settings.ts', () => ({
    WH40KSettings: {
        isHomebrew: () => false,
        getRuleset: () => 'raw',
    },
}));

vi.mock('../dialogs/advancement-dialog.ts', () => ({
    default: class AdvancementDialog {},
}));

vi.mock('../dialogs/confirmation-dialog.ts', () => ({
    default: class ConfirmationDialog {},
}));

vi.mock('./origin-detail-dialog.ts', () => ({
    default: class OriginDetailDialog {},
}));

vi.mock('./origin-path-choice-dialog.ts', () => ({
    default: class OriginPathChoiceDialog {},
}));

vi.mock('./origin-roll-dialog.ts', () => ({
    default: class OriginRollDialog {},
}));

(globalThis as Record<string, unknown>)['game'] = {
    i18n: {
        localize: (key: string) => key,
        format: (key: string) => key,
    },
    user: { isGM: true },
    packs: new Map(),
};

(globalThis as Record<string, unknown>)['foundry'] = {
    applications: {
        api: {
            ApplicationV2: FakeApplicationV2,
            HandlebarsApplicationMixin: fakeHandlebarsApplicationMixin,
        },
    },
    abstract: {
        DataModel: class {},
    },
    utils: {
        deepClone: <T>(value: T): T => structuredClone(value),
    },
};

(globalThis as Record<string, unknown>)['ui'] = {
    notifications: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    },
};

class FakeRoll {
    total: number;
    constructor(public formula: string) {
        this.total = 42;
    }
    async evaluate(): Promise<this> {
        return this;
    }
}
(globalThis as Record<string, unknown>)['Roll'] = FakeRoll;

afterAll(() => {
    (globalThis as Record<string, unknown>)['game'] = ORIGINAL_GAME;
    (globalThis as Record<string, unknown>)['foundry'] = ORIGINAL_FOUNDRY;
    (globalThis as Record<string, unknown>)['ui'] = ORIGINAL_UI;
    (globalThis as Record<string, unknown>)['Roll'] = ORIGINAL_ROLL;
});

const { default: OriginPathBuilder } = await import('./origin-path-builder.ts');

interface TestOrigin {
    id: string;
    uuid: string | null;
    name: string;
    img: string;
    step: string;
    stepIndex: number;
    identifier: string;
    positions: number[];
    primaryPosition: number;
    description: string;
    shortDescription: string;
    requirements: { text: string; previousSteps: string[]; excludedSteps: string[] };
    grants: {
        skills: [];
        talents: [];
        traits: [];
        equipment: [];
        aptitudes: [];
        specialAbilities: [];
        choices: [];
        woundsFormula: string | null;
        fateFormula: string | null;
    };
    modifiers: { characteristics: Record<string, number> };
    isAdvanced: boolean;
    xpCost: number;
    hasChoices: boolean;
    gameSystem: string;
    system: Record<string, unknown>;
    _sourceUuid?: string | null;
    _actorItemId?: string | null;
}

function makeOrigin(overrides: Partial<TestOrigin> = {}): TestOrigin {
    return {
        id: 'origin-hive-world',
        uuid: 'Compendium.wh40k-rpg.origin-paths.origin-hive-world',
        name: 'Hive World',
        img: 'icons/svg/d20.svg',
        step: 'homeWorld',
        stepIndex: 0,
        identifier: 'hive-world',
        positions: [1],
        primaryPosition: 1,
        description: '<p>Born amid steel and ash.</p>',
        shortDescription: 'Born amid steel and ash.',
        requirements: { text: '', previousSteps: [], excludedSteps: [] },
        grants: {
            skills: [],
            talents: [],
            traits: [],
            equipment: [],
            aptitudes: [],
            specialAbilities: [],
            choices: [],
            woundsFormula: null,
            fateFormula: null,
        },
        modifiers: { characteristics: { agility: 5 } },
        isAdvanced: false,
        xpCost: 0,
        hasChoices: false,
        gameSystem: 'dh2e',
        system: {
            step: 'homeWorld',
            selectedChoices: {
                'Starting Talent': ['Resistance'],
            },
            rollResults: {
                wounds: { rolled: 12, breakdown: '8 + 2 + 2' },
            },
        },
        ...overrides,
    };
}

function makeBuilderHost() {
    return {
        actor: { id: 'actor-1' },
        allOrigins: [] as TestOrigin[],
        lineageOrigins: [] as TestOrigin[],
        previewedOrigin: null as TestOrigin | null,
        render: vi.fn().mockResolvedValue(undefined),
        _findConfirmedSelectionMatching: vi.fn().mockReturnValue(null),
        _itemToSelectionData: OriginPathBuilder.prototype._itemToSelectionData,
    };
}

function makeTarget(origin: TestOrigin, disabled = false): HTMLElement {
    const target = document.createElement('button');
    target.dataset['originId'] = origin.id;
    if (origin.uuid !== null) target.dataset['originUuid'] = origin.uuid;
    if (disabled) target.classList.add('disabled');
    return target;
}

describe('OriginPathBuilder._itemToSelectionData', () => {
    it('accepts normalized origin data without a toObject method', () => {
        const builder = { actor: { id: 'actor-1' } };
        const origin = makeOrigin({
            _sourceUuid: 'Compendium.wh40k-rpg.origin-paths.hive-world-source',
            _actorItemId: 'embedded-origin-1',
        });

        const normalized = OriginPathBuilder.prototype._itemToSelectionData.call(builder, origin);

        expect(normalized.name).toBe('Hive World');
        expect(normalized.system['selectedChoices']).toEqual({
            'Starting Talent': ['Resistance'],
        });
        expect(normalized.system['rollResults']).toEqual({
            wounds: { rolled: 12, breakdown: '8 + 2 + 2' },
        });
        expect(normalized._sourceUuid).toBe('Compendium.wh40k-rpg.origin-paths.hive-world-source');
        expect(normalized._actorItemId).toBe('embedded-origin-1');
    });

    it('does not throw on a compendium index entry without toObject (issue #198)', () => {
        const builder = { actor: { id: 'actor-1' } };
        const indexEntry = makeOrigin();

        expect(() => OriginPathBuilder.prototype._itemToSelectionData.call(builder, indexEntry)).not.toThrow();
    });

    it('treats a non-callable toObject as plain data instead of invoking it (issue #198)', () => {
        const builder = { actor: { id: 'actor-1' } };
        const origin = makeOrigin();
        (origin as unknown as Record<string, unknown>)['toObject'] = 'not-a-function';

        const normalized = OriginPathBuilder.prototype._itemToSelectionData.call(builder, origin);

        expect(normalized.name).toBe('Hive World');
    });
});

describe('OriginPathBuilder preview action', () => {
    it('previews a normalized origin card without throwing', () => {
        const origin = makeOrigin();
        const host = makeBuilderHost();
        host.allOrigins = [origin];

        OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            makeTarget(origin),
        );

        expect(host.previewedOrigin?.name).toBe('Hive World');
        expect(host.previewedOrigin?.system['selectedChoices']).toEqual({
            'Starting Talent': ['Resistance'],
        });
        expect(host.render).toHaveBeenCalledTimes(1);
    });

    it('reuses the confirmed selection when the previewed card is already selected', () => {
        const origin = makeOrigin();
        const confirmed = makeOrigin({
            _sourceUuid: origin.uuid,
            system: {
                step: 'homeWorld',
                selectedChoices: {
                    'Starting Talent': ['Weapon Training (Las)'],
                },
                rollResults: {
                    wounds: { rolled: 14, breakdown: '8 + 4 + 2' },
                },
            },
        });
        const host = makeBuilderHost();
        host.allOrigins = [origin];
        host._findConfirmedSelectionMatching = vi.fn().mockReturnValue(confirmed);
        host._itemToSelectionData = vi.fn();

        OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            makeTarget(origin),
        );

        expect(host.previewedOrigin).toBe(confirmed);
        expect(host._itemToSelectionData).not.toHaveBeenCalled();
        expect(host.render).toHaveBeenCalledTimes(1);
    });

    it('warns and does not render when the clicked origin is disabled', () => {
        const origin = makeOrigin();
        const host = makeBuilderHost();
        host.allOrigins = [origin];

        OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            makeTarget(origin, true),
        );

        expect(host.previewedOrigin).toBeNull();
        expect(host.render).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith('WH40K.OriginPath.OriginNotAvailable');
    });
});

describe('OriginPathBuilder rollDivination (issue #199)', () => {
    function makeDivinationHost() {
        return {
            _divination: '',
            _saveScrollPosition: vi.fn(),
            render: vi.fn().mockResolvedValue(undefined),
        };
    }

    it('falls back to a 1d100 roll when the Divination table is absent', async () => {
        const g = (globalThis as Record<string, unknown>)['game'] as Record<string, unknown>;
        g['tables'] = undefined;
        g['packs'] = Object.assign(new Map(), { find: () => undefined });

        const host = makeDivinationHost();
        await OriginPathBuilder.DEFAULT_OPTIONS.actions.rollDivination.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            document.createElement('button'),
        );

        expect(host._divination).toBe('WH40K.OriginPath.DivinationTableUnavailable');
        expect(host.render).toHaveBeenCalledTimes(1);
        expect(host._saveScrollPosition).toHaveBeenCalledTimes(1);
    });

    it('treats an empty world RollTable as unavailable and never calls draw()', async () => {
        const draw = vi.fn();
        const g = (globalThis as Record<string, unknown>)['game'] as Record<string, unknown>;
        g['tables'] = { getName: () => ({ results: { size: 0 }, draw }) };
        g['packs'] = Object.assign(new Map(), { find: () => undefined });

        const host = makeDivinationHost();
        await OriginPathBuilder.DEFAULT_OPTIONS.actions.rollDivination.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            document.createElement('button'),
        );

        expect(draw).not.toHaveBeenCalled();
        expect(host._divination).toBe('WH40K.OriginPath.DivinationTableUnavailable');
    });

    it('uses the drawn result text when a populated table exists', async () => {
        const draw = vi.fn().mockResolvedValue({ results: [{ text: 'Trust in your fear.' }] });
        const g = (globalThis as Record<string, unknown>)['game'] as Record<string, unknown>;
        g['tables'] = { getName: () => ({ results: { size: 100 }, draw }) };
        g['packs'] = Object.assign(new Map(), { find: () => undefined });

        const host = makeDivinationHost();
        await OriginPathBuilder.DEFAULT_OPTIONS.actions.rollDivination.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            document.createElement('button'),
        );

        expect(draw).toHaveBeenCalledTimes(1);
        expect(host._divination).toBe('Trust in your fear.');
    });
});

describe('OriginPathBuilder commit (issue #206)', () => {
    it('blocks commit and routes to the Characteristics step when characteristics are unassigned', async () => {
        const dialogPrompt = vi.fn();
        const f = (globalThis as Record<string, unknown>)['foundry'] as {
            applications: { api: Record<string, unknown> };
        };
        f.applications.api['DialogV2'] = { prompt: dialogPrompt };

        const host = {
            _calculateStatus: () => ({ canCommit: true, stepsComplete: true, choicesComplete: true, equipmentComplete: true }),
            _hasAssignedCharacteristics: vi.fn().mockReturnValue(false),
            _clearPreviewedOrigin: vi.fn(),
            render: vi.fn().mockResolvedValue(undefined),
            showLineage: true,
            showCharacteristics: false,
            showEquipment: true,
            systemConfig: { equipmentStep: null },
            equipmentSelections: new Map<string, unknown>(),
            gameSystem: 'dh2e',
        };

        await OriginPathBuilder.DEFAULT_OPTIONS.actions.commit.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            document.createElement('button'),
        );

        expect(ui.notifications.warn).toHaveBeenCalledWith('WH40K.OriginPath.CharacteristicsRequiredBeforeCommit');
        expect(host.showCharacteristics).toBe(true);
        expect(host.showEquipment).toBe(false);
        expect(host.showLineage).toBe(false);
        expect(dialogPrompt).not.toHaveBeenCalled();
    });

    it('blocks commit and routes to the Equipment step when equipment is empty under DH2e RAW', async () => {
        const dialogPrompt = vi.fn();
        const f = (globalThis as Record<string, unknown>)['foundry'] as {
            applications: { api: Record<string, unknown> };
        };
        f.applications.api['DialogV2'] = { prompt: dialogPrompt };

        const host = {
            _calculateStatus: () => ({ canCommit: false, stepsComplete: true, choicesComplete: true, equipmentComplete: false }),
            _hasAssignedCharacteristics: vi.fn().mockReturnValue(true),
            _clearPreviewedOrigin: vi.fn(),
            render: vi.fn().mockResolvedValue(undefined),
            showLineage: false,
            showCharacteristics: true,
            showEquipment: false,
            guidedMode: false,
            systemConfig: {
                equipmentStep: { key: 'equipment', step: 'equipment', icon: 'fa-box', descKey: 'EquipmentDesc', stepIndex: 6 },
            },
            equipmentSelections: new Map<string, unknown>(),
            gameSystem: 'dh2e',
        };

        await OriginPathBuilder.DEFAULT_OPTIONS.actions.commit.call(
            host as unknown as InstanceType<typeof OriginPathBuilder>,
            new Event('click'),
            document.createElement('button'),
        );

        expect(ui.notifications.warn).toHaveBeenCalledWith('WH40K.OriginPath.StepInProgressEquipment');
        expect(host.showEquipment).toBe(true);
        expect(host.showCharacteristics).toBe(false);
        expect(host.showLineage).toBe(false);
        expect(dialogPrompt).not.toHaveBeenCalled();
    });
});

describe('OriginPathBuilder._collectAptitudeGrantCounts (issue #205)', () => {
    interface AptSelection {
        system: { grants?: Record<string, unknown>; selectedChoices?: Record<string, string[]> };
    }

    function makeCountHost(selections: Array<[string, AptSelection]>) {
        return {
            selections: new Map(selections),
            _getSelectionSystem: (s: AptSelection) => s.system,
            _collectAptitudeChoices: OriginPathBuilder.prototype._collectAptitudeChoices,
        };
    }

    it('counts a fixed aptitude granted by two origins as a duplicate', () => {
        const host = makeCountHost([
            ['homeWorld', { system: { grants: { aptitudes: ['Willpower', 'Offence'] }, selectedChoices: {} } }],
            ['background', { system: { grants: { aptitudes: ['Willpower'] }, selectedChoices: {} } }],
        ]);

        const counts = OriginPathBuilder.prototype._collectAptitudeGrantCounts.call(host as unknown as InstanceType<typeof OriginPathBuilder>);

        expect(counts.get('Willpower')).toBe(2);
        expect(counts.get('Offence')).toBe(1);
    });

    it('counts an aptitude-typed choice colliding with a fixed aptitude', () => {
        const host = makeCountHost([
            ['homeWorld', { system: { grants: { aptitudes: ['Tech'] }, selectedChoices: {} } }],
            [
                'background',
                {
                    system: {
                        grants: {
                            choices: [{ type: 'aptitude', label: 'Aptitude', options: [{ value: 'Tech' }] }],
                        },
                        selectedChoices: { Aptitude: ['Tech'] },
                    },
                },
            ],
        ]);

        const counts = OriginPathBuilder.prototype._collectAptitudeGrantCounts.call(host as unknown as InstanceType<typeof OriginPathBuilder>);

        expect(counts.get('Tech')).toBe(2);
    });

    it('does not double-count an aptitude granted twice by a single origin', () => {
        const host = makeCountHost([['homeWorld', { system: { grants: { aptitudes: ['Willpower', 'Willpower'] }, selectedChoices: {} } }]]);

        const counts = OriginPathBuilder.prototype._collectAptitudeGrantCounts.call(host as unknown as InstanceType<typeof OriginPathBuilder>);

        expect(counts.get('Willpower')).toBe(1);
    });
});
