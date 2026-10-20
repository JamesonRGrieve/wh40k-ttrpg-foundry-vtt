import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { type CardLocaliser, type VehicleDamageApplied, vehicleAssignCardRows, vehicleDamageCardRows } from '../../src/module/rolls/vehicle-card-rows.ts';
import type { VehicleFuryResult, VehicleStrike } from '../../src/module/rolls/vehicle-strike.ts';
import { resolveVehicleDamage } from '../../src/module/rules/vehicle-damage.ts';
import areaResolutionSrc from '../../src/templates/chat/area-resolution-chat.hbs?raw';
import assignDamageChatSrc from '../../src/templates/chat/assign-damage-chat.hbs?raw';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import assignDamagePromptSrc from '../../src/templates/prompt/assign-damage-prompt.hbs?raw';
import { formatKey, localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * A hit on a vehicle (content#28) on the damage and assign cards: the facing struck
 * (from the attacker's position), the hit location off Table 7-29, the facing's
 * armour after Penetration, a trait force field, the Structural Integrity it costs,
 * Critical damage past it with Reinforced Armour halving it, and the vehicle chart
 * rows — every number hoverable to its parts, every trait named. Crew sheltered by
 * an enclosed vehicle are listed on the area card instead of being hit.
 */
initializeStoryHandlebars();

const meta: Meta = { title: 'Chat/Vehicle Damage (content#28)' };
export default meta;
type Story = StoryObj;

const i18n: CardLocaliser = { localize: localizeKey, format: formatKey };

/** A Chimera's facing armour (DH2 Core: Front 30 / Side 22 / Rear 16). */
const CHIMERA_ARMOUR = { front: 30, side: 22, rear: 16 } as const;

function strike(over: Partial<VehicleStrike> = {}): VehicleStrike {
    return {
        line: 'dh2',
        facing: 'front',
        facingAssumed: false,
        fromAboveOrBelow: false,
        location: 'hull',
        tableRoll: 23,
        tableRollKind: 'reversed',
        redirectedFrom: null,
        armourFacing: 'front',
        forceField: null,
        righteousFury: [],
        ...over,
    };
}

function frame(child: HTMLElement): HTMLElement {
    const box = document.createElement('div');
    box.style.width = '300px';
    box.append(child);
    return box;
}

function damageCard(hitStrike: VehicleStrike, furies: VehicleFuryResult[] = [], gameSystem = 'dh2'): HTMLElement {
    const rows = vehicleDamageCardRows(
        { strike: hitStrike, facingArmour: CHIMERA_ARMOUR[hitStrike.armourFacing], coverAP: 0, penetration: 4, damage: 38, armourIgnored: false, furies },
        i18n,
    );
    return renderSheet(damageRollChatSrc, {
        weaponName: 'Lascannon',
        gameSystem,
        targetActor: { uuid: 'Actor.chimera' },
        targetName: 'Chimera Armoured Transport',
        hits: [
            {
                location: hitStrike.location,
                damageRoll: { formula: '5d10+10', result: '28 + 10' },
                totalDamage: 38,
                damageType: 'Energy',
                totalPenetration: 4,
                totalFatigue: 0,
                effects: [],
                righteousFury: furies.map((fury) => ({ roll: { total: fury.rolled }, effect: '' })),
                vehicleRows: rows,
                vehicleStrikeData: JSON.stringify(hitStrike),
            },
        ],
    });
}

function rowValue(root: HTMLElement, hook: string): string {
    return root.querySelector(`[data-vehicle-row="${hook}"] [data-vehicle-row-value]`)?.textContent.trim() ?? '';
}

export const FrontVersusRear: Story = {
    name: 'A lascannon into the Front and into the Rear',
    render: () => {
        const box = frame(damageCard(strike()));
        box.append(damageCard(strike({ facing: 'rear', armourFacing: 'rear' })));
        return box;
    },
    play: async ({ canvasElement }) => {
        const cards = [...canvasElement.querySelectorAll<HTMLElement>('[data-vehicle-rows]')];
        await expect(cards).toHaveLength(2);
        const front = cards.at(0);
        const rear = cards.at(1);
        if (front === undefined || rear === undefined) throw new Error('two vehicle cards expected');
        await expect(rowValue(front, 'vehicle-facing')).toBe(localizeKey('WH40K.Vehicle.Facing.Front'));
        await expect(rowValue(front, 'vehicle-armour')).toBe('26');
        await expect(rowValue(front, 'vehicle-integrity-damage')).toBe('12');
        await expect(rowValue(rear, 'vehicle-facing')).toBe(localizeKey('WH40K.Vehicle.Facing.Rear'));
        await expect(rowValue(rear, 'vehicle-armour')).toBe('12');
        await expect(rowValue(rear, 'vehicle-integrity-damage')).toBe('26');
        await expect(front.querySelector('[data-vehicle-row="vehicle-armour"] [data-wh40k-tooltip="modifier"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-damage-effective]')).toBeNull();
        await expect(canvasElement.querySelector('.roll-control__assign-damage')?.getAttribute('data-vehicle-strike')).toContain('"armourFacing":"front"');
    },
};

export const TurretRedirectedToHull: Story = {
    name: 'Table 7-29 names a Turret the vehicle lacks: the Hull',
    render: () => frame(damageCard(strike({ tableRoll: 91, redirectedFrom: 'turret' }))),
    play: async ({ canvasElement }) => {
        const note = canvasElement.querySelector('[data-vehicle-row="vehicle-location"] [data-vehicle-row-note]')?.textContent ?? '';
        await expect(note).toContain(localizeKey('WH40K.Vehicle.Location.Turret'));
        await expect(rowValue(canvasElement, 'vehicle-location')).toBe(localizeKey('WH40K.Vehicle.Location.Hull'));
    },
};

export const ForceFieldNullifies: Story = {
    name: 'A Shield Generator nullifies the attack',
    render: () => frame(damageCard(strike({ forceField: { rating: 40, roll: 17, nullified: true, source: 'Shield Generator', overloadUnmodelled: true } }))),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector('[data-vehicle-row="vehicle-force-field"]');
        await expect(field?.querySelector('[data-vehicle-row-label]')?.textContent).toBe('Shield Generator');
        await expect(rowValue(canvasElement, 'vehicle-force-field')).toBe(localizeKey('WH40K.Vehicle.Damage.ForceFieldNullified'));
        await expect(rowValue(canvasElement, 'vehicle-integrity-damage')).toBe('0');
    },
};

export const RighteousFuryOnTheChart: Story = {
    name: 'Righteous Fury reads the Hull chart, past Reinforced Armour',
    render: () =>
        frame(
            damageCard(strike(), [
                {
                    die: '1d5',
                    dieSource: '',
                    rolled: 4,
                    value: 4,
                    unaffectedBy: 'Reinforced Armour',
                    critical: { chartName: 'Hull Critical Hit Effects', chartUuid: 'x', value: 4, text: '<p>A fuel line ruptures.</p>' },
                },
            ]),
        ),
    play: async ({ canvasElement }) => {
        const fury = canvasElement.querySelector('[data-vehicle-row="vehicle-righteous-fury"]');
        await expect(fury?.querySelector('[data-vehicle-row-chart]')?.textContent).toBe('A fuel line ruptures.');
        await expect(fury?.querySelector('[data-vehicle-row-note]')?.textContent).toContain('Reinforced Armour');
        await expect(canvasElement.querySelector('[data-righteous-fury]')).toBeNull();
    },
};

/** What a hit did to a Chimera with the given Integrity and crit multiplier. */
function applied(damage: number, integrity: number, critMultiplier: number | null, over: Partial<VehicleDamageApplied> = {}): VehicleDamageApplied {
    return {
        facing: 'front',
        facingAssumed: false,
        fromAboveOrBelow: false,
        armourFacing: 'front',
        location: 'hull',
        outcome: resolveVehicleDamage({ damage, penetration: 0, armour: 30, integrity, critical: 0, critMultiplier }),
        integrityBefore: integrity,
        integrityMax: 35,
        criticalBefore: 0,
        critSources: critMultiplier === null ? [] : ['Reinforced Armour'],
        critical: null,
        criticalChartMissing: false,
        nullifiedBy: null,
        righteousFury: [],
        righteousFuryLost: false,
        ...over,
    };
}

function assignCard(vehicleDamage: VehicleDamageApplied, gameSystem = 'dh2'): HTMLElement {
    return renderSheet(assignDamageChatSrc, {
        gameSystem,
        actor: { name: 'Chimera Armoured Transport', uuid: 'Actor.chimera', system: {} },
        hit: { location: vehicleDamage.location, damageType: 'Energy' },
        hasDamage: vehicleDamage.outcome.integrityLoss > 0,
        vehicleDamage,
        vehicleRows: vehicleAssignCardRows(vehicleDamage, i18n),
    });
}

export const IntegrityLoss: Story = {
    name: 'Assign: Structural Integrity loss',
    render: () => frame(assignCard(applied(47, 35, null))),
    play: async ({ canvasElement }) => {
        await expect(rowValue(canvasElement, 'vehicle-integrity')).toBe('35 → 18 / 35');
        await expect(canvasElement.querySelector('[data-vehicle-row="vehicle-critical"]')).toBeNull();
        await expect(canvasElement.textContent).not.toContain(localizeKey('WH40K.Wounds'));
    },
};

export const ReinforcedArmourHalvesCrit: Story = {
    name: 'Assign: Reinforced Armour halves the Critical damage',
    render: () =>
        frame(assignCard(applied(37, 0, 0.5, { critical: { chartName: 'Hull Critical Hit Effects', chartUuid: 'x', value: 4, text: '<p>Crew shaken.</p>' } }))),
    play: async ({ canvasElement }) => {
        await expect(rowValue(canvasElement, 'vehicle-excess')).toBe('7');
        const multiplier = canvasElement.querySelector('[data-vehicle-row="vehicle-crit-multiplier"]');
        await expect(multiplier?.querySelector('[data-vehicle-row-label]')?.textContent).toBe('Reinforced Armour');
        await expect(rowValue(canvasElement, 'vehicle-crit-multiplier')).toBe('×0.5 → 4');
        await expect(rowValue(canvasElement, 'vehicle-critical')).toBe('0 + 4 = 4');
        await expect(canvasElement.querySelector('[data-vehicle-row="vehicle-critical"] [data-vehicle-row-chart]')?.textContent).toBe('Crew shaken.');
    },
};

export const ChartMissing: Story = {
    name: 'Assign: a line whose packs carry no vehicle chart',
    render: () => frame(assignCard(applied(40, 5, null, { criticalChartMissing: true }), 'bc')),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-vehicle-row="vehicle-critical"] [data-vehicle-row-note]')?.textContent).toBe(
            localizeKey('WH40K.Vehicle.Damage.ChartMissing'),
        );
    },
};

