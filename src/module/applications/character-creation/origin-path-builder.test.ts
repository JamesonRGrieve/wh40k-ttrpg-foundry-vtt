import { afterAll, describe, expect, it, vi } from 'vitest';

const ORIGINAL_GAME = (globalThis as Record<string, unknown>).game;
const ORIGINAL_FOUNDRY = (globalThis as Record<string, unknown>).foundry;
const ORIGINAL_UI = (globalThis as Record<string, unknown>).ui;

class FakeApplicationV2 {}
type Constructor = abstract new (...args: unknown[]) => object;
const fakeHandlebarsApplicationMixin = <T extends Constructor>(Base: T): T => class extends Base {} as T;

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

(globalThis as Record<string, unknown>).game = {
    i18n: {
        localize: (key: string) => key,
        format: (key: string) => key,
    },
    user: { isGM: true },
    packs: new Map(),
};

(globalThis as Record<string, unknown>).foundry = {
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

(globalThis as Record<string, unknown>).ui = {
    notifications: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    },
};

afterAll(() => {
    (globalThis as Record<string, unknown>).game = ORIGINAL_GAME;
    (globalThis as Record<string, unknown>).foundry = ORIGINAL_FOUNDRY;
    (globalThis as Record<string, unknown>).ui = ORIGINAL_UI;
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
});

describe('OriginPathBuilder preview action', () => {
    it('previews a normalized origin card without throwing', () => {
        const origin = makeOrigin();
        const host = makeBuilderHost();
        host.allOrigins = [origin];

        OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard.call(host, new Event('click'), makeTarget(origin));

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

        OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard.call(host, new Event('click'), makeTarget(origin));

        expect(host.previewedOrigin).toBe(confirmed);
        expect(host._itemToSelectionData).not.toHaveBeenCalled();
        expect(host.render).toHaveBeenCalledTimes(1);
    });

    it('warns and does not render when the clicked origin is disabled', () => {
        const origin = makeOrigin();
        const host = makeBuilderHost();
        host.allOrigins = [origin];

        OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard.call(host, new Event('click'), makeTarget(origin, true));

        expect(host.previewedOrigin).toBeNull();
        expect(host.render).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith('WH40K.OriginPath.OriginNotAvailable');
    });
});
