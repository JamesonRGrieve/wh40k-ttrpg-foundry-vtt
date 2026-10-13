/**
 * The inline skill-use flow (#432) and the RAW per-target time gates (#458) it depends on.
 *
 * Rolling a skill now opens ONE dialog: the use picker and (for a target-directed use)
 * the target picker are inline, and the concrete ActionData subclass is not constructed
 * until the roll resolves. Two consequences are load-bearing and tested here:
 *
 * 1. **Deferral is real.** Changing the use, or choosing/changing the target, AFTER the
 *    action was created must change what actually resolves.
 * 2. **The gate cannot be outrun.** Because the target is mutable right up to
 *    resolution, the cooldown check had to move out of `_rollTargetedSkillUse`
 *    (pre-dialog) into `descriptionText()` (resolution) — otherwise a player could pass
 *    the check against an eligible patient and then retarget onto a locked one. The
 *    abort semantics are asserted end to end: nothing applied, nothing stamped, and the
 *    player told why (a notification AND a chat-card row).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { SkillUseItemSource } from '../src/module/rolls/action-data.ts';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

/* -------------------------------------------- */
/*  Foundry global stubs                         */
/* -------------------------------------------- */

interface FoundryStub {
    applications: { api: ApplicationV2Api; handlebars: { renderTemplate: () => Promise<string> } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with framework-defined key/value types.
    utils: { Collection: new () => Map<unknown, unknown> };
}
interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string, data?: Record<string, string>) => string };
    // eslint-disable-next-line no-restricted-syntax -- boundary: test registry returns untyped objects standing in for real Foundry actors
    actors: { get: (id: string) => unknown };
    socket: { emit: () => void; on: () => void };
    time: { worldTime: number };
    user: { id: string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface UiStub {
    notifications: { warn: (message: string) => void; info: (message: string) => void; error: (message: string) => void };
}
interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
    ui?: UiStub | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor takes an open source data object per the framework.
    Actor?: (new (data?: Record<string, unknown>) => object) | undefined;
    Roll?: (new (formula: string) => { evaluate: () => Promise<void>; total: number }) | undefined;
    CONST?: { TOKEN_DISPLAY_MODES: { OWNER_HOVER: number }; TOKEN_DISPOSITIONS: { NEUTRAL: number; HOSTILE: number } } | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as FoundryStubs;

const ORIGINAL = { foundry: stubs.foundry, game: stubs.game, ui: stubs.ui, Actor: stubs.Actor, Roll: stubs.Roll, CONST: stubs.CONST };

/** Warnings raised through `ui.notifications.warn` during the current test. */
const warnings: string[] = [];

class FakeActor {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.system is the per-type DataModel slot; this stub never reads it.
    declare system: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor accepts an open source data object per the framework.
    constructor(public _data: Record<string, unknown> = {}) {
        Object.assign(this, _data);
    }
}

/** Deterministic 1d5 stand-in for the Interrogation lockout roll (always 3 days). */
const LOCKOUT_ROLL_TOTAL = 3;

// eslint-disable-next-line no-restricted-syntax -- boundary: test registry returns untyped objects standing in for real Foundry actors
const fakeActorRegistry: Map<string, unknown> = new Map();
let fakeActorCounter = 0;

stubs.foundry = {
    applications: { api: buildApplicationV2Api(), handlebars: { renderTemplate: async (): Promise<string> => Promise.resolve('') } },
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with arbitrary key/value types per the framework type.
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.Actor = FakeActor;
stubs.Roll = class FakeRoll {
    total = LOCKOUT_ROLL_TOTAL;
    constructor(public formula: string) {}
    async evaluate(): Promise<void> {
        return Promise.resolve();
    }
};
stubs.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 0 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0, HOSTILE: -1 } };
stubs.ui = {
    notifications: {
        warn: (message: string): void => {
            warnings.push(message);
        },
        info: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};
stubs.game = {
    i18n: {
        // Format echoes the key plus its interpolations so assertions can see both.
        localize: (key: string): string => key,
        format: (key: string, data?: Record<string, string>): string => `${key}|${JSON.stringify(data ?? {})}`,
    },
    // eslint-disable-next-line no-restricted-syntax -- boundary: test stub returns untyped objects standing in for real Foundry actors
    actors: { get: (id: string): unknown => fakeActorRegistry.get(id) },
    socket: { emit: (): void => {}, on: (): void => {} },
    time: { worldTime: 0 },
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

// Imports must come AFTER the stubs so module-init code finds the shims.
const {
    applySkillUseToRollData,
    buildSkillUseDelegate,
    ChemUseActionData,
    ContestActionData,
    DemolitionActionData,
    DetectionActionData,
    InterrogationActionData,
    MedicaeActionData,
    ObjectStateActionData,
    PalmActionData,
    SkillUseActionData,
    SocialBuffActionData,
    SocialInfluenceActionData,
} = await import('../src/module/rolls/action-data.ts');
const { dispatchItemChoiceUse, getSkillUse, getSkillUses, skillUseItemCandidates } = await import('../src/module/rules/skill-uses.ts');
const { DAY_SECONDS } = await import('../src/module/rules/world-time.ts');

afterAll(() => {
    Object.assign(stubs, ORIGINAL);
});

/* -------------------------------------------- */
/*  Test harness                                 */
/* -------------------------------------------- */

/** A patient/subject standing in for a real actor — only the surface the resolvers read. */
interface FakeTarget {
    id: string;
    isOwner: boolean;
    name: string;
    wounds: { value: number; max: number; critical: number };
    system: { fatigue?: { value: number; max: number } };
    characteristics: Record<string, { effectiveBonus: number }>;
    /** Per-key gate expiries, exactly as `WH40KBaseActor.getTimeGate` would return them. */
    gates: Record<string, number>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payloads are open-ended Records
    updates: Array<Record<string, unknown>>;
    /** Fatigue levels inflicted through `applyFatigue`. */
    fatigueApplied: number[];
    getTimeGate: (key: string) => number | null;
    setTimeGate: (key: string, expiry: number) => Promise<void>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payloads are open-ended Records
    update: (patch: Record<string, unknown>) => Promise<void>;
    applyFatigue: (levels: number) => Promise<void>;
}

function makeTarget(opts: { name?: string; wounds?: { value: number; max: number; critical: number }; gates?: Record<string, number> } = {}): FakeTarget {
    const id = `fake-${++fakeActorCounter}`;
    const target: FakeTarget = {
        id,
        isOwner: true,
        name: opts.name ?? 'Patient',
        wounds: opts.wounds ?? { value: 4, max: 12, critical: 0 },
        system: { fatigue: { value: 0, max: 10 } },
        characteristics: { toughness: { effectiveBonus: 3 } },
        gates: opts.gates ?? {},
        updates: [],
        fatigueApplied: [],
        getTimeGate: (key: string): number | null => target.gates[key] ?? null,
        setTimeGate: async (key: string, expiry: number): Promise<void> => {
            target.gates[key] = expiry;
            return Promise.resolve();
        },
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payloads are open-ended Records
        update: async (patch: Record<string, unknown>): Promise<void> => {
            target.updates.push(patch);
            for (const [key, val] of Object.entries(patch)) {
                const gateMatch = key.match(/^flags\.wh40k-rpg\.timeGates\.(.+)$/);
                if (gateMatch !== null && typeof val === 'number') target.gates[gateMatch[1]] = val;
                if (key === 'system.fatigue.value' && typeof val === 'number') target.fatigueApplied.push(val);
            }
            return Promise.resolve();
        },
        applyFatigue: async (levels: number): Promise<void> => {
            target.fatigueApplied.push(levels);
            return Promise.resolve();
        },
    };
    fakeActorRegistry.set(id, target);
    return target;
}

/** The resolved-roll slots the Medicae / Interrogation resolvers read off `rollData`. */
interface ResolvedRollData {
    targetActor: FakeTarget;
    sourceActor: { name: string };
    success: boolean;
    dos: number;
    dof: number;
}

/** A skill-use definition as the registry hands it back (non-null). */
type SkillUseDefLike = NonNullable<ReturnType<typeof getSkillUse>>;

/** The roll-data slots `applySkillUseToRollData` writes, for direct assertion. */
interface ShapedRollData {
    nameOverride: string;
    isOpposed: boolean;
    opposedChar: string;
    modifiers: Record<string, number>;
    targetActor: FakeTarget | null;
}

/** Any resolution-time action under test — all extend `SimpleSkillData`. */
type GatedAction = InstanceType<typeof MedicaeActionData> | InstanceType<typeof InterrogationActionData> | InstanceType<typeof SkillUseActionData>;

/** Bind a resolved roll outcome + final target onto an action, mirroring the live pipeline. */
function bind(action: GatedAction, target: FakeTarget, outcome: { success: boolean; dos?: number; dof?: number }): void {
    // eslint-disable-next-line no-restricted-syntax -- boundary: RollData#targetActor is typed as the real WH40KBaseActor document; the fixture satisfies only the surface the resolvers read
    const rollData = action.rollData as unknown as ResolvedRollData;
    rollData.targetActor = target;
    rollData.sourceActor = { name: 'Medic' };
    rollData.success = outcome.success;
    rollData.dos = outcome.dos ?? 0;
    rollData.dof = outcome.dof ?? 0;
}

/** The chat-card effect text an action wrote, joined for substring assertions. */
function cardText(action: GatedAction): string {
    return action.effectOutput.map((e) => e.effect).join(' ');
}

beforeEach(() => {
    warnings.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the stub is installed at module scope above; it is always present here
    stubs.game!.time.worldTime = 0;
});

/* -------------------------------------------- */
/*  Medicae (#432/#458)                          */
/* -------------------------------------------- */

describe('MedicaeActionData — resolution-time time gate (#458)', () => {
    it('heals and stamps the 24h gate when the patient is not on cooldown', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget();
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toHaveLength(2);
        expect(target.updates[0]).toEqual({ 'system.wounds.value': 5 });
        expect(target.gates['firstAid']).toBe(DAY_SECONDS);
        expect(target.updates[1]).toEqual({ 'flags.wh40k-rpg.timeGates.firstAid': DAY_SECONDS });
        expect(warnings).toHaveLength(0);
    });

    it('applies NOTHING and warns when the patient is still inside their First Aid cooldown', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { firstAid: DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = 6 * 3600; // 18 hours still to run
        bind(action, target, { success: true, dos: 3 });

        await action.descriptionText();

        expect(target.updates).toEqual([]);
        expect(target.wounds.value).toBe(4);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('WH40K.SkillUse.GateCooldown');
        expect(warnings[0]).toContain('18h');
        // The abort is also on the card, not just a transient toast.
        expect(cardText(action)).toContain('WH40K.SkillUse.GateCooldown');
    });

    it('does not RE-stamp the gate when it aborts (the cooldown never self-extends)', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { firstAid: DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = 6 * 3600;
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.gates['firstAid']).toBe(DAY_SECONDS);
    });

    it('blocks First Aid through an open Extended Care window with the exclusion message (DH2 p109)', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { extendedCare: DAY_SECONDS } });
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toEqual([]);
        expect(warnings[0]).toContain('WH40K.SkillUse.GateExtendedCare');
    });

    it('reopens the moment in-universe time reaches the expiry', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { firstAid: DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = DAY_SECONDS;
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toHaveLength(2);
        expect(warnings).toHaveLength(0);
        expect(target.gates['firstAid']).toBe(2 * DAY_SECONDS);
    });

    it('isolates the gate per patient — a locked patient never blocks a fresh one', async () => {
        const locked = makeTarget({ name: 'Locked', gates: { firstAid: DAY_SECONDS } });
        const fresh = makeTarget({ name: 'Fresh' });

        const blocked = new MedicaeActionData('firstAid');
        bind(blocked, locked, { success: true, dos: 1 });
        await blocked.descriptionText();

        const allowed = new MedicaeActionData('firstAid');
        bind(allowed, fresh, { success: true, dos: 1 });
        await allowed.descriptionText();

        expect(locked.updates).toEqual([]);
        expect(fresh.updates).toHaveLength(2);
    });

    it('leaves ungated uses (Surgery) unaffected by a First Aid cooldown on the same patient', async () => {
        const action = new MedicaeActionData('surgery');
        const target = makeTarget({ wounds: { value: 4, max: 12, critical: 2 }, gates: { firstAid: DAY_SECONDS } });
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toEqual([{ 'system.wounds.critical': 1 }]);
        expect(warnings).toHaveLength(0);
    });
});

