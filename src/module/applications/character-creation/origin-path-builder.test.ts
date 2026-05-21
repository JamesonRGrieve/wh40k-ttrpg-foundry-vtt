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
    // Test fixture mirrors the real DH2 GENERATION_CHARACTERISTICS map so
    // _collectAvailableAptitudePool's characteristic-only filter (#216) has a
    // realistic registry to compare against.
    getAllCharacteristicDisplayInfo: () => ({
        weaponSkill: { label: 'Weapon Skill', short: 'WS' },
        ballisticSkill: { label: 'Ballistic Skill', short: 'BS' },
        strength: { label: 'Strength', short: 'S' },
        toughness: { label: 'Toughness', short: 'T' },
        agility: { label: 'Agility', short: 'Ag' },
        intelligence: { label: 'Intelligence', short: 'Int' },
        perception: { label: 'Perception', short: 'Per' },
        willpower: { label: 'Willpower', short: 'WP' },
        fellowship: { label: 'Fellowship', short: 'Fel' },
        influence: { label: 'Influence', short: 'Inf' },
    }),
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

function makeBuilderHost(): {
    actor: { id: string };
    allOrigins: TestOrigin[];
    lineageOrigins: TestOrigin[];
    previewedOrigin: TestOrigin | null;
    render: ReturnType<typeof vi.fn>;
    _findConfirmedSelectionMatching: ReturnType<typeof vi.fn>;
    _itemToSelectionData: typeof OriginPathBuilder.prototype._itemToSelectionData;
} {
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

/**
 * Issue #198 regression: selecting any Home World / Background / Role / Elite
 * Advance card threw "item.toObject is not a function" because the cards loaded
 * from `allOrigins` / `lineageOrigins` are normalized POJOs (no `toObject()`),
 * but `_itemToSelectionData` invoked `.toObject()` unconditionally.
 *
 * All four selection types share one dispatch:
 *   selectOriginCard action → #previewOriginCard → _itemToSelectionData(origin)
 * The only difference between them is the `step`/`stepIndex` value, and whether
 * the card is sourced from `allOrigins` (core steps) or `lineageOrigins` (the
 * optional Elite Advance step). The total `hasToObject` guard must keep ALL
 * four paths from throwing.
 */
describe('OriginPathBuilder selection dispatch is total across all four steps (issue #198)', () => {
    interface StepCase {
        label: string;
        step: string;
        stepIndex: number;
        identifier: string;
        lineage: boolean;
    }

    const STEP_CASES: StepCase[] = [
        { label: 'Home World', step: 'homeWorld', stepIndex: 1, identifier: 'void-born', lineage: false },
        { label: 'Background', step: 'background', stepIndex: 2, identifier: 'imperial-guard', lineage: false },
        { label: 'Role', step: 'role', stepIndex: 3, identifier: 'warrior', lineage: false },
        // Elite Advance is the optional step → cards live in `lineageOrigins`.
        { label: 'Elite Advance', step: 'elite', stepIndex: 4, identifier: 'psyker', lineage: true },
    ];

    for (const sc of STEP_CASES) {
        it(`previews a ${sc.label} card (normalized POJO, no toObject) without throwing`, () => {
            const origin = makeOrigin({
                id: `origin-${sc.identifier}`,
                uuid: `Compendium.wh40k-rpg.origin-paths.origin-${sc.identifier}`,
                name: sc.label,
                step: sc.step,
                stepIndex: sc.stepIndex,
                identifier: sc.identifier,
                system: {
                    step: sc.step,
                    stepIndex: sc.stepIndex,
                    identifier: sc.identifier,
                    selectedChoices: {},
                    rollResults: {},
                },
            });
            const host = makeBuilderHost();
            if (sc.lineage) {
                host.lineageOrigins = [origin];
            } else {
                host.allOrigins = [origin];
            }

            expect(() =>
                OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard.call(
                    host as unknown as InstanceType<typeof OriginPathBuilder>,
                    new Event('click'),
                    makeTarget(origin),
                ),
            ).not.toThrow();

            expect(host.previewedOrigin?.name).toBe(sc.label);
            expect(host.previewedOrigin?.system['step']).toBe(sc.step);
            expect(host.render).toHaveBeenCalledTimes(1);
        });

        it(`_itemToSelectionData converts a ${sc.label} POJO without invoking toObject`, () => {
            const builder = { actor: { id: 'actor-1' } };
            const origin = makeOrigin({
                id: `origin-${sc.identifier}`,
                uuid: `Compendium.wh40k-rpg.origin-paths.origin-${sc.identifier}`,
                name: sc.label,
                step: sc.step,
                stepIndex: sc.stepIndex,
                identifier: sc.identifier,
                system: { step: sc.step, stepIndex: sc.stepIndex, identifier: sc.identifier },
            });

            let normalized: ReturnType<typeof OriginPathBuilder.prototype._itemToSelectionData> | undefined;
            expect(() => {
                normalized = OriginPathBuilder.prototype._itemToSelectionData.call(builder, origin);
            }).not.toThrow();

            expect(normalized?.name).toBe(sc.label);
            // Plain-object branch: _sourceUuid falls back to the POJO's own uuid.
            expect(normalized?._sourceUuid).toBe(`Compendium.wh40k-rpg.origin-paths.origin-${sc.identifier}`);
            expect(normalized?._actorItemId).toBeNull();
        });
    }

    it('still routes a real Item document through the toObject() branch', () => {
        const builder = { actor: { id: 'actor-doc' } };
        const toObject = vi.fn(() => ({
            name: 'Forge World',
            img: 'icons/svg/d20.svg',
            system: { step: 'homeWorld', stepIndex: 1, identifier: 'forge-world' },
        }));
        const fakeItemDocument = {
            toObject,
            flags: { core: { sourceId: 'Compendium.wh40k-rpg.origin-paths.forge-world' } },
            parent: { id: 'other-actor' },
            id: 'embedded-1',
            uuid: 'Actor.x.Item.embedded-1',
        };

        const normalized = OriginPathBuilder.prototype._itemToSelectionData.call(
            builder as unknown as InstanceType<typeof OriginPathBuilder>,
            fakeItemDocument as never,
        );

        expect(toObject).toHaveBeenCalledTimes(1);
        expect(normalized.name).toBe('Forge World');
        // Not parented to this.actor → _sourceUuid resolves from item.uuid.
        expect(normalized._sourceUuid).toBe('Actor.x.Item.embedded-1');
        expect(normalized._actorItemId).toBeNull();
    });
});

describe('OriginPathBuilder rollDivination (issue #199)', () => {
    function makeDivinationHost(): { _divination: string; _saveScrollPosition: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> } {
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
            equipmentSelections: new Map<string>(),
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
            equipmentSelections: new Map<string>(),
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

    function makeCountHost(selections: Array<[string, AptSelection]>): {
        selections: Map<string, AptSelection>;
        _getSelectionSystem: (s: AptSelection) => AptSelection['system'];
        _collectAptitudeChoices: typeof OriginPathBuilder.prototype._collectAptitudeChoices;
        _selectionGrantedAptitudes: typeof OriginPathBuilder.prototype._selectionGrantedAptitudes;
    } {
        return {
            selections: new Map(selections),
            _getSelectionSystem: (s: AptSelection) => s.system,
            _collectAptitudeChoices: OriginPathBuilder.prototype._collectAptitudeChoices,
            _selectionGrantedAptitudes: OriginPathBuilder.prototype._selectionGrantedAptitudes,
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

/**
 * Root-predicate coverage for the two coupled aptitude-duplicate bugs:
 *  - #205: a step that re-grants an aptitude the character already has (or
 *          another selection grants) MUST warn — including when the two
 *          spellings differ only by case/whitespace.
 *  - #215: a freshly-opened builder on a character that already has committed
 *          origin steps must NOT report a phantom collision — the actor's
 *          derived `system.aptitudes` is the same single grant the builder's
 *          own loaded selection re-emits, not a real duplicate.
 *
 * `_getAptitudeCollisions` is the single comparison/normalisation function used
 * by both the warning banner (`_calculatePreview`) and the commit-time
 * doubling guard, so it is exercised directly with a minimal host.
 */
describe('OriginPathBuilder._getAptitudeCollisions (issues #205 & #215)', () => {
    // A selection carries `_actorItemId` when `_itemToSelectionData` loaded it
    // from an origin item already committed on the actor. The actor's derived
    // `system.aptitudes` comes from those committed items, so a committed-step
    // selection's grants must be subtracted from "existing" (#215) while a
    // freshly-picked step (no `_actorItemId`) must NOT be (#205).
    type AptSel = {
        system: { grants?: Record<string, unknown>; selectedChoices?: Record<string, string[]> };
        _actorItemId?: string | null;
    };

    function makeCollisionHost(opts: { selections: Array<[string, AptSel]>; actorAptitudes?: string[]; overrides?: Map<string, string> }): {
        selections: Map<string, AptSel>;
        actor: { system: { aptitudes: string[] } };
        aptitudeOverrides: Map<string, string>;
        _getSelectionSystem: (s: AptSel) => AptSel['system'];
        _collectAptitudeChoices: typeof OriginPathBuilder.prototype._collectAptitudeChoices;
        _selectionGrantedAptitudes: typeof OriginPathBuilder.prototype._selectionGrantedAptitudes;
        _collectAptitudeGrantCounts: typeof OriginPathBuilder.prototype._collectAptitudeGrantCounts;
        _collectExistingAptitudes: typeof OriginPathBuilder.prototype._collectExistingAptitudes;
        _lookupAptitudeOverride: typeof OriginPathBuilder.prototype._lookupAptitudeOverride;
        _aptitudeKey: typeof OriginPathBuilder.prototype._aptitudeKey;
    } {
        const proto = OriginPathBuilder.prototype;
        return {
            selections: new Map(opts.selections),
            actor: { system: { aptitudes: opts.actorAptitudes ?? [] } },
            aptitudeOverrides: opts.overrides ?? new Map<string, string>(),
            _getSelectionSystem: (s: AptSel) => s.system,
            _collectAptitudeChoices: proto._collectAptitudeChoices,
            _selectionGrantedAptitudes: proto._selectionGrantedAptitudes,
            _collectAptitudeGrantCounts: proto._collectAptitudeGrantCounts,
            _collectExistingAptitudes: proto._collectExistingAptitudes,
            _lookupAptitudeOverride: proto._lookupAptitudeOverride,
            _aptitudeKey: proto._aptitudeKey,
        };
    }

    /** A selection seeded from a committed actor origin item. */
    function committed(grants: Record<string, unknown>, selectedChoices: Record<string, string[]> = {}, id = 'actor-item'): AptSel {
        return { system: { grants, selectedChoices }, _actorItemId: id };
    }
    /** A selection the player just picked this session (not yet committed). */
    function picked(grants: Record<string, unknown>, selectedChoices: Record<string, string[]> = {}): AptSel {
        return { system: { grants, selectedChoices }, _actorItemId: null };
    }

    function collisions(host: ReturnType<typeof makeCollisionHost>): { original: string; replacement: string | null }[] {
        return OriginPathBuilder.prototype._getAptitudeCollisions.call(host as unknown as InstanceType<typeof OriginPathBuilder>);
    }

    // ---- #215 — no phantom collision on a pre-existing character ----

    it('#215: does NOT warn when the only "existing" aptitudes come from the builder\'s own committed selections', () => {
        // Builder opened on a character with a committed Home World step.
        // _initializeFromActor seeded this selection from that committed item;
        // the character DataModel derived system.aptitudes from the same item.
        const host = makeCollisionHost({
            selections: [['homeWorld', committed({ aptitudes: ['Willpower', 'Offence'] })]],
            actorAptitudes: ['Willpower', 'Offence'],
        });
        expect(collisions(host)).toEqual([]);
    });

    it('#215: does NOT warn on a committed aptitude-typed choice already reflected in the actor', () => {
        const host = makeCollisionHost({
            selections: [
                ['background', committed({ choices: [{ type: 'aptitude', label: 'Aptitude', options: [{ value: 'Tech' }] }] }, { Aptitude: ['Tech'] })],
            ],
            actorAptitudes: ['Tech'],
        });
        expect(collisions(host)).toEqual([]);
    });

    it('#215: multi-step committed character (the screenshot case) → no phantom banner on open', () => {
        // Several committed steps; actor.system.aptitudes mirrors all of them.
        // Before the fix every one of these reported "duplicate aptitude
        // detected" and Reset All was the only escape.
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', committed({ aptitudes: ['Willpower'] }, {}, 'i1')],
                ['background', committed({ aptitudes: ['Tech'] }, {}, 'i2')],
                ['role', committed({ aptitudes: ['Finesse', 'Offence'] }, {}, 'i3')],
            ],
            actorAptitudes: ['Willpower', 'Tech', 'Finesse', 'Offence'],
        });
        expect(collisions(host)).toEqual([]);
    });

    it('#215: empty actor + single non-duplicated picked selection → no collision', () => {
        const host = makeCollisionHost({
            selections: [['homeWorld', picked({ aptitudes: ['Awareness', 'Fellowship'] })]],
            actorAptitudes: [],
        });
        expect(collisions(host)).toEqual([]);
    });

    // ---- #205 — real duplicates DO warn ----

    it('#205: warns when two distinct selections grant the same aptitude', () => {
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Willpower'] })],
                ['background', picked({ aptitudes: ['Willpower'] })],
            ],
            actorAptitudes: [],
        });
        const out = collisions(host);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ original: 'Willpower', replacement: null });
    });

    it('#205: warns across case/whitespace variants from different origins (was silently allowed)', () => {
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Willpower'] })],
                ['background', picked({ aptitudes: ['  willpower '] })],
            ],
            actorAptitudes: [],
        });
        const out = collisions(host);
        expect(out).toHaveLength(1);
        // First literal spelling seen is preserved for the banner.
        expect(out[0]?.original).toBe('Willpower');
    });

    it('#205: warns when a freshly-picked step re-grants a genuine pre-existing aptitude — case-insensitively', () => {
        // 'Tech' is genuinely pre-existing (GM hand-add: on actor, NOT backed
        // by any committed selection here). A just-picked Background step
        // grants 'tech' — that doubles it; warn. 'Offence' is committed +
        // self-sourced so it nets out (no warn).
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', committed({ aptitudes: ['Offence'] }, {}, 'i1')],
                ['background', picked({ aptitudes: ['tech'] })],
            ],
            actorAptitudes: ['Tech', 'Offence'],
        });
        const out = collisions(host);
        expect(out.map((c) => c.original)).toEqual(['tech']);
    });

    it('#205: distinct aptitudes including tricky near-matches do NOT warn', () => {
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Weapon Skill'] })],
                ['background', picked({ aptitudes: ['Ballistic Skill'] })],
                ['role', picked({ aptitudes: ['Tech', 'Toughness'] })],
            ],
            actorAptitudes: [],
        });
        expect(collisions(host)).toEqual([]);
    });

    it('#205: a free-choice aptitude slot resolving to a duplicate warns', () => {
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Fellowship'] })],
                [
                    'background',
                    picked(
                        { choices: [{ type: 'aptitude', label: 'Aptitude', options: [{ value: 'Fellowship' }, { value: 'Toughness' }] }] },
                        { Aptitude: ['Fellowship'] },
                    ),
                ],
            ],
            actorAptitudes: [],
        });
        const out = collisions(host);
        expect(out).toHaveLength(1);
        expect(out[0]?.original).toBe('Fellowship');
    });

    it('#205: a free-choice aptitude slot resolving to a distinct aptitude does NOT warn', () => {
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Fellowship'] })],
                [
                    'background',
                    picked(
                        { choices: [{ type: 'aptitude', label: 'Aptitude', options: [{ value: 'Fellowship' }, { value: 'Toughness' }] }] },
                        { Aptitude: ['Toughness'] },
                    ),
                ],
            ],
            actorAptitudes: [],
        });
        expect(collisions(host)).toEqual([]);
    });

    it('#205: an override recorded under a different casing still resolves the collision', () => {
        const host = makeCollisionHost({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Willpower'] })],
                ['background', picked({ aptitudes: ['willpower'] })],
            ],
            actorAptitudes: [],
            overrides: new Map([['WILLPOWER', 'Tech']]),
        });
        const out = collisions(host);
        expect(out).toHaveLength(1);
        // Collision still listed, but resolved (replacement set) → banner clears.
        expect(out[0]).toMatchObject({ original: 'Willpower', replacement: 'Tech' });
    });
});