export const PerSystem: Story = {
    name: 'The vehicle rows on each line',
    render: () => {
        const box = document.createElement('div');
        box.style.display = 'grid';
        box.style.gridTemplateColumns = 'repeat(3, 300px)';
        box.style.gap = '8px';
        for (const line of ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt']) box.append(damageCard(strike({ line }), [], line));
        return box;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-vehicle-rows]')).toHaveLength(6);
        const themed = [...canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-system]')].map((card) => card.dataset['wh40kSystem']);
        await expect(new Set(themed)).toEqual(new Set(['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt']));
    },
};

export const CrewSheltered: Story = {
    name: 'Area card: the crew of an enclosed vehicle are sheltered',
    render: () =>
        frame(
            renderSheet(areaResolutionSrc, {
                rollId: 'roll-1',
                weaponName: 'Frag Grenade',
                summary: 'Blast (3): Everyone in the blast (3 m) takes a hit.',
                results: [{ name: 'Chimera Armoured Transport', hit: true, outcomeLabel: 'Hit', test: null }],
                sheltered: [formatKey('WH40K.Vehicle.CrewTargeting.ShelteredFromArea', { name: 'Trooper Halden', vehicle: 'Chimera Armoured Transport' })],
                anyHit: true,
                noDamage: false,
            }),
        ),
    play: async ({ canvasElement }) => {
        const sheltered = canvasElement.querySelector('[data-area-sheltered]');
        await expect(sheltered?.textContent).toContain('Trooper Halden');
        await expect(sheltered?.textContent).toContain('Chimera Armoured Transport');
    },
};

export const AssignPromptForAVehicle: Story = {
    name: 'Assign dialog: Integrity, vehicle locations and facing armour',
    render: () =>
        frame(
            renderSheet(assignDamagePromptSrc, {
                actor: { name: 'Chimera Armoured Transport', img: 'icons/svg/mystery-man.svg', system: {} },
                vehicle: { integrity: { value: 18, max: 35, critical: 0 } },
                hit: { location: 'hull', damageType: 'Energy', totalDamage: 38, totalPenetration: 4, totalFatigue: 0 },
                locations: { motive: 'Motive Systems', hull: 'Hull', weapon: 'Weapon', turret: 'Turret' },
                damageType: { Energy: 'Energy' },
                armour: 16,
                tb: 0,
            }),
        ),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-assign-vehicle]')?.textContent).toContain('18/35');
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="hit.location"]')?.value).toBe('hull');
        await expect(canvasElement.querySelector('input[name="tb"]')).toBeNull();
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="armour"]')?.value).toBe('16');
    },
};
