// Tailwind addComponents entries ported from the legacy CSS files. Each
// section below corresponds to a deleted `src/css/.../_*.css` file. New
// component CSS should not land here — prefer inline `tw-*` utilities on
// templates per docs/tailwind-migration.md. This module exists to absorb
// the legacy rules during the per-file CSS retirement pass.

// ── from src/css/item/_base-window.css ────────────────────────────────────
// Item sheet window-content: strips Foundry's default chrome so the gothic
// sheet body fills the window edge-to-edge. The .wh40k-rpg.sheet.item path
// matches the classes set by every item sheet's DEFAULT_OPTIONS.
const itemSheetWindow = {
    '.wh40k-rpg.sheet.item .window-content': {
        background: 'transparent',
        padding: '0',
        overflow: 'hidden',
    },
};

// ── from src/css/components/_armour.css ───────────────────────────────────
// Hit-location chat card. Renders into the chat log via ChatMessage.create
// from CharacterSheet.#rollInitiative and StarshipDocument.rollInitiative.
// The renderChatMessageHTML hook adds .wh40k-rpg to the message element so
// the system-scoped Tailwind utilities resolve there too.
const armourChatCard = {
    '.wh40k-hit-location-result': {
        padding: '12px',
        background: 'var(--wh40k-panel-bg-solid)',
        border: '2px solid var(--wh40k-border-color)',
        borderRadius: 'var(--wh40k-radius-lg)',
        textAlign: 'center',
        boxShadow: '0 2px 8px var(--wh40k-shadow-medium)',
        '& h3': {
            margin: '0 0 10px 0',
            fontSize: '0.9em',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--wh40k-text-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            '& i': {
                color: 'var(--wh40k-gold)',
            },
        },
    },
    '.wh40k-hit-roll': {
        marginBottom: '10px',
    },
    '.wh40k-roll-result': {
        display: 'inline-block',
        fontFamily: 'var(--wh40k-font-alt)',
        fontSize: '2.5em',
        fontWeight: '700',
        color: 'var(--wh40k-text-dark)',
        background: 'var(--wh40k-panel-bg)',
        border: '2px solid var(--wh40k-border-color-strong)',
        borderRadius: 'var(--wh40k-radius-lg)',
        padding: '6px 20px',
        minWidth: '70px',
        boxShadow: 'inset 0 1px 0 var(--wh40k-text-shadow), 0 2px 4px var(--wh40k-shadow-medium)',
    },
    '.wh40k-hit-location': {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--wh40k-space-xs)',
        marginTop: '8px',
    },
    '.wh40k-location-armour': {
        fontSize: '0.95em',
        color: 'var(--wh40k-text-muted)',
        fontWeight: '600',
        '& strong': {
            color: 'var(--wh40k-text-dark)',
        },
    },
};

