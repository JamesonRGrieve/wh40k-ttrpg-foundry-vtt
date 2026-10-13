import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import { resolveBurst } from '../rules/auto-fire.ts';
import { localizeHitCeiling } from './hit-ceiling.ts';

/** Echo localiser: a key renders as itself, a format renders as `key{param=value}` so the line name is visible. */
beforeAll(() => {
    vi.stubGlobal('game', {
        i18n: {
            localize: (key: string) => key,
            format: (key: string, data: Record<string, string>) =>
                `${key}{${Object.entries(data)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(',')}}`,
        },
    });
});

describe('localizeHitCeiling (#607)', () => {
    it('renders each ceiling part as a hoverable row naming the line rule', () => {
        const burst = resolveBurst({
            action: 'Full Auto Burst',
            rateOfFire: { semi: 2, full: 4 },
            storm: true,
            affordableShots: 60,
            rules: SystemConfigRegistry.get('bc').burstRules,
        });
        const card = localizeHitCeiling({ action: 'Full Auto Burst', burstCapComponents: burst.capComponents, fireRate: burst.maxHits, gameSystemId: 'bc' });
        expect(card?.total).toBe(9);
        expect(card?.base.label).toBe('WH40K.Roll.HitCeiling.RateOfFireFull');
        expect(card?.base.value).toBe(4);
        expect(card?.parts.map((p) => [p.label, p.value])).toEqual([
            ['WH40K.Roll.HitCeiling.Storm', 4],
            ['WH40K.Roll.HitCeiling.FirstHit', 1],
        ]);
        const base = JSON.parse(card?.base.tooltipData ?? '{}') as { sources: { name: string; value: number }[] };
        expect(base.sources[0]?.name).toBe(`WH40K.Roll.HitCeiling.SourceExtra{line=${SystemConfigRegistry.get('bc').label}}`);
    });

    it('has no ceiling block for a single shot', () => {
        expect(localizeHitCeiling({ action: 'Standard Attack', burstCapComponents: [], fireRate: 1, gameSystemId: 'dh2' })).toBeNull();
    });

    it('cites no printed rule when the attacker has no line', () => {
        const card = localizeHitCeiling({ action: 'Semi-Auto Burst', burstCapComponents: [{ key: 'rof', value: 3 }], fireRate: 3, gameSystemId: undefined });
        const base = JSON.parse(card?.base.tooltipData ?? '{}') as { sources: { name: string }[] };
        expect(base.sources[0]?.name).toBe('WH40K.Roll.HitCeiling.SourceUnruled{line=}');
    });
});
