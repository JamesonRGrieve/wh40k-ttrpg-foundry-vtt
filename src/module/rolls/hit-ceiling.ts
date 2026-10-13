/**
 * @file Localized hit-ceiling rows for a burst's attack card (#607). Which parts
 * the ceiling has and which rule put each there is pure (`rules/auto-fire.ts`);
 * this module only runs them through the langpack and names the game line.
 */

import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import { t } from '../i18n/t.ts';
import { type BurstCapComponent, hitCeilingRows } from '../rules/auto-fire.ts';

/** One hoverable hit-ceiling row as the card renders it. */
interface HitCeilingCardRow {
    label: string;
    value: number;
    /** JSON payload for the shared wh40k-tooltip "modifier" type. */
    tooltipData: string;
}

/** The burst's hit ceiling as the card renders it: the rate of fire, the parts on top of it, and the total. */
export interface HitCeilingCard {
    base: HitCeilingCardRow;
    parts: HitCeilingCardRow[];
    total: number;
}

/** The attack data the ceiling is described from. */
interface HitCeilingSource {
    readonly action: string;
    readonly burstCapComponents: readonly BurstCapComponent[];
    readonly fireRate: number;
    readonly gameSystemId: string | undefined;
}

/**
 * The card's hit-ceiling block for a burst, or null for an action with no ceiling.
 * @param {HitCeilingSource} source  The committed attack's action, ceiling parts, ceiling and line.
 * @returns {HitCeilingCard | null}  The localized rows.
 */
export function localizeHitCeiling(source: HitCeilingSource): HitCeilingCard | null {
    const config = source.gameSystemId === undefined ? null : SystemConfigRegistry.getOrNull(source.gameSystemId);
    const rows = hitCeilingRows(source.action, source.burstCapComponents, config?.burstRules ?? null);
    const first = rows.at(0);
    if (first === undefined) return null;
    const rest = rows.slice(1);
    const line = config === null ? '' : game.i18n.localize(config.label);
    const toCard = (row: (typeof rows)[number]): HitCeilingCardRow => {
        const label = t(row.labelKey);
        return {
            label,
            value: row.value,
            tooltipData: JSON.stringify({ title: label, sources: [{ name: t(row.sourceKey, { line }), value: row.value }] }),
        };
    };
    return { base: toCard(first), parts: rest.map(toCard), total: source.fireRate };
}
