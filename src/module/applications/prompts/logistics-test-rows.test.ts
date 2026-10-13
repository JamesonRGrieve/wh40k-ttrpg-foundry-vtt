import { describe, expect, it } from 'vitest';
import { type LogisticsBreakdown, type LogisticsContext, type LogisticsTestTarget, computeLogisticsTarget } from '../../rules/ow-logistics.ts';
import { logisticsOptions, logisticsRows, type Translate } from './logistics-test-rows.ts';

/** Echo translator: the key, with format params appended, so assertions can see the sourced row. */
const echo: Translate = (key, params) => (params === undefined ? key : `${key}${JSON.stringify(params)}`);

function context(overrides: Partial<LogisticsContext> = {}): LogisticsContext {
    return {
        rating: 30,
        munitorum: false,
        situational: 0,
        availability: 'veryRare',
        troopCount: 'regiment',
        timeInFront: 'years1to5',
        frontActive: 'under3Months',
        warCondition: 'dominant',
        standardKit: false,
        craftsmanship: 'good',
        ...overrides,
    };
}

function testOf(ctx: LogisticsContext): LogisticsTestTarget {
    const result = computeLogisticsTarget(ctx);
    if (result.kind !== 'test') throw new Error('expected a test');
    return result;
}

function breakdownOf(ctx: LogisticsContext): LogisticsBreakdown {
    return testOf(ctx).breakdown;
}

describe('logisticsOptions', () => {
    it('offers all 11 availabilities, the 3 printed troop columns, 5 time rows, 6 war rows, 4 craftsmanships', () => {
        const options = logisticsOptions(context());
        expect(options.availabilityOptions).toHaveLength(11);
        expect(options.troopCountOptions.map((o) => o.id)).toEqual(['company', 'regiment', 'regiments']);
        expect(options.timeInFrontOptions).toHaveLength(5);
        expect(options.frontActiveOptions).toHaveLength(5);
        expect(options.warConditionOptions).toHaveLength(6);
        expect(options.craftsmanshipOptions).toHaveLength(4);
    });

    it('marks exactly the context value selected on each axis', () => {
        const options = logisticsOptions(context());
        expect(options.availabilityOptions.filter((o) => o.selected).map((o) => o.id)).toEqual(['veryRare']);
        expect(options.troopCountOptions.filter((o) => o.selected).map((o) => o.id)).toEqual(['regiment']);
        expect(options.frontActiveOptions.filter((o) => o.selected).map((o) => o.id)).toEqual(['under3Months']);
        expect(options.warConditionOptions.filter((o) => o.selected).map((o) => o.id)).toEqual(['dominant']);
    });
});

describe('logisticsRows', () => {
    it('prints the rating, the four Table 6-2 parts and craftsmanship, omitting bonuses that are off', () => {
        const ctx = context();
        const rows = logisticsRows(ctx, breakdownOf(ctx), echo);
        expect(rows.map((r) => r.key)).toEqual(['rating', 'availability', 'timeInFront', 'frontActive', 'warCondition', 'craftsmanship']);
        expect(rows.map((r) => r.value)).toEqual([30, -30, 20, -10, 20, -30]);
    });

    it('prints Munitorum, situational and standard kit when they apply', () => {
        const ctx = context({ munitorum: true, situational: 5, standardKit: true });
        const keys = logisticsRows(ctx, breakdownOf(ctx), echo).map((r) => r.key);
        expect(keys).toContain('munitorum');
        expect(keys).toContain('situational');
        expect(keys).toContain('standardKit');
    });

    it('row values sum to the target', () => {
        const ctx = context({ munitorum: true, situational: -5, standardKit: true, rating: 60 });
        const result = testOf(ctx);
        const sum = logisticsRows(ctx, result.breakdown, echo).reduce((total, r) => total + r.value, 0);
        expect(sum).toBe(result.target);
    });

    it('each row is a modifier tooltip naming its source table row', () => {
        const ctx = context();
        const rows = logisticsRows(ctx, breakdownOf(ctx), echo);
        const availability = rows.find((r) => r.key === 'availability');
        const parsed = JSON.parse(availability?.tooltipData ?? '{}') as { title: string; sources: Array<{ name: string; value: number }> };
        expect(parsed.title).toBe('WH40K.OW.Logistics.Modifier.Availability');
        expect(parsed.sources).toHaveLength(1);
        expect(parsed.sources[0]?.value).toBe(-30);
        expect(parsed.sources[0]?.name).toContain('WH40K.OW.Logistics.Source.FrontConditions');
        expect(parsed.sources[0]?.name).toContain('WH40K.Availability.VeryRare');
        expect(parsed.sources[0]?.name).toContain('WH40K.OW.Logistics.TroopCount.Regiment');

        const craft = JSON.parse(rows.find((r) => r.key === 'craftsmanship')?.tooltipData ?? '{}') as { sources: Array<{ name: string }> };
        expect(craft.sources[0]?.name).toContain('WH40K.OW.Logistics.Source.CraftsmanshipTable');
    });
});
