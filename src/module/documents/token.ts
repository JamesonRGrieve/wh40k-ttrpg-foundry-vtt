import { SYSTEM_ID } from '../constants.ts';

type MovementTypeConfig = {
    label: string;
    icon: string;
    order: number;
};

type TokenMovementConfigEntry = {
    label: string;
    icon: string;
    order: number;
    teleport: boolean;
    measure: boolean;
    walls: string;
    visualize: boolean;
    canSelect: (token: TokenDocument | null | undefined) => boolean;
    getAnimationOptions?: (token: TokenDocument | null | undefined) => { movementSpeed?: number };
    getCostFunction?: (...args: unknown[]) => MovementCostFunction;
};

type MovementCostFunction = (cost: number, from?: unknown, to?: unknown, distance?: number) => number;

type TokenConfigLike = {
    movement: {
        actions: Record<string, TokenMovementConfigEntry>;
        defaultSpeed: number;
    };
};

type Wh40kTokenConfig = {
    movementTypes: Record<string, MovementTypeConfig>;
};

type TokenHUDLike = {
    object?: {
        document?: TokenDocument;
    };
};

type TokenWithFlags = TokenDocument & {
    getFlag: (scope: string, key: string) => unknown;
};

/**
 * Extend the base TokenDocument class to implement WH40K movement actions.
 * Integrates character movement types (Half/Full/Charge/Run) with
 * Foundry V13's CONFIG.Token.movement.actions system.
 */
export class TokenDocumentWH40K extends TokenDocument {
    /* -------------------------------------------- */
    /*  Movement                                    */
    /* -------------------------------------------- */

    /**
     * Register WH40K movement actions in CONFIG.Token.movement.actions.
     * Creates new action entries for Half/Full/Charge/Run and configures
     * their cost functions and animation options.
     * Called during system init after CONFIG.wh40k is set.
     */
    static registerMovementActions(this: typeof TokenDocumentWH40K): void {
        const tokenConfig = CONFIG.Token as TokenConfigLike;
        const wh40kConfig = CONFIG.wh40k as Wh40kTokenConfig;
        for (const [type, config] of Object.entries(wh40kConfig.movementTypes)) {
            // Create the action entry if it doesn't already exist (WH40K-specific actions)
            tokenConfig.movement.actions[type] ??= {
                label: config.label,
                icon: config.icon,
                order: config.order,
                teleport: false,
                measure: true,
                walls: 'move',
                visualize: true,
                canSelect: (token: TokenDocument | null | undefined) => {
                    return token?.actor?.system?.movement !== undefined;
                },
            };

            const actionConfig = tokenConfig.movement.actions[type];
            actionConfig.getAnimationOptions = (token: TokenDocument | null | undefined) => {
                const movement = token?.actor?.system?.movement as Record<string, number> | undefined;
                // Slow animation if actor has no speed for this type
                if (!movement?.[type]) {
                    return { movementSpeed: tokenConfig.movement.defaultSpeed / 2 };
                }
                return {};
            };
            actionConfig.getCostFunction = (token: unknown, options?: unknown) =>
                this.#getMovementCostFunction(type, token as TokenDocument, options as Record<string, unknown> | undefined);
        }
    }

    /* -------------------------------------------- */

    /**
     * Return the movement action cost function for a specific movement type.
     * The cost function tracks distance against the actor's movement budget.
     * @param {string} type - Movement type key (half, full, charge, run)
     * @param {TokenDocumentWH40K} token - The token document
     * @param {object} [options] - Additional options
     * @returns {Function} Cost function (cost, from, to, distance, segment) => number
     */
    static #getMovementCostFunction(type: string, token: TokenDocument, options?: Record<string, unknown>): MovementCostFunction {
        const noAutomation = game.settings.get(SYSTEM_ID, 'movementAutomation') === 'none';
        const { actor } = token;
        const movement = actor?.system?.movement as Record<string, number> | undefined;
        const hasMovement = movement !== undefined;
        const speed = movement?.[type];