/* -------------------------------------------- */
/*  Interrogation (#435/#458)                    */
/* -------------------------------------------- */

describe('InterrogationActionData — resolution-time time gate (#458)', () => {
    it('interrogates normally when the subject carries no lockout', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject' });
        bind(action, target, { success: true, dos: 2 });

        await action.descriptionText();

        expect(target.fatigueApplied).toEqual([1]);
        expect(warnings).toHaveLength(0);
    });

    it('inflicts NO fatigue and extracts nothing while the subject is locked out', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject', gates: { interrogate: 3 * DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = DAY_SECONDS; // two days still to run
        bind(action, target, { success: true, dos: 4 });

        await action.descriptionText();

        expect(target.fatigueApplied).toEqual([]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('WH40K.SkillUse.GateCooldown');
        expect(warnings[0]).toContain('2d');
        expect(cardText(action)).toContain('WH40K.SkillUse.GateCooldown');
    });

    it('stamps the rolled 1d5-day lockout on a 2+ degree failure', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject' });
        bind(action, target, { success: false, dof: 2 });

        await action.descriptionText();

        expect(target.gates['interrogate']).toBe(LOCKOUT_ROLL_TOTAL * DAY_SECONDS);
        expect(target.fatigueApplied).toEqual([1]);
    });

    it('is not blocked by an unrelated Medicae gate on the same subject', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject', gates: { firstAid: DAY_SECONDS } });
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.fatigueApplied).toEqual([1]);
        expect(warnings).toHaveLength(0);
    });
});