describe('OriginPathBuilder._normalizeAptitudeIdentity (#205)', () => {
    it('canonicalises case and collapses whitespace', () => {
        const n = OriginPathBuilder._normalizeAptitudeIdentity;
        expect(n('Willpower')).toBe(n('  willpower '));
        expect(n('Weapon  Skill')).toBe(n('weapon skill'));
        expect(n('Weapon Skill')).not.toBe(n('Ballistic Skill'));
    });
});

describe('OriginPathBuilder._collectAvailableAptitudePool (#205, #216)', () => {
    it('excludes taken aptitudes by canonical identity and restricts to characteristic aptitudes (#216)', () => {
        const proto = OriginPathBuilder.prototype;
        const mkOrigin = (apts: string[]): { system: { grants: { aptitudes: string[] } } } => ({ system: { grants: { aptitudes: apts } } });
        const host = {
            allOrigins: [mkOrigin(['Willpower', 'willpower ', 'Tech', 'Offence', 'Strength', 'Fellowship'])],
            lineageOrigins: [],
            _getSelectionSystem: (o: { system: unknown }) => o.system,
            _aptitudeKey: proto._aptitudeKey,
        };
        const pool = proto._collectAvailableAptitudePool.call(host as unknown as InstanceType<typeof OriginPathBuilder>, new Set<string>(['  WILLPOWER']));
        // 'Willpower' excluded by the taken set; 'Tech' / 'Offence' filtered
        // out because they are NOT characteristic aptitudes; 'Strength' and
        // 'Fellowship' kept. The fallback top-up adds the other six
        // characteristic aptitudes that weren't mined from origins.
        expect(pool).toContain('Strength');
        expect(pool).toContain('Fellowship');
        expect(pool).not.toContain('Tech');
        expect(pool).not.toContain('Offence');
        expect(pool).not.toContain('Willpower');
        // Every entry must be one of the nine generation characteristics.
        const allowed = new Set([
            'Weapon Skill',
            'Ballistic Skill',
            'Strength',
            'Toughness',
            'Agility',
            'Intelligence',
            'Perception',
            'Willpower',
            'Fellowship',
        ]);
        for (const apt of pool) expect(allowed.has(apt)).toBe(true);
    });

    it('(#216) falls back to the full characteristic registry when origins reference no characteristic aptitudes', () => {
        const proto = OriginPathBuilder.prototype;
        const host = {
            // Only non-characteristic aptitudes referenced by origins.
            allOrigins: [{ system: { grants: { aptitudes: ['Tech', 'Offence', 'Knowledge'] } } }],
            lineageOrigins: [],
            _getSelectionSystem: (o: { system: unknown }) => o.system,
            _aptitudeKey: proto._aptitudeKey,
        };
        const pool = proto._collectAvailableAptitudePool.call(host as unknown as InstanceType<typeof OriginPathBuilder>, new Set<string>());
        // Pool should still contain every characteristic aptitude, sorted.
        expect(pool).toEqual(['Agility', 'Ballistic Skill', 'Fellowship', 'Intelligence', 'Perception', 'Strength', 'Toughness', 'Weapon Skill', 'Willpower']);
    });

    it('(#216) excludes Influence (resource char, not a generation char)', () => {
        const proto = OriginPathBuilder.prototype;
        const host = {
            allOrigins: [{ system: { grants: { aptitudes: ['Influence', 'Strength'] } } }],
            lineageOrigins: [],
            _getSelectionSystem: (o: { system: unknown }) => o.system,
            _aptitudeKey: proto._aptitudeKey,
        };
        const pool = proto._collectAvailableAptitudePool.call(host as unknown as InstanceType<typeof OriginPathBuilder>, new Set<string>());
        expect(pool).not.toContain('Influence');
        expect(pool).toContain('Strength');
    });
});

