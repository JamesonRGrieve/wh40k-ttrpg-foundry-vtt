import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of `src/module/documents/starship.ts` (was 8.3% fn /
 * 55.8% line before this spec landed). The vehicle-starship.spec.ts
 * file already exercises some of the underlying DataModel
 * preparation (component embedding, morale, hull-and-shields), but
 * the WH40KStarship Document class itself ships ~20 getters plus
 * `prepareData`, `fireWeapon`, and `rollInitiative` that no other
 * Tier B spec touches.
 *
 * Source coverage targets (Document layer only):
 *   - getters: hullType, hullClass, hullIntegrity, speed,
 *     manoeuvrability, detection, detectionBonus, armour,
 *     voidShields, turretRating, crew, power, space,
 *     weaponCapacity, isCrippled, isDestroyed, shipComponents,
 *     shipWeapons, shipUpgrades, weaponsByLocation
 *   - methods: prepareData (called via update), fireWeapon (valid
 *     weaponId AND invalid weaponId branches), rollInitiative
 *
 * Strategy: create a fresh rt-starship, walk each getter / method,
 * record per-flow pass/fail, cleanup at end. Most flows are pure
 * property reads so failure modes are limited to schema drift.
 *
 * Keep STARSHIP_METHODS_FLOWS in sync with the equivalent constant
 * in `scripts/e2e-coverage.mjs`.
 */

const STARSHIP_METHODS_FLOWS = [
    'get-hullType',
    'get-hullClass',
    'get-hullIntegrity',
    'get-speed',
    'get-manoeuvrability',
    'get-detection',
    'get-detectionBonus',
    'get-armour',
    'get-voidShields',
    'get-turretRating',
    'get-crew',
    'get-power',
    'get-space',
    'get-weaponCapacity',
    'get-isCrippled-false',
    'get-isCrippled-true',
    'get-isDestroyed-false',
    'get-isDestroyed-true',
    'get-shipComponents',
    'get-shipWeapons',
    'get-shipUpgrades',
    'get-weaponsByLocation',
    'method-prepareData',
    'method-fireWeapon-valid',
    'method-fireWeapon-invalid',
    'method-rollInitiative',
] as const;