/* -------------------------------------------- */
/*  Delegate selection by use kind (#432)        */
/* -------------------------------------------- */

describe('buildSkillUseDelegate — action selection by use kind', () => {
    const useOf = (skill: string, id: string): SkillUseDefLike => getSkillUse(skill, id) as SkillUseDefLike;

    it('builds no action for the plain test (nothing is applied)', () => {
        expect(buildSkillUseDelegate(useOf('medicae', 'general'))).toBeNull();
    });

    it('routes the whole Medicae family through MedicaeActionData, keyed by kind', () => {
        for (const kind of ['firstAid', 'extendedCare', 'surgery', 'diagnose', 'extractBullet']) {
            const action = buildSkillUseDelegate(useOf('medicae', kind));
            expect(action).toBeInstanceOf(MedicaeActionData);
            expect((action as InstanceType<typeof MedicaeActionData>).useKind).toBe(kind);
        }
    });

    it('routes each remaining family to its own action', () => {
        expect(buildSkillUseDelegate(useOf('interrogation', 'interrogate'))).toBeInstanceOf(InterrogationActionData);
        expect(buildSkillUseDelegate(useOf('stealth', 'detect'))).toBeInstanceOf(DetectionActionData);
        expect(buildSkillUseDelegate(useOf('charm', 'social'))).toBeInstanceOf(SocialInfluenceActionData);
        expect(buildSkillUseDelegate(useOf('charm', 'inspire'))).toBeInstanceOf(SocialBuffActionData);
        expect(buildSkillUseDelegate(useOf('barter', 'contest'))).toBeInstanceOf(ContestActionData);
    });

    it('carries the contest rival skill onto the action', () => {
        const contest = buildSkillUseDelegate(useOf('gamble', 'contest')) as InstanceType<typeof ContestActionData>;
        expect(contest.opposedSkill).toBe('gamble');
    });

    it('refuses the item-choice families — they need their item before construction', () => {
        for (const [skill, id] of [
            ['chemUse', 'applyChem'],
            ['chemUse', 'coatWeapon'],
            ['sleightOfHand', 'steal'],
            ['sleightOfHand', 'plant'],
            ['techUse', 'repair'],
            ['security', 'bypassLock'],
            ['athletics', 'breakObject'],
            ['demolition', 'placeCharge'],
            ['demolition', 'defuse'],
        ] as const) {
            expect(buildSkillUseDelegate(useOf(skill, id))).toBeNull();
        }
    });
});

