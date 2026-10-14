import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { buildConditionCatalog, type EffectDataInput, setConditionCatalog } from '../../rules/condition-registry.ts';
import { conditionPackFixture } from '../../testing/condition-catalog.ts';
import { importModelOrSkip } from '../../testing/model-import.ts';
import type { SupportedLineKey } from '../../utils/item-variant-utils.ts';
import type { ActiveEffectLike, EffectsOwner } from '../api/effect-actions.ts';
import type { EffectCreationData, EffectPayload } from './effect-creation-dialog.ts';

/** The dialog's form-input shape (re-exported from the source so the test asserts against the real type). */
type EffectData = EffectCreationData;

/**
 * Tests for EffectCreationDialog's payload builders (#341).
 *
 * The dialog `extends ApplicationV2`, which is evaluated at module-load, so the
 * Foundry globals it references must be installed before the dynamic import.
 * The builders are static and pure (given the stubbed globals), so we exercise
 * them directly without instantiating the dialog or booting ApplicationV2.
 */

const ADD_MODE = 2;

// Minimal shape of the static surface the tests reach into. Returns are the
// concrete EffectPayload imported from the source (#341).
interface EffectBuilders {
    _buildEffectData: (args: { label: string; changeKey: string; value: number; icon: string; data: EffectData }) => EffectPayload;
    _applyDuration: (effectData: EffectPayload, data: EffectData) => EffectPayload;
    _createCharacteristicData: (data: EffectData) => EffectPayload | null;
    _createSkillData: (data: EffectData) => EffectPayload | null;
    _createCombatData: (data: EffectData) => EffectPayload | null;
    _createConditionData: (data: EffectData, line: SupportedLineKey) => EffectDataInput | null;
}

/** A minimal valid EffectPayload literal for tests that only assert on `duration`. */
function emptyPayload(): EffectPayload {
    return { name: '', icon: '', changes: [], flags: { 'wh40k-rpg': { nature: 'harmful' } } };
}

/** Narrow a builder's `EffectPayload | null` result to a non-null payload for assertions. */
function assertPayload(payload: EffectPayload | null): EffectPayload {
    expect(payload).not.toBeNull();
    if (payload === null) throw new Error('expected a non-null EffectPayload');
    return payload;
}

function installGlobals(combat: { round: number; turn: number } | null): void {
    Object.assign(globalThis, {
        CONST: { ACTIVE_EFFECT_MODES: { ADD: ADD_MODE } },
        CONFIG: { WH40K: { characteristics: { weaponSkill: { label: 'Weapon Skill' } } } },
        game: { combat },
        foundry: {
            applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: <T>(base: T): T => base } },
            utils: { deepClone: <T>(o: T): T => structuredClone(o) },
        },
    });
}

async function loadBuilders(): Promise<EffectBuilders | undefined> {
    const mod = await importModelOrSkip(import('./effect-creation-dialog.ts'));
    if (mod === undefined) return undefined;
    return mod.default;
}

