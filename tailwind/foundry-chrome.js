// Auto-ported from src/css/foundry-chrome.css via scripts/css-to-js.mjs.
// Registered in tailwind.config.js via addBase so wh40k-* class names emit
// literally (addComponents would prefix them with 'tw-' per the global
// 'prefix' config and break consumer templates).

module.exports = {
    ".origin-detail-dialog": {
        ".window-content": {
            "padding": "0",
            "display": "flex",
            "flex-direction": "column",
            "height": "100%",
            "overflow": "hidden",
        },
    },
    ".wh40k-prose-editor": {
        ".ProseMirror": {
            "padding": "var(--wh40k-space-sm)",
            "min-height": "100%",
            "outline": "none",
            "p": {
                "margin": "0 0 var(--wh40k-space-sm) 0",
                "&:last-child": {
                    "margin-bottom": "0",
                },
            },
            "ul,\n        ol": {
                "margin": "0 0 var(--wh40k-space-sm) var(--wh40k-space-lg)",
                "padding-left": "var(--wh40k-space-md)",
            },
            "h1,\n        h2,\n        h3,\n        h4,\n        h5,\n        h6": {
                "font-family": "var(--wh40k-font-alt)",
                "margin": "var(--wh40k-space-md) 0 var(--wh40k-space-sm) 0",
                "color": "var(--color-text-primary)",
                "font-weight": "700",
                "&:first-child": {
                    "margin-top": "0",
                },
            },
            "h1": {
                "font-size": "1.8rem",
            },
            "h2": {
                "font-size": "1.5rem",
            },
            "h3": {
                "font-size": "1.2rem",
            },
            "h4": {
                "font-size": "1.1rem",
            },
            "blockquote": {
                "margin": "var(--wh40k-space-sm) 0",
                "padding": "var(--wh40k-space-sm) var(--wh40k-space-md)",
                "border-left": "3px solid var(--wh40k-accent-bio)",
                "background": "rgb(from var(--wh40k-accent-bio) r g b / 0.05)",
                "font-style": "italic",
            },
            "code": {
                "background": "rgba(0, 0, 0, 0.1)",
                "padding": "2px 6px",
                "border-radius": "3px",
                "font-family": "'Courier New', monospace",
                "font-size": "0.85em",
            },
            "pre": {
                "background": "rgba(0, 0, 0, 0.1)",
                "padding": "var(--wh40k-space-sm)",
                "border-radius": "var(--wh40k-radius-md)",
                "overflow-x": "auto",
                "code": {
                    "background": "none",
                    "padding": "0",
                },
            },
            "table": {
                "border-collapse": "collapse",
                "width": "100%",
                "margin": "var(--wh40k-space-sm) 0",
                "th,\n            td": {
                    "border": "1px solid var(--wh40k-border-light)",
                    "padding": "var(--wh40k-space-xs) var(--wh40k-space-sm)",
                    "text-align": "left",
                },
                "th": {
                    "background": "rgb(from var(--wh40k-accent-bio) r g b / 0.1)",
                    "font-weight": "600",
                },
            },
            "a": {
                "color": "var(--wh40k-accent-bio)",
                "text-decoration": "underline",
                "&:hover": {
                    "color": "color-mix(in srgb, var(--wh40k-accent-bio), white 10%)",
                },
            },
            "img": {
                "max-width": "100%",
                "height": "auto",
                "border-radius": "var(--wh40k-radius-md)",
                "margin": "var(--wh40k-space-sm) 0",
            },
            "hr": {
                "margin": "var(--wh40k-space-md) 0",
                "border": "none",
                "border-top": "2px solid var(--wh40k-border-light)",
            },
        },
    },
    ".wh40k-prose-content": {
        "p": {
            "margin": "0 0 var(--wh40k-space-sm) 0",
            "&:last-child": {
                "margin-bottom": "0",
            },
        },
        "ul,\n    ol": {
            "margin": "0 0 var(--wh40k-space-sm) var(--wh40k-space-lg)",
        },
        "h1,\n    h2,\n    h3": {
            "font-family": "var(--wh40k-font-alt)",
            "margin": "var(--wh40k-space-sm) 0",
        },
        "&:empty::before": {
            "content": "'No notes recorded...'",
            "color": "var(--wh40k-text-muted)",
            "font-style": "italic",
        },
    },
    ".wh40k-rpg.sheet.actor.vehicle": {
        ".window-content": {
            "display": "flex",
            "flex-direction": "column",
            "overflow": "hidden",
            "height": "100%",
        },
        "form": {
            "display": "flex",
            "flex-direction": "column",
            "flex": "1 1 auto",
            "min-height": "0",
            "overflow": "hidden",
            "gap": "0",
            "height": "100%",
        },
    },
    ".roll-configuration-dialog": {
        ".window-content": {
            "padding": "0",
        },
    },
    ".add-xp-dialog": {
        ".window-content": {
            "padding": "0",
        },
    },
    "body.theme-dark": {
        "#chat-log": {
            ".message": {
                "background-color": "var(--wh40k-panel-bg-solid)",
                "border-color": "var(--wh40k-border-color)",
                "box-shadow": "0 2px 4px var(--wh40k-shadow-medium)",
                ".message-header": {
                    "background": "var(--wh40k-panel-bg)",
                    "border-bottom": "1px solid var(--wh40k-border-color)",
                    "color": "var(--wh40k-text-dark)",
                    ".message-sender": {
                        "color": "var(--wh40k-gold)",
                        "font-weight": "600",
                    },
                    ".message-metadata": {
                        "color": "var(--wh40k-text-muted)",
                        ".message-timestamp": {
                            "color": "var(--wh40k-text-subtle)",
                        },
                    },
                },
                ".message-content": {
                    "background": "transparent",
                    "color": "var(--wh40k-text-dark)",
                    "p,\n                span,\n                div,\n                td,\n                th,\n                li,\n                label": {
                        "color": "var(--wh40k-text-dark)",
                    },
                    "a": {
                        "color": "var(--wh40k-gold)",
                        "&:hover": {
                            "color": "var(--wh40k-gold-bright)",
                        },
                    },
                    "strong,\n                b": {
                        "color": "var(--wh40k-text-dark)",
                        "font-weight": "700",
                    },
                    "em,\n                i": {
                        "color": "var(--wh40k-text-medium)",
                    },
                    "h1,\n                h2,\n                h3,\n                h4,\n                h5,\n                h6": {
                        "color": "var(--wh40k-text-dark)",
                    },
                    "table": {
                        "background": "transparent",
                        "border-color": "var(--wh40k-border-color)",
                        "th": {
                            "background": "var(--wh40k-panel-bg)",
                            "border-color": "var(--wh40k-border-color)",
                            "color": "var(--wh40k-text-dark)",
                        },
                        "td": {
                            "border-color": "var(--wh40k-border-color)",
                            "background": "transparent",
                            "color": "var(--wh40k-text-dark)",
                        },
                    },
                    "code,\n                pre": {
                        "background": "var(--wh40k-panel-bg)",
                        "color": "var(--wh40k-text-dark)",
                        "border-color": "var(--wh40k-border-color)",
                    },
                },
                ".flavor-text": {
                    "color": "var(--wh40k-text-muted)",
                    "background": "var(--wh40k-panel-bg)",
                },
            },
            ".message.whisper": {
                "background": "rgba(106, 90, 74, 0.3)",
                "border-color": "var(--wh40k-bio-border)",
                ".message-header": {
                    "background": "rgba(106, 90, 74, 0.4)",
                },
            },
            ".message.blind": {
                "background": "rgba(74, 55, 40, 0.3)",
                "border-color": "var(--wh40k-border-color-strong)",
            },
        },
        "#chat-form": {
            "background": "var(--wh40k-panel-bg-solid)",
            "border-color": "var(--wh40k-border-color)",
            "textarea": {
                "background": "var(--wh40k-input-bg)",
                "color": "var(--wh40k-text-dark)",
                "border-color": "var(--wh40k-border-color)",
                "&:focus": {
                    "background": "var(--wh40k-input-bg-focus)",
                    "border-color": "var(--wh40k-gold)",
                },
            },
            "button": {
                "background": "var(--wh40k-btn-bg)",
                "color": "var(--wh40k-text-dark)",
                "border-color": "var(--wh40k-border-color)",
                "&:hover": {
                    "background": "var(--wh40k-btn-bg-hover)",
                    "border-color": "var(--wh40k-gold)",
                },
            },
        },
    },
    "body.theme-dark": {
        "#chat-log": {
            ".wh40k-hit-location-result": {
                "background": "var(--wh40k-panel-bg-solid)",
                "border-color": "var(--wh40k-border-color)",
                "h3": {
                    "color": "var(--wh40k-text-dark)",
                    "i": {
                        "color": "var(--wh40k-gold)",
                    },
                },
                ".wh40k-roll-result": {
                    "background": "var(--wh40k-panel-bg)",
                    "color": "var(--wh40k-text-dark)",
                    "border-color": "var(--wh40k-border-color-strong)",
                },
                ".wh40k-location-armour": {
                    "color": "var(--wh40k-text-muted)",
                },
            },
        },
    },
};
