import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the vehicle + starship gameplay paths. The
 * actor-types spec proves these actor types can be created and their
 * sheets render; this spec drives their gameplay-specific fields so
 * source-code coverage on the underlying DataModels and sheets climbs
 * past basic constructor execution.
 *
 * Source coverage targets:
 *   - src/module/data/actor/vehicle.ts (integrity get/set,
 *     prepareBaseData clamp, prepareDerivedData → _applyVehicleTraitModifiers,
 *     altitude field write-back, isDamaged / isCritical / isDestroyed
 *     getters, armourSummary / speedSummary / integrityPercentage)
 *   - src/module/data/actor/starship.ts (prepareDerivedData →
 *     _prepareResources + _prepareCombatStats, prepareEmbeddedData walk
 *     over shipComponent / shipWeapon / shipUpgrade items, hullPercentage
 *     + moralePercentage derived fields, isDamaged / isCrippled getters,
 *     getRollData shorthand keys)
 *   - src/module/applications/actor/vehicle-sheet.ts (item bucketing
 *     into vehicleTraits / shipWeapons / shipComponents on render)
 *   - src/module/applications/actor/starship-sheet.ts (shipComponents /
 *     shipWeapons / shipUpgrades context split on render)
 *
 * Strategy mirrors damage.spec.ts: join as GM, run a single Page.evaluate
 * with per-call timeouts, accumulate per-flow pass/fail, then assert
 * collect-failures at the end. Each successful flow records a
 * `vehicle-starship.flow` coverage key.
 *
 * Keep VEHICLE_STARSHIP_FLOWS in sync with the equivalent constant in
 * scripts/e2e-coverage.mjs — that is the coverage denominator and must
 * agree with the recordCoverage keys here.
 */

const VEHICLE_STARSHIP_FLOWS = [
    'vehicle-hull-damage',
    'vehicle-crew-management',
    'vehicle-altitude-profile',
    'starship-component-install',
    'starship-crew-morale',
    'starship-hull-and-shields',
    'vehicle-weapon-fire',
] as const;

type FlowName = (typeof VEHICLE_STARSHIP_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    vehicleId: string | null;
    starshipId: string | null;
    setupError: string | null;
}

/**
 * Shape returned by the in-browser `page.evaluate` callback. It uses
 * loose `Record<string, …>` keying because the callback builds its maps
 * from the runtime `flows` string array rather than the `FlowName`
 * literal union; the outer scope reads it back through the typed
 * `ProbeResult` view.
 */
interface RawProbeResult {
    flowsFired: Record<string, boolean>;
    flowNotes: Record<string, string>;
    vehicleId: string | null;
    starshipId: string | null;
    setupError: string | null;
}

