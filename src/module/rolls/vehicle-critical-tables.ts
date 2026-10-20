/**
 * The Vehicle Critical charts a line's packs carry (content#28). Each chart is a
 * RollTable flagged `flags['wh40k-rpg'].vehicleCritical.location` with the hit
 * location it covers (`motive` / `hull` / `weapon` / `turret`), or `any` for a
 * line printing one chart for the whole vehicle (RT, DW). The system discovers
 * them by that flag in the packs of the vehicle's line, never by name, and reads
 * a row with {@link vehicleCritRowFor}.
 */

import { SYSTEM_ID } from '../constants.ts';
import { chartLocationsFor, type VehicleCritChartLocation, type VehicleCritRow, type VehicleLocationId, vehicleCritRowFor } from '../rules/vehicle-damage.ts';
import { packLine } from '../utils/index-source.ts';

/** The flag a vehicle crit chart carries. */
const VEHICLE_CRITICAL_FLAG = 'vehicleCritical';

/** A chart's rows and where it came from, for the card. */
interface VehicleCritChart {
    readonly name: string;
    readonly uuid: string;
    readonly rows: readonly VehicleCritRow[];
}

/** One row a chart lookup landed on. */
export interface VehicleCritLookup {
    readonly chartName: string;
    readonly chartUuid: string;
    /** The value read against the chart. */
    readonly value: number;
    readonly text: string;
}

/** Look up a row of a vehicle's crit chart: its line, the struck location, the value. Injected so tests run without packs. */
export type VehicleCritLookupFn = (line: string, location: VehicleLocationId, value: number) => Promise<VehicleCritLookup | null>;

/** The slice of a RollTable pack this module reads. */
interface RollTablePackLike {
    readonly collection: string;
    readonly metadata: { readonly type: string; readonly packageName: string };
    // eslint-disable-next-line no-restricted-syntax -- boundary: CompendiumCollection#getIndex returns each entry's flags as untyped JSON; chartLocation validates the one flag read
    getIndex: (options: { fields: string[] }) => Promise<Iterable<{ _id: string; name?: string; flags?: Record<string, Record<string, unknown> | undefined> }>>;
    getDocument: (id: string) => Promise<RollTableLike | null | undefined>;
}

/** The slice of a RollTable document this module reads. */
interface RollTableLike {
    readonly name: string;
    readonly uuid: string;
    readonly results: Iterable<{ range: readonly number[]; description?: string; text?: string; name?: string }>;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: the flag value CompendiumCollection#getIndex returns is untyped JSON; this guard is its validation
function chartLocation(flag: unknown): VehicleCritChartLocation | null {
    if (flag === null || typeof flag !== 'object' || !('location' in flag)) return null;
    const { location } = flag;
    return location === 'motive' || location === 'hull' || location === 'weapon' || location === 'turret' || location === 'any' ? location : null;
}

/** A chart document's rows. Pure. */
export function chartRows(results: RollTableLike['results']): VehicleCritRow[] {
    const rows: VehicleCritRow[] = [];
    for (const result of results) {
        const [min, max] = result.range;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) types the destructured range as always present; tsconfig.json (flag on) types it `| undefined` and requires this guard
        if (min === undefined || max === undefined) continue;
        rows.push({ min, max, text: result.description ?? result.text ?? result.name ?? '' });
    }
    return rows;
}

const chartCache = new Map<string, Promise<VehicleCritChart | null>>();

/** Find the chart flagged for a line's location (its own chart first, then the line's single chart). */
async function findChart(line: string, location: VehicleLocationId): Promise<VehicleCritChart | null> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs is Foundry's CompendiumCollection (untyped element shape); narrowed to the RollTablePackLike surface
    const packs = [...(game.packs as unknown as Iterable<RollTablePackLike>)].filter(
        (pack) => pack.metadata.type === 'RollTable' && pack.metadata.packageName === SYSTEM_ID && packLine(pack.collection) === line,
    );
    for (const wanted of chartLocationsFor(location)) {
        for (const pack of packs) {
            // eslint-disable-next-line no-await-in-loop -- sequential by design: the first pack carrying the chart wins
            const index = await pack.getIndex({ fields: [`flags.${SYSTEM_ID}.${VEHICLE_CRITICAL_FLAG}`] });
            const entry = [...index].find((row) => chartLocation(row.flags?.[SYSTEM_ID]?.[VEHICLE_CRITICAL_FLAG]) === wanted);
            if (entry === undefined) continue;
            // eslint-disable-next-line no-await-in-loop -- sequential by design (see above)
            const table = await pack.getDocument(entry._id);
            if (table === null || table === undefined) continue;
            return { name: table.name, uuid: table.uuid, rows: chartRows(table.results) };
        }
    }
    return null;
}

/** The chart for a line's location, cached for the session. */
async function chartFor(line: string, location: VehicleLocationId): Promise<VehicleCritChart | null> {
    const key = `${line}:${location}`;
    const cached = chartCache.get(key);
    if (cached !== undefined) return cached;
    const found = findChart(line, location);
    chartCache.set(key, found);
    return found;
}

/**
 * The row a value lands on in the vehicle's chart for the struck location, or
 * null when the line's packs carry no such chart (BC, DH1, IM).
 */
export async function lookupVehicleCritical(line: string, location: VehicleLocationId, value: number): Promise<VehicleCritLookup | null> {
    const chart = await chartFor(line, location);
    if (chart === null) return null;
    const row = vehicleCritRowFor(chart.rows, value);
    return row === null ? null : { chartName: chart.name, chartUuid: chart.uuid, value, text: row.text };
}