describe('EffectCreationDialog payload builders (#341)', () => {
    beforeEach(() => {
        installGlobals({ round: 3, turn: 1 });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('_buildEffectData assembles the single-change payload with nature + sign', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._buildEffectData({
            label: 'Strength',
            changeKey: 'system.characteristics.strength.modifier',
            value: 10,
            icon: 'icons/svg/upgrade.svg',
            data: { effectType: 'custom' },
        });

        expect(effect.name).toBe('Strength +10');
        expect(effect.icon).toBe('icons/svg/upgrade.svg');
        expect(effect.changes).toEqual([{ key: 'system.characteristics.strength.modifier', mode: ADD_MODE, value: 10 }]);
        expect(effect.flags['wh40k-rpg'].nature).toBe('beneficial');
        expect(effect.duration).toBeUndefined();
    });

    it('_buildEffectData marks negative values harmful and omits the + sign', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._buildEffectData({
            label: 'Agility',
            changeKey: 'system.characteristics.agility.modifier',
            value: -20,
            icon: 'icons/svg/upgrade.svg',
            data: { effectType: 'custom' },
        });

        expect(effect.name).toBe('Agility -20');
        expect(effect.flags['wh40k-rpg'].nature).toBe('harmful');
    });

    it('_applyDuration adds a combat-anchored duration block when rounds > 0', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._applyDuration(emptyPayload(), { effectType: 'custom', duration: { rounds: '5' } });
        expect(effect.duration).toEqual({ rounds: 5, startRound: 3, startTurn: 1 });
    });

    it('_applyDuration defaults startRound/startTurn to 0 with no active combat', async () => {
        installGlobals(null);
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._applyDuration(emptyPayload(), { effectType: 'custom', duration: { rounds: '2' } });
        expect(effect.duration).toEqual({ rounds: 2, startRound: 0, startTurn: 0 });
    });

    it('_applyDuration leaves the payload untouched when rounds is 0 or absent', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        expect(Builders._applyDuration(emptyPayload(), { effectType: 'custom' }).duration).toBeUndefined();
        expect(Builders._applyDuration(emptyPayload(), { effectType: 'custom', duration: { rounds: '0' } }).duration).toBeUndefined();
    });

    it('_createCharacteristicData resolves the CONFIG label and routes through _buildEffectData', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(
            Builders._createCharacteristicData({ effectType: 'characteristic', characteristic: 'weaponSkill', modifierValue: '15', duration: { rounds: '4' } }),
        );

        expect(effect.name).toBe('Weapon Skill +15');
        expect(effect.changes[0]?.key).toBe('system.characteristics.weaponSkill.modifier');
        expect(effect.duration).toEqual({ rounds: 4, startRound: 3, startTurn: 1 });
    });

    it('_createCharacteristicData falls back to a capitalised label when CONFIG lacks one', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(Builders._createCharacteristicData({ effectType: 'characteristic', characteristic: 'strength', modifierValue: '5' }));
        expect(effect.name).toBe('Strength +5');
    });

    it('_createSkillData builds a skill-bonus change', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(Builders._createSkillData({ effectType: 'skill', skill: 'dodge', modifierValue: '10' }));
        expect(effect.name).toBe('Dodge +10');
        expect(effect.changes[0]?.key).toBe('system.skills.dodge.bonus');
    });

    it('_createCombatData builds a combat change with the combat icon', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(Builders._createCombatData({ effectType: 'combat', combatType: 'attack', modifierValue: '-10' }));
        expect(effect.name).toBe('Attack -10');
        expect(effect.icon).toBe('icons/svg/combat.svg');
        expect(effect.changes[0]?.key).toBe('system.combat.attack');
        expect(effect.flags['wh40k-rpg'].nature).toBe('harmful');
    });

    it('the modifier builders return null when value is 0 or the target is missing', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        expect(Builders._createCharacteristicData({ effectType: 'characteristic', characteristic: 'strength', modifierValue: '0' })).toBeNull();
        expect(Builders._createSkillData({ effectType: 'skill', modifierValue: '5' })).toBeNull();
        expect(Builders._createCombatData({ effectType: 'combat', combatType: 'attack', modifierValue: '0' })).toBeNull();
    });

    it("_createConditionData builds the condition document's payload for the actor's line, with the shared duration block", async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when ApplicationV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;
        setConditionCatalog(buildConditionCatalog(conditionPackFixture()));

        const dh2 = Builders._createConditionData({ effectType: 'condition', conditionId: 'prone', duration: { rounds: '2' } }, 'dh2');
        expect(dh2?.name).toBe('Prone');
        expect(dh2?.statuses).toEqual(['prone']);
        expect(dh2?.changes?.map((c) => c.key)).toEqual(['system.characteristics.weaponSkill.modifier', 'system.combat.defense']);
        expect(dh2?.duration).toEqual({ rounds: 2, startRound: 3, startTurn: 1 });

        const rt = Builders._createConditionData({ effectType: 'condition', conditionId: 'prone' }, 'rt');
        expect(rt?.changes?.map((c) => c.key)).toEqual(['system.characteristics.weaponSkill.modifier', 'system.skills.dodge.bonus']);

        expect(Builders._createConditionData({ effectType: 'condition', conditionId: 'nonexistent' }, 'dh2')).toBeNull();
        setConditionCatalog(new Map());
    });
});

/* -------------------------------------------------------------------------- */
/*  DialogResolution wiring (#287)                                            */
/* -------------------------------------------------------------------------- */

/**
 * The dialog now composes the shared `DialogResolution` helper (#287) instead of a
 * passed-in `resolve` callback: `show()` tracks the resolution, `formHandler`
 * resolves it with the created effect, and the `close()` override resolves the
 * default (null) on dismissal — with the helper guarding against a double-resolve.
 *
 * The dialog `extends ApplicationV2` (evaluated at module load), so ApplicationV2 is stubbed
 * with a no-op that records the constructed instance via `render()` — letting us
 * drive the resolution paths without booting ApplicationV2.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- types the module that loadDialog() imports dynamically at runtime; a static import would be unused as a value
type EffectModule = typeof import('./effect-creation-dialog.ts');
/** The dialog instance type, derived from the module's default export (a single static import). */
type EffectCreationDialog = InstanceType<EffectModule['default']>;