/* -------------------------------------------- */
/*  Roll shaping per use (#432)                  */
/* -------------------------------------------- */

describe('applySkillUseToRollData — roll shaping', () => {
    /** A pristine host whose real `RollData` the shaping is applied to. */
    const freshAction = (): InstanceType<typeof SkillUseActionData> => new SkillUseActionData('medicae', 'Medicae');
    /** The same roll data, narrowed to the slots the shaping writes, for assertion. */
    const shaped = (action: InstanceType<typeof SkillUseActionData>): ShapedRollData =>
        // eslint-disable-next-line no-restricted-syntax -- boundary: RollData is the heterogeneous roll bag; narrowed to the slots the shaping writes
        action.rollData as unknown as ShapedRollData;
    const useOf = (skill: string, id: string): SkillUseDefLike => getSkillUse(skill, id) as SkillUseDefLike;

    it('labels the plain test as a bare skill test and a special use as "Skill: Use"', () => {
        const action = freshAction();
        applySkillUseToRollData(action.rollData, useOf('medicae', 'general'), 'Medicae');
        expect(shaped(action).nameOverride).toBe('Medicae Test');
        applySkillUseToRollData(action.rollData, useOf('medicae', 'surgery'), 'Medicae');
        expect(shaped(action).nameOverride).toBe('Medicae: WH40K.SkillUse.Medicae.Surgery');
    });

    it('raises characteristic opposition for a WP/Per-opposed use', () => {
        const action = freshAction();
        applySkillUseToRollData(action.rollData, useOf('interrogation', 'interrogate'), 'Interrogation');
        expect(shaped(action).isOpposed).toBe(true);
        expect(shaped(action).opposedChar).toBe('WP');
    });

    it('does NOT raise characteristic opposition for a SKILL-opposed use (the action resolves it)', () => {
        const action = freshAction();
        applySkillUseToRollData(action.rollData, useOf('deceive', 'social'), 'Deceive');
        expect(shaped(action).isOpposed).toBe(false);
        applySkillUseToRollData(action.rollData, useOf('barter', 'contest'), 'Barter');
        expect(shaped(action).isOpposed).toBe(false);
    });

    it('CLEARS opposition when the player switches back to an unopposed use', () => {
        const action = freshAction();
        applySkillUseToRollData(action.rollData, useOf('interrogation', 'interrogate'), 'Interrogation');
        expect(shaped(action).isOpposed).toBe(true);
        applySkillUseToRollData(action.rollData, useOf('medicae', 'surgery'), 'Medicae');
        expect(shaped(action).isOpposed).toBe(false);
    });

    it('sets the RAW use difficulty, and REPLACES rather than accumulates it across switches', () => {
        const action = freshAction();
        applySkillUseToRollData(action.rollData, useOf('medicae', 'surgery'), 'Medicae');
        expect(shaped(action).modifiers['useDifficulty']).toBe(-20);
        applySkillUseToRollData(action.rollData, useOf('medicae', 'extendedCare'), 'Medicae');
        expect(shaped(action).modifiers['useDifficulty']).toBe(-10);
    });

    it('removes the difficulty slot entirely for a zero-modifier use', () => {
        const action = freshAction();
        applySkillUseToRollData(action.rollData, useOf('medicae', 'surgery'), 'Medicae');
        applySkillUseToRollData(action.rollData, useOf('medicae', 'general'), 'Medicae');
        expect('useDifficulty' in shaped(action).modifiers).toBe(false);
    });

    it("First Aid difficulty scales with the patient's damage tier (RAW, #432)", () => {
        const action = freshAction();
        const firstAid = useOf('medicae', 'firstAid');

        // Unharmed / undamaged → Challenging (+0), no useDifficulty modifier.
        shaped(action).targetActor = makeTarget({ wounds: { value: 12, max: 12, critical: 0 } });
        applySkillUseToRollData(action.rollData, firstAid, 'Medicae');
        expect('useDifficulty' in shaped(action).modifiers).toBe(false);

        // Heavily Damaged (< half wounds) → −10.
        shaped(action).targetActor = makeTarget({ wounds: { value: 1, max: 12, critical: 0 } });
        applySkillUseToRollData(action.rollData, firstAid, 'Medicae');
        expect(shaped(action).modifiers['useDifficulty']).toBe(-10);

        // Critically Damaged → −10 per point of critical damage.
        shaped(action).targetActor = makeTarget({ wounds: { value: 0, max: 12, critical: 2 } });
        applySkillUseToRollData(action.rollData, firstAid, 'Medicae');
        expect(shaped(action).modifiers['useDifficulty']).toBe(-20);
    });
});

