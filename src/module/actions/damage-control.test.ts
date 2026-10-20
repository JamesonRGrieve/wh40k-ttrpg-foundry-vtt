import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateVehicleTraitEffects, neutralVehicleTraitEffects } from '../data/shared/vehicle-trait-effects-template.ts';

/**
 * Damage Control (#678; DH2 Core p. 188, OW Core p. 213): the damage card's re-roll
 * button rolls the Righteous Fury die again, reads the new value on the struck
 * location's chart and posts it — once per roll, recorded on the card.
 */

vi.mock('../rolls/vehicle-critical-tables.ts', () => ({
    lookupVehicleCritical: vi.fn(async (_line: string, _location: string, value: number) =>
        Promise.resolve({ chartName: 'Hull Critical Hit Effects', chartUuid: 'RollTable.hull', value, text: `<p>Row ${value}.</p>` }),
    ),
}));

const { damageControlReroll, disableSpentDamageControl, spentKeys } = await import('./damage-control.ts');

const REQUEST = { vehicleUuid: 'Actor.chimera', trait: 'Damage Control', line: 'dh2', location: 'hull', die: '1d5', key: '0.0' };

class StubActor {
    constructor(readonly system: object) {}
}

/** A Chimera with Damage Control, prepared as the vehicle DataModel prepares it. */
function chimera(): StubActor {
    return new StubActor({
        gameSystem: 'dh2',
        armour: { front: { value: 30 }, side: { value: 22 }, rear: { value: 16 } },
        integrity: { max: 35, value: 35, critical: 0 },
        traitEffects: aggregateVehicleTraitEffects([{ name: 'Damage Control', effects: { ...neutralVehicleTraitEffects(), rerollRighteousFuryCrit: true } }]),
    });
}

function button(request: object = REQUEST): HTMLButtonElement {
    const el = document.createElement('button');
    el.className = 'roll-control__damage-control';
    el.dataset['damageControl'] = JSON.stringify(request);
    return el;
}

/** A damage card's message, with the re-rolls it has spent. */
function card(spent: string[], isOwner = true): { flags: object; isOwner: boolean; setFlag: ReturnType<typeof vi.fn> } {
    return { flags: { 'wh40k-rpg': { damageControlSpent: spent } }, isOwner, setFlag: vi.fn(async () => Promise.resolve()) };
}

describe('Damage Control re-roll (#678)', () => {
    let created: Array<{ content: string; flavor: string }>;
    let warned: string[];

    beforeEach(() => {
        created = [];
        warned = [];
        vi.stubGlobal('Actor', StubActor);
        vi.stubGlobal(
            'fromUuid',
            vi.fn(async () => Promise.resolve(chimera())),
        );
        vi.stubGlobal(
            'Roll',
            class {
                total: number | undefined;
                async evaluate(): Promise<this> {
                    this.total = 2;
                    return Promise.resolve(this);
                }
            },
        );
        vi.stubGlobal('ChatMessage', {
            getSpeaker: () => ({ alias: 'Chimera' }),
            create: vi.fn(async (data: { content: string; flavor: string }) => {
                created.push(data);
                return Promise.resolve(data);
            }),
        });
        vi.stubGlobal('foundry', {
            applications: {
                handlebars: {
                    renderTemplate: vi.fn(async (_path: string, data: { rows: Array<{ hook: string; value: string; html: string }> }) =>
                        Promise.resolve(JSON.stringify(data.rows)),
                    ),
                },
            },
        });
        vi.stubGlobal('ui', { notifications: { warn: (message: string) => warned.push(message) } });
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('re-rolls the die, posts the new chart row and records the roll as spent', async () => {
        const message = card([]);
        // eslint-disable-next-line no-restricted-syntax -- test: a chat message reduced to the flags, ownership and setFlag the re-roll uses
        await damageControlReroll(button(), message as unknown as ChatMessage);
        expect(created).toHaveLength(1);
        const rows = JSON.parse(created[0]?.content ?? '[]') as Array<{ hook: string; value: string; html: string }>;
        expect(rows.map((row) => [row.hook, row.value])).toEqual([
            ['vehicle-damage-control', 'WH40K.Vehicle.Damage.DamageControlRerolled'],
            ['vehicle-righteous-fury', '2'],
        ]);
        expect(rows[1]?.html).toBe('<p>Row 2.</p>');
        expect(message.setFlag).toHaveBeenCalledWith('wh40k-rpg', 'damageControlSpent', ['0.0']);
    });

    it('refuses a roll already re-rolled', async () => {
        // eslint-disable-next-line no-restricted-syntax -- test: a chat message reduced to its flags
        await damageControlReroll(button(), card(['0.0']) as unknown as ChatMessage);
        expect(created).toEqual([]);
        expect(warned).toEqual(['WH40K.Vehicle.Damage.DamageControlUsed']);
    });

    it('reads the spent rolls off a card and disables their buttons', () => {
        expect(spentKeys(card(['0.0', '1.0']))).toEqual(['0.0', '1.0']);
        expect(spentKeys({})).toEqual([]);
        const html = document.createElement('div');
        const spent = button();
        const fresh = button({ ...REQUEST, key: '1.0' });
        html.append(spent, fresh);
        disableSpentDamageControl(html, card(['0.0']));
        expect([spent.disabled, fresh.disabled]).toEqual([true, false]);
    });
});
