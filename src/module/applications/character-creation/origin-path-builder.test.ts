import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApplicationV2Api, FakeApplicationV2, type Constructor } from '../../testing/app-v2-stub.ts';

/**
 * Structural shape of every `globalThis` member this suite stubs. The runtime
 * globals (`game`, `foundry`, `ui`, `Roll`) are strongly typed by fvtt-types,
 * so the suite reaches them through a single typed view rather than scattering
 * `globalThis as Record<string, unknown>` casts — the stub interfaces below ARE
 * the validated boundary shape, exactly what the production globals expose to
 * the methods under test.
 */
interface I18nStub {
    localize: (key: string) => string;
    format: (key: string, data?: Record<string, string>) => string;
}
/** A populated/empty RollTable as `rollDivination` reads it. */
interface RollTableStub {
    results: { size: number } | Array<{ text?: string }>;
    draw?: () => Promise<{ results: Array<{ text?: string }> }>;
}
interface CompendiumPackStub {
    metadata: { id: string; name: string };
    documentName: string;
}
type PacksStub = Map<string, CompendiumPackStub> & { find?: (predicate: (pack: CompendiumPackStub) => boolean) => CompendiumPackStub | undefined };
interface GameStub {
    i18n: I18nStub;
    user: { isGM: boolean };
    packs: PacksStub;
    // `| undefined` is explicit (not just optional) so the `g.tables = undefined`
    // reset assigns cleanly under exactOptionalPropertyTypes.
    tables: { getName: (name: string) => RollTableStub | undefined } | undefined;
}
/** The reset-choices payload `#commit` resolves from the confirm dialog. */
interface CommitResetChoices {
    resetInventory: boolean;
    resetExperience: boolean;
    resetInjuries: boolean;
    resetCurrency: boolean;
}
interface FoundryStub {
    applications: {
        api: {
            ApplicationV2: typeof FakeApplicationV2;
            HandlebarsApplicationMixin: <T extends Constructor>(Base: T) => T;
            DialogV2?: { prompt: (...args: never[]) => Promise<CommitResetChoices | null> };
        };
    };
    abstract: { DataModel: new () => object };
    utils: { deepClone: <T>(value: T) => T };
}
interface UiStub {
    notifications: { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
}
interface GlobalStubs {
    game: GameStub;
    foundry: FoundryStub;
    ui: UiStub;
    Roll: typeof FakeRoll;
}

/**
 * Typed view over `globalThis` for the four stubbed members. fvtt-types declares
 * these as non-optional globals, so a `Partial` view lets the suite read/restore
 * them (they are `undefined` outside Foundry) without a `Record` cast.
 */
const stubHost = globalThis as typeof globalThis & Partial<GlobalStubs>;

const ORIGINAL_GAME = stubHost.game;
const ORIGINAL_FOUNDRY = stubHost.foundry;
const ORIGINAL_UI = stubHost.ui;
const ORIGINAL_ROLL = stubHost.Roll;

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
        // Deterministic generation primitives for the point-buy / roll suites.
        // Base = 20 (offset 0); pool = 100. These mirror the production
        // defaults so the pure-logic assertions read in real units.
        getCharacteristicBase: () => 20,
        getCharacteristicPointBuyPool: () => 100,
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

class FakeRoll {
    total: number;
    constructor(public formula: string) {
        this.total = 42;
    }
    async evaluate(): Promise<this> {
        return Promise.resolve(this);
    }
}

/**
 * The installed stubs, kept as `GlobalStubs`-typed handles. fvtt-types declares
 * the four globals as intersection types (`typeof ApplicationV2 & ...`) that no
 * hand-built fake satisfies by direct assignment — the genuine framework
 * boundary. Tests read these typed handles instead of `globalThis.foundry` etc.
 * (which resolve to the intersected real-global types), so the stubbed surface
 * stays validated against `GlobalStubs` rather than fought through casts.
 */
const STUBS: GlobalStubs = {
    game: {
        i18n: {
            localize: (key: string) => key,
            format: (key: string) => key,
        },
        user: { isGM: true },
        packs: new Map<string, CompendiumPackStub>(),
        tables: undefined,
    },
    foundry: {
        applications: {
            api: buildApplicationV2Api(),
        },
        abstract: {
            DataModel: class {},
        },
        utils: {
            deepClone: <T>(value: T): T => structuredClone(value),
        },
    },
    ui: {
        notifications: {
            warn: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
        },
    },
    Roll: FakeRoll,
};
// `Object.assign` widens the assignment target so the stub shapes can be
// installed onto the strongly-typed globals without per-member casts.
Object.assign(globalThis, STUBS);

afterAll(() => {
    Object.assign(globalThis, {
        game: ORIGINAL_GAME,
        foundry: ORIGINAL_FOUNDRY,
        ui: ORIGINAL_UI,
        Roll: ORIGINAL_ROLL,
    });
});

const { default: OriginPathBuilder, originProvenanceFlags, filterOriginsByProvenance } = await import('./origin-path-builder.ts');

const proto = OriginPathBuilder.prototype;

type ItemToSelectionArg = Parameters<typeof proto._itemToSelectionData>[0];
type ItemToSelectionRet = ReturnType<typeof proto._itemToSelectionData>;

/**
 * Invoke a sheet action handler against a duck-typed host. Action handlers are
 * stored as plain function-typed properties bound to `this: OriginPathBuilder`
 * (strict, contravariant `this`), so a structural test host cannot be supplied
 * via `.call` without a cast. `Reflect.apply` accepts any `thisArgument` by
 * design — the supported primitive for invoking a fixed-`this` function with a
 * duck-typed receiver — and the generic return `R` keeps the result typed.
 */
function invokeAction<R>(action: (...args: never[]) => R, host: object, event: Event, target: HTMLElement): R {
    return Reflect.apply(action, host, [event, target]) as R;
}

/**
 * Concrete shapes for the aptitude-grants the collision/count/pool/preview
 * methods read off a selection's `system`. Declared as `type`s (assignable to
 * `Record<string, unknown>`) so a selection literal satisfies the loose
 * `NormalizedOrigin.system` the methods nominally accept, without any field
 * widening to `unknown`.
 */
type TestAptitudeChoiceOption = { value?: string; name?: string };
type TestAptitudeChoice = { type?: string; label?: string; name?: string; options?: TestAptitudeChoiceOption[] };
type TestAptitudeGrants = { aptitudes?: string[]; choices?: TestAptitudeChoice[] };
type TestAptitudeSystem = { grants?: TestAptitudeGrants; selectedChoices?: Record<string, string[]> };
/** A builder selection: its system plus the committed-source marker (#215). */
type TestAptitudeSelection = { system: TestAptitudeSystem; _actorItemId?: string | null };
/**
 * Shared input shape for the aptitude-collision host builders
 * (`makeCollisionHost` / `previewCollisions`): the seeded selections plus the
 * optional pre-existing actor aptitudes and override map.
 */
type AptitudeCollisionOpts = {
    selections: Array<[string, TestAptitudeSelection]>;
    actorAptitudes?: string[];
    overrides?: Map<string, string>;
};

/**
 * The aptitude collaborators reuse the prototype signatures verbatim. Their
 * `selection`/`origin` parameter is the production `NormalizedOrigin`; the test
 * delegates pass the structurally-compatible `TestAptitudeSelection` through
 * (the methods only read `.system.grants` / `.selectedChoices`, which the test
 * shape provides).
 */
type SelectionGrantedAptitudes = typeof proto._selectionGrantedAptitudes;
type CollectAptitudeChoices = typeof proto._collectAptitudeChoices;

/**
 * Roll/choice snapshot the normalized-origin path reads off `system`. Declared
 * as a `type` (not `interface`) so it is structurally assignable to
 * `NormalizedOrigin.system` (`Record<string, unknown>`) without an index-
 * signature widening to `unknown`.
 */
type TestOriginSystem = {
    step?: string;
    stepIndex?: number;
    identifier?: string;
    selectedChoices?: Record<string, string[]>;
    rollResults?: Record<string, { rolled?: number; breakdown?: string }>;
};

type TestOrigin = {
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
    fromWorld: boolean;
    officialLines: string[];
    gameSystem: string;
    system: TestOriginSystem;
    _sourceUuid?: string | null;
    _actorItemId?: string | null;
    /**
     * A normalized POJO has no `toObject`; a real Item document has a callable
     * one. The non-callable-string variant covers the issue-#198 guard test
     * (a malformed `toObject` must be treated as plain data, not invoked).
     */
    toObject?: string | (() => Partial<TestOrigin>);
    /** Document-only metadata read by the `hasToObject` (item) branch. */
    flags?: { core?: { sourceId?: string } };
    parent?: { id: string };
};

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
        fromWorld: false,
        officialLines: [],
        gameSystem: 'dh2',
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

/**
 * Minimal `this` for the preview-action dispatch (`#previewOriginCard`):
 * it reads the origin pools, resolves a confirmed selection, normalizes the
 * card via `_itemToSelectionData`, and re-renders. Each field mirrors exactly
 * what that method touches on a real builder.
 */
interface BuilderHost {
    actor: { id: string };
    allOrigins: TestOrigin[];
    lineageOrigins: TestOrigin[];
    previewedOrigin: TestOrigin | null;
    render: ReturnType<typeof vi.fn>;
    _findConfirmedSelectionMatching: ReturnType<typeof vi.fn>;
    _itemToSelectionData: (item: ItemToSelectionArg) => ItemToSelectionRet;
}

function makeBuilderHost(): BuilderHost {
    const host: BuilderHost = {
        actor: { id: 'actor-1' },
        allOrigins: [],
        lineageOrigins: [],
        previewedOrigin: null,
        render: vi.fn().mockResolvedValue(undefined),
        _findConfirmedSelectionMatching: vi.fn().mockReturnValue(null),
        _itemToSelectionData: (item) => proto._itemToSelectionData.call(host, item),
    };
    return host;
}

/** Invoke the `selectOriginCard` preview action against a duck-typed host. */
const selectOriginCard = (host: BuilderHost, event: Event, target: HTMLElement): void =>
    invokeAction(OriginPathBuilder.DEFAULT_OPTIONS.actions.selectOriginCard, host, event, target);

function makeTarget(origin: TestOrigin, disabled = false): HTMLElement {
    const target = document.createElement('button');
    target.dataset['originId'] = origin.id;
    if (origin.uuid !== null) target.dataset['originUuid'] = origin.uuid;
    if (disabled) target.classList.add('disabled');
    return target;
}

/** Minimal `this` for `_itemToSelectionData`: it only reads `this.actor`. */
interface ItemToSelectionHost {
    actor: { id: string };
}
/**
 * Invoke `_itemToSelectionData` against a duck-typed host. The `item` is a
 * `TestOrigin` POJO (the normalized-card shape, which is structurally a
 * `NormalizedOrigin`); a callable `toObject` on it routes through the real
 * Item-document branch, mirroring how the production method dispatches.
 */
const itemToSelectionData = (host: ItemToSelectionHost, item: TestOrigin): ItemToSelectionRet => proto._itemToSelectionData.call(host, item);

describe('OriginPathBuilder._itemToSelectionData', () => {
    it('accepts normalized origin data without a toObject method', () => {
        const builder: ItemToSelectionHost = { actor: { id: 'actor-1' } };
        const origin = makeOrigin({
            _sourceUuid: 'Compendium.wh40k-rpg.origin-paths.hive-world-source',
            _actorItemId: 'embedded-origin-1',
        });

        const normalized = itemToSelectionData(builder, origin);

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
        const builder: ItemToSelectionHost = { actor: { id: 'actor-1' } };
        const indexEntry = makeOrigin();

        expect(() => itemToSelectionData(builder, indexEntry)).not.toThrow();
    });

    it('treats a non-callable toObject as plain data instead of invoking it (issue #198)', () => {
        const builder: ItemToSelectionHost = { actor: { id: 'actor-1' } };
        // A non-function `toObject` must be ignored by the `hasToObject` guard.
        const origin = makeOrigin({ toObject: 'not-a-function' });

        const normalized = itemToSelectionData(builder, origin);

        expect(normalized.name).toBe('Hive World');
    });
});

describe('OriginPathBuilder preview action', () => {
    it('previews a normalized origin card without throwing', () => {
        const origin = makeOrigin();
        const host = makeBuilderHost();
        host.allOrigins = [origin];

        selectOriginCard(host, new Event('click'), makeTarget(origin));

        expect(host.previewedOrigin?.name).toBe('Hive World');
        expect(host.previewedOrigin?.system.selectedChoices).toEqual({
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
        const itemToSelectionSpy = vi.fn<(item: ItemToSelectionArg) => ItemToSelectionRet>();
        host._itemToSelectionData = itemToSelectionSpy;

        selectOriginCard(host, new Event('click'), makeTarget(origin));

        expect(host.previewedOrigin).toBe(confirmed);
        expect(itemToSelectionSpy).not.toHaveBeenCalled();
        expect(host.render).toHaveBeenCalledTimes(1);
    });

    it('warns and does not render when the clicked origin is disabled', () => {
        const origin = makeOrigin();
        const host = makeBuilderHost();
        host.allOrigins = [origin];

        selectOriginCard(host, new Event('click'), makeTarget(origin, true));

        expect(host.previewedOrigin).toBeNull();
        expect(host.render).not.toHaveBeenCalled();
        expect(stubHost.ui?.notifications.warn).toHaveBeenCalledWith('WH40K.OriginPath.OriginNotAvailable');
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

    /** Place the card in the pool the step routes through (lineage vs core). */
    function seedPool(host: BuilderHost, sc: StepCase, origin: TestOrigin): void {
        const pool = sc.lineage ? host.lineageOrigins : host.allOrigins;
        pool.push(origin);
    }

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
            seedPool(host, sc, origin);

            expect(() => selectOriginCard(host, new Event('click'), makeTarget(origin))).not.toThrow();

            expect(host.previewedOrigin?.name).toBe(sc.label);
            expect(host.previewedOrigin?.system.step).toBe(sc.step);
            expect(host.render).toHaveBeenCalledTimes(1);
        });

        it(`_itemToSelectionData converts a ${sc.label} POJO without invoking toObject`, () => {
            const builder: ItemToSelectionHost = { actor: { id: 'actor-1' } };
            const origin = makeOrigin({
                id: `origin-${sc.identifier}`,
                uuid: `Compendium.wh40k-rpg.origin-paths.origin-${sc.identifier}`,
                name: sc.label,
                step: sc.step,
                stepIndex: sc.stepIndex,
                identifier: sc.identifier,
                system: { step: sc.step, stepIndex: sc.stepIndex, identifier: sc.identifier },
            });

            let normalized: ItemToSelectionRet | undefined;
            expect(() => {
                normalized = itemToSelectionData(builder, origin);
            }).not.toThrow();

            expect(normalized?.name).toBe(sc.label);
            // Plain-object branch: _sourceUuid falls back to the POJO's own uuid.
            expect(normalized?._sourceUuid).toBe(`Compendium.wh40k-rpg.origin-paths.origin-${sc.identifier}`);
            expect(normalized?._actorItemId).toBeNull();
        });
    }

    it('still routes a real Item document through the toObject() branch', () => {
        const builder: ItemToSelectionHost = { actor: { id: 'actor-doc' } };
        const toObject = vi.fn(
            (): Partial<TestOrigin> => ({
                name: 'Forge World',
                img: 'icons/svg/d20.svg',
                system: { step: 'homeWorld', stepIndex: 1, identifier: 'forge-world' },
            }),
        );
        // A real Item document: a callable `toObject` plus the doc-only metadata
        // the `hasToObject` branch reads (flags.core.sourceId, parent, id, uuid).
        const fakeItemDocument = makeOrigin({
            id: 'embedded-1',
            uuid: 'Actor.x.Item.embedded-1',
            toObject,
            flags: { core: { sourceId: 'Compendium.wh40k-rpg.origin-paths.forge-world' } },
            parent: { id: 'other-actor' },
        });

        const normalized = itemToSelectionData(builder, fakeItemDocument);

        expect(toObject).toHaveBeenCalledTimes(1);
        expect(normalized.name).toBe('Forge World');
        // Not parented to this.actor → _sourceUuid resolves from item.uuid.
        expect(normalized._sourceUuid).toBe('Actor.x.Item.embedded-1');
        expect(normalized._actorItemId).toBeNull();
    });
});

/** The installed `game` stub. */
function mutableGame(): GameStub {
    return STUBS.game;
}

/** The installed `ui` stub. */
function mutableUi(): UiStub {
    return STUBS.ui;
}

/** Build a `game.packs` stub whose `find` never resolves a pack. */
function emptyPacks(): PacksStub {
    return Object.assign(new Map<string, CompendiumPackStub>(), { find: () => undefined });
}

describe('OriginPathBuilder rollDivination (issue #199)', () => {
    interface DivinationHost {
        _divination: string;
        _saveScrollPosition: ReturnType<typeof vi.fn>;
        render: ReturnType<typeof vi.fn>;
    }
    function makeDivinationHost(): DivinationHost {
        return {
            _divination: '',
            _saveScrollPosition: vi.fn(),
            render: vi.fn().mockResolvedValue(undefined),
        };
    }

    /** Invoke the `rollDivination` action against a duck-typed host. */
    const rollDivination = async (host: DivinationHost, event: Event, target: HTMLElement): Promise<void> => {
        await invokeAction(OriginPathBuilder.DEFAULT_OPTIONS.actions.rollDivination, host, event, target);
    };

    it('falls back to a 1d100 roll when the Divination table is absent', async () => {
        const g = mutableGame();
        g.tables = undefined;
        g.packs = emptyPacks();

        const host = makeDivinationHost();
        await rollDivination(host, new Event('click'), document.createElement('button'));

        expect(host._divination).toBe('WH40K.OriginPath.DivinationTableUnavailable');
        expect(host.render).toHaveBeenCalledTimes(1);
        expect(host._saveScrollPosition).toHaveBeenCalledTimes(1);
    });

    it('treats an empty world RollTable as unavailable and never calls draw()', async () => {
        const draw = vi.fn();
        const g = mutableGame();
        g.tables = { getName: () => ({ results: { size: 0 }, draw }) };
        g.packs = emptyPacks();

        const host = makeDivinationHost();
        await rollDivination(host, new Event('click'), document.createElement('button'));

        expect(draw).not.toHaveBeenCalled();
        expect(host._divination).toBe('WH40K.OriginPath.DivinationTableUnavailable');
    });

    it('uses the drawn result text when a populated table exists', async () => {
        const draw = vi.fn().mockResolvedValue({ results: [{ text: 'Trust in your fear.' }] });
        const g = mutableGame();
        g.tables = { getName: () => ({ results: { size: 100 }, draw }) };
        g.packs = emptyPacks();

        const host = makeDivinationHost();
        await rollDivination(host, new Event('click'), document.createElement('button'));

        expect(draw).toHaveBeenCalledTimes(1);
        expect(host._divination).toBe('Trust in your fear.');
    });
});

describe('OriginPathBuilder commit (issue #206)', () => {
    interface CommitStatus {
        canCommit: boolean;
        stepsComplete: boolean;
        choicesComplete: boolean;
        equipmentComplete: boolean;
    }
    interface EquipmentStep {
        key: string;
        step: string;
        icon: string;
        descKey: string;
        stepIndex: number;
    }
    interface CommitHost {
        _calculateStatus: () => CommitStatus;
        _hasAssignedCharacteristics: ReturnType<typeof vi.fn>;
        _clearPreviewedOrigin: ReturnType<typeof vi.fn>;
        render: ReturnType<typeof vi.fn>;
        showLineage: boolean;
        showCharacteristics: boolean;
        showEquipment: boolean;
        guidedMode?: boolean;
        systemConfig: { equipmentStep: EquipmentStep | null };
        equipmentSelections: Map<string, string>;
        gameSystem: string;
    }

    /** Invoke the `commit` action against a duck-typed host. */
    const commit = async (host: CommitHost, event: Event, target: HTMLElement): Promise<void> => {
        await invokeAction(OriginPathBuilder.DEFAULT_OPTIONS.actions.commit, host, event, target);
    };

    /** Install a DialogV2 prompt spy on the foundry stub and return it. */
    function installDialogPrompt(): ReturnType<typeof vi.fn<(...args: never[]) => Promise<CommitResetChoices | null>>> {
        const dialogPrompt = vi.fn<(...args: never[]) => Promise<CommitResetChoices | null>>();
        STUBS.foundry.applications.api.DialogV2 = { prompt: dialogPrompt };
        return dialogPrompt;
    }

    it('blocks commit and routes to the Characteristics step when characteristics are unassigned', async () => {
        const dialogPrompt = installDialogPrompt();

        const host: CommitHost = {
            _calculateStatus: () => ({ canCommit: true, stepsComplete: true, choicesComplete: true, equipmentComplete: true }),
            _hasAssignedCharacteristics: vi.fn().mockReturnValue(false),
            _clearPreviewedOrigin: vi.fn(),
            render: vi.fn().mockResolvedValue(undefined),
            showLineage: true,
            showCharacteristics: false,
            showEquipment: true,
            systemConfig: { equipmentStep: null },
            equipmentSelections: new Map<string, string>(),
            gameSystem: 'dh2',
        };

        await commit(host, new Event('click'), document.createElement('button'));

        expect(mutableUi().notifications.warn).toHaveBeenCalledWith('WH40K.OriginPath.CharacteristicsRequiredBeforeCommit');
        expect(host.showCharacteristics).toBe(true);
        expect(host.showEquipment).toBe(false);
        expect(host.showLineage).toBe(false);
        expect(dialogPrompt).not.toHaveBeenCalled();
    });

    it('blocks commit and routes to the Equipment step when equipment is empty under DH2e RAW', async () => {
        const dialogPrompt = installDialogPrompt();

        const host: CommitHost = {
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
            equipmentSelections: new Map<string, string>(),
            gameSystem: 'dh2',
        };

        await commit(host, new Event('click'), document.createElement('button'));

        expect(mutableUi().notifications.warn).toHaveBeenCalledWith('WH40K.OriginPath.StepInProgressEquipment');
        expect(host.showEquipment).toBe(true);
        expect(host.showCharacteristics).toBe(false);
        expect(host.showLineage).toBe(false);
        expect(dialogPrompt).not.toHaveBeenCalled();
    });
});

describe('OriginPathBuilder._collectAptitudeGrantCounts (issue #205)', () => {
    interface CountHost {
        selections: Map<string, TestAptitudeSelection>;
        _getSelectionSystem: (selection: TestAptitudeSelection) => TestAptitudeSystem;
        _collectAptitudeChoices: CollectAptitudeChoices;
        _selectionGrantedAptitudes: SelectionGrantedAptitudes;
    }

    function makeCountHost(selections: Array<[string, TestAptitudeSelection]>): CountHost {
        const host: CountHost = {
            selections: new Map(selections),
            _getSelectionSystem: (s) => s.system,
            // Delegate to the real prototype methods (bound to this host) so the
            // genuine grant-collection logic is exercised, not a re-implementation.
            _collectAptitudeChoices: (choice, selectedValues, aptitudeSet) => proto._collectAptitudeChoices.call(host, choice, selectedValues, aptitudeSet),
            _selectionGrantedAptitudes: (sel) => proto._selectionGrantedAptitudes.call(host, sel),
        };
        return host;
    }

    const countGrants = (host: CountHost): Map<string, number> => proto._collectAptitudeGrantCounts.call(host);

    it('counts a fixed aptitude granted by two origins as a duplicate', () => {
        const host = makeCountHost([
            ['homeWorld', { system: { grants: { aptitudes: ['Willpower', 'Offence'] }, selectedChoices: {} } }],
            ['background', { system: { grants: { aptitudes: ['Willpower'] }, selectedChoices: {} } }],
        ]);

        const counts = countGrants(host);

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

        const counts = countGrants(host);

        expect(counts.get('Tech')).toBe(2);
    });

    it('does not double-count an aptitude granted twice by a single origin', () => {
        const host = makeCountHost([['homeWorld', { system: { grants: { aptitudes: ['Willpower', 'Willpower'] }, selectedChoices: {} } }]]);

        const counts = countGrants(host);

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
    type AptCollision = { original: string; replacement: string | null };

    interface CollisionHost {
        selections: Map<string, TestAptitudeSelection>;
        actor: { system: { aptitudes: string[] } };
        aptitudeOverrides: Map<string, string>;
        _getSelectionSystem: (selection: TestAptitudeSelection) => TestAptitudeSystem;
        _collectAptitudeChoices: CollectAptitudeChoices;
        _selectionGrantedAptitudes: SelectionGrantedAptitudes;
        _collectAptitudeGrantCounts: () => Map<string, number>;
        _collectExistingAptitudes: () => Set<string>;
        _lookupAptitudeOverride: (original: string) => string | undefined;
        _aptitudeKey: (name: string) => string;
    }

    function makeCollisionHost(opts: AptitudeCollisionOpts): CollisionHost {
        const host: CollisionHost = {
            selections: new Map(opts.selections),
            actor: { system: { aptitudes: opts.actorAptitudes ?? [] } },
            aptitudeOverrides: opts.overrides ?? new Map<string, string>(),
            _getSelectionSystem: (s) => s.system,
            // Each collaborator delegates to the real prototype method bound to
            // this host, so the genuine normalisation/subtraction logic runs.
            _collectAptitudeChoices: (choice, selectedValues, aptitudeSet) => proto._collectAptitudeChoices.call(host, choice, selectedValues, aptitudeSet),
            _selectionGrantedAptitudes: (sel) => proto._selectionGrantedAptitudes.call(host, sel),
            _collectAptitudeGrantCounts: () => proto._collectAptitudeGrantCounts.call(host),
            _collectExistingAptitudes: () => proto._collectExistingAptitudes.call(host),
            _lookupAptitudeOverride: (original) => proto._lookupAptitudeOverride.call(host, original),
            _aptitudeKey: (name) => proto._aptitudeKey.call(host, name),
        };
        return host;
    }

    /** A selection seeded from a committed actor origin item. */
    function committed(grants: TestAptitudeGrants, selectedChoices: Record<string, string[]> = {}, id = 'actor-item'): TestAptitudeSelection {
        return { system: { grants, selectedChoices }, _actorItemId: id };
    }
    /** A selection the player just picked this session (not yet committed). */
    function picked(grants: TestAptitudeGrants, selectedChoices: Record<string, string[]> = {}): TestAptitudeSelection {
        return { system: { grants, selectedChoices }, _actorItemId: null };
    }

    function collisions(host: CollisionHost): AptCollision[] {
        return proto._getAptitudeCollisions.call(host);
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
        // Static normaliser; wrapped so the reference is bound (not an unbound method).
        const n = (name: string): string => OriginPathBuilder._normalizeAptitudeIdentity(name);
        expect(n('Willpower')).toBe(n('  willpower '));
        expect(n('Weapon  Skill')).toBe(n('weapon skill'));
        expect(n('Weapon Skill')).not.toBe(n('Ballistic Skill'));
    });
});

describe('OriginPathBuilder._collectAvailableAptitudePool (#205, #216)', () => {
    /** An origin as the pool reader sees it: only `system.grants.aptitudes`. */
    type PoolOrigin = { system: { grants: { aptitudes: string[] } } };
    interface PoolHost {
        allOrigins: PoolOrigin[];
        lineageOrigins: PoolOrigin[];
        _getSelectionSystem: (origin: PoolOrigin) => PoolOrigin['system'];
        _aptitudeKey: (name: string) => string;
    }
    function makePoolHost(allOrigins: PoolOrigin[]): PoolHost {
        const host: PoolHost = {
            allOrigins,
            lineageOrigins: [],
            _getSelectionSystem: (o) => o.system,
            _aptitudeKey: (name) => proto._aptitudeKey.call(host, name),
        };
        return host;
    }
    const collectPool = (host: PoolHost, taken: ReadonlySet<string>): string[] => proto._collectAvailableAptitudePool.call(host, taken);

    it('excludes taken aptitudes by canonical identity and restricts to characteristic aptitudes (#216)', () => {
        const mkOrigin = (apts: string[]): PoolOrigin => ({ system: { grants: { aptitudes: apts } } });
        const host = makePoolHost([mkOrigin(['Willpower', 'willpower ', 'Tech', 'Offence', 'Strength', 'Fellowship'])]);
        const pool = collectPool(host, new Set<string>(['  WILLPOWER']));
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
        // Only non-characteristic aptitudes referenced by origins.
        const host = makePoolHost([{ system: { grants: { aptitudes: ['Tech', 'Offence', 'Knowledge'] } } }]);
        const pool = collectPool(host, new Set<string>());
        // Pool should still contain every characteristic aptitude, sorted.
        expect(pool).toEqual(['Agility', 'Ballistic Skill', 'Fellowship', 'Intelligence', 'Perception', 'Strength', 'Toughness', 'Weapon Skill', 'Willpower']);
    });

    it('(#216) excludes Influence (resource char, not a generation char)', () => {
        const host = makePoolHost([{ system: { grants: { aptitudes: ['Influence', 'Strength'] } } }]);
        const pool = collectPool(host, new Set<string>());
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
    type AptCollision = { original: string; replacement: string | null };
    interface PreviewCollisionFields {
        aptitudeCollisions: AptCollision[];
        unresolvedAptitudeCollisions: AptCollision[];
        resolvedAptitudeCollisions: AptCollision[];
        hasUnresolvedAptitudeCollision: boolean;
    }

    /**
     * The `this` `_calculatePreview` walks. The aptitude-collision methods are
     * the real prototype methods (delegated, bound to the host); the heavier
     * grant/talent/tooltip pipeline is stubbed to no-ops because the fixtures
     * grant only aptitudes, so those branches never execute.
     */
    interface PreviewHost {
        selections: Map<string, TestAptitudeSelection>;
        actor: { system: { aptitudes: string[] } };
        aptitudeOverrides: Map<string, string>;
        systemConfig: { getOriginStepConfig: () => { coreSteps: never[]; optionalStep: null; equipmentStep: null } };
        allOrigins: never[];
        lineageOrigins: never[];
        _getSelectionSystem: (selection: TestAptitudeSelection) => TestAptitudeSystem;
        _collectAptitudeChoices: CollectAptitudeChoices;
        _selectionGrantedAptitudes: SelectionGrantedAptitudes;
        _collectAptitudeGrantCounts: () => Map<string, number>;
        _collectExistingAptitudes: () => Set<string>;
        _lookupAptitudeOverride: (original: string) => string | undefined;
        _aptitudeKey: (name: string) => string;
        _getAptitudeCollisions: () => AptCollision[];
        _applyChoiceGrantsToPreview: () => Promise<void>;
        _addTalentModifiers: () => Promise<void>;
        _findSkillUuid: () => string | null;
        _prepareGrantTooltipData: () => Promise<string>;
    }

    async function previewCollisions(opts: AptitudeCollisionOpts): Promise<PreviewCollisionFields> {
        const host: PreviewHost = {
            selections: new Map(opts.selections),
            actor: { system: { aptitudes: opts.actorAptitudes ?? [] } },
            aptitudeOverrides: opts.overrides ?? new Map<string, string>(),
            // Preview pipeline dependencies; stubbed so the bare minimum runs.
            systemConfig: { getOriginStepConfig: () => ({ coreSteps: [], optionalStep: null, equipmentStep: null }) },
            allOrigins: [],
            lineageOrigins: [],
            // The aptitude methods _calculatePreview reaches transitively run for real.
            _getSelectionSystem: (s) => s.system,
            _collectAptitudeChoices: (choice, selectedValues, aptitudeSet) => proto._collectAptitudeChoices.call(host, choice, selectedValues, aptitudeSet),
            _selectionGrantedAptitudes: (sel) => proto._selectionGrantedAptitudes.call(host, sel),
            _collectAptitudeGrantCounts: () => proto._collectAptitudeGrantCounts.call(host),
            _collectExistingAptitudes: () => proto._collectExistingAptitudes.call(host),
            _lookupAptitudeOverride: (original) => proto._lookupAptitudeOverride.call(host, original),
            _aptitudeKey: (name) => proto._aptitudeKey.call(host, name),
            _getAptitudeCollisions: () => proto._getAptitudeCollisions.call(host),
            // No choice grants / talents / skills in this fixture → no-op stubs.
            // (Non-async to avoid require-await; they resolve immediately.)
            _applyChoiceGrantsToPreview: async (): Promise<void> => {},
            _addTalentModifiers: async (): Promise<void> => {},
            _findSkillUuid: () => null,
            _prepareGrantTooltipData: async (): Promise<string> => Promise.resolve(''),
        };
        const preview = await proto._calculatePreview.call(host);
        return {
            aptitudeCollisions: preview.aptitudeCollisions,
            unresolvedAptitudeCollisions: preview.unresolvedAptitudeCollisions,
            resolvedAptitudeCollisions: preview.resolvedAptitudeCollisions,
            hasUnresolvedAptitudeCollision: preview.hasUnresolvedAptitudeCollision,
        };
    }

    const picked = (grants: TestAptitudeGrants, selectedChoices: Record<string, string[]> = {}): TestAptitudeSelection => ({
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
    type FakeExperience = { total: number; used: number };
    /** A specialist-skill entry; arbitrary extra fields are preserved verbatim. */
    type FakeSkillEntry = { advance?: number; cost?: number; name?: string; trained?: boolean; current?: number };
    type FakeSkill = { advance: number; cost: number; entries?: FakeSkillEntry[] };
    // Declared as `type`s (assignable to `Record<string, unknown>`) so the
    // path-keyed `actor.update(...)` simulation can walk the tree without an
    // `as unknown as Record` cast.
    type FakeSystem = {
        experience: FakeExperience;
        characteristics: Record<string, { advance: number; cost: number }>;
        skills: Record<string, FakeSkill>;
    };

    /**
     * `this` for `_resetExperienceAndAdvancements`: it reads `registryConfig`,
     * `_actorSys()`, and drives `actor.update(...)` / `actor.system`.
     */
    interface ResetHost {
        actor: { system: FakeSystem; update: ReturnType<typeof vi.fn> };
        registryConfig: { startingXP: number };
        _actorSys: () => FakeSystem;
    }

    /** The leaf values the reset writes through `actor.update(...)`. */
    type FakeUpdateValue = number | string | boolean | null | FakeSkillEntry[];
    /** A nested mutable tree, the shape `actor.update(...)` writes path-keys into. */
    type MutableTree = { [key: string]: MutableTree | FakeUpdateValue | undefined };

    /**
     * Apply one `actor.update(...)` path-keyed payload to the backing system.
     * The payload is the genuine Foundry update boundary — a flattened map of
     * dotted paths to mixed values; `payload` accepts that documented shape.
     */
    function applyUpdatePayload(system: FakeSystem, payload: Record<string, FakeUpdateValue>): void {
        const root: MutableTree = system;
        for (const [path, value] of Object.entries(payload)) {
            const parts = path.split('.').slice(1); // drop leading "system"
            let cursor = root;
            for (let i = 0; i < parts.length - 1; i++) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess: the `!` is required under tsconfig.json (flag ON); ESLint runs under tsconfig.test.json (flag OFF) where it reads as unnecessary/forbidden
                cursor = cursor[parts[i]!] as MutableTree;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess: the `!` is required under tsconfig.json (flag ON); ESLint runs under tsconfig.test.json (flag OFF) where it reads as unnecessary/forbidden
            cursor[parts[parts.length - 1]!] = value;
        }
    }

    /**
     * @param opts.rejectEntryWrites - simulate Foundry V14 strict validation
     *        rejecting any update payload that contains a `system.skills.*.entries`
     *        array (the pre-fix non-atomic-write failure mode).
     */
    function makeResetHost(system: FakeSystem, opts: { rejectEntryWrites?: boolean; dropFirstUsedWrite?: boolean } = {}): ResetHost {
        let call = 0;
        // Built incrementally so the `update` spy below can resolve to the same
        // `actor` reference it is attached to (the production method awaits the
        // resolved actor). Declaring `actor` first keeps lexical order clean.
        const actor = { system } as ResetHost['actor'];
        // `actor.update()` is a genuine Foundry boundary: a flattened, path-keyed
        // payload of mixed leaf values (the documented update shape).
        actor.update = vi.fn(async (payload: Record<string, FakeUpdateValue>): Promise<ResetHost['actor']> => {
            call += 1;
            const hasEntryWrite = Object.keys(payload).some((k) => /^system\.skills\..+\.entries$/.test(k));
            if (opts.rejectEntryWrites === true && hasEntryWrite) {
                // Foundry rejects the ENTIRE atomic update — nothing applies.
                // (Throwing from this async mock surfaces as a rejected update,
                // exactly as V14 strict validation does at runtime.)
                throw new Error('V14 strict validation: invalid skill entries array');
            }
            // Simulate the experience-reset write only partially landing
            // (the `used` path silently dropped) so a stale `used` survives
            // above the post-reset `total` — exercises the clamp guard.
            if (opts.dropFirstUsedWrite === true && call === 1) {
                delete payload['system.experience.used'];
            }
            applyUpdatePayload(system, payload);
            await Promise.resolve();
            return actor;
        });
        return {
            actor,
            registryConfig: { startingXP: 1000 },
            _actorSys: () => system,
        };
    }

    /** Invoke `_resetExperienceAndAdvancements` against a duck-typed host. */
    const resetExperienceAndAdvancements = async (host: ResetHost): Promise<void> => {
        await proto._resetExperienceAndAdvancements.call(host);
    };

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

        await resetExperienceAndAdvancements(host);

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
                expect(e.advance).toBe(0);
                expect(e.cost).toBe(0);
            }
        }
    });

    it('available XP (total - used) is non-negative and equals startingXP after reset', async () => {
        const system = generatedCharacter();
        const host = makeResetHost(system);

        await resetExperienceAndAdvancements(host);

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

        await expect(resetExperienceAndAdvancements(host)).rejects.toThrow();

        // The experience reset is now its own update committed FIRST, so it
        // landed before the entries write threw: available is never negative.
        expect(system.experience.total).toBe(1000);
        expect(system.experience.used).toBe(0);
        expect(system.experience.total - system.experience.used).toBeGreaterThanOrEqual(0);
    });

    it('is idempotent — re-applying the reset on an already-reset character changes nothing', async () => {
        const system = generatedCharacter();
        const host = makeResetHost(system);

        await resetExperienceAndAdvancements(host);
        const firstPass = structuredClone(system);
        await resetExperienceAndAdvancements(host);

        expect(system).toEqual(firstPass);
        expect(system.experience).toEqual({ total: 1000, used: 0 });
    });

    it('defensively clamps used <= total if some external state slipped through', async () => {
        const system = generatedCharacter();
        // The experience-reset write only partially lands (`used` dropped),
        // leaving the stale 1500 against the reset total of 1000.
        const host = makeResetHost(system, { dropFirstUsedWrite: true });

        await resetExperienceAndAdvancements(host);

        expect(system.experience.total).toBe(1000);
        // Clamp step pulled used back down to total — available is exactly 0,
        // never negative ("nothing can be bought" no longer occurs).
        expect(system.experience.used).toBeLessThanOrEqual(system.experience.total);
        expect(system.experience.total - system.experience.used).toBeGreaterThanOrEqual(0);
    });
});

/* -------------------------------------------------------------------------- */
/*  Point-buy generation mode                                                 */
/* -------------------------------------------------------------------------- */

const GEN_CHARS = OriginPathBuilder.GENERATION_CHARACTERISTICS;

/**
 * Minimal host exposing the point-buy state the pure methods read, plus the
 * sibling-method delegates the composed methods (`_setPointBuy`,
 * `_adjustPointBuy`, `_hasAssignedCharacteristics`) call on `this`. Delegating
 * to the real prototype methods keeps the logic-under-test genuine.
 */
interface PointBuyHost {
    _charGenMode: 'point-buy' | 'roll' | 'roll-pool-hb';
    _charPointBuy: Record<string, number>;
    _charRolls: number[];
    _charAssignments: Record<string, number | null>;
    _charAdvancedMode: boolean;
    _charCustomBases: Record<string, number>;
    _pointBuySpent: () => number;
    _pointBuyRemaining: () => number;
    _pointBuyBaseFor: (key: string) => number;
}

function makePointBuyHost(overrides: Partial<PointBuyHost> = {}): PointBuyHost {
    const host: PointBuyHost = {
        _charGenMode: 'point-buy',
        _charPointBuy: Object.fromEntries(GEN_CHARS.map((k) => [k, 0])),
        _charRolls: Array<number>(9).fill(0),
        _charAssignments: Object.fromEntries(GEN_CHARS.map((k) => [k, null])),
        _charAdvancedMode: false,
        _charCustomBases: {},
        _pointBuySpent: (): number => proto._pointBuySpent.call(host),
        _pointBuyRemaining: (): number => proto._pointBuyRemaining.call(host),
        _pointBuyBaseFor: (key: string): number => proto._pointBuyBaseFor.call(host, key),
        ...overrides,
    };
    return host;
}

const pbSpent = (host: PointBuyHost): number => proto._pointBuySpent.call(host);
const pbRemaining = (host: PointBuyHost): number => proto._pointBuyRemaining.call(host);
const pbAdjust = (host: PointBuyHost, key: string, delta: number): number => proto._adjustPointBuy.call(host, key, delta);
const pbSet = (host: PointBuyHost, key: string, value: number): number => proto._setPointBuy.call(host, key, value);
const hasAssigned = (host: PointBuyHost): boolean => proto._hasAssignedCharacteristics.call(host);

describe('OriginPathBuilder point-buy pure logic', () => {
    it('sums allocations across characteristics, clamping negatives to 0', () => {
        const host = makePointBuyHost();
        host._charPointBuy['weaponSkill'] = 10;
        host._charPointBuy['strength'] = 5;
        // Defensive: bad flag data with a negative spend must not under-count.
        host._charPointBuy['agility'] = -3;
        expect(pbSpent(host)).toBe(15);
        expect(pbRemaining(host)).toBe(85);
    });

    it('adjusts up only as far as the pool allows', () => {
        const host = makePointBuyHost();
        // Pre-spend 95 so only 5 remain.
        host._charPointBuy['weaponSkill'] = 95;
        // Asking for +10 with 5 left clamps the actual add to 5.
        const stored = pbAdjust(host, 'ballisticSkill', 10);
        expect(stored).toBe(5);
        expect(pbSpent(host)).toBe(100);
        expect(pbRemaining(host)).toBe(0);
        // A further +1 is rejected (no headroom) — stays at 5.
        expect(pbAdjust(host, 'ballisticSkill', 1)).toBe(5);
        expect(pbSpent(host)).toBe(100);
    });

    it('never lets an individual allocation go below 0 on a decrease', () => {
        const host = makePointBuyHost();
        host._charPointBuy['toughness'] = 2;
        expect(pbAdjust(host, 'toughness', -5)).toBe(0);
        expect(pbSpent(host)).toBe(0);
    });

    it('ignores adjustments for keys that are not generation characteristics', () => {
        const host = makePointBuyHost();
        const before = pbSpent(host);
        expect(pbAdjust(host, 'notACharacteristic', 5)).toBe(0);
        expect(pbSpent(host)).toBe(before);
    });

    it('refunds the field before applying pool headroom, then clamps to the per-characteristic cap', () => {
        const host = makePointBuyHost();
        host._charPointBuy['intelligence'] = 30;
        // The field's own 30 is refunded into headroom (so it doesn't fight itself),
        // but base(20) + points may not exceed the gen cap of 40 → at most 20 points.
        expect(pbSet(host, 'intelligence', 50)).toBe(20);
        expect(pbSpent(host)).toBe(20);
    });

    it('caps an absolute set at the remaining pool when the pool is the tighter limit', () => {
        const host = makePointBuyHost();
        host._charPointBuy['perception'] = 95; // only 5 of the pool remain
        host._charPointBuy['willpower'] = 0;
        // Setting willpower to 80 can take only the 5 of pool headroom left
        // (tighter than the cap's 20 points).
        expect(pbSet(host, 'willpower', 80)).toBe(5);
        expect(pbSpent(host)).toBe(100);
    });

    it('clamps base + points at the generation cap (DH2e: 40) regardless of pool headroom (#223)', () => {
        // Fresh pool (100 headroom), mocked base 20 → at most 20 points (total 40).
        expect(pbSet(makePointBuyHost(), 'strength', 100)).toBe(20);
        expect(pbAdjust(makePointBuyHost(), 'strength', 100)).toBe(20);
    });

    it('floors non-finite / negative absolute sets at 0', () => {
        const host = makePointBuyHost();
        expect(pbSet(host, 'fellowship', Number.NaN)).toBe(0);
        expect(pbSet(host, 'fellowship', -7)).toBe(0);
    });

    it('reports committable while the pool is not overspent (point-buy)', () => {
        const host = makePointBuyHost();
        host._charPointBuy['weaponSkill'] = 50;
        expect(hasAssigned(host)).toBe(true);
        // Spending nothing is a legitimate all-at-base build.
        const empty = makePointBuyHost();
        expect(hasAssigned(empty)).toBe(true);
    });
});

/* -------------------------------------------------------------------------- */
/*  Roll generation mode                                                      */
/* -------------------------------------------------------------------------- */

interface RollHost {
    _charGenMode: 'point-buy' | 'roll' | 'roll-pool-hb';
    _charRolls: number[];
    _charAssignments: Record<string, number | null>;
}

function makeRollHost(): RollHost {
    return {
        _charGenMode: 'roll',
        _charRolls: Array<number>(9).fill(0),
        _charAssignments: Object.fromEntries(GEN_CHARS.map((k) => [k, null])),
    };
}

const generate = async (host: RollHost, injected?: number[]): Promise<number[]> => proto._generateRollModeValues.call(host, injected);
const hasAssignedRoll = (host: RollHost): boolean => proto._hasAssignedCharacteristics.call(host);

describe('OriginPathBuilder roll-mode pure logic', () => {
    it('writes injected values in order and locks each to its characteristic', async () => {
        const host = makeRollHost();
        const injected = [12, 8, 19, 4, 15, 11, 7, 18, 9];
        const result = await generate(host, injected);
        expect(result).toEqual(injected);
        expect(host._charRolls).toEqual(injected);
        // Each characteristic is assigned its own index, in order.
        GEN_CHARS.forEach((key, i) => {
            expect(host._charAssignments[key]).toBe(i);
        });
        // With every slot positive and assigned, the step is committable.
        expect(hasAssignedRoll(host)).toBe(true);
    });

    it('truncates and floors injected values defensively', async () => {
        const host = makeRollHost();
        const result = await generate(host, [5.9, -2, 10, 10, 10, 10, 10, 10, 10]);
        expect(result[0]).toBe(5); // truncated
        expect(result[1]).toBe(0); // floored from negative
    });

    it('pads missing injected entries with 0', async () => {
        const host = makeRollHost();
        const result = await generate(host, [10, 10]);
        expect(result).toHaveLength(GEN_CHARS.length);
        expect(result[2]).toBe(0);
        // A 0-valued slot is still assigned but not yet committable.
        expect(hasAssignedRoll(host)).toBe(false);
    });

    it('falls back to live Roll evaluation when no values are injected', async () => {
        const host = makeRollHost();
        // FakeRoll resolves total = 42 for every slot.
        const result = await generate(host);
        expect(result).toEqual(Array<number>(GEN_CHARS.length).fill(42));
        expect(host._charRolls.every((v) => v === 42)).toBe(true);
        expect(hasAssignedRoll(host)).toBe(true);
    });
});

describe('OriginPathBuilder._hasAssignedCharacteristics across modes', () => {
    it('roll/roll-pool-hb require every characteristic to carry a positive assigned roll', () => {
        const host: RollHost = {
            _charGenMode: 'roll-pool-hb',
            _charRolls: Array<number>(9).fill(0),
            _charAssignments: Object.fromEntries(GEN_CHARS.map((k) => [k, null])),
        };
        expect(proto._hasAssignedCharacteristics.call(host)).toBe(false);
        // Assign a full bank in order with positive values.
        host._charRolls = GEN_CHARS.map((_k, i) => i + 5);
        GEN_CHARS.forEach((key, i) => {
            host._charAssignments[key] = i;
        });
        expect(proto._hasAssignedCharacteristics.call(host)).toBe(true);
    });
});

describe('originProvenanceFlags', () => {
    const flags = (officialLines: string[], active: string): { isPureHomebrew: boolean; isAdaptedHomebrew: boolean; adaptedFromLabel: string } =>
        originProvenanceFlags({ officialLines } as Parameters<typeof originProvenanceFlags>[0], active);

    it('marks no flags when official for the active system', () => {
        expect(flags(['dh2'], 'dh2')).toEqual({ isPureHomebrew: false, isAdaptedHomebrew: false, adaptedFromLabel: '' });
    });

    it('marks adapted homebrew when homebrew here but official elsewhere, listing the official lines', () => {
        const result = flags(['dh1', 'rt'], 'dh2');
        expect(result.isAdaptedHomebrew).toBe(true);
        expect(result.isPureHomebrew).toBe(false);
        expect(result.adaptedFromLabel).toBe('Dark Heresy 1e, Rogue Trader');
    });

    it('marks pure homebrew when no line is official', () => {
        expect(flags([], 'dh2')).toEqual({ isPureHomebrew: true, isAdaptedHomebrew: false, adaptedFromLabel: '' });
    });
});

describe('filterOriginsByProvenance (#295)', () => {
    const raw = { officialLines: ['dh2'] } as Parameters<typeof originProvenanceFlags>[0]; // official in the active system → raw
    const adapted = { officialLines: ['rt'] } as Parameters<typeof originProvenanceFlags>[0]; // official elsewhere → adapted
    const homebrew = { officialLines: [] as string[] } as Parameters<typeof originProvenanceFlags>[0]; // nowhere official → pure homebrew
    const origins = [raw, adapted, homebrew];
    const apply = (filter: { raw: boolean; adapted: boolean; homebrew: boolean }): typeof origins => filterOriginsByProvenance(origins, 'dh2', filter);

    it('shows everything when all categories are enabled (default no-op)', () => {
        expect(apply({ raw: true, adapted: true, homebrew: true })).toEqual([raw, adapted, homebrew]);
    });

    it('hides RAW origins when the raw category is disabled', () => {
        expect(apply({ raw: false, adapted: true, homebrew: true })).toEqual([adapted, homebrew]);
    });

    it('shows only pure-homebrew origins when only homebrew is enabled', () => {
        expect(apply({ raw: false, adapted: false, homebrew: true })).toEqual([homebrew]);
    });

    it('shows only adapted origins when only adapted is enabled', () => {
        expect(apply({ raw: false, adapted: true, homebrew: false })).toEqual([adapted]);
    });
});