/* -------------------------------------------- */
/*  Inline use selection + deferred construction */
/* -------------------------------------------- */

describe('SkillUseActionData — inline use selection', () => {
    it('offers exactly the skill registry uses, defaulting to the plain test', () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        expect(action.skillUseOptions.map((u) => u.id)).toEqual(getSkillUses('medicae').map((u) => u.id));
        expect(action.selectedSkillUseId).toBe('general');
    });

    it('transitions the selection and re-shapes the roll in one step', () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        action.selectSkillUse('surgery');
        expect(action.selectedSkillUseId).toBe('surgery');
        expect(action.selectedSkillUse?.kind).toBe('surgery');
        expect(action.rollData.nameOverride).toBe('Medicae: WH40K.SkillUse.Medicae.Surgery');
        expect(action.rollData.modifiers['useDifficulty']).toBe(-20);
    });

    it('ignores a use id the skill does not offer', () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        action.selectSkillUse('placeCharge');
        expect(action.selectedSkillUseId).toBe('general');
    });

    it('switching use is fully reversible — no residue from the abandoned pick', () => {
        const action = new SkillUseActionData('interrogation', 'Interrogation');
        action.selectSkillUse('interrogate');
        action.selectSkillUse('general');
        expect(action.rollData.isOpposed).toBe(false);
        expect('useDifficulty' in action.rollData.modifiers).toBe(false);
        expect(action.rollData.nameOverride).toBe('Interrogation Test');
    });

    it('DEFERS construction — the use chosen LAST is the one that resolves', async () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        const target = makeTarget({ wounds: { value: 4, max: 12, critical: 2 } });
        bind(action, target, { success: true, dos: 1 });

        // Pick First Aid, then change your mind to Surgery before rolling.
        action.selectSkillUse('firstAid');
        action.selectSkillUse('surgery');
        await action.descriptionText();

        // Surgery resolved (a critical tier removed), not First Aid (no wound restored).
        expect(target.updates).toEqual([{ 'system.wounds.critical': 1 }]);
    });

    it('honours a target chosen AFTER the action was built (in-dialog targeting)', async () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        action.selectSkillUse('firstAid');
        // Nothing was targeted when the dialog opened…
        expect(action.rollData.targetActor).toBeNull();

        // …the player picks a patient in the dialog, then rolls.
        const target = makeTarget();
        bind(action, target, { success: true, dos: 1 });
        await action.descriptionText();

        expect(target.updates[0]).toEqual({ 'system.wounds.value': 5 });
    });

    it('folds the delegate chat-card rows onto the shell (the action the card renders)', async () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        const target = makeTarget();
        bind(action, target, { success: true, dos: 1 });
        action.selectSkillUse('firstAid');
        await action.descriptionText();

        expect(action.effectOutput.length).toBeGreaterThan(0);
        expect(cardText(action)).toContain('WH40K.SkillUse.Applied');
    });

    it('applies nothing on the plain test', async () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        const target = makeTarget();
        bind(action, target, { success: true, dos: 3 });
        await action.descriptionText();

        expect(target.updates).toEqual([]);
        expect(action.effectOutput).toEqual([]);
    });

    it('aborts with a warning when a target-directed use reaches resolution with NO target', async () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        action.selectSkillUse('firstAid');
        // eslint-disable-next-line no-restricted-syntax -- boundary: RollData carries the resolved-roll slots; narrowed to what the resolver reads
        const rollData = action.rollData as unknown as ResolvedRollData;
        rollData.success = true;
        rollData.dos = 1;

        await action.descriptionText();

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('WH40K.SkillUse.NoTarget');
        expect(cardText(action)).toContain('WH40K.SkillUse.NoTarget');
    });

    it('CANNOT bypass the RAW gate by retargeting onto a locked patient in-dialog', async () => {
        const action = new SkillUseActionData('medicae', 'Medicae');
        action.selectSkillUse('firstAid');

        // Open against an eligible patient — the old pre-dialog check would have passed here…
        const eligible = makeTarget({ name: 'Eligible' });
        bind(action, eligible, { success: true, dos: 1 });

        // …then retarget in-dialog onto a patient who is still on cooldown.
        const locked = makeTarget({ name: 'Locked', gates: { firstAid: DAY_SECONDS } });
        bind(action, locked, { success: true, dos: 1 });

        await action.descriptionText();

        expect(locked.updates).toEqual([]);
        expect(eligible.updates).toEqual([]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('WH40K.SkillUse.GateCooldown');
    });

    it('still resolves an opposed use through the shell delegate', async () => {
        const action = new SkillUseActionData('interrogation', 'Interrogation');
        action.selectSkillUse('interrogate');
        const target = makeTarget({ name: 'Subject' });
        bind(action, target, { success: true, dos: 2 });

        await action.descriptionText();

        expect(action.rollData.isOpposed).toBe(true);
        expect(action.rollData.opposedChar).toBe('WP');
        expect(target.fatigueApplied).toEqual([1]);
    });
});

