// Gothic-themed `.wh40k-panel` component library — collapsible content section
// with header, body, chevron, and accent overlays. Ports the merged rules from
// the legacy `_gothic-theme.css` and `_unified-components.css` files into a
// Tailwind addComponents plugin. The unified-components definitions came later
// in the cascade and won most property conflicts; gothic-theme contributed
// typography and the ⚜ ornament to the header. Final values reflect that
// merge, so rendered output matches the legacy cascade.
//
// Selector keys here are auto-prefixed by Tailwind's `prefix: 'tw-'` config
// when they begin with a class — but the wh40k-* class names are deliberate
// component classes (not utilities), so we DO NOT add the prefix.

module.exports = {
    '.wh40k-panel': {
        background: 'var(--wh40k-panel-bg)',
        border: '1px solid var(--wh40k-border-color-light)',
        borderRadius: 'var(--wh40k-radius-lg)',
        overflow: 'hidden',
        marginBottom: 'var(--wh40k-space-md)',
        boxShadow: '0 2px 8px var(--wh40k-shadow-soft)',
        position: 'relative',
        '&::before': {
            content: "''",
            position: 'absolute',
            inset: '0',
            background: 'var(--wh40k-accent-overlay)',
            borderTop: '2px solid var(--wh40k-accent-border)',
            borderBottom: '2px solid var(--wh40k-accent-border)',
            pointerEvents: 'none',
            zIndex: '0',
        },
        '& > *': {
            position: 'relative',
            zIndex: '1',
        },
        // Accent color modifier — any class matching `wh40k-panel--<name>` lights
        // up its header icon with the variant's accent color (set via the
        // `--panel-accent` custom property on the variant class).
        '&[class*="--"] .wh40k-panel-header .wh40k-panel-title i': {
            color: 'var(--panel-accent, var(--wh40k-accent-gold))',
        },
    },
    '.wh40k-panel-header': {
        display: 'flex !important',
        flexDirection: 'row !important',
        alignItems: 'center !important',
        gap: 'var(--wh40k-space-sm)',
        padding: 'var(--wh40k-space-sm) var(--wh40k-space-md)',
        background:
            'linear-gradient(180deg, rgb(from var(--wh40k-accent-gold) r g b / 0.15) 0%, rgb(from var(--wh40k-accent-gold) r g b / 0.05) 100%)',
        borderBottom: '1px solid var(--wh40k-border-color-light)',
        transition: 'box-shadow 0.2s ease, background 0.2s ease',
        width: '100% !important',
        boxSizing: 'border-box !important',
        minWidth: '0 !important',
        // Typography contributed by the legacy gothic-theme rule (unified-components
        // didn't override these, so they survived the cascade).
        fontFamily: 'var(--wh40k-font-header)',
        fontSize: '0.95rem',
        fontWeight: 'bold',
        color: 'var(--wh40k-gold)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        textShadow: '1px 1px 2px var(--color-shadow-primary)',
        // ⚜ ornament prefix on every panel header. Pseudo-element retained;
        // not a candidate for the real-DOM-child pattern because the ornament
        // is purely decorative and consistent across every panel-header.
        '&::before': {
            content: "'⚜'",
            marginRight: 'var(--wh40k-space-sm)',
            color: 'var(--wh40k-gold)',
            fontSize: '1rem',
        },
        '& .wh40k-panel-title': {
            flex: '1 1 auto !important',
            fontFamily: "var(--wh40k-font-display, 'Modesto Condensed', serif)",
            fontSize: 'var(--wh40k-text-h3, 1.1rem)',
            fontWeight: '600',
            color: 'var(--wh40k-text-dark)',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap !important',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'flex !important',
            alignItems: 'center !important',
            gap: 'var(--wh40k-space-sm)',
            minWidth: '0',
            '& i': {
                marginRight: '0',
                color: 'var(--panel-accent, var(--wh40k-accent-gold))',
                flexShrink: '0',
            },
        },
        // Buttons / labels in a header dock to the right and never shrink.
        '& > button, & > label': {
            flexShrink: '0 !important',
            marginLeft: 'auto',
        },
    },
    '.wh40k-panel-body': {
        padding: 'var(--wh40k-space-md)',
        background: 'var(--wh40k-panel-body-bg)',
    },
    '.wh40k-panel.collapsed': {
        '& .wh40k-panel-body': {
            display: 'none',
        },
    },
};
