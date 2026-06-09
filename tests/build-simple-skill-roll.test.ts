/**
 * Frozen-shape regression tests for `WH40KBaseActor._buildSimpleSkillRoll(...)`.
 *
 * The helper centralises the SimpleSkillData boilerplate that used to be hand-rolled in
 * `WH40KAcolyte.rollCharacteristic` / `rollSkill` and `WH40KNPC.rollCharacteristic` /
 * `rollSimpleWeapon` / `rollSkill`. These tests pin the produced rollData shape against
 * the literal field assignments those methods used to make so any drift surfaces in CI.
 */

import { afterAll, describe, expect, it } from 'vitest';
import type { SimpleSkillData as SimpleSkillDataType } from '../src/module/rolls/action-data.ts';

// --- Stub Foundry globals before importing system modules. -----------------
// `unified-roll-dialog.ts` (transitive import via base-actor.ts) reads
// `foundry.applications.api.ApplicationV2` at module top-level, and `roll-helpers.ts`
// references `foundry.applications.handlebars` lazily. We need the namespaces to exist.

/**
 * Boundary shape: globals we plant on `globalThis` to stand in for Foundry's runtime
 * namespaces. The fake objects below intentionally satisfy only the surface that
 * transitively-loaded modules read at import time.
 */
interface FoundryHandlebarsStub {
    renderTemplate: () => Promise<string>;
}
interface FoundryApiStub {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructor signatures.
    ApplicationV2: new (...args: any[]) => object;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for the HandlebarsApplicationMixin generic constraint.
    HandlebarsApplicationMixin: <T extends new (...args: any[]) => object>(Base: T) => T;
}
interface FoundryUtilsStub {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with framework-defined keys/values; matches the framework type.
    Collection: new () => Map<unknown, unknown>;
}
interface FoundryStub {
    applications: { api: FoundryApiStub; handlebars: FoundryHandlebarsStub };
    utils: FoundryUtilsStub;
}
interface GameI18nStub {
    localize: (key: string) => string;
    format: (key: string) => string;
}
interface GameSettingsStub {
    get: () => boolean;
}
interface GameWh40kStub {
    log: () => void;
    error: () => void;
}
interface GameStub {
    i18n: GameI18nStub;
    user: { id: string };
    settings: GameSettingsStub;
    wh40k: GameWh40kStub;
}
interface ConstStub {
    TOKEN_DISPLAY_MODES: { OWNER_HOVER: number };
    TOKEN_DISPOSITIONS: { NEUTRAL: number; HOSTILE: number };
}

interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor takes an open source data object (`Record<string, unknown>`) per the framework.
    Actor?: (new (data?: Record<string, unknown>) => object) | undefined;
    CONST?: ConstStub | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the FoundryStubs shape; no narrower alternative since `declare global` cannot augment `globalThis` itself in a vitest test file (would leak into the global scope).
const stubs = globalThis as unknown as FoundryStubs;

const ORIGINAL_FOUNDRY = stubs.foundry;
const ORIGINAL_GAME = stubs.game;
const ORIGINAL_ACTOR = stubs.Actor;
const ORIGINAL_CONST = stubs.CONST;

class FakeApplicationV2 {}

// The HandlebarsApplicationMixin is a class-decorator-style mixin; we shim a
// pass-through that preserves the constructor signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructor signatures; `never[]`/`unknown[]` are rejected.
type ClassCtor = new (...args: any[]) => object;
const fakeHandlebarsApplicationMixin = <T extends ClassCtor>(Base: T): T => class extends Base {};

class FakeActor {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.system is the DataModel slot — unknown until narrowed by the per-type DataModel; this stub never reads it.
    declare system: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.items is a Collection of Item documents with system-specific shapes; this stub never reads it.
    declare items: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor derives characteristics from per-system DataModels; this stub never reads it.
    declare characteristics: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor accepts an open source data object (`Record<string, unknown>`) per the framework.
    constructor(public _data: Record<string, unknown> = {}) {
        Object.assign(this, _data);
    }
}

