// Auto-ported from src/css/item/_weapon.css via scripts/css-to-js.mjs.
// Registered in tailwind.config.js via addBase so wh40k-* class names emit
// literally (addComponents would prefix them with 'tw-' per the global
// 'prefix' config and break consumer templates).

module.exports = {
    ".wh40k-weapon-sheet-v3": {
        "display": "flex",
        "flex-direction": "column",
        "height": "100%",
        "background": "linear-gradient(150deg, rgba(10, 12, 18, 0.97) 0%, rgba(36, 26, 20, 0.92) 100%)",
        "color": "var(--wh40k-text-dark)",
        "font-family": "var(--wh40k-font-body)",
        "font-size": "0.875rem",
        "overflow": "hidden",
        ".window-content": {
            "container-type": "inline-size",
        },
        "form": {
            "display": "flex",
            "flex-direction": "column",
            "flex": "1",
            "min-height": "0",
            "overflow": "hidden",
        },
        ".wh40k-section__body": {
            "&.collapsed": {
                "display": "none",
            },
        },
        ".wh40k-float-field": {
            "&::after": {
                "content": "''",
                "position": "absolute",
                "inset": "0",
                "border-radius": "6px",
                "pointer-events": "none",
                "opacity": "0",
                "background": "radial-gradient(circle at center, rgba(212, 175, 55, 0.15), transparent 70%)",
                "transition": "opacity var(--wh40k-transition-medium)",
            },
            "&:focus-within::after": {
                "opacity": "1",
            },
        },
        ".wh40k-toggle-switch": {
            "display": "flex",
            "align-items": "center",
            "gap": "10px",
            "cursor": "pointer",
            "input": {
                "display": "none",
            },
            "&__slider": {
                "position": "relative",
                "width": "40px",
                "height": "22px",
                "background": "rgba(0, 0, 0, 0.3)",
                "border": "1px solid rgba(255, 255, 255, 0.15)",
                "border-radius": "11px",
                "transition": "all var(--wh40k-transition-medium)",
                "&::after": {
                    "content": "''",
                    "position": "absolute",
                    "top": "2px",
                    "left": "2px",
                    "width": "16px",
                    "height": "16px",
                    "background": "rgba(214, 221, 235, 0.7)",
                    "border-radius": "50%",
                    "transition": "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    "box-shadow": "0 2px 4px rgba(0, 0, 0, 0.3)",
                },
            },
            "input:checked + &__slider": {
                "background": "linear-gradient(135deg, rgba(74, 132, 72, 0.6), rgba(74, 132, 72, 0.4))",
                "border-color": "rgba(115, 177, 113, 0.5)",
                "&::after": {
                    "left": "20px",
                    "background": "var(--wh40k-green-bright)",
                    "box-shadow": "0 0 8px rgba(115, 177, 113, 0.5)",
                },
            },
            "&__label": {
                "display": "flex",
                "align-items": "center",
                "gap": "6px",
                "font-size": "0.85rem",
                "color": "var(--wh40k-text-medium)",
                "i": {
                    "font-size": "0.8rem",
                    "color": "var(--wh40k-bronze)",
                },
            },
            "input:checked ~ &__label": {
                "color": "var(--wh40k-green-bright)",
                "i": {
                    "color": "var(--wh40k-green)",
                },
            },
            "&:hover .wh40k-toggle-switch__slider": {
                "border-color": "rgba(212, 175, 55, 0.4)",
            },
        },
        ".wh40k-weapon-body": {
            "flex": "1",
            "overflow-y": "auto",
            "overflow-x": "hidden",
            "padding": "10px 12px 60px",
            "transition": "all var(--wh40k-transition-medium)",
            "&.collapsed": {
                "display": "none",
            },
            "&::-webkit-scrollbar": {
                "width": "6px",
            },
            "&::-webkit-scrollbar-track": {
                "background": "transparent",
            },
            "&::-webkit-scrollbar-thumb": {
                "background": "rgba(212, 175, 55, 0.3)",
                "border-radius": "3px",
                "&:hover": {
                    "background": "rgba(212, 175, 55, 0.5)",
                },
            },
        },
        ".wh40k-float-field": {
            "position": "relative",
            "display": "flex",
            "flex-direction": "column",
            "input,\n        select": {
                "width": "100%",
                "min-height": "42px",
                "padding": "24px 12px 8px",
                "background": "rgba(0, 0, 0, 0.25)",
                "border": "1px solid rgba(255, 255, 255, 0.12)",
                "border-radius": "6px",
                "font-size": "0.9rem",
                "color": "var(--wh40k-text-dark)",
                "transition": "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:focus": {
                    "outline": "none",
                    "border-color": "rgba(212, 175, 55, 0.6)",
                    "background": "rgba(0, 0, 0, 0.3)",
                    "box-shadow": "0 0 0 3px rgba(212, 175, 55, 0.15)",
                },
                "&:hover:not(:focus)": {
                    "border-color": "rgba(255, 255, 255, 0.2)",
                    "background": "rgba(0, 0, 0, 0.28)",
                },
            },
            "input[type='number']": {
                "text-align": "center",
                "&::-webkit-outer-spin-button,\n            &::-webkit-inner-spin-button": {
                    "-webkit-appearance": "none",
                    "margin": "0",
                },
                "-moz-appearance": "textfield",
            },
            "label": {
                "position": "absolute",
                "left": "12px",
                "top": "50%",
                "transform": "translateY(-50%)",
                "font-size": "0.8rem",
                "font-weight": "500",
                "color": "rgba(202, 210, 222, 0.6)",
                "pointer-events": "none",
                "transition": "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                "transform-origin": "left center",
                "z-index": "1",
            },
            "&__bar": {
                "position": "absolute",
                "bottom": "0",
                "left": "50%",
                "width": "0",
                "height": "2px",
                "background": "linear-gradient(90deg, var(--wh40k-gold), var(--wh40k-gold-bright))",
                "border-radius": "0 0 6px 6px",
                "transition": "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                "transform": "translateX(-50%)",
            },
            "input:focus ~ label,\n        input:not(:placeholder-shown) ~ label,\n        select:focus ~ label,\n        select:not([value='']) ~ label,\n        select ~ label": {
                "top": "8px",
                "transform": "translateY(0) scale(0.75)",
                "color": "rgba(212, 175, 55, 0.9)",
                "font-weight": "600",
                "letter-spacing": "0.02em",
            },
            "input:not(:focus):not(:placeholder-shown) ~ label,\n        select:not(:focus) ~ label": {
                "color": "rgba(202, 210, 222, 0.7)",
            },
            "input:focus ~ .wh40k-float-field__bar,\n        select:focus ~ .wh40k-float-field__bar": {
                "width": "calc(100% - 2px)",
            },
            "&--narrow": {
                "max-width": "100px",
                "input": {
                    "padding": "24px 8px 8px",
                },
                "label": {
                    "left": "8px",
                },
            },
            "&--select": {
                "select": {
                    "appearance": "none",
                    "padding-right": "32px",
                    "cursor": "pointer",
                    "option": {
                        "background": "rgba(20, 24, 34, 0.98)",
                        "color": "var(--wh40k-text-dark)",
                        "padding": "8px 12px",
                    },
                },
                ".wh40k-float-field__arrow": {
                    "position": "absolute",
                    "right": "12px",
                    "top": "50%",
                    "transform": "translateY(-50%)",
                    "font-size": "0.7rem",
                    "color": "rgba(202, 210, 222, 0.5)",
                    "pointer-events": "none",
                    "transition": "all 0.25s ease",
                },
                "select:focus ~ .wh40k-float-field__arrow": {
                    "color": "var(--wh40k-gold)",
                    "transform": "translateY(-50%) rotate(180deg)",
                },
                "select:hover:not(:focus) ~ .wh40k-float-field__arrow": {
                    "color": "rgba(202, 210, 222, 0.7)",
                },
            },
        },
        ".wh40k-input--readonly": {
            "background": "rgba(0, 0, 0, 0.15)",
            "border-color": "rgba(255, 255, 255, 0.05)",
            "color": "var(--wh40k-text-medium)",
            "cursor": "default",
            "pointer-events": "none",
            "&:focus": {
                "box-shadow": "none",
                "border-color": "rgba(255, 255, 255, 0.05)",
            },
        },
        ".wh40k-toggle-switch--readonly": {
            "opacity": "0.7",
            "pointer-events": "none",
            ".wh40k-toggle-switch__slider": {
                "cursor": "default",
            },
        },
    },
    ".wh40k-prose-editor": {
        ".prosemirror": {
            "min-height": "120px",
            "padding": "12px",
            "background": "var(--wh40k-input-bg)",
            "border": "1px solid var(--wh40k-border-color-light)",
            "border-radius": "var(--wh40k-radius-md)",
        },
    },
    ".wh40k-weapon-card": {
        "background": "var(--wh40k-panel-bg-solid)",
        "border": "2px solid var(--wh40k-combat-border)",
        "border-radius": "6px",
        "overflow": "hidden",
        "font-family": "var(--wh40k-font-ui)",
    },
};
