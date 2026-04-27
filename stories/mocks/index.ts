type DeepPartial<T> = T extends (infer U)[] ? U[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

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
    id: string;
    name: string;
    img: string;
    type: string;
    icon?: string;
    isOwner?: boolean;
    isEmbedded?: boolean;
    system: Record<string, unknown>;
}

export function mockItem(overrides?: DeepPartial<MockItem>): MockItem {
    const id = 'mock-item-' + Math.random().toString(36).slice(2, 8);
    const base: MockItem = {
        _id: id,
        id,
        name: 'Generic Item',
        img: 'icons/svg/item-bag.svg',
        type: 'gear',
        icon: 'fa-cube',
        isOwner: true,
        isEmbedded: false,
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
            career: string;
            divination: string;
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
                career: 'Guardsman',
                divination: 'Trust in your fellow man, and put your faith in the Emperor.',
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

// ── Shared template data ─────────────────────────────────────────────────────

export interface MockModifierBadge {
    type: string;
    label: string;
    value: number;
}

export interface MockModifierGroupEntry {
    id: string;
    name: string;
    img: string;
    description: string;
    duration: string;
    active?: boolean;
    canToggle?: boolean;
    stacks?: number;
    nature?: 'positive' | 'negative' | 'neutral';
}

export interface MockActiveEffect {
    id: string;
    label: string;
    disabled: boolean;
    duration?: { label: string } | null;
}

export interface MockWeaponQuality {
    identifier: string;
    label: string;
    level?: number;
    description: string;
}

export function mockModifierBadge(overrides?: DeepPartial<MockModifierBadge>): MockModifierBadge {
    return deepMerge(
        {
            type: 'damage',
            label: 'Damage',
            value: 2,
        },
        overrides,
    );
}

export function mockModifierEntry(overrides?: DeepPartial<MockModifierGroupEntry>): MockModifierGroupEntry {
    const id = 'modifier-' + Math.random().toString(36).slice(2, 8);
    return deepMerge(
        {
            id,
            name: 'Targeting Auspex',
            img: 'icons/svg/aura.svg',
            description: '+10 against concealed targets.',
            duration: 'Sustained',
            active: true,
            canToggle: true,
            stacks: 1,
            nature: 'positive',
        },
        overrides,
    );
}

export function mockActiveEffect(overrides?: DeepPartial<MockActiveEffect>): MockActiveEffect {
    const id = 'effect-' + Math.random().toString(36).slice(2, 8);
    return deepMerge(
        {
            id,
            label: 'Blessed Ammunition',
            disabled: false,
            duration: { label: '3 rounds remaining' },
        },
        overrides,
    );
}

export function mockWeaponQuality(overrides?: DeepPartial<MockWeaponQuality>): MockWeaponQuality {
    return deepMerge(
        {
            identifier: 'accurate',
            label: 'Accurate',
            description: 'Deals extra damage on precise shots.',
        },
        overrides,
    );
}

export function mockModifiersPanel(overrides?: DeepPartial<Record<string, unknown>>) {
    return deepMerge(
        {
            modifiers: {
                collapsed: false,
                conditions: [
                    mockModifierEntry({
                        name: 'On Fire',
                        img: 'icons/magic/fire/flame-burning-skull.webp',
                        description: 'Take damage each round until extinguished.',
                        duration: 'Ends after extinguish action',
                        stacks: 2,
                        nature: 'negative',
                        canToggle: false,
                    }),
                ],
                talents: [
                    mockModifierEntry({
                        name: 'Mighty Shot',
                        img: 'icons/skills/ranged/target-bullseye-arrow-glowing.webp',
                        description: '+2 damage with ranged attacks.',
                    }),
                ],
                traits: [
                    mockModifierEntry({
                        name: 'Unnatural Perception',
                        img: 'icons/creatures/eyes/humanoid-single-red-brown.webp',
                        description: 'Heightened senses from augmetics.',
                        canToggle: false,
                    }),
                ],
                equipment: [
                    mockModifierEntry({
                        name: 'Red-Dot Sight',
                        img: 'icons/weapons/guns/gun-pistol-flintlock-metal.webp',
                        description: '+10 bonus at short range.',
                        canToggle: false,
                    }),
                ],
                effects: [
                    mockModifierEntry({
                        name: 'Litany of Accuracy',
                        img: 'icons/svg/book.svg',
                        description: 'Reroll one missed shot this turn.',
                        active: false,
                    }),
                ],
            },
        },
        overrides,
    );
}

export function mockRollData(overrides?: DeepPartial<Record<string, unknown>>) {
    return deepMerge(
        {
            rollData: {
                sheetName: 'Acolyte Vex',
                name: 'Ballistic Skill Test',
                type: 'Attack',
                difficulty: 'routine',
                difficulties: {
                    routine: 'Routine (+20)',
                },
                isManualRoll: false,
                baseTarget: 42,
                activeModifiers: {
                    Aim: 10,
                    Range: 10,
                    Darkness: -20,
                },
                modifiedTarget: 42,
                isTargetOnly: false,
                success: true,
                dos: 3,
                dof: 0,
                roll: { total: 17 },
                render: '<div class="dice-result">17</div>',
            },
        },
        overrides,
    );
}

export function mockDamageRollData(overrides?: DeepPartial<Record<string, unknown>>) {
    return deepMerge(
        {
            weaponName: 'Godwyn-Deaz Boltgun',
            hits: [
                {
                    location: 'Body',
                    damageRoll: {
                        formula: '1d10+5',
                        result: '8 + 5',
                    },
                    modifiers: {
                        MightyShot: 2,
                    },
                    totalDamage: 15,
                    damageType: 'Explosive',
                    totalPenetration: 4,
                    totalFatigue: 0,
                    effects: [{ name: 'Tearing', effect: 'Roll an extra damage die and discard the lowest.' }],
                    righteousFury: [],
                },
            ],
            targetActor: {
                uuid: 'Actor.mock-target',
            },
        },
        overrides,
    );
}

export function mockActionRollData(overrides?: DeepPartial<Record<string, unknown>>) {
    return deepMerge(
        {
            id: 'roll-attack-1',
            label: 'Semi-Auto Burst',
            effectOutput: [{ name: 'Suppressive', effect: 'Targets must test Pinning.' }],
            rollData: {
                name: 'M36 Kantrael Lasgun',
                action: 'Attack',
                effectString: 'Suppressive Fire',
                isManualRoll: false,
                weapon: {
                    system: {
                        effectiveSpecial: {
                            size: 2,
                            values: [
                                mockWeaponQuality({
                                    identifier: 'reliable',
                                    label: 'Reliable',
                                    description: 'Jam results are reduced.',
                                }),
                                mockWeaponQuality({
                                    identifier: 'accurate',
                                    label: 'Accurate',
                                    description: 'Reward precision with extra damage.',
                                }),
                            ],
                        },
                    },
                },
                ignoreModifiers: false,
                baseTarget: 48,
                activeModifiers: {
                    Aim: 10,
                    Range: 10,
                },
                modifiedTarget: 68,
                usesAmmo: true,
                ammoUsed: 3,
                isOpposed: false,
                ignoreDegrees: false,
                isTargetOnly: false,
                success: true,
                dos: 2,
                dof: 0,
                ignoreSuccess: false,
                roll: { total: 21 },
                hitLocation: 'Right Arm',
                ignoreControls: false,
                showDamage: true,
            },
        },
        overrides,
    );
}

export function mockQuickActionItem(type: string, overrides?: DeepPartial<MockItem>): MockItem {
    const baseByType: Record<string, MockItem> = {
        weapon: mockItem({
            type: 'weapon',
            name: 'Bolt Pistol',
            icon: 'fa-gun',
            system: { equipped: true, usesAmmo: true },
        }),
        armour: mockItem({
            type: 'armour',
            name: 'Carapace Armour',
            icon: 'fa-shield-halved',
            system: { equipped: true },
        }),
        talent: mockItem({
            type: 'talent',
            name: 'Mighty Shot',
            icon: 'fa-star',
            system: { isRollable: true },
        }),
        trait: mockItem({
            type: 'trait',
            name: 'Unnatural Strength',
            icon: 'fa-dna',
            system: { rollable: true },
        }),
        gear: mockItem({
            type: 'gear',
            name: 'Stimm',
            icon: 'fa-flask',
            system: { consumable: true },
        }),
        condition: mockItem({
            type: 'condition',
            name: 'Bleeding',
            icon: 'fa-droplet',
            system: {},
        }),
        criticalInjury: mockItem({
            type: 'criticalInjury',
            name: 'Cracked Rib',
            icon: 'fa-kit-medical',
            system: {},
        }),
        psychicPower: mockItem({
            type: 'psychicPower',
            name: 'Smite',
            icon: 'fa-brain',
            system: {},
        }),
        ammunition: mockItem({
            type: 'ammunition',
            name: 'Man-Stopper Rounds',
            icon: 'fa-bullseye',
            system: {},
        }),
    };

    return deepMerge(baseByType[type] ?? mockItem({ type }), overrides);
}

export function mockActiveEffectsContext(overrides?: DeepPartial<Record<string, unknown>>) {
    return deepMerge(
        {
            item: mockItem({
                type: 'weapon',
                name: 'Godwyn Pattern Boltgun',
                isOwner: true,
            }),
            effects: [mockActiveEffect(), mockActiveEffect({ label: 'Overheated', disabled: true, duration: null })],
        },
        overrides,
    );
}

export function mockWeaponSheetContext(overrides?: DeepPartial<Record<string, unknown>>) {
    const item = mockItem({
        type: 'weapon',
        name: 'Godwyn-Deaz Boltgun',
        img: 'icons/weapons/guns/rifle-bolt.webp',
        system: {
            description: { value: '<p>Holy wrath delivered at range.</p>' },
            notes: 'A relic maintained by the chapter artificers.',
        },
    });

    return deepMerge(
        {
            item,
            system: {
                ...item.system,
                classLabel: 'Basic',
                typeLabel: 'Bolt',
                typeIcon: 'fa-gun',
                craftsmanship: 'good',
                craftsmanshipLabel: 'Good Craftsmanship',
                isMeleeWeapon: false,
                isRangedWeapon: true,
                rangeLabel: '100m',
                rateOfFireLabel: 'S/3/-',
                usesAmmo: true,
                clip: { value: 18 },
                effectiveClipMax: 24,
                ammoStatus: 'high',
                ammoPercentage: 75,
                reloadLabel: 'Full',
                reload: 'full',
                availability: 'rare',
                effectiveSpecial: [
                    mockWeaponQuality({
                        identifier: 'accurate',
                        label: 'Accurate',
                        description: 'Gain extra damage on precise hits.',
                    }),
                ],
                description: { value: '<p>Holy wrath delivered at range.</p>' },
                notes: 'A relic maintained by the chapter artificers.',
            },
            source: {
                damage: { type: 'explosive' },
                class: 'basic',
                type: 'bolt',
                reload: 'full',
                availability: 'rare',
                craftsmanship: 'good',
            },
            damageTypes: {
                explosive: { label: 'Explosive' },
                impact: { label: 'Impact' },
                energy: { label: 'Energy' },
            },
            weaponClasses: {
                pistol: { label: 'Pistol' },
                basic: { label: 'Basic' },
                heavy: { label: 'Heavy' },
            },
            weaponTypes: {
                bolt: { label: 'Bolt' },
                las: { label: 'Las' },
                flame: { label: 'Flame' },
            },
            reloadTimes: {
                half: { label: 'Half' },
                full: { label: 'Full' },
            },
            availabilities: {
                common: { label: 'Common' },
                scarce: { label: 'Scarce' },
                rare: { label: 'Rare' },
            },
            craftsmanships: {
                poor: { label: 'Poor' },
                common: { label: 'Common' },
                good: { label: 'Good' },
            },
            qualitiesArray: [],
            fullDamageFormula: '1d10+5',
            effectivePenetration: 4,
            effectiveToHit: 10,
            effectiveWeight: 8.5,
            hasModificationEffects: true,
            isOwnedByActor: true,
            canEdit: true,
            inEditMode: false,
            editable: true,
            bodyCollapsed: false,
            hasLoadedAmmo: true,
            loadedAmmoLabel: 'Kraken Penetrator',
            loadedAmmoData: {
                modifiers: {
                    damage: 2,
                    penetration: 3,
                },
                addedQualities: ['Tearing'],
            },
            modificationsData: [
                {
                    index: 0,
                    name: 'Red-Dot Sight',
                    categoryIcon: 'fa-crosshairs',
                    active: true,
                    hasEffects: true,
                    effects: [{ label: '+10 when aiming' }],
                },
            ],
            effects: [mockActiveEffect(), mockActiveEffect({ label: 'Machine Spirit Agitation', disabled: true })],
        },
        overrides,
    );
}

export function mockArmourSheetContext(overrides?: DeepPartial<Record<string, unknown>>) {
    const item = mockItem({
        type: 'armour',
        name: 'Carapace Armour',
        img: 'icons/equipment/chest/breastplate-layered-steel.webp',
        system: {
            type: 'carapace',
            equipped: true,
            craftsmanship: 'good',
            availability: 'rare',
            maxAgility: 4,
            maxAP: 6,
            typeIcon: 'fa-shield-halved',
            typeLabel: 'Carapace',
            protectionLevel: 'heavy',
            weight: 15,
            armourPoints: {
                head: 4,
                body: 6,
                leftArm: 5,
                rightArm: 5,
                leftLeg: 5,
                rightLeg: 5,
            },
            craftsmanshipLabel: 'Good Craftsmanship',
            description: { value: '<p>Rigid plates for elite troops.</p>' },
            effect: '<p>Bulky but dependable.</p>',
        },
    });

    return deepMerge(
        {
            item,
            system: item.system,
            isOwnedByActor: true,
            canEdit: true,
            inEditMode: false,
            editable: true,
            hideThroneGelt: false,
            propertiesArray: [
                { label: 'Sealed', description: 'Can operate in hostile atmospheres.' },
                { label: 'Bulky', description: 'Counts as cumbersome in confined spaces.' },
            ],
            availableProperties: {
                sealed: 'Sealed',
                bulky: 'Bulky',
            },
            modificationsArray: [{ name: 'Ceramite Plating', summary: '+2 vs flame', description: 'Extra protection against flame weapons.' }],
            effects: [mockActiveEffect({ label: 'Blessing of Saint Drusus' })],
        },
        overrides,
    );
}

export function mockGearSheetContext(overrides?: DeepPartial<Record<string, unknown>>) {
    const item = mockItem({
        type: 'gear',
        name: 'Medi-Kit',
        img: 'icons/tools/medical/bag-kit-red.webp',
        system: {
            category: 'medical',
            craftsmanship: 'best',
            craftsmanshipLabel: 'Best Craftsmanship',
            quantity: 2,
            effectiveTotalWeight: 3.5,
            availability: 'very-rare',
            availabilityLabel: 'Very Rare',
            cost: { dh2: { homebrew: { throneGelt: 350 } } },
            equipped: true,
            inBackpack: false,
            consumable: true,
            maxUses: 6,
            uses: 4,
            effect: '<p>Provides a bonus to Medicae tests.</p>',
            description: { value: '<p>Contains blessed scalpels, synthskin, and chems.</p>' },
        },
    });

    return deepMerge(
        {
            item,
            system: item.system,
            source: item.system,
            categoryIcon: 'fa-kit-medical',
            categoryLabel: 'Medical',
            hasLimitedUses: true,
            usesExhausted: false,
            usesPercentage: 67,
            hideThroneGelt: false,
            editable: true,
            inEditMode: false,
            effects: [mockActiveEffect({ label: 'Combat Stimm Residue', disabled: true })],
        },
        overrides,
    );
}

// ── Sheet rendering helpers ──────────────────────────────────────────────────

export function renderTemplate<T>(template: HandlebarsTemplateDelegate, context: T): HTMLElement {
    // Mirror Foundry V14's app-window.html shell exactly (.app.window-app + .window-content)
    // under the theme-dark scope so foundry2.css's variables, reset, and chrome cascade
    // through correctly. With Foundry's own CSS imported in preview.ts, no inline styling
    // is needed — the deployed look comes from the cascade layers in foundry2.css.
    const wrap = document.createElement('div');
    wrap.className = 'theme-dark wh40k-wrapper';
    wrap.innerHTML = `
        <div class="app window-app sheet" data-appid="0">
            <section class="window-content">${template(context)}</section>
        </div>
    `;
    return wrap;
}