stubs.foundry = {
    applications: {
        api: {
            ApplicationV2: FakeApplicationV2,
            HandlebarsApplicationMixin: fakeHandlebarsApplicationMixin,
        },
        handlebars: {
            renderTemplate: async () => Promise.resolve(''),
        },
    },
    utils: {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with arbitrary key/value types per the framework type.
        Collection: class FakeCollection extends Map<unknown, unknown> {},
    },
};
stubs.Actor = FakeActor;
stubs.CONST = {
    TOKEN_DISPLAY_MODES: { OWNER_HOVER: 0 },
    TOKEN_DISPOSITIONS: { NEUTRAL: 0, HOSTILE: -1 },
};
stubs.game = {
    i18n: {
        localize: (key: string): string => key,
        format: (key: string): string => key,
    },
    user: { id: 'test' },
    settings: { get: (): boolean => false },
    wh40k: {
        log: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};

// Imports must come AFTER the global stubs so module-init code finds the shims.
const { WH40KBaseActor } = await import('../src/module/documents/base-actor.ts');
const { SimpleSkillData } = await import('../src/module/rolls/action-data.ts');

afterAll(() => {
    stubs.foundry = ORIGINAL_FOUNDRY;
    stubs.game = ORIGINAL_GAME;
    stubs.Actor = ORIGINAL_ACTOR;
    stubs.CONST = ORIGINAL_CONST;
});

/* -------------------------------------------- */
/*  Test harness                                 */
/* -------------------------------------------- */

interface SituationalEntry {
    key: string;
    value: number;
}

interface RollFixture {
    actorName: string;
    nameOverride: string;
    type: 'Characteristic' | 'Skill' | 'Attack';
    rollKey: string;
    baseTarget: number;
    modifierBaseline: number;
    situational?: number;
}

/**
 * The runtime shape `_buildSimpleSkillRoll` writes onto `simpleSkillData.rollData`.
 * Extracted as a single interface so each assertion targets the right field type
 * without a per-call cast.
 */
interface RollDataShape {
    // `actor` / `sourceActor` are assigned the test actor (which is a
    // `WH40KBaseActor` proto with a `name` field); we compare by reference
    // (`.toBe(actor)`), so the field type only needs `object`.
    actor: object;
    sourceActor: object;
    nameOverride: string;
    type: string;
    rollKey: string;
    baseTarget: number;
    skillRank?: number;
    modifiers: {
        modifier: number;
        situational?: number;
    };
}

type WH40KBaseActorInstance = InstanceType<typeof WH40KBaseActor>;
type BuildOpts = Parameters<WH40KBaseActorInstance['_buildSimpleSkillRoll']>[0];

interface SituationalProvider {
    getCharacteristicSituationalModifiers?: (k: string) => SituationalEntry[];
    getSkillSituationalModifiers?: (k: string) => SituationalEntry[];
    getCombatSituationalModifiers?: (k: string) => SituationalEntry[];
}

type TestActor = WH40KBaseActorInstance &
    SituationalProvider & {
        name: string;
    };

/**
 * Construct a bare-bones helper consumer. We do not invoke `new WH40KBaseActor(...)`
 * because the Foundry Actor base class does heavy data preparation; instead we build a
 * plain object whose prototype is `WH40KBaseActor.prototype`, which is enough to exercise
 * `_buildSimpleSkillRoll` without booting the rest of the document machinery.
 */
function makeActor(opts: {
    name: string;
    situationalCharacteristics?: Record<string, SituationalEntry[]>;
    situationalSkills?: Record<string, SituationalEntry[]>;
    situationalCombat?: Record<string, SituationalEntry[]>;
    fatePoints?: number;
}): TestActor {
    const actor = Object.create(WH40KBaseActor.prototype) as TestActor;
    actor.name = opts.name;
    if (opts.fatePoints !== undefined) {
        // Object.assign plants a runtime `system.fate` pool without fighting the
        // DataModel-typed `system` slot (the getter under test reads it loosely).
        Object.assign(actor, { system: { fate: { value: opts.fatePoints } } });
    }
    if (opts.situationalCharacteristics) {
        actor.getCharacteristicSituationalModifiers = (k): SituationalEntry[] => opts.situationalCharacteristics?.[k] ?? [];
    }
    if (opts.situationalSkills) {
        actor.getSkillSituationalModifiers = (k): SituationalEntry[] => opts.situationalSkills?.[k] ?? [];
    }
    if (opts.situationalCombat) {
        actor.getCombatSituationalModifiers = (k): SituationalEntry[] => opts.situationalCombat?.[k] ?? [];
    }
    return actor;
}

function rollDataOf(simpleSkillData: SimpleSkillDataType): RollDataShape {
    // eslint-disable-next-line no-restricted-syntax -- boundary: SimpleSkillData.rollData is typed as the wide RollData base; this narrows to the fields _buildSimpleSkillRoll writes
    return simpleSkillData.rollData as unknown as RollDataShape;
}

function assertShape(simpleSkillData: SimpleSkillDataType, fixture: RollFixture, sourceActor: object): void {
    expect(simpleSkillData).toBeInstanceOf(SimpleSkillData);
    const rollData = rollDataOf(simpleSkillData);

    expect(rollData.actor, 'rollData.actor === source actor').toBe(sourceActor);
    expect(rollData.sourceActor, 'rollData.sourceActor === source actor').toBe(sourceActor);
    expect(rollData.nameOverride).toBe(fixture.nameOverride);
    expect(rollData.type).toBe(fixture.type);
    expect(rollData.rollKey).toBe(fixture.rollKey);
    expect(rollData.baseTarget).toBe(fixture.baseTarget);
    expect(rollData.modifiers.modifier).toBe(fixture.modifierBaseline);
    if (fixture.situational !== undefined) {
        expect(rollData.modifiers.situational).toBe(fixture.situational);
    } else {
        expect(rollData.modifiers.situational).toBeUndefined();
    }
}

// Helper to invoke the protected `_buildSimpleSkillRoll` method without TS protection
// errors at the call site — equivalent to calling it from a subclass.
interface BuildRollHost {
    _buildSimpleSkillRoll: (o: BuildOpts) => SimpleSkillDataType;
}
function buildRoll(actor: TestActor, opts: BuildOpts): SimpleSkillDataType {
    // eslint-disable-next-line no-restricted-syntax -- boundary: _buildSimpleSkillRoll is protected; the test invokes it as a subclass would
    return (actor as unknown as BuildRollHost)._buildSimpleSkillRoll(opts);
}

/* -------------------------------------------- */
/*  PC-path tests (situational modifiers wired)  */
/* -------------------------------------------- */

describe('_buildSimpleSkillRoll — PC (acolyte) paths honour situational modifiers', () => {
    it('rollCharacteristic: produces SimpleSkillData identical to the legacy hand-rolled shape', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalCharacteristics: {
                weaponSkill: [
                    { key: 'weaponSkill', value: 10 },
                    { key: 'weaponSkill', value: -5 },
                ],
            },
        });

        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'Weapon Skill Test',
            target: 42,
            situationalKey: 'weaponSkill',
        });

        assertShape(
            result,
            {
                actorName: 'Acolyte Vex',
                nameOverride: 'Weapon Skill Test',
                type: 'Characteristic',
                rollKey: 'weaponSkill',
                baseTarget: 42,
                modifierBaseline: 0,
                situational: 5,
            },
            actor,
        );
    });

    it('rollCharacteristic with flavorOverride: nameOverride wins over the default label', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalCharacteristics: { ballisticSkill: [] },
        });

        const result = buildRoll(actor, {
            key: 'ballisticSkill',
            type: 'characteristic',
            label: 'Ballistic Skill Test',
            target: 35,
            situationalKey: 'ballisticSkill',
            nameOverride: 'Lasgun Snap-Shot',
        });

        assertShape(
            result,
            {
                actorName: 'Acolyte Vex',
                nameOverride: 'Lasgun Snap-Shot',
                type: 'Characteristic',
                rollKey: 'ballisticSkill',
                baseTarget: 35,
                modifierBaseline: 0,
            },
            actor,
        );
    });

    it('rollSkill: emits type="Skill" and pulls from skill situational modifiers', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalSkills: {
                dodge: [{ key: 'dodge', value: 20 }],
            },
        });

        const result = buildRoll(actor, {
            key: 'dodge',
            type: 'skill',
            label: 'Dodge Test',
            target: 50,
            situationalKey: 'dodge',
        });

        assertShape(
            result,
            {
                actorName: 'Acolyte Vex',
                nameOverride: 'Dodge Test',
                type: 'Skill',
                rollKey: 'dodge',
                baseTarget: 50,
                modifierBaseline: 0,
                situational: 20,
            },
            actor,
        );
    });

    it('rollSkill specialist: label can carry "Skill: Specialty" composition', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalSkills: { commonLore: [] },
        });

        const result = buildRoll(actor, {
            key: 'commonLore',
            type: 'skill',
            label: 'Common Lore: Imperium Test',
            target: 40,
            situationalKey: 'commonLore',
        });

        expect(rollDataOf(result).nameOverride).toBe('Common Lore: Imperium Test');
    });

    it('rollSkill specialist: skillRank is threaded onto rollData so the dialog sees the entry as trained (#225)', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalSkills: { commonLore: [] },
        });

        const result = buildRoll(actor, {
            key: 'commonLore',
            type: 'skill',
            label: 'Common Lore: Imperium Test',
            target: 40,
            situationalKey: 'commonLore',
            skillRank: 2,
        });

        expect(rollDataOf(result).skillRank).toBe(2);
    });

    it('omitting skillRank leaves rollData.skillRank unset (non-specialist rolls behave as before)', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalSkills: { dodge: [] },
        });

        const result = buildRoll(actor, {
            key: 'dodge',
            type: 'skill',
            label: 'Dodge Test',
            target: 50,
            situationalKey: 'dodge',
        });

        expect(rollDataOf(result).skillRank).toBeUndefined();
    });

    it('zero situational total leaves modifiers.situational unset (does not write 0)', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalCharacteristics: {
                weaponSkill: [
                    { key: 'weaponSkill', value: 10 },
                    { key: 'weaponSkill', value: -10 },
                ],
            },
        });

        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'Weapon Skill Test',
            target: 42,
            situationalKey: 'weaponSkill',
        });

        expect(rollDataOf(result).modifiers.situational).toBeUndefined();
    });
});