type FlowName = (typeof STARSHIP_METHODS_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeStarshipMethods(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (flows: readonly string[]): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const ActorCls = g.Actor;
            const foundryGame = g.game;
            const out: FlowResult[] = [];
            const record = (name: string, ok: boolean, detail: string | null = null): void => {
                out.push({ name: name as FlowName, ok, detail });
            };

            if (typeof ActorCls?.create !== 'function') {
                for (const f of flows) record(f, false, 'Actor.create unavailable');
                return out;
            }

            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timer !== null) clearTimeout(timer);
                }
            };

            let actor: any = null;
            try {
                actor = await withTimeout(
                    ActorCls.create({
                        name: 'starship-methods-spec-rt',
                        type: 'rt-starship',
                        system: {
                            gameSystem: 'rt',
                            hullType: 'sword-frigate',
                            hullClass: 'frigate',
                            hullIntegrity: { max: 40, value: 40 },
                            voidShields: 2,
                            armour: 18,
                            speed: 8,
                            manoeuvrability: 15,
                            detection: 12,
                            detectionBonus: 0,
                            turretRating: 2,
                            crew: {
                                population: 25_000,
                                crewRating: 30,
                                morale: { max: 100, value: 100 },
                            },
                            space: { total: 40, used: 5 },
                            power: { total: 50, used: 10 },
                            weaponCapacity: { prow: 1, dorsal: 2, port: 1, starboard: 1, keel: 0 },
                        },
                    }),
                    8_000,
                    'starship Actor.create',
                );
            } catch (err) {
                for (const f of flows) record(f, false, `actor create threw: ${err instanceof Error ? err.message : String(err)}`);
                return out;
            }

            if (actor?.id == null) {
                for (const f of flows) record(f, false, 'actor not created');
                return out;
            }

            const live = (): any => foundryGame?.actors?.get?.(actor.id);

            // -------- getters that read directly off system fields --------
            try {
                record('get-hullType', live()?.hullType === 'sword-frigate', String(live()?.hullType));
            } catch (err) {
                record('get-hullType', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-hullClass', live()?.hullClass === 'frigate', String(live()?.hullClass));
            } catch (err) {
                record('get-hullClass', false, err instanceof Error ? err.message : String(err));
            }
            try {
                const hi = live()?.hullIntegrity;
                record('get-hullIntegrity', hi?.value === 40 && hi?.max === 40, JSON.stringify(hi));
            } catch (err) {
                record('get-hullIntegrity', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-speed', live()?.speed === 8, String(live()?.speed));
            } catch (err) {
                record('get-speed', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-manoeuvrability', live()?.manoeuvrability === 15, String(live()?.manoeuvrability));
            } catch (err) {
                record('get-manoeuvrability', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-detection', live()?.detection === 12, String(live()?.detection));
            } catch (err) {
                record('get-detection', false, err instanceof Error ? err.message : String(err));
            }
            try {
                // detectionBonus = system.detectionBonus || floor(detection/10) → floor(12/10) = 1
                const db = live()?.detectionBonus;
                record('get-detectionBonus', db === 1, String(db));
            } catch (err) {
                record('get-detectionBonus', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-armour', live()?.armour === 18, String(live()?.armour));
            } catch (err) {
                record('get-armour', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-voidShields', live()?.voidShields === 2, String(live()?.voidShields));
            } catch (err) {
                record('get-voidShields', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-turretRating', live()?.turretRating === 2, String(live()?.turretRating));
            } catch (err) {
                record('get-turretRating', false, err instanceof Error ? err.message : String(err));
            }
            try {
                const c = live()?.crew;
                record('get-crew', c?.crewRating === 30 && c?.population === 25_000, JSON.stringify(c));
            } catch (err) {
                record('get-crew', false, err instanceof Error ? err.message : String(err));
            }
            try {
                // Schema may recompute `used` from embedded components (start
                // value is sanitized to 0 when no shipComponents seed it). The
                // getter coverage signal is the property-read itself returning
                // a numeric pair, not the specific seeded value.
                const p = live()?.power;
                record('get-power', typeof p?.total === 'number' && typeof p?.used === 'number', JSON.stringify(p));
            } catch (err) {
                record('get-power', false, err instanceof Error ? err.message : String(err));
            }
            try {
                const s = live()?.space;
                record('get-space', typeof s?.total === 'number' && typeof s?.used === 'number', JSON.stringify(s));
            } catch (err) {
                record('get-space', false, err instanceof Error ? err.message : String(err));
            }
            try {
                const wc = live()?.weaponCapacity;
                const ok = wc?.prow === 1 && wc?.dorsal === 2 && wc?.port === 1 && wc?.starboard === 1 && wc?.keel === 0;
                record('get-weaponCapacity', ok, JSON.stringify(wc));
            } catch (err) {
                record('get-weaponCapacity', false, err instanceof Error ? err.message : String(err));
            }

            // -------- isCrippled / isDestroyed: false branch at full hull --------
            try {
                record('get-isCrippled-false', live()?.isCrippled === false, String(live()?.isCrippled));
            } catch (err) {
                record('get-isCrippled-false', false, err instanceof Error ? err.message : String(err));
            }
            try {
                record('get-isDestroyed-false', live()?.isDestroyed === false, String(live()?.isDestroyed));
            } catch (err) {
                record('get-isDestroyed-false', false, err instanceof Error ? err.message : String(err));
            }

            // -------- ship-* item getters with no items --------
            try {
                const comps = live()?.shipComponents;
                record('get-shipComponents', Array.isArray(comps) && comps.length === 0, `len=${comps?.length}`);
            } catch (err) {
                record('get-shipComponents', false, err instanceof Error ? err.message : String(err));
            }
            try {
                const weps = live()?.shipWeapons;
                record('get-shipWeapons', Array.isArray(weps) && weps.length === 0, `len=${weps?.length}`);
            } catch (err) {
                record('get-shipWeapons', false, err instanceof Error ? err.message : String(err));
            }
            try {
                const ups = live()?.shipUpgrades;
                record('get-shipUpgrades', Array.isArray(ups) && ups.length === 0, `len=${ups?.length}`);
            } catch (err) {
                record('get-shipUpgrades', false, err instanceof Error ? err.message : String(err));
            }

            // -------- embed a couple of shipWeapons to exercise weaponsByLocation buckets --------
            let createdWeaponId: string | null = null;
            try {
                const created = await withTimeout(
                    live()?.createEmbeddedDocuments?.('Item', [
                        {
                            name: 'Prow Lance Battery',
                            type: 'shipWeapon',
                            system: { location: 'prow' },
                        },
                        {
                            name: 'Dorsal Macrocannons',
                            type: 'shipWeapon',
                            system: { location: 'dorsal' },
                        },
                        {
                            name: 'Mystery Weapon (unknown loc)',
                            type: 'shipWeapon',
                            system: {},
                        },
                    ]),
                    8_000,
                    'starship weapon embed',
                );
                const createdArr = (Array.isArray(created) ? created : []) as Array<{ id?: string; type?: string }>;
                createdWeaponId = createdArr[0]?.id ?? null;
                const wbl = live()?.weaponsByLocation;
                const ok =
                    wbl != null &&
                    Array.isArray(wbl.prow) &&
                    wbl.prow.length === 1 &&
                    Array.isArray(wbl.dorsal) &&
                    // mystery falls back to 'dorsal' (default in the source)
                    wbl.dorsal.length === 2 &&
                    Array.isArray(wbl.port) &&
                    wbl.port.length === 0 &&
                    Array.isArray(wbl.starboard) &&
                    Array.isArray(wbl.keel);
                record('get-weaponsByLocation', !!ok, JSON.stringify(Object.fromEntries(Object.entries(wbl ?? {}).map(([k, v]) => [k, (v as any[]).length]))));
            } catch (err) {
                record('get-weaponsByLocation', false, err instanceof Error ? err.message : String(err));
            }

            // -------- method: prepareData (triggered by an update that recomputes) --------
            try {
                // Force a re-prepare by writing to a derived-affecting field. The
                // override calls `system.prepareEmbeddedData()` so any successful
                // round-trip counts as having executed the override.
                await withTimeout(live()?.update?.({ 'system.armour': 19 }), 5_000, 'update for prepareData');
                record('method-prepareData', live()?.armour === 19, String(live()?.armour));
            } catch (err) {
                record('method-prepareData', false, err instanceof Error ? err.message : String(err));
            }

            // -------- method: fireWeapon (valid id → creates a chat message; just no-throw) --------
            try {
                if (createdWeaponId === null) {
                    record('method-fireWeapon-valid', false, 'no weapon id available');
                } else {
                    await withTimeout(live()?.fireWeapon?.(createdWeaponId), 8_000, 'fireWeapon valid');
                    record('method-fireWeapon-valid', true, null);
                }
            } catch (err) {
                record('method-fireWeapon-valid', false, err instanceof Error ? err.message : String(err));
            }

            // -------- method: fireWeapon (invalid id → warns + returns; no-throw) --------
            try {
                await withTimeout(live()?.fireWeapon?.('not-a-real-weapon-id'), 5_000, 'fireWeapon invalid');
                record('method-fireWeapon-invalid', true, null);
            } catch (err) {
                record('method-fireWeapon-invalid', false, err instanceof Error ? err.message : String(err));
            }

            // -------- method: rollInitiative --------
            try {
                const result = await withTimeout(live()?.rollInitiative?.(), 8_000, 'rollInitiative');
                // The override returns null by contract; either way no-throw is the coverage signal.
                record('method-rollInitiative', result === null || result === undefined || typeof result === 'object', `returned=${String(result)}`);
            } catch (err) {
                record('method-rollInitiative', false, err instanceof Error ? err.message : String(err));
            }

            // -------- isCrippled-true / isDestroyed-true: damage the hull --------
            try {
                await withTimeout(live()?.update?.({ 'system.hullIntegrity.value': 10 }), 5_000, 'hull damage for crippled');
                // 10 <= floor(40/2)=20 → crippled
                record('get-isCrippled-true', live()?.isCrippled === true, `value=${live()?.hullIntegrity?.value}`);
            } catch (err) {
                record('get-isCrippled-true', false, err instanceof Error ? err.message : String(err));
            }
            try {
                await withTimeout(live()?.update?.({ 'system.hullIntegrity.value': 0 }), 5_000, 'hull zero for destroyed');
                record('get-isDestroyed-true', live()?.isDestroyed === true, `value=${live()?.hullIntegrity?.value}`);
            } catch (err) {
                record('get-isDestroyed-true', false, err instanceof Error ? err.message : String(err));
            }

            // -------- cleanup --------
            try {
                await live()?.delete?.();
            } catch {
                /* ignore */
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, STARSHIP_METHODS_FLOWS);
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('documents/starship method coverage (Tier B)', () => {
    test.setTimeout(180_000);
    test('every WH40KStarship getter and method executes against an rt-starship', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeStarshipMethods(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('starship-methods.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of STARSHIP_METHODS_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${STARSHIP_METHODS_FLOWS.length} starship-method probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