async function probeVehicleStarshipFlows(page: Page): Promise<ProbeResult & { pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]): Promise<RawProbeResult> => {
            // Foundry globals are runtime-only; describe just the surface this probe touches.
            type DataValue = string | number | boolean | null | DataLeaf | DataLeaf[];
            interface DataLeaf {
                [key: string]: DataValue;
            }
            type DocData = Record<string, DataValue>;
            interface CreatedItem {
                id?: string;
                type?: string;
            }
            interface ActorLike {
                id?: string;
                system?: {
                    integrity?: { value?: number };
                    crew?: { required?: number; morale?: { max?: number; value?: number } };
                    passengers?: number;
                    altitude?: string;
                    isDamaged?: boolean;
                    hullIntegrity?: { max?: number; value?: number };
                    voidShields?: number;
                    hullPercentage?: number;
                    isCrippled?: boolean;
                    moralePercentage?: number;
                };
                items?: { size?: number };
                update: (data: DocData) => Promise<void>;
                createEmbeddedDocuments?: (type: string, data: DocData[]) => Promise<CreatedItem[]>;
                sheet?: { render?: (force: boolean) => Promise<void>; close?: () => Promise<void> };
                delete?: () => Promise<void>;
            }
            interface ActorStatic {
                create?: (data: DocData) => Promise<ActorLike | null>;
            }
            interface FoundryGlobal {
                Actor?: ActorStatic;
                game?: { actors?: { get?: (id: string) => ActorLike | null | undefined } };
            }
            // eslint-disable-next-line no-restricted-syntax -- named Foundry framework boundary: browser-side globalThis (Actor, game)
            const g = globalThis as unknown as FoundryGlobal;
            const ActorCls = g.Actor;
            const gme = g.game;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (ActorCls?.create == null) {
                return {
                    flowsFired: fired,
                    flowNotes: { 'vehicle-hull-damage': 'Actor.create unavailable' },
                    vehicleId: null,
                    starshipId: null,
                    setupError: 'Actor.create unavailable',
                };
            }

            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                const timers: ReturnType<typeof setTimeout>[] = [];
                const timeout = new Promise<T>((_, reject) => {
                    timers.push(setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms));
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    for (const timer of timers) clearTimeout(timer);
                }
            };

            // ---- create dh2-vehicle ----
            let vehicleActor: ActorLike | null = null;
            try {
                vehicleActor = await withTimeout(
                    ActorCls.create({
                        name: 'vehicle-spec-dh2',
                        type: 'dh2-vehicle',
                        system: {
                            gameSystem: 'dh2e',
                            type: 'flyer',
                            vehicleClass: 'air',
                            integrity: { max: 10, value: 10, critical: 0 },
                            crew: { required: 2, notes: 'pilot + gunner' },
                            passengers: 4,
                            altitude: 'ground',
                            armour: {
                                front: { value: 12, descriptor: '' },
                                side: { value: 10, descriptor: '' },
                                rear: { value: 8, descriptor: '' },
                            },
                            speed: { cruising: 200, tactical: 30, notes: '' },
                        },
                    }),
                    5_000,
                    'vehicle Actor.create',
                );
            } catch (err) {
                notes['vehicle-hull-damage'] = `vehicle create threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- create rt-starship ----
            let starshipActor: ActorLike | null = null;
            try {
                starshipActor = await withTimeout(
                    ActorCls.create({
                        name: 'starship-spec-rt',
                        type: 'rt-starship',
                        system: {
                            gameSystem: 'rt',
                            hullType: 'sword-frigate',
                            hullIntegrity: { max: 40, value: 40 },
                            voidShields: 1,
                            armour: 18,
                            speed: 8,
                            manoeuvrability: 15,
                            detection: 10,
                            turretRating: 2,
                            crew: {
                                population: 25_000,
                                crewRating: 30,
                                morale: { max: 100, value: 100 },
                            },
                            space: { total: 40, used: 0 },
                            power: { total: 50, used: 0 },
                        },
                    }),
                    5_000,
                    'starship Actor.create',
                );
            } catch (err) {
                notes['starship-component-install'] = `starship create threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            if (vehicleActor?.id == null && starshipActor?.id == null) {
                return {
                    flowsFired: fired,
                    flowNotes: { ...notes, 'vehicle-hull-damage': 'no actors could be created' },
                    vehicleId: null,
                    starshipId: null,
                    setupError: 'no actors could be created',
                };
            }

            const getVehicle = (): ActorLike | null | undefined => (vehicleActor?.id != null ? gme?.actors?.get?.(vehicleActor.id) : null);
            const getStarship = (): ActorLike | null | undefined => (starshipActor?.id != null ? gme?.actors?.get?.(starshipActor.id) : null);

            // ---- 1. vehicle-hull-damage (integrity.value reduces, isDamaged getter flips) ----
            try {
                const v = getVehicle();
                if (v == null) {
                    notes['vehicle-hull-damage'] = 'no vehicle available';
                } else {
                    const before = v.system?.integrity?.value ?? -1;
                    await withTimeout(v.update({ 'system.integrity.value': Math.max(0, before - 4) }), 5_000, 'vehicle integrity update');
                    const after = getVehicle()?.system?.integrity?.value ?? -1;
                    const isDamaged = getVehicle()?.system?.isDamaged ?? false;
                    if (after === before - 4 && isDamaged) {
                        fired['vehicle-hull-damage'] = true;
                    } else {
                        notes['vehicle-hull-damage'] = `expected integrity ${before - 4} + isDamaged=true, got ${after} / isDamaged=${isDamaged}`;
                    }
                }
            } catch (err) {
                notes['vehicle-hull-damage'] = `hull damage threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- 2. vehicle-crew-management (crew.required update + passengers) ----
            // Vehicles don't have embedded ship-role items in this codebase
            // (those belong to starships); the vehicle's crew is the
            // `crew.required` + `passengers` scalar pair, so we walk those.
            try {
                const v = getVehicle();
                if (v == null) {
                    notes['vehicle-crew-management'] = 'no vehicle available';
                } else {
                    const beforeReq = v.system?.crew?.required ?? -1;
                    const beforePax = v.system?.passengers ?? -1;
                    await withTimeout(
                        v.update({
                            'system.crew.required': beforeReq + 1,
                            'system.passengers': beforePax + 2,
                        }),
                        5_000,
                        'vehicle crew update',
                    );
                    const afterReq = getVehicle()?.system?.crew?.required ?? -1;
                    const afterPax = getVehicle()?.system?.passengers ?? -1;
                    if (afterReq === beforeReq + 1 && afterPax === beforePax + 2) {
                        fired['vehicle-crew-management'] = true;
                    } else {
                        notes['vehicle-crew-management'] = `expected required=${beforeReq + 1} passengers=${
                            beforePax + 2
                        }, got req=${afterReq} pax=${afterPax}`;
                    }
                }
            } catch (err) {
                notes['vehicle-crew-management'] = `crew update threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- 3. vehicle-altitude-profile (ground → low → high) ----
            try {
                const v = getVehicle();
                if (v == null) {
                    notes['vehicle-altitude-profile'] = 'no vehicle available';
                } else {
                    await withTimeout(v.update({ 'system.altitude': 'low' }), 5_000, 'altitude low');
                    const atLow = getVehicle()?.system?.altitude;
                    const vHigh = getVehicle();
                    if (vHigh != null) await withTimeout(vHigh.update({ 'system.altitude': 'high' }), 5_000, 'altitude high');
                    const atHigh = getVehicle()?.system?.altitude;
                    const vOrbital = getVehicle();
                    if (vOrbital != null) await withTimeout(vOrbital.update({ 'system.altitude': 'orbital' }), 5_000, 'altitude orbital');
                    const atOrbital = getVehicle()?.system?.altitude;
                    if (atLow === 'low' && atHigh === 'high' && atOrbital === 'orbital') {
                        fired['vehicle-altitude-profile'] = true;
                    } else {
                        notes['vehicle-altitude-profile'] = `expected low/high/orbital, got ${atLow}/${atHigh}/${atOrbital}`;
                    }
                }
            } catch (err) {
                notes['vehicle-altitude-profile'] = `altitude flow threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- 4. starship-component-install (embed a shipComponent → prepareEmbeddedData walks it) ----
            try {
                const s = getStarship();
                if (s == null) {
                    notes['starship-component-install'] = 'no starship available';
                } else if (typeof s.createEmbeddedDocuments !== 'function') {
                    notes['starship-component-install'] = 'createEmbeddedDocuments missing';
                } else {
                    const before = getStarship()?.items?.size ?? 0;
                    const created = await withTimeout(
                        s.createEmbeddedDocuments('Item', [
                            {
                                name: 'Jovian Pattern Class 2 Drive',
                                type: 'shipComponent',
                                system: {
                                    condition: 'functional',
                                    space: 10,
                                    power: { generated: 35, used: 0 },
                                    modifiers: { speed: 1 },
                                },
                            },
                        ]),
                        5_000,
                        'starship component embed',
                    );
                    const after = getStarship()?.items?.size ?? 0;
                    const createdArr = Array.isArray(created) ? created : [];
                    const componentExists = createdArr.length === 1 && createdArr[0]?.type === 'shipComponent';
                    if (after === before + 1 && componentExists) {
                        fired['starship-component-install'] = true;
                    } else {
                        notes['starship-component-install'] = `expected items size ${
                            before + 1
                        } + shipComponent type, got size=${after} created=${JSON.stringify(createdArr.map((c) => c.type))}`;
                    }
                }
            } catch (err) {
                notes['starship-component-install'] = `component embed threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- 5. starship-crew-morale (morale.value update → moralePercentage derived) ----
            try {
                const s = getStarship();
                if (s == null) {
                    notes['starship-crew-morale'] = 'no starship available';
                } else {
                    const beforeMax = s.system?.crew?.morale?.max ?? 0;
                    await withTimeout(s.update({ 'system.crew.morale.value': Math.floor(beforeMax / 2) }), 5_000, 'starship morale update');
                    const afterVal = getStarship()?.system?.crew?.morale?.value ?? -1;
                    const moralePct = getStarship()?.system?.moralePercentage ?? -1;
                    if (afterVal === Math.floor(beforeMax / 2) && moralePct === 50) {
                        fired['starship-crew-morale'] = true;
                    } else {
                        notes['starship-crew-morale'] = `expected morale=${Math.floor(beforeMax / 2)} pct=50, got val=${afterVal} pct=${moralePct}`;
                    }
                }
            } catch (err) {
                notes['starship-crew-morale'] = `morale update threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- 6. starship-hull-and-shields (hull damage + shield drop → hullPercentage / isDamaged / isCrippled) ----
            try {
                const s = getStarship();
                if (s == null) {
                    notes['starship-hull-and-shields'] = 'no starship available';
                } else {
                    const maxHull = s.system?.hullIntegrity?.max ?? 0;
                    // Drop hull to 40% to trigger isCrippled (≤ half).
                    const damaged = Math.floor(maxHull * 0.4);
                    await withTimeout(
                        s.update({
                            'system.hullIntegrity.value': damaged,
                            'system.voidShields': 0,
                        }),
                        5_000,
                        'starship hull + shields update',
                    );
                    const post = getStarship();
                    const hullVal = post?.system?.hullIntegrity?.value ?? -1;
                    const shields = post?.system?.voidShields ?? -1;
                    const hullPct = post?.system?.hullPercentage ?? -1;
                    const isCrippled = post?.system?.isCrippled ?? false;
                    if (hullVal === damaged && shields === 0 && hullPct === 40 && isCrippled) {
                        fired['starship-hull-and-shields'] = true;
                    } else {
                        notes[
                            'starship-hull-and-shields'
                        ] = `expected hull=${damaged}/shields=0/pct=40/crippled=true, got hull=${hullVal} shields=${shields} pct=${hullPct} crippled=${isCrippled}`;
                    }
                }
            } catch (err) {
                notes['starship-hull-and-shields'] = `hull/shields threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- 7. vehicle-weapon-fire (embed a shipWeapon on the vehicle and confirm the bucket lands) ----
            // We don't fire a roll here — the vehicle sheet's roll wiring is
            // not yet a public API surface. Confirming the weapon embeds
            // successfully drives the vehicle-sheet item-bucketing branch
            // (`case 'shipWeapon'` in _prepareContext).
            try {
                const v = getVehicle();
                if (v == null) {
                    notes['vehicle-weapon-fire'] = 'no vehicle available';
                } else if (typeof v.createEmbeddedDocuments !== 'function') {
                    notes['vehicle-weapon-fire'] = 'createEmbeddedDocuments missing';
                } else {
                    const beforeSize = getVehicle()?.items?.size ?? 0;
                    const created = await withTimeout(
                        v.createEmbeddedDocuments('Item', [
                            {
                                name: 'Heavy Bolter (vehicle-mounted)',
                                type: 'shipWeapon',
                                system: {},
                            },
                        ]),
                        5_000,
                        'vehicle weapon embed',
                    );
                    const afterSize = getVehicle()?.items?.size ?? 0;
                    const createdArr = Array.isArray(created) ? created : [];
                    const ok = createdArr.length === 1 && createdArr[0]?.type === 'shipWeapon';
                    if (afterSize === beforeSize + 1 && ok) {
                        // Force a sheet render so the vehicle-sheet's item-bucket
                        // switch executes against the new weapon.
                        try {
                            const renderPromise = getVehicle()?.sheet?.render?.(true);
                            if (renderPromise != null) await withTimeout(renderPromise, 5_000, 'vehicle sheet render');
                            await getVehicle()?.sheet?.close?.();
                        } catch {
                            /* sheet render is best-effort here — the embed itself is the metric */
                        }
                        fired['vehicle-weapon-fire'] = true;
                    } else {
                        notes['vehicle-weapon-fire'] = `expected items size ${beforeSize + 1}, got ${afterSize} (types=${JSON.stringify(
                            createdArr.map((c) => c.type),
                        )})`;
                    }
                }
            } catch (err) {
                notes['vehicle-weapon-fire'] = `weapon embed threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- cleanup ----
            try {
                await getVehicle()?.delete?.();
            } catch {
                /* ignore */
            }
            try {
                await getStarship()?.delete?.();
            } catch {
                /* ignore */
            }

            return {
                flowsFired: fired,
                flowNotes: notes,
                vehicleId: vehicleActor?.id ?? null,
                starshipId: starshipActor?.id ?? null,
                setupError: null,
            };
        }, VEHICLE_STARSHIP_FLOWS);

        return {
            flowsFired: result.flowsFired,
            flowNotes: result.flowNotes,
            vehicleId: result.vehicleId,
            starshipId: result.starshipId,
            setupError: result.setupError,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('vehicle + starship gameplay pipeline (Tier B)', () => {
    test.setTimeout(180_000);
    test('vehicle and starship update flows drive integrity, crew, altitude, components, morale, and shields', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeVehicleStarshipFlows(page);

        const failures: string[] = [];

        for (const flow of VEHICLE_STARSHIP_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('vehicle-starship.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${VEHICLE_STARSHIP_FLOWS.length} vehicle/starship probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
