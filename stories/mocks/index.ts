type DeepPartial<T> = T extends (infer U)[]
    ? U[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override?: DeepPartial<T>): T {
    if (!override) return base;
    if (!isPlainObject(base)) return (override as T) ?? base;
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, ovVal] of Object.entries(override as Record<string, unknown>)) {
        const baseVal = (base as Record<string, unknown>)[key];
        if (isPlainObject(ovVal) && isPlainObject(baseVal)) {
            result[key] = deepMerge(baseVal, ovVal as DeepPartial<typeof baseVal>);
        } else {
            result[key] = ovVal;
        }
    }
    return result as T;
}

// ── Skill ────────────────────────────────────────────────────────────────────

export interface MockSkill {
    name: string;
    img: string;
    system: {
        skillType: string;
        skillTypeLabel: string;
        characteristicLabel: string;
        characteristicAbbr: string;
        isBasic: boolean;
        descriptor: string;
        uses: string;
        specialRules: string;
        useTime: string;
        aptitudes: string[];
        hasSpecializations: boolean;
        specializations: string[];
    };
}

export function mockSkill(overrides?: DeepPartial<MockSkill>): MockSkill {
    const base: MockSkill = {
        name: 'Awareness',
        img: 'icons/skills/awareness.webp',
        system: {
            skillType: 'basic',
            skillTypeLabel: 'Basic Skill',
            characteristicLabel: 'Perception',
            characteristicAbbr: 'Per',
            isBasic: true,
            descriptor: 'You notice things that other people miss.',
            uses: '<p>Used to spot ambushes, hidden objects, and subtle cues.</p>',
            specialRules: '',
            useTime: 'Free Action',
            aptitudes: ['Perception', 'Fieldcraft'],
            hasSpecializations: false,
            specializations: [],
        },
    };
    return deepMerge(base, overrides);
}

// ── Item ─────────────────────────────────────────────────────────────────────

export interface MockItem {
    _id: string;
    name: string;
    img: string;
    type: string;
    system: Record<string, unknown>;
}

export function mockItem(overrides?: DeepPartial<MockItem>): MockItem {
    const base: MockItem = {
        _id: 'mock-item-' + Math.random().toString(36).slice(2, 8),
        name: 'Generic Item',
        img: 'icons/svg/item-bag.svg',
        type: 'gear',
        system: {},
    };
    return deepMerge(base, overrides);
}

// ── Characteristic ───────────────────────────────────────────────────────────

export interface MockCharacteristic {
    short: string;
    label: string;
    total: number;
    bonus: number;
    modifier: number;
    advance: number;
}

const CHARACTERISTIC_DEFAULTS: Record<string, { short: string; label: string }> = {
    weaponSkill: { short: 'WS', label: 'Weapon Skill' },
    ballisticSkill: { short: 'BS', label: 'Ballistic Skill' },
    strength: { short: 'S', label: 'Strength' },
    toughness: { short: 'T', label: 'Toughness' },
    agility: { short: 'Ag', label: 'Agility' },
    intelligence: { short: 'Int', label: 'Intelligence' },
    perception: { short: 'Per', label: 'Perception' },
    willpower: { short: 'Wp', label: 'Willpower' },
    fellowship: { short: 'Fel', label: 'Fellowship' },
    influence: { short: 'Inf', label: 'Influence' },
};

function mockCharacteristic(key: string, total = 35, modifier = 0, advance = 0): MockCharacteristic {
    const meta = CHARACTERISTIC_DEFAULTS[key] ?? { short: key.toUpperCase(), label: key };
    return {
        short: meta.short,
        label: meta.label,
        total,
        bonus: Math.floor(total / 10),
        modifier,
        advance,
    };
}

export function mockCharacteristics(
    overrides?: Partial<Record<keyof typeof CHARACTERISTIC_DEFAULTS, Partial<MockCharacteristic>>>,
): Record<string, MockCharacteristic> {
    const result: Record<string, MockCharacteristic> = {};
    for (const key of Object.keys(CHARACTERISTIC_DEFAULTS)) {
        result[key] = deepMerge(mockCharacteristic(key), overrides?.[key as keyof typeof CHARACTERISTIC_DEFAULTS]);
    }
    return result;
}

// ── Actor ────────────────────────────────────────────────────────────────────

export interface MockActor {
    _id: string;
    name: string;
    img: string;
    type: string;
    characteristics: Record<string, MockCharacteristic>;
    items: MockItem[];
    system: {
        bio: {
            playerName: string;
            age: string;
            gender: string;
            description: string;
        };
        originPath: {
            homeWorld: string;
            background: string;
            role: string;
            trialsAndTravails: string;
            motivation: string;
        };
        wounds: { value: number; max: number };
        fate: { value: number; max: number };
        corruption: { value: number; max: number };
        insanity: { value: number; max: number };
        fatigue: { value: number; max: number };
        xp: { total: number; spent: number; available: number };
    };
}

export function mockActor(overrides?: DeepPartial<MockActor>): MockActor {
    const base: MockActor = {
        _id: 'mock-actor-' + Math.random().toString(36).slice(2, 8),
        name: 'Acolyte Vex',
        img: 'icons/portraits/acolyte-default.webp',
        type: 'player',
        characteristics: mockCharacteristics(),
        items: [],
        system: {
            bio: {
                playerName: 'Player One',
                age: '24',
                gender: 'Female',
                description: '',
            },
            originPath: {
                homeWorld: 'Hive World',
                background: 'Imperial Guard',
                role: 'Warrior',
                trialsAndTravails: '',
                motivation: 'Duty',
            },
            wounds: { value: 12, max: 12 },
            fate: { value: 3, max: 3 },
            corruption: { value: 0, max: 100 },
            insanity: { value: 0, max: 100 },
            fatigue: { value: 0, max: 12 },
            xp: { total: 1500, spent: 1200, available: 300 },
        },
    };
    return deepMerge(base, overrides);
}

// ── Sheet rendering helpers ──────────────────────────────────────────────────

export function renderTemplate<T>(template: HandlebarsTemplateDelegate, context: T): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'wh40k-wrapper';
    wrap.innerHTML = template(context);
    return wrap;
}