/** The most recently rendered dialog instance, captured by the stubbed `render()`. */
let capturedDialog: EffectCreationDialog | undefined;

/** A stand-in ActiveEffect the mocked owner "creates"; identity is all the tests assert on. */
const createdEffect: ActiveEffectLike = { name: 'ae-created', disabled: false, update: vi.fn(), delete: vi.fn() };

function installResolutionGlobals(): void {
    capturedDialog = undefined;

    class ApplicationV2Stub {
        // eslint-disable-next-line no-restricted-syntax -- boundary: stub of Foundry ApplicationV2's untyped options bag
        constructor(_options?: Record<string, unknown>) {}
        // `this` is the EffectCreationDialog subclass instance at call time (this.render()).
        render(this: EffectCreationDialog, _force?: boolean): void {
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- intentional: capture the rendered dialog instance so the test can drive its form handler
            capturedDialog = this;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: stub of Foundry ApplicationV2.close()'s untyped options bag
        async close(_options?: Record<string, unknown>): Promise<this> {
            await Promise.resolve();
            return this;
        }
    }

    Object.assign(globalThis, {
        ui: { notifications: { warn: vi.fn() } },
        game: { combat: null },
        CONST: { ACTIVE_EFFECT_MODES: { ADD: 2 } },
        CONFIG: { WH40K: { characteristics: {} } },
        foundry: {
            applications: { api: { ApplicationV2: ApplicationV2Stub, HandlebarsApplicationMixin: <T>(base: T): T => base } },
            utils: { deepClone: <T>(o: T): T => structuredClone(o) },
        },
    });
}

async function loadDialog(): Promise<EffectModule | undefined> {
    return importModelOrSkip(import('./effect-creation-dialog.ts'));
}

type CreateEmbedded = EffectsOwner['createEmbeddedDocuments'];

/** A `createEmbeddedDocuments` spy resolving to the given created effects. */
function createSpy(created: ActiveEffectLike[] = []): Mock<CreateEmbedded> {
    return vi.fn<CreateEmbedded>().mockResolvedValue(created);
}

/** A mocked effects owner (actor or item) whose `createEmbeddedDocuments` is the given spy. */
function mockOwner(createEmbeddedDocuments: Mock<CreateEmbedded>, uuid = 'Actor.abc'): EffectsOwner {
    return { uuid, effects: { get: (): undefined => undefined }, createEmbeddedDocuments };
}

/** Invoke the static form handler on a captured dialog with a valid custom-effect payload. */
async function submitCustom(Mod: EffectModule, dialog: EffectCreationDialog, customName: string): Promise<void> {
    const formData = { object: { effectType: 'custom', customName } as EffectCreationData };
    await Mod.default.formHandler.call(
        dialog,
        // eslint-disable-next-line no-restricted-syntax -- boundary: SubmitEvent is a DOM framework type the handler never reads here
        new Event('submit') as unknown as SubmitEvent,
        document.createElement('form'),
        // eslint-disable-next-line no-restricted-syntax -- boundary: FormDataExtended is a Foundry framework type; the handler reads formData.object only
        formData as unknown as FormDataExtended,
    );
}

describe('EffectCreationDialog resolution wiring (#287)', () => {
    beforeEach(() => {
        vi.resetModules();
        installResolutionGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('show() resolves the created effect on a successful submit', async () => {
        const Mod = await loadDialog();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: fail loudly if the stub could not load the dialog, never skip silently
        if (Mod === undefined) throw new Error('EffectCreationDialog failed to load under the ApplicationV2 stub');

        const create = createSpy([createdEffect]);
        const result = Mod.default.show(mockOwner(create));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: render() must have captured the instance
        if (capturedDialog === undefined) throw new Error('render() did not capture the dialog instance');

        await submitCustom(Mod, capturedDialog, 'Aura');

        await expect(result).resolves.toBe(createdEffect);
        expect(create).toHaveBeenCalledOnce();
    });

    it('show() resolves null when the dialog is dismissed via close()', async () => {
        const Mod = await loadDialog();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: fail loudly if the stub could not load the dialog, never skip silently
        if (Mod === undefined) throw new Error('EffectCreationDialog failed to load under the ApplicationV2 stub');

        const result = Mod.default.show(mockOwner(createSpy()));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: render() must have captured the instance
        if (capturedDialog === undefined) throw new Error('render() did not capture the dialog instance');

        await capturedDialog.close();

        await expect(result).resolves.toBeNull();
    });

    it('never double-resolves: a close() after a submit does not overwrite the effect with null', async () => {
        const Mod = await loadDialog();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: fail loudly if the stub could not load the dialog, never skip silently
        if (Mod === undefined) throw new Error('EffectCreationDialog failed to load under the ApplicationV2 stub');

        const result = Mod.default.show(mockOwner(createSpy([createdEffect])));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: render() must have captured the instance
        if (capturedDialog === undefined) throw new Error('render() did not capture the dialog instance');

        await submitCustom(Mod, capturedDialog, 'Aura');
        // Dismissal after a resolved submit must be a guarded no-op, not a second resolution.
        await capturedDialog.close();

        await expect(result).resolves.toBe(createdEffect);
    });

    it("creates on an item owner with the item's origin laid under the built effect (#516)", async () => {
        const Mod = await loadDialog();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: fail loudly if the stub could not load the dialog, never skip silently
        if (Mod === undefined) throw new Error('EffectCreationDialog failed to load under the ApplicationV2 stub');

        const create = createSpy([createdEffect]);
        const item = mockOwner(create, 'Item.xyz');
        const result = Mod.default.show(item, { origin: item.uuid });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: render() must have captured the instance
        if (capturedDialog === undefined) throw new Error('render() did not capture the dialog instance');

        await submitCustom(Mod, capturedDialog, 'Blessed Edge');

        await expect(result).resolves.toBe(createdEffect);
        expect(create).toHaveBeenCalledWith('ActiveEffect', [expect.objectContaining({ origin: 'Item.xyz', name: 'Blessed Edge' })]);
    });
});

/**
 * Regression (#516, found by the Tier B spec): as a DialogV2 the window rendered
 * only DialogV2's `content` string and its Create / Cancel buttons — DialogV2
 * ignores PARTS and `_prepareContext` — so the category tabs and pickers never
 * appeared and Create submitted an empty form. It is now a Handlebars
 * ApplicationV2 whose root is the form and whose template is that form's content.
 */
describe('EffectCreationDialog renders its template (#516)', () => {
    const source = readFileSync(resolve(__dirname, 'effect-creation-dialog.ts'), 'utf8');
    const template = readFileSync(resolve(__dirname, '../../../templates/dialogs/effect-creation-dialog.hbs'), 'utf8');

    beforeEach(() => {
        vi.resetModules();
        installResolutionGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('is a Handlebars ApplicationV2, never a DialogV2', () => {
        expect(source).toMatch(/extends HandlebarsApplicationMixin\(ApplicationV2\)/);
        expect(source).not.toMatch(/extends DialogV2|\{ DialogV2 \}/);
    });

    it('renders its template as the content of its own form root', async () => {
        const Mod = await loadDialog();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: fail loudly if the stub could not load the dialog, never skip silently
        if (Mod === undefined) throw new Error('EffectCreationDialog failed to load under the ApplicationV2 stub');
        expect(Mod.default.DEFAULT_OPTIONS.tag).toBe('form');
        expect(Mod.default.DEFAULT_OPTIONS).not.toHaveProperty('buttons');
        expect(Mod.default.PARTS).toMatchObject({ form: { template: 'systems/wh40k-rpg/templates/dialogs/effect-creation-dialog.hbs' } });
        // A nested <form> inside the form root would never submit through the window's handler.
        expect(template).not.toMatch(/<form\b/);
    });

    it('picking a condition requests a real form submit, so the handler runs and the window closes', async () => {
        const Mod = await loadDialog();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: fail loudly if the stub could not load the dialog, never skip silently
        if (Mod === undefined) throw new Error('EffectCreationDialog failed to load under the ApplicationV2 stub');
        void Mod.default.show(mockOwner(createSpy()));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: render() must have captured the instance
        if (capturedDialog === undefined) throw new Error('render() did not capture the dialog instance');

        // The window root is the form (`tag: 'form'`): the dialog's element.
        const form = document.createElement('form');
        form.innerHTML = '<input type="hidden" name="effectType" value="custom"><input type="hidden" name="conditionId">';
        const requestSubmit = vi.fn();
        form.requestSubmit = requestSubmit;
        Object.defineProperty(capturedDialog, 'element', { value: form });
        const row = document.createElement('div');
        row.dataset['conditionId'] = 'stunned';

        Mod.default._onSelectCondition.call(capturedDialog, new Event('click'), row);

        expect((form.elements.namedItem('effectType') as HTMLInputElement).value).toBe('condition');
        expect((form.elements.namedItem('conditionId') as HTMLInputElement).value).toBe('stunned');
        // ApplicationV2#submit would run the handler but never honour closeOnSubmit.
        expect(requestSubmit).toHaveBeenCalledOnce();
    });
});