// ── from src/css/actor/_actor-scroll.css ──────────────────────────────────
// ApplicationV2 scroll/flex overrides for actor sheets. Heavy `!important`
// usage because Foundry V14's default ApplicationV2 templates set their own
// flex/overflow on .window-content / form.sheet-body that we need to undo.
// Scoped under .wh40k-rpg.sheet.actor so PC and NPC sheets share the layout.
const actorSheetOverrides = {
    '.wh40k-rpg.sheet.actor': {
        '& .window-content': {
            display: 'flex !important',
            flexDirection: 'column !important',
            overflow: 'hidden !important',
            height: '100% !important',
        },
        '& .wh40k-sheet': {
            display: 'flex !important',
            flexDirection: 'column !important',
            flex: '1 1 auto !important',
            minHeight: '0 !important',
            overflow: 'hidden !important',
        },
        '& form.sheet-body, & .window-app.wh40k-rpg form': {
            display: 'flex !important',
            flexDirection: 'column !important',
            flex: '1 1 auto !important',
            minHeight: '0 !important',
            overflow: 'hidden !important',
            gap: '0 !important',
        },
        '& .wh40k-character-header': {
            flex: '0 0 auto !important',
            overflow: 'visible !important',
            zIndex: '10 !important',
        },
        '& nav.wh40k-navigation': {
            display: 'flex !important',
            flexWrap: 'wrap !important',
            alignItems: 'center !important',
            gap: 'var(--wh40k-space-xs) !important',
            padding: '8px !important',
            background: 'rgba(0, 0, 0, 0.2) !important',
            flex: '0 0 auto !important',
            '& .wh40k-nav-item': {
                padding: '6px 12px !important',
                borderRadius: 'var(--wh40k-radius-md) !important',
                cursor: 'pointer !important',
                transition: 'background-color 0.2s !important',
                textTransform: 'uppercase !important',
                fontSize: '0.85em !important',
                '&:hover': {
                    background: 'rgba(255, 255, 255, 0.1) !important',
                },
                '&.active': {
                    background: 'rgba(196, 135, 29, 0.3) !important',
                    borderBottom: '2px solid #c4871d !important',
                },
            },
        },
        '& .wh40k-utility-menu': {
            background: 'rgba(40, 40, 40, 0.95) !important',
            border: '1px solid rgba(196, 135, 29, 0.5) !important',
            borderRadius: 'var(--wh40k-radius-md) !important',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5) !important',
            minWidth: '200px !important',
            padding: '4px 0 !important',
            '& .context-menu-item': {
                padding: '8px 12px !important',
                color: 'rgba(255, 255, 255, 0.8) !important',
                cursor: 'pointer !important',
                fontSize: '0.9rem !important',
                display: 'flex !important',
                alignItems: 'center !important',
                gap: 'var(--wh40k-space-sm) !important',
                '&:hover': {
                    background: 'rgba(196, 135, 29, 0.2) !important',
                    color: 'rgba(255, 255, 255, 1) !important',
                },
                '& i': {
                    width: '16px !important',
                    textAlign: 'center !important',
                    flexShrink: '0 !important',
                },
            },
        },
        '& .wh40k-body, & #tab-body': {
            overflowY: 'auto !important',
            overflowX: 'hidden !important',
            minHeight: '0 !important',
            flex: '1 1 auto !important',
            gridColumn: 'auto !important',
        },
        '& .wh40k-body .tab, & #tab-body .tab, & .wh40k-body section.tab, & #tab-body section.tab': {
            display: 'none !important',
        },
        '& .wh40k-body .tab.active, & #tab-body .tab.active, & .wh40k-body section.tab.active, & #tab-body section.tab.active': {
            display: 'flex !important',
            flexDirection: 'column !important',
            gap: 'var(--wh40k-space-md) !important',
            padding: '12px !important',
        },
        '& .wh40k-body section.tab-combat.active, & #tab-body section.tab-combat.active': {
            minHeight: '100% !important',
            boxSizing: 'border-box !important',
        },
        '& .wh40k-char-hud-circle': {
            position: 'relative !important',
            width: '48px !important',
            height: '48px !important',
            borderRadius: '50% !important',
            display: 'flex !important',
            flexDirection: 'column !important',
            alignItems: 'center !important',
            justifyContent: 'center !important',
            gap: '1px !important',
            background:
                'var(--wh40k-circle-bg, linear-gradient(180deg, #f4d03f 0%, var(--wh40k-color-gold) 70%, #b8860b 100%)) !important',
            border: '2px solid var(--wh40k-border-color-strong, #8b6914) !important',
            boxShadow:
                'inset 0 1px 2px var(--wh40k-text-shadow, rgba(0, 0, 0, 0.1)), 0 3px 8px var(--wh40k-shadow-soft, rgba(0, 0, 0, 0.15)) !important',
        },
        '& .wh40k-char-hud-mod': {
            fontSize: '1.2em !important',
            fontWeight: '700 !important',
            color: 'var(--wh40k-text-dark, #1a1510) !important',
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.3) !important',
        },
        '& .wh40k-char-hud-details': {
            position: 'absolute !important',
            top: 'calc(100% + 6px) !important',
            left: '50% !important',
            transform: 'translateX(-50%) !important',
            display: 'none !important',
            gap: '6px !important',
            padding: '8px !important',
            width: '170px !important',
            background: 'var(--wh40k-panel-bg-solid, #f8f4ec) !important',
            border: '1px solid var(--wh40k-border-color, rgba(140, 120, 90, 0.5)) !important',
            borderRadius: 'var(--wh40k-radius-lg) !important',
            boxShadow: '0 6px 16px var(--wh40k-shadow-medium, rgba(0, 0, 0, 0.2)) !important',
            zIndex: '20 !important',
            '&.expanded': {
                display: 'grid !important',
            },
        },
        '& .wh40k-char-hud-details input, & .wh40k-char-hud-details select': {
            width: '100% !important',
            border: '1px solid var(--wh40k-border-color-light, rgba(140, 120, 90, 0.3)) !important',
            borderRadius: 'var(--wh40k-radius-md) !important',
            padding: '2px 4px !important',
            background: 'var(--wh40k-input-bg, #fff) !important',
            color: 'var(--wh40k-text-dark, #333) !important',
            fontSize: '0.8em !important',
        },
    },
};

module.exports = {
    ...itemSheetWindow,
    ...armourChatCard,
    ...actorSheetOverrides,
};
