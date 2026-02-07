import { SYSTEM_ID } from '../constants.mjs';

/**
 * Extend the base TokenDocument class to implement RT movement actions.
 * Integrates character movement types (Half/Full/Charge/Run) with
 * Foundry V13's CONFIG.Token.movement.actions system.
 */
export class TokenDocumentRT extends TokenDocument {

    /* -------------------------------------------- */
    /*  Movement                                    */
    /* -------------------------------------------- */

    /**
     * Register RT movement actions in CONFIG.Token.movement.actions.
     * Creates new action entries for Half/Full/Charge/Run and configures
     * their cost functions and animation options.
     * Called during system init after CONFIG.rt is set.
     */
    static registerMovementActions() {
        for (const [type, config] of Object.entries(CONFIG.rt.movementTypes)) {
            // Create the action entry if it doesn't already exist (RT-specific actions)
            CONFIG.Token.movement.actions[type] ??= {
                label: config.label,
                icon: config.icon,
                order: config.order,
                teleport: false,
                measure: true,
                walls: 'move',
                visualize: true,
                canSelect: token => {
                    return token?.actor?.system?.movement !== undefined;
                },
            };

            const actionConfig = CONFIG.Token.movement.actions[type];
            actionConfig.getAnimationOptions = token => {
                const movement = token?.actor?.system?.movement;
                // Slow animation if actor has no speed for this type
                if (!movement?.[type]) {
                    return { movementSpeed: CONFIG.Token.movement.defaultSpeed / 2 };
                }
                return {};
            };
            actionConfig.getCostFunction = (...args) => this.#getMovementCostFunction(type, ...args);
        }
    }

    /* -------------------------------------------- */

    /**
     * Return the movement action cost function for a specific movement type.
     * The cost function tracks distance against the actor's movement budget.
     * @param {string} type - Movement type key (half, full, charge, run)
     * @param {TokenDocumentRT} token - The token document
     * @param {object} [options] - Additional options
     * @returns {Function} Cost function (cost, from, to, distance, segment) => number
     */
    static #getMovementCostFunction(type, token, options) {
        const noAutomation = game.settings.get(SYSTEM_ID, 'movementAutomation') === 'none';
        const { actor } = token;
        const movement = actor?.system?.movement;
        const hasMovement = movement !== undefined;
        const speed = movement?.[type];

        // If automation is disabled, actor has no movement data, or speed is available, use default cost
        return (noAutomation || !hasMovement || speed)
            ? cost => cost
            : (cost, _from, _to, distance) => cost + distance;
    }

    /* -------------------------------------------- */
    /*  Token HUD                                   */
    /* -------------------------------------------- */

    /**
     * Register Token HUD hooks for movement buttons.
     */
    static registerHUDListeners() {
        Hooks.on('renderTokenHUD', this.onTokenHUDRender.bind(this));
    }

    /**
     * Inject movement action buttons into the Token HUD.
     * @param {TokenHUD} app - The TokenHUD application
     * @param {HTMLElement} html - The rendered HTML
     */
    static onTokenHUDRender(app, html) {
        const token = app.object?.document;
        const actor = token?.actor;
        const movement = actor?.system?.movement;
        if (!movement) return;

        const movementTypes = CONFIG.rt.movementTypes;
        const activeType = token.getFlag(SYSTEM_ID, 'movementAction');
        const $html = html instanceof HTMLElement ? html : html[0] ?? html;

        // Build movement buttons container
        const container = document.createElement('div');
        container.classList.add('rt-token-movement');

        for (const [type, config] of Object.entries(movementTypes)) {
            const speed = movement[type];
            if (speed === undefined) continue;

            const btn = document.createElement('button');
            btn.classList.add('rt-token-movement__btn');
            if (type === activeType) btn.classList.add('active');
            btn.dataset.movementType = type;
            btn.title = `${game.i18n.localize(config.label)}: ${speed}m`;
            btn.innerHTML = `<i class="${config.icon}"></i><span class="rt-token-movement__value">${speed}m</span>`;

            btn.addEventListener('click', (event) => {
                event.preventDefault();
                this.#setMovementAction(token, type);
                container.querySelectorAll('.rt-token-movement__btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });

            container.appendChild(btn);
        }

        // Insert below the token HUD columns
        const statusEffects = $html.querySelector('.status-effects') ?? $html.querySelector('.col.right');
        if (statusEffects) {
            statusEffects.parentNode.insertBefore(container, statusEffects.nextSibling);
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
    static #setMovementAction(token, type) {
        const config = CONFIG.rt.movementTypes[type];
        const label = config ? game.i18n.localize(config.label) : type;
        const speed = token.actor?.system?.movement?.[type];
        token.update({ 'flags.rogue-trader.movementAction': type });
        ui.notifications.info(`${label}: ${speed}m set as active movement mode.`);
    }
}
