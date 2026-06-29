/**
 * Order aptitudes for display: universal aptitudes (General) first, then the
 * rest alphabetically.
 *
 * The universal set is content-driven — it comes from the active system's
 * `AptitudeBasedSystemConfig.universalAptitudes` — so "General" is never
 * hardcoded here (Direction #7); this helper only knows "universal sorts first".
 */
export function orderAptitudesGeneralFirst(aptitudes: readonly string[], universal: ReadonlySet<string>): string[] {
    return [...aptitudes].sort((a, b) => {
        const aUniversal = universal.has(a);
        const bUniversal = universal.has(b);
        if (aUniversal !== bUniversal) return aUniversal ? -1 : 1;
        return a.localeCompare(b);
    });
}