/* -------------------------------------------- */
/*  Item-choice uses in the dialog (#535)        */
/* -------------------------------------------- */

/** The system slots the item-choice actions and candidate filters read. */
interface FakeItemSystem {
    uses: { value: number; max: number };
    grants: { activeEffects: Array<{ key: string; mode: number; value: number; durationRounds: number }> };
    addictive: number;
    state: { broken: boolean; locked: boolean; destroyed: boolean; armed: { active: boolean; setterDegrees: number } };
    jammed: boolean;
}

/** A carried item: satisfies the candidate filters and every item-choice action's item shape. */
interface FakeItem {
    id: string;
    name: string;
    type: string;
    isWeapon: boolean;
    isArmour: boolean;
    isGear: boolean;
    system: FakeItemSystem;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    updates: Array<Record<string, unknown>>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    update: (patch: Record<string, unknown>) => Promise<void>;
}

function fakeItem(
    id: string,
    opts: { type?: string; isWeapon?: boolean; isGear?: boolean; state?: Partial<FakeItemSystem['state']>; uses?: number; effects?: number } = {},
): FakeItem {
    const item: FakeItem = {
        id,
        name: `Item ${id}`,
        type: opts.type ?? (opts.isWeapon === true ? 'weapon' : 'gear'),
        isWeapon: opts.isWeapon ?? false,
        isArmour: false,
        isGear: opts.isGear ?? opts.isWeapon !== true,
        system: {
            uses: { value: opts.uses ?? 0, max: opts.uses ?? 0 },
            grants: { activeEffects: Array.from({ length: opts.effects ?? 0 }, () => ({ key: 'system.x', mode: 2, value: 1, durationRounds: 1 })) },
            addictive: 0,
            state: { broken: false, locked: false, destroyed: false, armed: { active: false, setterDegrees: 0 }, ...opts.state },
            jammed: false,
        },
        updates: [],
        update: async (patch): Promise<void> => {
            item.updates.push(patch);
            return Promise.resolve();
        },
    };
    return item;
}

/** What the roller carries, what each target carries, and what the fake source records. */
interface ItemWorld {
    own: FakeItem[];
    carriedBy: Map<object, FakeItem[]>;
    /** The craftsmanship row a repair pick brings. */
    craftsmanship: number;
    /** What the pre-roll step answers. */
    proceed: boolean;
    /** Every handler call, as [family, use id, ...picked ids]. */
    calls: string[][];
}

function itemWorld(own: FakeItem[] = []): ItemWorld {
    return { own, carriedBy: new Map(), craftsmanship: 0, proceed: true, calls: [] };
}

/**
 * The item source an actor hands the shell, built on the REAL candidate filters and
 * the REAL per-kind dispatch, with handlers that build the real actions. This is the
 * acolyte's wiring minus the Foundry documents.
 */
