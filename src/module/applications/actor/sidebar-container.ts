/**
 * Shared `#sidebar` part container for actor sheets whose `header` and `tabs`
 * PARTS both mount into the left sidebar (PC, NPC, craft).
 *
 * The container itself never scrolls: only the header part does, and the tab
 * strip is pinned beneath it. When the whole container scrolled, a tall header
 * (origin bubbles + bio fields — tallest on RT) pushed the tab nav below the
 * fold with no visible cue on six of seven lines.
 *
 * The header's bottom edge carries a scroll shadow while more of it lies below
 * (#701): a fixed shadow layer, covered by a `local` layer that scrolls with the
 * content and sits over the shadow only once the header is scrolled to its end.
 * Without it the header's lower fields (Hull Integrity, a DW Rank, a horde's
 * Nature and Faction) looked cut off by the tab strip, not scrollable.
 */
export const SIDEBAR_CONTAINER = {
    id: 'sidebar',
    classes: [
        'wh40k-sidebar',
        'tw-flex',
        'tw-flex-col',
        'tw-h-full',
        'tw-min-h-0',
        'tw-min-w-0',
        'tw-overflow-hidden',
        'tw-bg-[var(--color-bg-secondary,#252525)]',
        'tw-border-r-2',
        'tw-border-solid',
        'tw-border-[var(--wh40k-sidebar-accent,var(--wh40k-color-gold,#d4af37))]',
        '[&>[data-application-part=header]]:tw-flex-1',
        '[&>[data-application-part=header]]:tw-min-h-0',
        '[&>[data-application-part=header]]:tw-overflow-y-auto',
        '[&>[data-application-part=header]]:tw-overflow-x-hidden',
        '[&>[data-application-part=header]]:[background:linear-gradient(var(--color-bg-secondary,#252525),var(--color-bg-secondary,#252525))_center_bottom/100%_16px_no-repeat_local,linear-gradient(transparent,rgba(0,0,0,0.6))_center_bottom/100%_16px_no-repeat_scroll]',
        '[&>[data-application-part=tabs]]:tw-shrink-0',
    ],
};
