// Auto-ported from src/css/actor/_npc-sheet.css via scripts/css-to-js.mjs.
// Registered in tailwind.config.js via addBase so wh40k-* class names emit
// literally (addComponents would prefix them with 'tw-' per the global
// 'prefix' config and break consumer templates).

module.exports = {
    ".wh40k-rpg.sheet.actor.player": {
        // !important is required: tailwind/legacy-components.js's
        // actorSheetOverrides scope-rule
        // `.wh40k-rpg.sheet.actor .window-content { display: flex !important }`
        // would otherwise win the cascade despite our higher specificity.
        // Matches the original `_npc-sheet.css` which carried !important here.
        ".window-content": {
            "display": "grid !important",
            "grid-template-columns": "minmax(180px, 220px) minmax(0, 1fr) !important",
            "grid-template-rows": "minmax(0, 1fr) !important",
            "overflow": "hidden !important",
            "height": "100% !important",
            "background": "var(--color-bg-primary, #1a1a1a)",
        },
        ".wh40k-navigation .wh40k-nav-item": {
            "margin": "0",
        },
    },
    ".wh40k-rpg.sheet.actor.player.npc": {
        "--npc-accent-combat": "#dc3545",
        "--npc-accent-defense": "#2196f3",
        "--npc-accent-movement": "#4caf50",
        "--npc-accent-skills": "#9c27b0",
        "--npc-accent-abilities": "#ff9800",
        "--npc-accent-notes": "#607d8b",
        "--wh40k-sidebar-accent": "var(--npc-accent-primary)",
        ".wh40k-body": {
            "flex": "1 1 auto",
            "overflow-y": "auto",
            "overflow-x": "hidden",
            "min-height": "0",
            "min-width": "0",
            "padding": "0.75rem",
            ".tab": {
                "display": "none",
                "&.active": {
                    "display": "block",
                },
            },
        },
        ".wh40k-npc-sidebar-header": {
            "background": "var(--color-bg-secondary, #252525)",
        },
        ".wh40k-nav-item": {
            "display": "flex",
            "align-items": "center",
            "gap": "0.5rem",
            "padding": "0.5rem 0.6rem",
            "background": "transparent",
            "border": "1px solid transparent",
            "border-radius": "6px",
            "color": "var(--color-text-light-secondary, #888)",
            "font-size": "0.8rem",
            "font-weight": "500",
            "cursor": "pointer",
            "transition": "all var(--wh40k-transition-fast)",
            "text-decoration": "none",
            "width": "100%",
            "text-align": "left",
            "i": {
                "font-size": "1rem",
                "width": "20px",
                "text-align": "center",
                "flex-shrink": "0",
            },
            "&:hover": {
                "background": "rgba(255, 255, 255, 0.05)",
                "color": "var(--color-text-light-primary, #f0f0f0)",
                "border-color": "var(--color-border-secondary, #444)",
            },
            "&.active": {
                "background": "rgb(from var(--npc-accent-primary) r g b / 0.15)",
                "color": "var(--npc-accent-primary)",
                "border-color": "var(--npc-accent-primary)",
                "font-weight": "600",
                "i": {
                    "color": "var(--npc-accent-primary)",
                },
            },
        },
        ".wh40k-panel": {
            "background": "var(--color-bg-secondary, #252525)",
            "border": "1px solid var(--color-border-secondary, #444)",
            "border-radius": "var(--wh40k-radius-lg)",
            "overflow": "hidden",
            "margin-bottom": "0.75rem",
            "&:last-child": {
                "margin-bottom": "0",
            },
            ".wh40k-panel-header": {
                "display": "flex",
                "align-items": "center",
                "gap": "0.5rem",
                "padding": "0.5rem 0.75rem",
                "background": "var(--color-bg-tertiary, rgba(30, 30, 30, 0.9))",
                "border-bottom": "1px solid var(--color-border-secondary, #444)",
                "font-weight": "600",
                "font-size": "0.85rem",
                "> i:first-child": {
                    "font-size": "1rem",
                    "color": "var(--npc-accent-primary)",
                },
            },
            ".wh40k-panel-body": {
                "padding": "0.75rem",
            },
            ".wh40k-count-badge": {
                "margin-left": "auto",
                "background": "var(--color-bg-primary, #1a1a1a)",
                "padding": "0.15rem 0.5rem",
                "border-radius": "10px",
                "font-size": "0.7rem",
                "font-weight": "700",
            },
        },
        ".wh40k-weapon-card": {
            "background": "var(--color-bg-tertiary, rgba(30, 30, 30, 0.9))",
            "border": "1px solid var(--color-border-secondary, #444)",
            "border-radius": "6px",
            "padding": "0.6rem",
            "transition": "all var(--wh40k-transition-fast)",
            "&:hover": {
                "box-shadow": "0 2px 8px rgba(0, 0, 0, 0.3)",
            },
            "&.melee": {
                "border-left": "3px solid #ff6b6b",
            },
            "&.ranged": {
                "border-left": "3px solid #4ecdc4",
            },
            ".wh40k-stat-input": {
                "width": "60px",
                "padding": "0.2rem 0.4rem",
                "background": "transparent",
                "border": "1px solid transparent",
                "color": "var(--color-text-light-primary, #f0f0f0)",
                "border-radius": "3px",
                "font-size": "0.8rem",
                "&:hover,\n            &:focus": {
                    "border-color": "var(--color-border-secondary, #444)",
                    "outline": "none",
                },
            },
        },
        ".wh40k-count-badge": {
            "margin-left": "auto",
            "background": "var(--color-bg-primary, #1a1a1a)",
            "padding": "0.15rem 0.5rem",
            "border-radius": "10px",
            "font-size": "0.7rem",
            "font-weight": "600",
        },
    },
    ".wh40k-dialog-skill": {
        ".window-content": {
            "padding": "1rem",
            "background": "linear-gradient(180deg, #1a1a24 0%, #0d0d12 100%)",
        },
        ".wh40k-skill-add-dialog": {
            "display": "flex",
            "flex-direction": "column",
            "gap": "1rem",
        },
        ".wh40k-form-group": {
            "display": "flex",
            "flex-direction": "column",
            "gap": "0.35rem",
        },
        ".wh40k-form-label": {
            "font-size": "0.8rem",
            "font-weight": "600",
            "color": "var(--wh40k-color-gold)",
            "text-transform": "uppercase",
            "letter-spacing": "0.05em",
        },
        ".wh40k-form-select": {
            "width": "100%",
            "padding": "0.5rem 0.75rem",
            "background": "rgba(0, 0, 0, 0.4)",
            "border": "1px solid rgba(201, 162, 39, 0.3)",
            "border-radius": "var(--wh40k-radius-md)",
            "color": "#f0f0f0",
            "font-size": "0.9rem",
            "cursor": "pointer",
            "transition": "all var(--wh40k-transition-base)",
            "&:hover": {
                "border-color": "rgba(201, 162, 39, 0.5)",
                "background": "rgba(0, 0, 0, 0.5)",
            },
            "&:focus": {
                "border-color": "var(--wh40k-color-gold)",
                "outline": "none",
                "box-shadow": "0 0 0 2px rgba(201, 162, 39, 0.2)",
            },
            "option": {
                "background": "#1a1a24",
                "color": "#f0f0f0",
                "padding": "0.5rem",
            },
        },
        ".dialog-buttons": {
            "display": "flex",
            "gap": "0.75rem",
            "margin-top": "0.5rem",
            "padding-top": "1rem",
            "border-top": "1px solid rgba(201, 162, 39, 0.2)",
            "button": {
                "flex": "1",
                "display": "flex",
                "align-items": "center",
                "justify-content": "center",
                "gap": "0.5rem",
                "padding": "0.6rem 1rem",
                "border": "1px solid rgba(201, 162, 39, 0.4)",
                "border-radius": "var(--wh40k-radius-md)",
                "background": "rgba(201, 162, 39, 0.1)",
                "color": "#f0f0f0",
                "font-size": "0.85rem",
                "font-weight": "500",
                "cursor": "pointer",
                "transition": "all var(--wh40k-transition-base)",
                "i": {
                    "font-size": "0.9rem",
                },
                "&:hover": {
                    "background": "rgba(201, 162, 39, 0.2)",
                    "border-color": "rgba(201, 162, 39, 0.6)",
                },
                "&.default,\n            &[data-action='add']": {
                    "background": "linear-gradient(135deg, var(--wh40k-color-gold) 0%, #8b6914 100%)",
                    "border": "none",
                    "color": "#0a0a0f",
                    "font-weight": "600",
                    "&:hover": {
                        "background": "linear-gradient(135deg, #d4ad32 0%, #9a7818 100%)",
                        "box-shadow": "0 4px 12px rgba(201, 162, 39, 0.3)",
                    },
                },
            },
        },
    },
};
