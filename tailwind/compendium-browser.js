// Auto-ported from src/css/components/_compendium-browser.css via scripts/css-to-js.mjs.
// Registered in tailwind.config.js via addBase so wh40k-* class names emit
// literally (addComponents would prefix them with 'tw-' per the global
// 'prefix' config and break consumer templates).

module.exports = {
    ".wh40k-compendium-browser": {
        "display": "flex",
        "flex-direction": "column",
        "height": "100%",
        ".browser-header": {
            "padding": "1rem",
            "background": "rgba(0, 0, 0, 0.3)",
            "border-bottom": "2px solid var(--color-border-dark)",
            "h1": {
                "margin": "0 0 0.5rem 0",
                "font-size": "1.5rem",
                "color": "var(--color-text-light)",
                "i": {
                    "margin-right": "0.5rem",
                    "color": "var(--color-warm-2)",
                },
            },
            "p": {
                "margin": "0",
                "color": "var(--color-text-dark)",
                "font-size": "0.9rem",
            },
        },
        ".browser-body": {
            "display": "flex",
            "flex": "1",
            "overflow": "hidden",
        },
        ".browser-sidebar": {
            "width": "250px",
            "padding": "1rem",
            "background": "rgba(0, 0, 0, 0.2)",
            "border-right": "1px solid var(--color-border-dark)",
            "overflow-y": "auto",
            "h3": {
                "margin": "0 0 1rem 0",
                "font-size": "1.1rem",
                "color": "var(--color-text-light)",
                "border-bottom": "1px solid var(--color-border-dark)",
                "padding-bottom": "0.5rem",
                "i": {
                    "margin-right": "0.5rem",
                },
            },
            ".filter-group": {
                "margin-bottom": "1rem",
                "label": {
                    "display": "block",
                    "margin-bottom": "0.25rem",
                    "font-weight": "bold",
                    "color": "var(--color-text-light)",
                },
                "input,\n            select": {
                    "width": "100%",
                    "padding": "0.5rem",
                    "background": "rgba(0, 0, 0, 0.3)",
                    "border": "1px solid var(--color-border-dark)",
                    "color": "var(--color-text-light)",
                    "border-radius": "3px",
                    "&:focus": {
                        "outline": "none",
                        "border-color": "var(--color-warm-2)",
                    },
                },
            },
            ".clear-filters": {
                "width": "100%",
                "padding": "0.5rem",
                "background": "var(--color-cool-2)",
                "border": "none",
                "color": "white",
                "border-radius": "3px",
                "cursor": "pointer",
                "&:hover": {
                    "background": "var(--color-cool-3)",
                },
                "i": {
                    "margin-right": "0.5rem",
                },
            },
            ".filter-divider": {
                "height": "1px",
                "background": "var(--color-border-dark)",
                "margin": "1.5rem 0",
            },
            ".filter-subheader": {
                "margin": "0 0 1rem 0",
                "font-size": "0.95rem",
                "color": "var(--wh40k-color-gold)",
                "font-weight": "600",
                "i": {
                    "margin-right": "0.5rem",
                },
            },
        },
        ".browser-results": {
            "flex": "1",
            "display": "flex",
            "flex-direction": "column",
            "overflow": "hidden",
            ".results-header": {
                "padding": "1rem",
                "background": "rgba(0, 0, 0, 0.1)",
                "border-bottom": "1px solid var(--color-border-dark)",
                "h3": {
                    "margin": "0",
                    "font-size": "1.1rem",
                    "color": "var(--color-text-light)",
                },
            },
            ".results-list": {
                "flex": "1",
                "overflow-y": "auto",
                "padding": "1rem",
            },
        },
        ".results-group": {
            "margin-bottom": "1.5rem",
        },
        ".results-group-header": {
            "display": "flex",
            "align-items": "center",
            "justify-content": "space-between",
            "margin": "0 0 0.75rem 0",
            "padding": "0.35rem 0.75rem",
            "border-left": "3px solid var(--color-warm-2)",
            "background": "rgba(0, 0, 0, 0.25)",
            "color": "var(--color-text-light)",
            ".results-group-title": {
                "font-size": "0.85rem",
                "text-transform": "uppercase",
                "letter-spacing": "0.08em",
            },
            ".results-group-count": {
                "font-size": "0.75rem",
                "padding": "0.15rem 0.5rem",
                "border-radius": "999px",
                "background": "rgba(0, 0, 0, 0.4)",
            },
        },
        ".compendium-item": {
            "display": "flex",
            "align-items": "center",
            "padding": "0.75rem",
            "margin-bottom": "0.5rem",
            "background": "rgba(0, 0, 0, 0.2)",
            "border": "1px solid var(--color-border-dark)",
            "border-radius": "var(--wh40k-radius-md)",
            "cursor": "pointer",
            "transition": "all var(--wh40k-transition-base)",
            "&:hover": {
                "background": "rgba(0, 0, 0, 0.4)",
                "border-color": "var(--color-warm-2)",
                "transform": "translateX(4px)",
            },
            ".item-image": {
                "width": "40px",
                "height": "40px",
                "object-fit": "cover",
                "border-radius": "var(--wh40k-radius-md)",
                "margin-right": "1rem",
                "border": "1px solid var(--color-border-dark)",
            },
            ".item-details": {
                "flex": "1",
                ".item-name": {
                    "margin": "0 0 0.25rem 0",
                    "font-size": "1rem",
                    "color": "var(--color-text-light)",
                },
                ".item-meta": {
                    "display": "flex",
                    "gap": "0.5rem",
                    "flex-wrap": "wrap",
                    "span": {
                        "font-size": "0.75rem",
                        "padding": "0.25rem 0.5rem",
                        "border-radius": "3px",
                        "background": "rgba(0, 0, 0, 0.3)",
                        "&.item-type": {
                            "background": "var(--color-cool-4)",
                            "color": "white",
                        },
                        "&.item-source": {
                            "background": "var(--color-warm-4)",
                            "color": "white",
                        },
                        "&.item-pack": {
                            "background": "var(--color-border-dark)",
                            "color": "var(--color-text-light)",
                        },
                    },
                },
                ".item-stats--armour": {
                    "display": "flex",
                    "gap": "0.5rem",
                    "margin": "0.5rem 0",
                    "flex-wrap": "wrap",
                    ".stat-badge": {
                        "display": "inline-flex",
                        "align-items": "center",
                        "gap": "0.375rem",
                        "padding": "0.25rem 0.625rem",
                        "background": "linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%)",
                        "border": "1px solid rgba(212, 175, 55, 0.4)",
                        "border-radius": "var(--wh40k-radius-md)",
                        "font-size": "0.75rem",
                        "font-weight": "600",
                        "color": "#fff",
                        "i": {
                            "font-size": "0.85rem",
                            "opacity": "0.9",
                        },
                        "&--type": {
                            "background": "linear-gradient(135deg, rgba(212, 175, 55, 0.3) 0%, rgba(212, 175, 55, 0.15) 100%)",
                            "border-color": "rgba(212, 175, 55, 0.5)",
                        },
                        "&--ap": {
                            "font-family": "'Courier New', monospace",
                            "font-weight": "700",
                        },
                        "&--coverage": {
                            "font-family": "monospace",
                            "letter-spacing": "1px",
                            "font-size": "0.7rem",
                        },
                        "&--agility": {
                            "background": "linear-gradient(135deg, rgba(52, 152, 219, 0.2) 0%, rgba(52, 152, 219, 0.1) 100%)",
                            "border-color": "rgba(52, 152, 219, 0.4)",
                        },
                        "&--flak": {
                            "background": "linear-gradient(135deg, rgba(149, 165, 166, 0.2) 0%, rgba(149, 165, 166, 0.1) 100%)",
                            "border-color": "rgba(149, 165, 166, 0.4)",
                        },
                        "&--mesh": {
                            "background": "linear-gradient(135deg, rgba(52, 152, 219, 0.2) 0%, rgba(52, 152, 219, 0.1) 100%)",
                            "border-color": "rgba(52, 152, 219, 0.4)",
                        },
                        "&--carapace": {
                            "background": "linear-gradient(135deg, rgba(46, 204, 113, 0.2) 0%, rgba(46, 204, 113, 0.1) 100%)",
                            "border-color": "rgba(46, 204, 113, 0.4)",
                        },
                        "&--power,\n                    &--light-power": {
                            "background": "linear-gradient(135deg, rgba(155, 89, 182, 0.2) 0%, rgba(155, 89, 182, 0.1) 100%)",
                            "border-color": "rgba(155, 89, 182, 0.4)",
                        },
                        "&--xenos": {
                            "background": "linear-gradient(135deg, rgba(231, 76, 60, 0.2) 0%, rgba(231, 76, 60, 0.1) 100%)",
                            "border-color": "rgba(231, 76, 60, 0.4)",
                        },
                        "&--void": {
                            "background": "linear-gradient(135deg, rgba(52, 73, 94, 0.2) 0%, rgba(52, 73, 94, 0.1) 100%)",
                            "border-color": "rgba(52, 73, 94, 0.4)",
                        },
                    },
                },
                ".item-stats--armour-mod": {
                    "display": "flex",
                    "gap": "0.5rem",
                    "margin": "0.5rem 0",
                    "flex-wrap": "wrap",
                    ".stat-badge": {
                        "display": "inline-flex",
                        "align-items": "center",
                        "gap": "0.375rem",
                        "padding": "0.25rem 0.625rem",
                        "background": "linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%)",
                        "border": "1px solid rgba(212, 175, 55, 0.4)",
                        "border-radius": "var(--wh40k-radius-md)",
                        "font-size": "0.75rem",
                        "font-weight": "600",
                        "color": "#fff",
                        "i": {
                            "font-size": "0.85rem",
                            "opacity": "0.9",
                        },
                        "&--restrictions": {
                            "background": "linear-gradient(135deg, rgba(52, 152, 219, 0.2) 0%, rgba(52, 152, 219, 0.1) 100%)",
                            "border-color": "rgba(52, 152, 219, 0.4)",
                        },
                        "&--modifier": {
                            "background": "linear-gradient(135deg, rgba(46, 204, 113, 0.2) 0%, rgba(46, 204, 113, 0.1) 100%)",
                            "border-color": "rgba(46, 204, 113, 0.4)",
                            "&.stat-badge--negative": {
                                "background": "linear-gradient(135deg, rgba(231, 76, 60, 0.2) 0%, rgba(231, 76, 60, 0.1) 100%)",
                                "border-color": "rgba(231, 76, 60, 0.4)",
                            },
                        },
                        "&--properties": {
                            "background": "linear-gradient(135deg, rgba(155, 89, 182, 0.2) 0%, rgba(155, 89, 182, 0.1) 100%)",
                            "border-color": "rgba(155, 89, 182, 0.4)",
                        },
                    },
                },
            },
        },
        ".no-results": {
            "text-align": "center",
            "padding": "3rem",
            "color": "var(--color-text-dark)",
            "i": {
                "font-size": "3rem",
                "margin-bottom": "1rem",
                "opacity": "0.5",
            },
            "p": {
                "font-size": "1.1rem",
            },
        },
    },
};