/* -------------------------------------------- */
/*  NPC-path tests (no situational lookup)       */
/* -------------------------------------------- */

describe('_buildSimpleSkillRoll — NPC paths skip situational lookup entirely', () => {
    it('rollCharacteristic on NPC (no situationalKey passed) does not consult situational modifiers', () => {
        // Even if the actor exposes the modifier collectors, omitting situationalKey should
        // skip them. This guarantees NPCs cannot accidentally inherit PC-only behaviour.
        const actor = makeActor({
            name: 'Cultist',
            situationalCharacteristics: {
                weaponSkill: [{ key: 'weaponSkill', value: 999 }], // booby-trap value
            },
        });

        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'Weapon Skill Test',
            target: 35,
        });

        assertShape(
            result,
            {
                actorName: 'Cultist',
                nameOverride: 'Weapon Skill Test',
                type: 'Characteristic',
                rollKey: 'weaponSkill',
                baseTarget: 35,
                modifierBaseline: 0,
            },
            actor,
        );
    });

    it('rollCharacteristic with flavor: nameOverride wins', () => {
        const actor = makeActor({ name: 'Cultist' });
        const result = buildRoll(actor, {
            key: 'agility',
            type: 'characteristic',
            label: 'Agility Test',
            target: 30,
            nameOverride: 'Hasty Dodge',
        });
        expect(rollDataOf(result).nameOverride).toBe('Hasty Dodge');
    });

    it('rollSimpleWeapon: type maps to literal "Attack" and rollKey is the attack characteristic', () => {
        const actor = makeActor({ name: 'Heavy Cultist' });
        const result = buildRoll(actor, {
            key: 'ballisticSkill',
            type: 'simpleWeapon',
            label: 'Autogun Attack',
            target: 35,
        });

        assertShape(
            result,
            {
                actorName: 'Heavy Cultist',
                nameOverride: 'Autogun Attack',
                type: 'Attack',
                rollKey: 'ballisticSkill',
                baseTarget: 35,
                modifierBaseline: 0,
            },
            actor,
        );
    });

    it('rollSkill on NPC: type="Skill", no situational lookup', () => {
        const actor = makeActor({
            name: 'Scholar Cultist',
            situationalSkills: { awareness: [{ key: 'awareness', value: 42 }] },
        });

        const result = buildRoll(actor, {
            key: 'awareness',
            type: 'skill',
            label: 'Awareness Test',
            target: 45,
        });

        assertShape(
            result,
            {
                actorName: 'Scholar Cultist',
                nameOverride: 'Awareness Test',
                type: 'Skill',
                rollKey: 'awareness',
                baseTarget: 45,
                modifierBaseline: 0,
            },
            actor,
        );
    });
});