/**
 * Issue #216 — "Duplicate aptitude option still displays as a requirement
 * even if it is selected".
 *
 * Root cause: `_calculatePreview` emitted every collision into
 * `preview.aptitudeCollisions`; the template's banner keyed on
 * `aptitudeCollisions.length` (any collision, resolved or not), so a
 * collision the player had already swapped via the chooser still rendered
 * under the warning banner as an outstanding requirement until the builder
 * closed.
 *
 * Fix: derive two filtered lists on the preview —
 * `unresolvedAptitudeCollisions` (drives the warning banner) and
 * `resolvedAptitudeCollisions` (drives a neutral "applied swap" sub-section
 * with a Change affordance). Banner now only displays for genuinely
 * outstanding requirements.
 */
describe('OriginPathBuilder._calculatePreview aptitude collision split (issue #216)', () => {
    /**
     * Drive _calculatePreview through the same minimal host pattern the rest
     * of the file uses, returning just the four collision-related fields.
     */
    async function previewCollisions(opts: {
        selections: Array<[string, { system: { grants?: Record<string, unknown>; selectedChoices?: Record<string, string[]> }; _actorItemId?: string | null }]>;
        actorAptitudes?: string[];
        overrides?: Map<string, string>;
    }): Promise<{
        aptitudeCollisions: { original: string; replacement: string | null }[];
        unresolvedAptitudeCollisions: { original: string; replacement: string | null }[];
        resolvedAptitudeCollisions: { original: string; replacement: string | null }[];
        hasUnresolvedAptitudeCollision: boolean;
    }> {
        const proto = OriginPathBuilder.prototype;
        const host = {
            selections: new Map(opts.selections),
            actor: { system: { aptitudes: opts.actorAptitudes ?? [] } },
            aptitudeOverrides: opts.overrides ?? new Map<string, string>(),
            // Preview pipeline dependencies; stubbed so the bare minimum runs.
            systemConfig: { getOriginStepConfig: () => ({ coreSteps: [], optionalStep: null, equipmentStep: null }) },
            allOrigins: [],
            lineageOrigins: [],
            // The methods _calculatePreview reaches transitively.
            _getSelectionSystem: (s: { system: unknown }) => s.system,
            _collectAptitudeChoices: proto._collectAptitudeChoices,
            _selectionGrantedAptitudes: proto._selectionGrantedAptitudes,
            _collectAptitudeGrantCounts: proto._collectAptitudeGrantCounts,
            _collectExistingAptitudes: proto._collectExistingAptitudes,
            _lookupAptitudeOverride: proto._lookupAptitudeOverride,
            _aptitudeKey: proto._aptitudeKey,
            _getAptitudeCollisions: proto._getAptitudeCollisions,
            _applyChoiceGrantsToPreview: async () => {
                /* no choice grants in this test fixture */
            },
            _addTalentModifiers: async () => {
                /* no talent modifier resolution needed */
            },
            _findSkillUuid: () => null,
            _prepareGrantTooltipData: async () => null,
        };
        const preview = await proto._calculatePreview.call(host as unknown as InstanceType<typeof OriginPathBuilder>);
        return {
            aptitudeCollisions: preview.aptitudeCollisions,
            unresolvedAptitudeCollisions: preview.unresolvedAptitudeCollisions,
            resolvedAptitudeCollisions: preview.resolvedAptitudeCollisions,
            hasUnresolvedAptitudeCollision: preview.hasUnresolvedAptitudeCollision,
        };
    }

    const picked = (
        grants: Record<string, unknown>,
        selectedChoices: Record<string, string[]> = {},
    ): { system: { grants: Record<string, unknown>; selectedChoices: Record<string, string[]> }; _actorItemId: null } => ({
        system: { grants, selectedChoices },
        _actorItemId: null,
    });

    it('reproduces the bug: an unresolved collision lands in unresolvedAptitudeCollisions only', async () => {
        const out = await previewCollisions({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Willpower'] })],
                ['background', picked({ aptitudes: ['Willpower'] })],
            ],
        });
        expect(out.unresolvedAptitudeCollisions).toHaveLength(1);
        expect(out.unresolvedAptitudeCollisions[0]).toMatchObject({ original: 'Willpower', replacement: null });
        expect(out.resolvedAptitudeCollisions).toEqual([]);
        expect(out.hasUnresolvedAptitudeCollision).toBe(true);
    });

    it('post-select: a resolved collision moves OUT of unresolved and INTO resolved (this is the #216 fix)', async () => {
        const out = await previewCollisions({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Willpower'] })],
                ['background', picked({ aptitudes: ['Willpower'] })],
            ],
            overrides: new Map([['Willpower', 'Strength']]),
        });
        // Banner data-source must be empty so the warning banner no longer
        // renders — this is the exact assertion the bug report demanded.
        expect(out.unresolvedAptitudeCollisions).toEqual([]);
        expect(out.hasUnresolvedAptitudeCollision).toBe(false);
        // The resolved entry is still tracked so the player can Change it.
        expect(out.resolvedAptitudeCollisions).toHaveLength(1);
        expect(out.resolvedAptitudeCollisions[0]).toEqual({ original: 'Willpower', replacement: 'Strength' });
        // Legacy `aptitudeCollisions` still carries everything for any caller
        // that wants the combined list.
        expect(out.aptitudeCollisions).toHaveLength(1);
    });

    it('mixed: two collisions, one resolved one not — banner shows only the unresolved', async () => {
        const out = await previewCollisions({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Willpower', 'Fellowship'] })],
                ['background', picked({ aptitudes: ['Willpower'] })],
                ['role', picked({ aptitudes: ['Fellowship'] })],
            ],
            overrides: new Map([['Willpower', 'Strength']]),
        });
        expect(out.unresolvedAptitudeCollisions.map((c) => c.original)).toEqual(['Fellowship']);
        expect(out.resolvedAptitudeCollisions.map((c) => c.original)).toEqual(['Willpower']);
        expect(out.hasUnresolvedAptitudeCollision).toBe(true);
    });

    it('treats an empty-string replacement as still-unresolved (player closed the picker without choosing)', async () => {
        const out = await previewCollisions({
            selections: [
                ['homeWorld', picked({ aptitudes: ['Willpower'] })],
                ['background', picked({ aptitudes: ['Willpower'] })],
            ],
            overrides: new Map([['Willpower', '']]),
        });
        // '' is the "explicitly skipped" sentinel — still requires action.
        expect(out.unresolvedAptitudeCollisions).toHaveLength(1);
        expect(out.resolvedAptitudeCollisions).toEqual([]);
    });
});

