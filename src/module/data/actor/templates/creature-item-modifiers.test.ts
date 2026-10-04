import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Path A end to end: an owned item's static `modifiers` block (ModifiersTemplate)
 * → `CreatureTemplate._computeItemModifiers` / `_applyItemModifiers` → the actor's
 * characteristic totals, skill targets and combat totals, with a provenance entry
 * per contributing item in `system.modifierSources`.
 *
 * `creature.ts` only needs `foundry.abstract` + `foundry.data.fields` at module
 * evaluation, so a stub is installed BEFORE a dynamic import (a static import
 * would hoist above it). The DataModel base is an empty class, which lets the
 * template be constructed and its preparation methods driven on hand-set data —
 * the same methods `prepareEmbeddedData` runs, in the same order.
 *
 * Every positive assertion pins a value that must be PRESENT: the failure mode
 * guarded here is a modifier silently dropped on its way to the target number.
 */

type AnyCtor = abstract new (...args: never[]) => object;
interface FoundryStub {
    abstract: { DataModel: AnyCtor; TypeDataModel: AnyCtor };
    data: { fields: Record<string, AnyCtor> };
    utils: { mergeObject: <T extends object>(original: T, other: object) => T };
}
interface GlobalShim {
    foundry?: FoundryStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_FOUNDRY = G.foundry;
class StubField {}
G.foundry = {
    abstract: { DataModel: class {}, TypeDataModel: class {} },
    // The schema factories are never invoked here; every field ctor is the same inert class.
    data: { fields: new Proxy<Record<string, AnyCtor>>({}, { get: () => StubField }) },
    // ActorDataModel merges its metadata at class-definition time.
    utils: { mergeObject: <T extends object>(original: T, other: object): T => ({ ...original, ...other }) },
};

afterAll(() => {
    G.foundry = ORIGINAL_FOUNDRY;
});

const { default: CreatureTemplate } = await import('./creature.ts');

/** The two game lines every case runs under — the aggregation is system-generic. */
const SYSTEMS = ['dh2', 'rt'] as const;

/** Item-modifier block as an author writes it on a compendium item. */
interface ModifiersBlock {
    characteristics?: Record<string, number>;
    skills?: Record<string, number>;
    combat?: Record<string, number>;
}

/** The structural slice of a `WH40KItem` the aggregator reads. */
interface FakeItem {
    name: string;
    type: string;
    id: string;
    uuid: string;
    isOriginPath: boolean;
    isTalent: boolean;
    isTrait: boolean;
    isCondition: boolean;
    system: { modifiers: ModifiersBlock; state?: { equipped: boolean } };
}

function makeItem(name: string, type: string, modifiers: ModifiersBlock, equipped?: boolean): FakeItem {
    return {
        name,
        type,
        id: `${name}-id`,
        uuid: `Actor.a.Item.${name}-id`,
        isOriginPath: type === 'originPath',
        isTalent: type === 'talent',
        isTrait: type === 'trait',
        isCondition: type === 'condition',
        system: { modifiers, ...(equipped === undefined ? {} : { state: { equipped } }) },
    };
}

/** The stored (pre-preparation) slice of a characteristic the aggregator reads. */
interface StoredCharacteristic {
    label: string;
    short: string;
    base: number;
    advance: number;
    modifier: number;
    unnatural: number;
    damage: number;
    total: number;
    bonus: number;
}

/** The stored slice of a standard skill the aggregator reads. */
interface StoredSkill {
    label: string;
    characteristic: string;
    advanced: boolean;
    basic: boolean;
    advance: number;
    bonus: number;
    current: number;
}

/** A characteristic as the schema stores it before preparation. */
function characteristic(base: number, short: string): StoredCharacteristic {
    return { label: short, short, base, advance: 0, modifier: 0, unnatural: 0, damage: 0, total: base, bonus: Math.floor(base / 10) };
}

/** A trained (rank 1) standard skill, so its target is exactly the characteristic total. */
function trainedSkill(characteristicShort: string): StoredSkill {
    return { label: characteristicShort, characteristic: characteristicShort, advanced: false, basic: true, advance: 1, bonus: 0, current: 0 };
}

type Creature = InstanceType<typeof CreatureTemplate>;

/** Base value of each characteristic before any override. */
const DEFAULT_BASES: Record<string, [number, string]> = {
    weaponSkill: [40, 'WS'],
    ballisticSkill: [35, 'BS'],
    strength: [30, 'S'],
    toughness: [30, 'T'],
    agility: [30, 'Ag'],
    intelligence: [40, 'Int'],
    perception: [30, 'Per'],
    willpower: [30, 'WP'],
    fellowship: [30, 'Fel'],
};

/**
 * Build a creature owning `items`, then run the item-modifier half of
 * `prepareEmbeddedData` (`_computeItemModifiers` → characteristics → skills).
 * `bases` overrides a characteristic's stored base (e.g. one the Origin Path
 * Builder already raised).
 */
function prepare(gameSystem: string, items: FakeItem[], bases: Record<string, number> = {}): Creature {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's TypeDataModel constructor demands (data, options), which the stubbed base ignores; the instance is populated by hand below
    const creature = new (CreatureTemplate as unknown as new () => Creature)();
    Object.assign(creature, {
        gameSystem,
        characteristics: Object.fromEntries(Object.entries(DEFAULT_BASES).map(([key, [base, short]]) => [key, characteristic(bases[key] ?? base, short)])),
        skills: { medicae: trainedSkill('Int'), awareness: trainedSkill('Per') },
        initiative: { characteristic: 'agility', base: 0, bonus: 0 },
        fatigue: { value: 0, max: 0 },
    });
    Object.defineProperty(creature, 'parent', { value: { items: { filter: (fn: (i: FakeItem) => boolean) => items.filter(fn) } } });
    creature._initializeModifierTracking();
    creature._computeItemModifiers();
    creature._applyModifiersToCharacteristics();
    creature._applyModifiersToSkills();
    return creature;
}

beforeEach(() => {
    // WH40KSettings.getFatigueMode reads a world setting; 'auto' keeps the line's RAW model.
    vi.stubGlobal('game', { settings: { get: () => 'auto' } });
});

describe.each(SYSTEMS)('Path A — static item modifiers reach the computed target (%s)', (gameSystem) => {
    it('an equipped gear item raises the characteristic total and records its provenance', () => {
        const scope = makeItem('Bionic Eye', 'gear', { characteristics: { perception: 10 } }, true);
        const { characteristics, modifierSources } = prepare(gameSystem, [scope]);

        expect(characteristics.perception.total).toBe(40);
        expect(characteristics.perception.itemModifier).toBe(10);
        expect(modifierSources.characteristics['perception']).toEqual([
            expect.objectContaining({ name: 'Bionic Eye', type: 'gear', id: 'Bionic Eye-id', value: 10 }),
        ]);
    });

    it('an equipped armour and cybernetic each contribute, stacking with their own provenance rows', () => {
        const armour = makeItem('Carapace', 'armour', { characteristics: { agility: -10 } }, true);
        const cyber = makeItem('Bionic Legs', 'cybernetic', { characteristics: { agility: 5 } }, true);
        const { characteristics, modifierSources } = prepare(gameSystem, [armour, cyber]);

        expect(characteristics.agility.total).toBe(25);
        expect(modifierSources.characteristics['agility']?.map((s) => [s.name, s.value])).toEqual([
            ['Carapace', -10],
            ['Bionic Legs', 5],
        ]);
    });

    it('an equipped item modifies a skill target and the derived characteristic flows into it', () => {
        const kit = makeItem('Medi-kit', 'gear', { skills: { medicae: 20 }, characteristics: { intelligence: 5 } }, true);
        const { skills, modifierSources } = prepare(gameSystem, [kit]);

        // Int 40 + 5 (item) = 45 → trained Medicae 45, + 20 skill modifier = 65.
        expect(skills.medicae.current).toBe(65);
        expect(skills.medicae.itemModifier).toBe(20);
        expect(modifierSources.skills['medicae']).toEqual([expect.objectContaining({ name: 'Medi-kit', value: 20 })]);
    });

    it('an UNEQUIPPED gear / armour / cybernetic contributes nothing and leaves no provenance', () => {
        const items = [
            makeItem('Stowed Scope', 'gear', { characteristics: { perception: 10 } }, false),
            makeItem('Stowed Carapace', 'armour', { characteristics: { agility: -10 } }, false),
            makeItem('Spare Bionic', 'cybernetic', { skills: { awareness: 10 } }, false),
        ];
        const { characteristics, skills, modifierSources } = prepare(gameSystem, items);

        expect(characteristics.perception.total).toBe(30);
        expect(characteristics.agility.total).toBe(30);
        expect(skills.awareness.current).toBe(30);
        expect(modifierSources.characteristics).toEqual({});
        expect(modifierSources.skills).toEqual({});
    });

    it('a weapon never contributes its modifiers block, equipped or not (it is not a passive item)', () => {
        const { characteristics } = prepare(gameSystem, [makeItem('Lasgun', 'weapon', { characteristics: { ballisticSkill: 10 } }, true)]);
        expect(characteristics.ballisticSkill.total).toBe(35);
    });

    it('a talent and a trait apply with no equip state at all', () => {
        const talent = makeItem('Sound Constitution', 'talent', { characteristics: { toughness: 5 } });
        const trait = makeItem('Unnatural Senses', 'trait', { skills: { awareness: 10 } });
        const { characteristics, skills, modifierSources } = prepare(gameSystem, [talent, trait]);

        expect(characteristics.toughness.total).toBe(35);
        expect(skills.awareness.current).toBe(40);
        expect(modifierSources.characteristics['toughness']).toEqual([expect.objectContaining({ name: 'Sound Constitution', type: 'talent' })]);
        expect(modifierSources.skills['awareness']).toEqual([expect.objectContaining({ name: 'Unnatural Senses', type: 'trait' })]);
    });

    it('a condition item applies its modifiers (penalties are modifiers too)', () => {
        const { characteristics } = prepare(gameSystem, [makeItem('Blinded', 'condition', { characteristics: { ballisticSkill: -30 } })]);
        expect(characteristics.ballisticSkill.total).toBe(5);
    });

    // The condition packs author characteristics by SHORT key (`ws: -30` on Blinded).
    // The buckets are keyed by the full key the totals read, so a short key landed in
    // its own `ws` bucket and never applied.
    it('a short-key characteristic modifier (ws) applies to its full characteristic', () => {
        const { characteristics } = prepare(gameSystem, [makeItem('Blinded', 'condition', { characteristics: { ws: -30, BS: -10 } })]);
        expect(characteristics.weaponSkill.total).toBe(10); // WS 40 − 30
        expect(characteristics.ballisticSkill.total).toBe(25); // BS 35 − 10
    });

    // Regression: the Origin Path Builder bakes origin characteristic bonuses into
    // `base` on commit, and `_registerOriginPathModifierSources` ALSO lists them in
    // `modifierSources.characteristics` for the tooltip. `_getTotalCharacteristicModifier`
    // summed that bucket wholesale, so every origin bonus landed twice (+5 Fel → +10).
    it('an origin-path bonus (already baked into base) is listed as provenance but never re-applied', () => {
        const origin = makeItem('Imperial World', 'originPath', { characteristics: { fellowship: 5 } });
        // The builder committed base 30 + 5 origin = 35.
        const { characteristics, modifierSources } = prepare(gameSystem, [origin], { fellowship: 35 });

        expect(characteristics.fellowship.total).toBe(35);
        expect(characteristics.fellowship.itemModifier).toBe(0);
        expect(modifierSources.characteristics['fellowship']).toEqual([expect.objectContaining({ name: 'Imperial World', type: 'originPath', value: 5 })]);
    });

    it('an origin-path bonus does not mask a real item bonus on the same characteristic', () => {
        const origin = makeItem('Imperial World', 'originPath', { characteristics: { fellowship: 5 } });
        const talent = makeItem('Peer', 'talent', { characteristics: { fellowship: 10 } });
        const { characteristics } = prepare(gameSystem, [origin, talent], { fellowship: 35 });

        expect(characteristics.fellowship.itemModifier).toBe(10);
        expect(characteristics.fellowship.total).toBe(45);
    });

    it('re-running preparation does not accumulate (totals are rebuilt from base each pass)', () => {
        const scope = makeItem('Bionic Eye', 'gear', { characteristics: { perception: 10 } }, true);
        const creature = prepare(gameSystem, [scope]);
        creature._initializeModifierTracking();
        creature._computeItemModifiers();
        creature._applyModifiersToCharacteristics();

        expect(creature.characteristics.perception.total).toBe(40);
        expect(creature.modifierSources.characteristics['perception']).toHaveLength(1);
    });

    // Regression: the combat bucket was seeded with `toHit` / `defence`, while the
    // schema, the talent editor and the compendium author `attack` / `defense`. An
    // unknown combat key is deliberately dropped, so every authored to-hit and
    // defence modifier vanished without a trace — and `combatModifiers.attack` /
    // `.defense` read buckets that could never be filled.
    it('records every schema combat key (attack / damage / penetration / defense / initiative / speed) with provenance', () => {
        const talent = makeItem('Battle Drill', 'talent', {
            combat: { attack: 10, damage: 2, penetration: 1, defense: 10, initiative: 1, speed: 2 },
        });
        const { combatModifiers, modifierSources } = prepare(gameSystem, [talent]);

        expect(combatModifiers).toEqual({ attack: 10, damage: 2, penetration: 1, defense: 10, initiative: 1, speed: 2 });
        const recorded = Object.fromEntries(Object.entries(modifierSources.combat).map(([key, list]) => [key, list?.map((s) => [s.name, s.value])]));
        expect(recorded).toEqual({
            attack: [['Battle Drill', 10]],
            damage: [['Battle Drill', 2]],
            penetration: [['Battle Drill', 1]],
            defense: [['Battle Drill', 10]],
            initiative: [['Battle Drill', 1]],
            speed: [['Battle Drill', 2]],
        });
    });

    it('folds the initiative combat modifier into the initiative bonus', () => {
        const { initiative } = prepare(gameSystem, [makeItem('Lightning Reflexes', 'talent', { combat: { initiative: 3 } })]);
        // Agility 30 → bonus 3, + 3 from the talent.
        expect(initiative.bonus).toBe(6);
        expect(initiative.itemModifier).toBe(3);
    });
});