/* -------------------------------------------- */
/*  Cross-cutting structural assertions          */
/* -------------------------------------------- */

describe('SimpleSkillData.sourceFatePoints — gates the chat-card Fate controls', () => {
    it('reports the source actor current Fate Points so the reroll/+DoS buttons can render', () => {
        const actor = makeActor({ name: 'Acolyte Vex', fatePoints: 3 });
        const result = buildRoll(actor, { key: 'awareness', type: 'skill', label: 'Awareness Test', target: 45 });
        expect(result.sourceFatePoints).toBe(3);
    });

    it('is 0 when the actor has no Fate pool (non-fate systems / spent out → no dead button)', () => {
        const actor = makeActor({ name: 'Cultist' });
        const result = buildRoll(actor, { key: 'awareness', type: 'skill', label: 'Awareness Test', target: 45 });
        expect(result.sourceFatePoints).toBe(0);
    });
});

describe('_buildSimpleSkillRoll — structural invariants', () => {
    it('always returns a fresh SimpleSkillData (no shared rollData between calls)', () => {
        const actor = makeActor({ name: 'A' });
        const a = buildRoll(actor, { key: 'k', type: 'characteristic', label: 'L', target: 1 });
        const b = buildRoll(actor, { key: 'k', type: 'characteristic', label: 'L', target: 1 });
        expect(a).not.toBe(b);
        expect(a.rollData).not.toBe(b.rollData);
    });

    it('PC path with situationalKey provided but no collector method present returns 0 situational', () => {
        // makeActor without any situational* maps doesn't define the collector methods.
        const actor = makeActor({ name: 'A' });
        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'WS Test',
            target: 40,
            situationalKey: 'weaponSkill',
        });
        const modifiers = rollDataOf(result).modifiers;
        expect(modifiers.modifier).toBe(0);
        expect(modifiers.situational).toBeUndefined();
    });
});