        // If automation is disabled, actor has no movement data, or speed is available, use default cost
        return noAutomation || !hasMovement || speed ? (cost: number) => cost : (cost: number, _from?: unknown, _to?: unknown, distance = 0) => cost + distance;
    }

    /* -------------------------------------------- */
    /*  Token HUD                                   */
    /* -------------------------------------------- */

    /**
     * Register Token HUD hooks for movement buttons.
     */
    static registerHUDListeners(): void {
        Hooks.on('renderTokenHUD', this.onTokenHUDRender.bind(this));
    }

    /**
     * Inject movement action buttons into the Token HUD.
     * @param {TokenHUD} app - The TokenHUD application
     * @param {HTMLElement} html - The rendered HTML
     */
    static onTokenHUDRender(app: TokenHUDLike, html: HTMLElement | JQuery<HTMLElement>): void {
        const token = app.object?.document;
        const actor = token?.actor;
        const movement = actor?.system?.movement as Record<string, number> | undefined;
        if (!movement) return;

        const movementTypes = (CONFIG.wh40k as Wh40kTokenConfig).movementTypes;
        if (!token) return;
        const activeType = (token as TokenWithFlags).getFlag(SYSTEM_ID, 'movementAction');
        const $html = html instanceof HTMLElement ? html : html[0] ?? html;

        // Build movement buttons container
        const container = document.createElement('div');
        container.classList.add('wh40k-token-movement');
        Object.assign(container.style, {
            display: 'flex',
            gap: '4px',
            justifyContent: 'center',
            padding: '4px',
            position: 'absolute',
            bottom: '-40px',
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
        });

        for (const [type, config] of Object.entries(movementTypes)) {
            const speed = movement[type];
            if (speed === undefined) continue;

            const btn = document.createElement('button');
            btn.classList.add('wh40k-token-movement__btn');
            if (type === activeType) btn.classList.add('active');
            btn.dataset.movementType = type;
            btn.title = `${game.i18n.localize(config.label)}: ${speed}m`;
            btn.innerHTML = `<i class="${config.icon}"></i><span class="wh40k-token-movement__value" style="font-weight:700;font-family:var(--wh40k-font-alt,serif)">${speed}m</span>`;
            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                color: '#ddd',
                fontSize: '0.7rem',
                cursor: 'pointer',
            });

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(0,0,0,0.85)';
                btn.style.borderColor = 'rgba(255,255,255,0.4)';
                btn.style.color = '#fff';
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.classList.contains('active')) {
                    btn.style.background = 'rgba(0,0,0,0.7)';
                    btn.style.borderColor = 'rgba(255,255,255,0.2)';
                    btn.style.color = '#ddd';
                }
            });

            btn.addEventListener('click', (event) => {
                event.preventDefault();
                this.#setMovementAction(token, type);
                container.querySelectorAll('.wh40k-token-movement__btn').forEach((b: Element) => {
                    (b as HTMLElement).style.background = 'rgba(0,0,0,0.7)';
                    (b as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)';
                    (b as HTMLElement).style.color = '#ddd';
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                btn.style.background = 'rgba(52,152,219,0.6)';
                btn.style.borderColor = 'rgba(52,152,219,0.8)';
                btn.style.color = '#fff';
            });

            // Apply active state styles
            if (type === activeType) {
                btn.style.background = 'rgba(52,152,219,0.6)';
                btn.style.borderColor = 'rgba(52,152,219,0.8)';
                btn.style.color = '#fff';
            }

            container.appendChild(btn);
        }

        // Insert below the token HUD columns
        const statusEffects = $html.querySelector('.status-effects') ?? $html.querySelector('.col.right');
        if (statusEffects) {
            statusEffects.parentNode?.insertBefore(container, statusEffects.nextSibling);
        } else {
            $html.appendChild(container);
        }
    }

    /**
     * Set the active movement action for a token.
     * Stores the selection as a flag and shows a notification.
     * @param {TokenDocument} token - The token document
     * @param {string} type - Movement type key
     */
    static #setMovementAction(token: TokenDocument, type: string): void {
        const movementTypes = (CONFIG.wh40k as Wh40kTokenConfig).movementTypes;
        const config = movementTypes[type];
        const label = config ? game.i18n.localize(config.label) : type;
        const speed = (token.actor?.system?.movement as Record<string, number> | undefined)?.[type];
        void token.update({ flags: { 'wh40k-rpg': { movementAction: type } } } as TokenDocument.UpdateInput);
        ui.notifications.info(`${label}: ${speed}m set as active movement mode.`);
    }
}
