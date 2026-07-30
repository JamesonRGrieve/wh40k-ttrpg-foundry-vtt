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
// ApplicationV2 scroll/flex overrides for actor sheets. These undo the
// flex/overflow Foundry V14's own ApplicationV2 rules set on .window-content /
// form.sheet-body, and they do it on specificity alone — no priority flags.
// That works because Foundry ships foundry2.css almost entirely inside `@layer`
// blocks while this system's stylesheet is unlayered, and an unlayered normal
// declaration outranks a layered one at ANY specificity. (Priority flags were
// counterproductive there: for important declarations the layer order inverts,
// so a flagged unlayered rule ranks BELOW Foundry's own flagged layered ones.)
// Scoped under .wh40k-rpg.sheet.actor so PC and NPC sheets share the layout.
const actorSheetOverrides = {
    '.wh40k-rpg.sheet.actor': {
        '& .window-content': {
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
        },
        '& .wh40k-sheet': {
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: '0',
            overflow: 'hidden',
        },
        '& form.sheet-body, & .window-app.wh40k-rpg form': {
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: '0',
            overflow: 'hidden',
            gap: '0',
        },
        '& .wh40k-character-header': {
            flex: '0 0 auto',
            overflow: 'visible',
            zIndex: '10',
        },
        '& nav.wh40k-navigation': {
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--wh40k-space-xs)',
            padding: '8px',
            background: 'rgba(0, 0, 0, 0.2)',
            flex: '0 0 auto',
            '& .wh40k-nav-item': {
                padding: '6px 12px',
                borderRadius: 'var(--wh40k-radius-md)',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                textTransform: 'uppercase',
                fontSize: '0.85em',
                '&:hover': {
                    background: 'rgba(255, 255, 255, 0.1)',
                },
                '&.active': {
                    background: 'rgba(196, 135, 29, 0.3)',
                    borderBottom: '2px solid #c4871d',
                },
            },
        },
        '& .wh40k-utility-menu': {
            background: 'rgba(40, 40, 40, 0.95)',
            border: '1px solid rgba(196, 135, 29, 0.5)',
            borderRadius: 'var(--wh40k-radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            minWidth: '200px',
            padding: '4px 0',
            '& .context-menu-item': {
                padding: '8px 12px',
                color: 'rgba(255, 255, 255, 0.8)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--wh40k-space-sm)',
                '&:hover': {
                    background: 'rgba(196, 135, 29, 0.2)',
                    color: 'rgba(255, 255, 255, 1)',
                },
                '& i': {
                    width: '16px',
                    textAlign: 'center',
                    flexShrink: '0',
                },
            },
        },
        '& .wh40k-body, & #tab-body': {
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: '0',
            flex: '1 1 auto',
            gridColumn: 'auto',
        },
        '& .wh40k-body .tab, & #tab-body .tab, & .wh40k-body section.tab, & #tab-body section.tab': {
            display: 'none',
        },
        '& .wh40k-body .tab.active, & #tab-body .tab.active, & .wh40k-body section.tab.active, & #tab-body section.tab.active': {
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--wh40k-space-md)',
            // No top padding: tab content top-aligns with the header/sidebar column
            // top (#398); keep horizontal + bottom breathing room.
            padding: '0 12px 12px',
        },
        '& .wh40k-body section.tab-combat.active, & #tab-body section.tab-combat.active': {
            minHeight: '100%',
            boxSizing: 'border-box',
        },
        '& .wh40k-char-hud-circle': {
            position: 'relative',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1px',
            background:
                'var(--wh40k-circle-bg, linear-gradient(180deg, #f4d03f 0%, var(--wh40k-color-gold) 70%, #b8860b 100%))',
            border: '2px solid var(--wh40k-border-color-strong, #8b6914)',
            boxShadow:
                'inset 0 1px 2px var(--wh40k-text-shadow, rgba(0, 0, 0, 0.1)), 0 3px 8px var(--wh40k-shadow-soft, rgba(0, 0, 0, 0.15))',
        },
        '& .wh40k-char-hud-mod': {
            fontSize: '1.2em',
            fontWeight: '700',
            color: 'var(--wh40k-text-dark, #1a1510)',
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.3)',
        },
        '& .wh40k-char-hud-details': {
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'none',
            gap: '6px',
            padding: '8px',
            width: '170px',
            background: 'var(--wh40k-panel-bg-solid, #f8f4ec)',
            border: '1px solid var(--wh40k-border-color, rgba(140, 120, 90, 0.5))',
            borderRadius: 'var(--wh40k-radius-lg)',
            boxShadow: '0 6px 16px var(--wh40k-shadow-medium, rgba(0, 0, 0, 0.2))',
            zIndex: '20',
            '&.expanded': {
                display: 'grid',
            },
        },
        '& .wh40k-char-hud-details input, & .wh40k-char-hud-details select': {
            width: '100%',
            border: '1px solid var(--wh40k-border-color-light, rgba(140, 120, 90, 0.3))',
            borderRadius: 'var(--wh40k-radius-md)',
            padding: '2px 4px',
            background: 'var(--wh40k-input-bg, #fff)',
            color: 'var(--wh40k-text-dark, #333)',
            fontSize: '0.8em',
        },
    },
};

module.exports = {
    ...itemSheetWindow,
    ...armourChatCard,
    ...actorSheetOverrides,
};
