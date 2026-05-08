// Auto-ported from src/css/components/_item-preview.css via scripts/css-to-js.mjs.
// Registered in tailwind.config.js via addBase so wh40k-* class names emit
// literally (addComponents would prefix them with 'tw-' per the global
// 'prefix' config and break consumer templates).

module.exports = {
    ".wh40k-item-preview": {
        "display": "none",
        "opacity": "0",
        "max-height": "0",
        "overflow": "hidden",
        "margin": "0",
        "padding": "0",
        "transition": "opacity 0.2s ease, max-height 0.3s ease, margin 0.2s ease, padding 0.2s ease",
        "&--open": {
            "display": "block",
            "opacity": "1",
            "max-height": "1000px",
            "margin": "8px 0",
            "padding": "12px",
        },
        "background": "var(--wh40k-panel-bg, rgba(0, 0, 0, 0.3))",
        "border": "1px solid var(--wh40k-panel-border, rgba(255, 255, 255, 0.1))",
        "border-radius": "var(--wh40k-radius-md)",
        "box-shadow": "inset 0 1px 3px rgba(0, 0, 0, 0.2)",
        "&--weapon": {
            "border-left": "3px solid rgba(239, 68, 68, 0.5)",
        },
        "&--armour": {
            "border-left": "3px solid rgba(59, 130, 246, 0.5)",
        },
        "&--talent": {
            "border-left": "3px solid rgba(168, 85, 247, 0.5)",
        },
        "&--condition": {
            "border-left": "3px solid rgba(245, 158, 11, 0.5)",
        },
        "&--psychicPower,\n    &--navigatorPower": {
            "border-left": "3px solid rgba(139, 92, 246, 0.5)",
        },
    },
    ".wh40k-item-preview-header": {
        "display": "flex",
        "justify-content": "space-between",
        "align-items": "center",
        "gap": "var(--wh40k-space-md)",
        "margin-bottom": "12px",
        "padding-bottom": "8px",
        "border-bottom": "1px solid var(--wh40k-panel-border, rgba(255, 255, 255, 0.1))",
    },
    ".wh40k-item-preview-title": {
        "display": "flex",
        "align-items": "center",
        "gap": "var(--wh40k-space-sm)",
        "flex": "1",
        "font-size": "1.1em",
        "font-weight": "600",
        "color": "var(--wh40k-text-primary, #fff)",
    },
    ".wh40k-item-preview-icon": {
        "width": "32px",
        "height": "32px",
        "border-radius": "var(--wh40k-radius-md)",
        "border": "1px solid var(--wh40k-panel-border, rgba(255, 255, 255, 0.1))",
    },
    ".wh40k-item-preview-actions": {
        "display": "flex",
        "gap": "var(--wh40k-space-xs)",
        "flex-wrap": "wrap",
        "justify-content": "flex-end",
    },
    ".wh40k-item-preview-body": {
        "font-size": "0.95em",
    },
    ".wh40k-item-preview-description": {
        "margin-top": "8px",
        "padding": "8px",
        "background": "rgba(0, 0, 0, 0.2)",
        "border-radius": "var(--wh40k-radius-md)",
        "color": "var(--wh40k-text-secondary, rgba(255, 255, 255, 0.8))",
        "line-height": "1.5",
        "p:first-child": {
            "margin-top": "0",
        },
        "p:last-child": {
            "margin-bottom": "0",
        },
    },
    ".wh40k-weapon-preview-stats": {
        "display": "flex",
        "flex-wrap": "wrap",
        "gap": "var(--wh40k-space-sm)",
        "margin-bottom": "8px",
    },
    ".wh40k-armour-preview-locations": {
        "display": "grid",
        "grid-template-columns": "repeat(auto-fit, minmax(120px, 1fr))",
        "gap": "6px",
        "margin-bottom": "8px",
    },
    ".wh40k-item-preview-qualities": {
        "display": "flex",
        "flex-wrap": "wrap",
        "gap": "var(--wh40k-space-xs)",
        "margin-top": "8px",
    },
    ".wh40k-condition-preview-meta": {
        "display": "flex",
        "flex-wrap": "wrap",
        "gap": "6px",
        "margin-bottom": "8px",
    },
    ".wh40k-item-preview-prereqs": {
        "margin-bottom": "8px",
        "padding": "6px 8px",
        "background": "rgba(168, 85, 247, 0.1)",
        "border-left": "3px solid rgba(168, 85, 247, 0.5)",
        "border-radius": "var(--wh40k-radius-md)",
        "font-size": "0.9em",
        "strong": {
            "color": "var(--wh40k-text-primary, #fff)",
        },
    },
    ".wh40k-item-preview-benefit": {
        "margin-bottom": "8px",
        "line-height": "1.5",
        "color": "var(--wh40k-text-secondary, rgba(255, 255, 255, 0.8))",
    },
    ".wh40k-gear-quantity,\n.wh40k-gear-uses": {
        "margin-bottom": "6px",
        "font-size": "0.95em",
        "strong": {
            "color": "var(--wh40k-text-primary, #fff)",
            "margin-right": "4px",
        },
    },
    ".wh40k-power-cost,\n.wh40k-power-range,\n.wh40k-power-sustained": {
        "margin-bottom": "6px",
        "font-size": "0.95em",
        "strong": {
            "color": "var(--wh40k-text-primary, #fff)",
            "margin-right": "4px",
        },
    },
    ".wh40k-trait-level": {
        "margin-bottom": "8px",
        "padding": "6px 8px",
        "background": "rgba(0, 0, 0, 0.2)",
        "border-radius": "var(--wh40k-radius-md)",
        "font-size": "0.95em",
        "strong": {
            "color": "var(--wh40k-text-primary, #fff)",
            "margin-right": "4px",
        },
    },
    "@media (max-width: 600px)": {
        ".wh40k-item-preview-header": {
            "flex-direction": "column",
            "align-items": "flex-start",
        },
        ".wh40k-item-preview-actions": {
            "width": "100%",
            "justify-content": "flex-start",
        },
        ".wh40k-weapon-preview-stats": {
            "grid-template-columns": "1fr 1fr",
        },
        ".wh40k-armour-preview-locations": {
            "grid-template-columns": "1fr",
        },
    },
};