function itemSource(world: ItemWorld): SkillUseItemSource {
    const carried = (target: object | null): FakeItem[] | null => (target === null ? null : world.carriedBy.get(target) ?? []);
    const findItem = (id: string, target: object | null): FakeItem | null =>
        carried(target)?.find((i) => i.id === id) ?? world.own.find((i) => i.id === id) ?? null;
    return {
        candidates: (use, slot, target) => skillUseItemCandidates(use, slot, world.own, carried(target)).map((i) => ({ id: i.id, name: i.name })),
        modifiers: (use, choice): Record<string, number> =>
            use.kind === 'repair' && choice.item !== undefined ? { 'craftsmanship-repair': world.craftsmanship } : {},
        beforeRoll: async (): Promise<boolean> => Promise.resolve(world.proceed),
        build: (use, choice, target) =>
            dispatchItemChoiceUse<ReturnType<SkillUseItemSource['build']>>(use, choice, {
                chem: (u, chemId, weaponId) => {
                    world.calls.push(['chem', u.id, chemId, weaponId ?? '']);
                    const chem = findItem(chemId, null);
                    if (chem === null) return null;
                    return u.kind === 'coatWeapon'
                        ? new ChemUseActionData('coatWeapon', chem, findItem(weaponId ?? '', null))
                        : new ChemUseActionData('applyChem', chem);
                },
                palm: (u, itemId) => {
                    world.calls.push(['palm', u.id, itemId]);
                    return new PalmActionData(u.kind === 'steal' ? 'steal' : 'plant', itemId);
                },
                objectState: (u, itemId) => {
                    world.calls.push(['objectState', u.id, itemId]);
                    const item = findItem(itemId, target);
                    const mode = u.kind === 'repair' ? 'repair' : u.kind === 'bypassLock' ? 'bypassLock' : 'breakObject';
                    return item === null ? null : new ObjectStateActionData(mode, item);
                },
                demolition: (u, itemId) => {
                    world.calls.push(['demolition', u.id, itemId]);
                    const item = findItem(itemId, target);
                    if (item === null) return null;
                    return u.kind === 'placeCharge' ? new DemolitionActionData('placeCharge', item, 'on trigger') : new DemolitionActionData('defuse', item);
                },
            }),
    };
}