/**
 * Issue #214 — "First time origin path on already generated character creates
 * negative xp".
 *
 * An already-generated character carries XP-purchased advances recorded in two
 * places per advance: the `.advance` rank AND a paired `.cost`, plus a running
 * `system.experience.used` total (see AdvancementDialog#purchaseCharacteristic).
 *
 * Two accounting failures combined to drive `available = total - used`
 * negative on the first origin-path commit:
 *
 *  A. The reset zeroed `.advance` but left every paired `.cost` orphaned, so
 *     `_computeExperienceSpent`'s `calculatedTotal` and the auto-opened
 *     Advancement Dialog kept pricing from a corrupt baseline.
 *  B. The experience reset rode in the SAME atomic `actor.update()` payload as
 *     the bulk `system.skills.<k>.entries` array replacements. On an
 *     already-generated character those entries fail V14 strict array
 *     validation, so Foundry rejected the WHOLE update — `experience.used`
 *     stayed at the pre-origin spend while `total` was meant to drop to
 *     `startingXP`, yielding negative available XP.
 *
 * These tests build a host that drives `_resetExperienceAndAdvancements`
 * directly with a fake actor whose `update()` mutates a backing system object.
 */
describe('OriginPathBuilder._resetExperienceAndAdvancements (issue #214)', () => {
    interface FakeExperience {
        total: number;
        used: number;
    }
    interface FakeSystem {
        experience: FakeExperience;
        characteristics: Record<string, { advance: number; cost: number }>;
        skills: Record<string, { advance: number; cost: number; entries?: Array<Record<string, unknown>> }>;
    }

    /**
     * @param opts.rejectEntryWrites - simulate Foundry V14 strict validation
     *        rejecting any update payload that contains a `system.skills.*.entries`
     *        array (the pre-fix non-atomic-write failure mode).
     */
    function makeResetHost(
        system: FakeSystem,
        opts: { rejectEntryWrites?: boolean; dropFirstUsedWrite?: boolean } = {},
    ): InstanceType<typeof OriginPathBuilder> {
        let call = 0;
        const actor = {
            system,
            update: vi.fn(async (payload: Record<string, unknown>) => {
                call += 1;
                const hasEntryWrite = Object.keys(payload).some((k) => /^system\.skills\..+\.entries$/.test(k));
                if (opts.rejectEntryWrites === true && hasEntryWrite) {
                    // Foundry rejects the ENTIRE atomic update — nothing applies.
                    throw new Error('V14 strict validation: invalid skill entries array');
                }
                // Simulate the experience-reset write only partially landing
                // (the `used` path silently dropped) so a stale `used` survives
                // above the post-reset `total` — exercises the clamp guard.
                if (opts.dropFirstUsedWrite === true && call === 1) {
                    delete payload['system.experience.used'];
                }
                for (const [path, value] of Object.entries(payload)) {
                    const parts = path.split('.').slice(1); // drop leading "system"
                    let cursor: Record<string, unknown> = system as unknown as Record<string, unknown>;
                    for (let i = 0; i < parts.length - 1; i++) {
                        cursor = cursor[parts[i]!] as Record<string, unknown>;
                    }
                    cursor[parts[parts.length - 1]!] = value;
                }
                return actor;
            }),
        };
        return {
            actor,
            registryConfig: { startingXP: 1000 },
            _actorSys: () => system,
            _resetExperienceAndAdvancements: OriginPathBuilder.prototype._resetExperienceAndAdvancements,
        } as unknown as InstanceType<typeof OriginPathBuilder>;
    }

    function generatedCharacter(): FakeSystem {
        // Built via the Advancement Dialog: 1500 XP spent across WS + skills,
        // total topped up to 2000 by play awards.
        return {
            experience: { total: 2000, used: 1500 },
            characteristics: {
                weaponSkill: { advance: 3, cost: 750 },
                ballisticSkill: { advance: 1, cost: 250 },
                strength: { advance: 0, cost: 0 },
                toughness: { advance: 0, cost: 0 },
                agility: { advance: 0, cost: 0 },
                intelligence: { advance: 0, cost: 0 },
                perception: { advance: 0, cost: 0 },
                willpower: { advance: 0, cost: 0 },
                fellowship: { advance: 0, cost: 0 },
            },
            skills: {
                dodge: { advance: 2, cost: 400 },
                awareness: { advance: 1, cost: 100 },
                commonLore: {
                    advance: 0,
                    cost: 0,
                    entries: [{ name: 'Imperium', advance: 1, cost: 100, trained: true, current: 35 }],
                },
            },
        };
    }

    it('reproduces the pre-fix scenario: reset clears advances AND their paired costs', async () => {
        const system = generatedCharacter();
        const host = makeResetHost(system);

        await host._resetExperienceAndAdvancements();

        // Experience is fully reset to a clean slate.
        expect(system.experience.total).toBe(1000);
        expect(system.experience.used).toBe(0);

        // Every advance AND its paired cost is zeroed — no orphaned `.cost`
        // left to corrupt calculatedTotal / the Advancement Dialog re-pricing.
        for (const c of Object.values(system.characteristics)) {
            expect(c.advance).toBe(0);
            expect(c.cost).toBe(0);
        }
        for (const s of Object.values(system.skills)) {
            expect(s.advance).toBe(0);
            expect(s.cost).toBe(0);
            for (const e of s.entries ?? []) {
                expect(e['advance']).toBe(0);
                expect(e['cost']).toBe(0);
            }
        }
    });

    it('available XP (total - used) is non-negative and equals startingXP after reset', async () => {
        const system = generatedCharacter();
        const host = makeResetHost(system);

        await host._resetExperienceAndAdvancements();

        const available = system.experience.total - system.experience.used;
        expect(available).toBe(1000);
        expect(available).toBeGreaterThanOrEqual(0);
    });

    it('zeroes experience even when the bulk skill-entries write is rejected by V14 validation', async () => {
        const system = generatedCharacter();
        // Pre-fix: the experience reset shared one atomic update with the
        // entries array write, so this rejection stranded `used` at 1500
        // against a `total` meant to drop to startingXP → negative XP.
        const host = makeResetHost(system, { rejectEntryWrites: true });

        await expect(host._resetExperienceAndAdvancements()).rejects.toThrow();

        // The experience reset is now its own update committed FIRST, so it
        // landed before the entries write threw: available is never negative.
        expect(system.experience.total).toBe(1000);
        expect(system.experience.used).toBe(0);
        expect(system.experience.total - system.experience.used).toBeGreaterThanOrEqual(0);
    });

    it('is idempotent — re-applying the reset on an already-reset character changes nothing', async () => {
        const system = generatedCharacter();
        const host = makeResetHost(system);

        await host._resetExperienceAndAdvancements();
        const firstPass = structuredClone(system);
        await host._resetExperienceAndAdvancements();

        expect(system).toEqual(firstPass);
        expect(system.experience).toEqual({ total: 1000, used: 0 });
    });

    it('defensively clamps used <= total if some external state slipped through', async () => {
        const system = generatedCharacter();
        // The experience-reset write only partially lands (`used` dropped),
        // leaving the stale 1500 against the reset total of 1000.
        const host = makeResetHost(system, { dropFirstUsedWrite: true });

        await host._resetExperienceAndAdvancements();

        expect(system.experience.total).toBe(1000);
        // Clamp step pulled used back down to total — available is exactly 0,
        // never negative ("nothing can be bought" no longer occurs).
        expect(system.experience.used).toBeLessThanOrEqual(system.experience.total);
        expect(system.experience.total - system.experience.used).toBeGreaterThanOrEqual(0);
    });
});
