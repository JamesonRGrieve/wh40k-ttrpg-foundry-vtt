/**
 * Serialisation for the rich `modifier` tooltip (`data-wh40k-tooltip="modifier"`):
 * a title plus named numeric components. Pure, with no UI dependency, so the roll
 * layer can attach provenance tooltips to the rows it builds without importing the
 * tooltip application (and the import cycle that would bring).
 */

/** One component row of a modifier tooltip. */
export interface ModifierTooltipSource {
    name?: string;
    source?: string;
    value?: number;
    modifier?: number;
}

/** The `data-wh40k-tooltip-data` JSON for a modifier tooltip. */
export function prepareModifierTooltipData(title: string, sources: ModifierTooltipSource[]): string {
    const data = {
        title,
        sources: sources.map((s) => ({
            name: s.name ?? s.source ?? 'Unknown',
            value: s.value ?? s.modifier ?? 0,
        })),
    };
    return JSON.stringify(data);
}