describe('SkillUseActionData — item-choice uses resolve through their handler (#535)', () => {
    it.each([
        ['chemUse', 'applyChem', fakeItem('chem', { type: 'drug', isGear: false, uses: 2, effects: 1 }), ['chem', 'applyChem', 'chem', '']],
        ['sleightOfHand', 'plant', fakeItem('knife', { isWeapon: true }), ['palm', 'plant', 'knife']],
        ['techUse', 'repair', fakeItem('auspex', { state: { broken: true } }), ['objectState', 'repair', 'auspex']],
        ['security', 'bypassLock', fakeItem('lockbox', { state: { locked: true } }), ['objectState', 'bypassLock', 'lockbox']],
        ['athletics', 'breakObject', fakeItem('crate'), ['objectState', 'breakObject', 'crate']],
        ['demolition', 'placeCharge', fakeItem('krak'), ['demolition', 'placeCharge', 'krak']],
        ['demolition', 'defuse', fakeItem('armed', { state: { armed: { active: true, setterDegrees: 1 } } }), ['demolition', 'defuse', 'armed']],
    ] as const)('%s / %s: picking an item calls the handler with that item', async (skill, useId, item, expected) => {
        const world = itemWorld([item]);
        const action = new SkillUseActionData(skill, skill, undefined, itemSource(world));
        action.selectSkillUse(useId);
        action.selectSkillUseItem('item', item.id);
        // A target is bound for every kind: Apply and Plant need one, and it carries none of the items.
        bind(action, makeTarget({ name: 'Mark' }), { success: false, dof: 1 });
        // The mark's opposing roll is not under test here, only which handler builds the action.
        action.rollData.isOpposed = false;

        await expect(action.prepareSkillUseRoll()).resolves.toBe('ready');
        await action.checkForOpposed();

        expect(world.calls).toEqual([expected]);
    });

    it('Steal picks from the TARGET’s items and moves the picked one on a win', async () => {
        const world = itemWorld();
        const mark = makeTarget({ name: 'Mark' });
        const purse = fakeItem('purse');
        world.carriedBy.set(mark, [fakeItem('rosary'), purse]);
        const moved: string[] = [];
        Object.assign(mark, {
            transferItemTo: async (id: string): Promise<string> => {
                moved.push(id);
                return Promise.resolve('Item purse');
            },
        });
        const action = new SkillUseActionData('sleightOfHand', 'Sleight of Hand', undefined, itemSource(world));
        action.selectSkillUse('steal');
        bind(action, mark, { success: true, dos: 2 });
        action.syncSkillUse();
        expect(action.skillUseItemPickers[0]?.options.map((o) => o.id)).toEqual(['rosary', 'purse']);
        action.selectSkillUseItem('item', 'purse');

        await action.descriptionText();

        expect(world.calls).toEqual([['palm', 'steal', 'purse']]);
        expect(moved).toEqual(['purse']);
    });

    it('Repair clears the picked item’s broken state, shows its craftsmanship row before the roll, and names it', async () => {
        const auspex = fakeItem('auspex', { state: { broken: true } });
        const vox = fakeItem('vox', { state: { broken: true } });
        const world = itemWorld([auspex, vox]);
        world.craftsmanship = -10;
        const action = new SkillUseActionData('techUse', 'Tech-Use', undefined, itemSource(world));
        action.selectSkillUse('repair');
        action.selectSkillUseItem('item', 'vox');

        expect(action.rollData.modifiers['craftsmanship-repair']).toBe(-10);
        expect(action.rollData.nameOverride).toBe('Tech-Use: WH40K.SkillUse.Object.Repair (Item vox)');

        bind(action, makeTarget(), { success: true, dos: 1 });
        await action.descriptionText();

        expect(vox.updates).toEqual([{ 'system.state.broken': false, 'system.jammed': false }]);
        expect(auspex.updates).toEqual([]);
        expect(cardText(action)).toContain('WH40K.SkillUse.Object.Repaired');
    });

    it('defaults to the first eligible item and replaces, never stacks, the item modifiers', () => {
        const world = itemWorld([fakeItem('auspex', { state: { broken: true } }), fakeItem('vox', { state: { broken: true } })]);
        world.craftsmanship = -10;
        const action = new SkillUseActionData('techUse', 'Tech-Use', undefined, itemSource(world));
        action.selectSkillUse('repair');
        expect(action.skillUseItemPickers[0]?.selectedId).toBe('auspex');

        action.selectSkillUseItem('item', 'vox');
        action.syncSkillUse();
        expect(action.rollData.modifiers['craftsmanship-repair']).toBe(-10);

        action.selectSkillUse('general');
        expect(action.rollData.modifiers['craftsmanship-repair']).toBeUndefined();
        expect(action.skillUseItemPickers).toEqual([]);
    });

    it('ignores a pick the slot does not offer', () => {
        const world = itemWorld([fakeItem('auspex', { state: { broken: true } }), fakeItem('intact')]);
        const action = new SkillUseActionData('techUse', 'Tech-Use', undefined, itemSource(world));
        action.selectSkillUse('repair');
        action.selectSkillUseItem('item', 'intact');
        expect(action.skillUseItemPickers[0]?.selectedId).toBe('auspex');
    });

    it('Coat Weapon needs both a chem and a weapon, and coats the picked weapon', async () => {
        const blade = fakeItem('blade', { isWeapon: true });
        const world = itemWorld([fakeItem('toxin', { type: 'drug', isGear: false, uses: 3, effects: 1 }), blade]);
        const action = new SkillUseActionData('chemUse', 'Chem-Use', undefined, itemSource(world));
        action.selectSkillUse('coatWeapon');
        expect(action.skillUseItemPickers.map((p) => [p.key, p.selectedId])).toEqual([
            ['item', 'toxin'],
            ['weapon', 'blade'],
        ]);
        bind(action, makeTarget(), { success: true, dos: 1 });
        await action.descriptionText();

        expect(world.calls).toEqual([['chem', 'coatWeapon', 'toxin', 'blade']]);
        expect(blade.updates).toEqual([{ 'system.state.coating': { name: 'Item toxin', charges: 3 } }]);
    });

    it('Place Charge arms the picked explosive', async () => {
        const krak = fakeItem('krak');
        const action = new SkillUseActionData('demolition', 'Demolition', undefined, itemSource(itemWorld([krak])));
        action.selectSkillUse('placeCharge');
        bind(action, makeTarget(), { success: true, dos: 2 });
        await action.descriptionText();
        expect(krak.updates).toEqual([{ 'system.state.armed': { active: true, trigger: 'on trigger', setterDegrees: 2 } }]);
    });

    it('blocks the roll and says what is missing when nothing is eligible', async () => {
        const action = new SkillUseActionData('techUse', 'Tech-Use', undefined, itemSource(itemWorld([fakeItem('intact')])));
        action.selectSkillUse('repair');
        await expect(action.prepareSkillUseRoll()).resolves.toBe('blocked');
        expect(warnings).toEqual(['WH40K.SkillUse.Object.NoBroken']);
    });

    it('reports on the card instead of resolving a bare test when no item reached resolution', async () => {
        const action = new SkillUseActionData('techUse', 'Tech-Use', undefined, itemSource(itemWorld()));
        action.selectSkillUse('repair');
        bind(action, makeTarget(), { success: true, dos: 1 });
        await action.descriptionText();
        expect(cardText(action)).toContain('WH40K.SkillUse.Object.NoBroken');
    });

    it('is redirected when the pre-roll step launches another test (the xenos Forbidden Lore step)', async () => {
        const world = itemWorld([fakeItem('xenos-blade', { isWeapon: true, state: { broken: true } })]);
        world.proceed = false;
        const action = new SkillUseActionData('techUse', 'Tech-Use', undefined, itemSource(world));
        action.selectSkillUse('repair');
        await expect(action.prepareSkillUseRoll()).resolves.toBe('redirected');
    });

    it('lets a plain use roll with no pre-roll step', async () => {
        const action = new SkillUseActionData('techUse', 'Tech-Use', undefined, itemSource(itemWorld()));
        await expect(action.prepareSkillUseRoll()).resolves.toBe('ready');
    });
});
