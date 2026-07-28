import { SYSTEM_ID } from '../constants.ts';
import { disembark, embark, slaveOccupantTokens } from '../rules/vehicle-embark.ts';
import { readAboard } from '../rules/vehicle-occupancy.ts';
import { hasInteriorScene, isVehicleActor, openInteriorScene, type SceneLookup } from '../vehicle/vehicle-interior.ts';

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry movement API dictates getCostFunction signature; args are typed by the engine, not this codebase
    getCostFunction?: (...args: unknown[]) => MovementCostFunction;
};

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry movement cost function signature; `from`/`to` are grid positions with unknown shape from the engine
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's TokenDocument.getFlag returns unknown; the caller casts to the expected type after retrieval
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's CONFIG.Token type doesn't expose movement.actions; cast through unknown
        const tokenConfig = CONFIG.Token as unknown as TokenConfigLike;
        const wh40kConfig = CONFIG.wh40k as Wh40kTokenConfig;
        for (const [type, config] of Object.entries(wh40kConfig.movementTypes)) {
            // Foundry V14 seals each movement-action config after init, so the
            // getAnimationOptions / getCostFunction assignments below throw on
            // re-invocation ("Cannot assign to read only property"). Only create
            // and wire an entry that doesn't already exist — making this genuinely
            // idempotent. Existing (sealed) entries are left as-is.
            const isNew = !(type in tokenConfig.movement.actions);
            if (!isNew) continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: ??= is used to register WH40K movement actions into CONFIG.Token.movement.actions during system init (framework registration, not call-site default)
            tokenConfig.movement.actions[type] ??= {
                label: config.label,
                icon: config.icon,
                order: config.order,
                teleport: false,
                measure: true,
                walls: 'move',
                visualize: true,
                canSelect: (token: TokenDocument | null | undefined) => {
                    return token?.actor?.system.movement !== undefined;
                },
            };

            const actionConfig = tokenConfig.movement.actions[type];
            actionConfig.getAnimationOptions = (token: TokenDocument | null | undefined) => {
                const movement = token?.actor?.system.movement as Record<string, number> | undefined;
                // Slow animation if actor has no speed for this type
                const speed = movement?.[type];
                if (speed === undefined || speed === 0) {
                    return { movementSpeed: tokenConfig.movement.defaultSpeed / 2 };
                }
                return {};
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: getCostFunction signature is defined by Foundry's movement API; token and options are untyped engine values
            actionConfig.getCostFunction = (token: unknown, options?: unknown) =>
                // eslint-disable-next-line no-restricted-syntax -- boundary: casting engine-provided unknown args to concrete types after API boundary
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: _options shape is dictated by Foundry's movement API; content is not used by this implementation
    static #getMovementCostFunction(type: string, token: TokenDocument, _options?: Record<string, unknown>): MovementCostFunction {
        const noAutomation = game.settings.get(SYSTEM_ID, 'movementAutomation') === 'none';
        const { actor } = token;
        const movement = actor?.system.movement as Record<string, number> | undefined;
        const hasMovement = movement !== undefined;
        const speed = movement?.[type];
        const hasSpeed = speed !== undefined && speed !== 0;

        // If automation is disabled, actor has no movement data, or speed is available, use default cost
        const costFn: MovementCostFunction = (cost: number) => cost;
        // eslint-disable-next-line no-restricted-syntax -- boundary: MovementCostFunction signature requires `from`/`to` as unknown; they are engine-provided grid positions not used in this calculation
        const trackingFn: MovementCostFunction = (cost: number, _from?: unknown, _to?: unknown, distance = 0) => cost + distance;
        return noAutomation || !hasMovement || hasSpeed ? costFn : trackingFn;
    }

    /* -------------------------------------------- */
    /*  Token HUD                                   */
    /* -------------------------------------------- */

    /**
     * Register Token HUD hooks for movement buttons.
     */
    static registerHUDListeners(): void {
        Hooks.on('renderTokenHUD', this.onTokenHUDRender.bind(this));
        // Registered separately from the movement row rather than bolted onto it:
        // that handler returns early for any actor without `system.movement`, and
        // a vehicle's interior should not depend on how its movement is authored.
        Hooks.on('renderTokenHUD', this.onVehicleInteriorHUDRender.bind(this));
        Hooks.on('renderTokenHUD', this.onVehicleEmbarkHUDRender.bind(this));
        // Occupant tokens are slaved to the vehicle (#508). `preUpdateToken` is the
        // hook with BOTH positions available — the document still holds the old
        // one and the payload holds the new — which is what the delta needs.
        Hooks.on('preUpdateToken', (doc, changed) => {
            const changes = {
                x: typeof changed.x === 'number' ? changed.x : undefined,
                y: typeof changed.y === 'number' ? changed.y : undefined,
            };
            void slaveOccupantTokens(doc, changes, doc.parent as Parameters<typeof slaveOccupantTokens>[2]);
        });
    }

    /**
     * The HUD's root element. The hook passes an HTMLElement under V14 and a
     * jQuery wrapper under the V13 shim, so both handlers below resolve it here
     * rather than repeating the branch.
     * @param {HTMLElement | JQuery} html  The hook's html argument.
     * @returns {HTMLElement | null}  The root, or null when the wrapper is empty.
     */
    static #hudRoot(html: HTMLElement | JQuery): HTMLElement | null {
        if (html instanceof HTMLElement) return html;
        const first = html[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes first possibly undefined under strict TS, but eslint's plain rule disagrees
        return first ?? null;
    }

    /**
     * Add "Board Interior" to a vehicle token's HUD (#508).
     *
     * The dual-nature vehicle convention makes a vehicle both a combat Actor and a
     * walkable Scene. `vehicle/vehicle-interior.ts` already resolves that link and
     * the actor-sheet header already offers the control; this is its TOKEN call
     * site, off the same module rather than a second implementation.
     *
     * `hasInteriorScene` is the whole conditional: a vehicle with a linked Scene
     * (the Errant Vector) gets the control, one without (a Sentinel Walker) does
     * not — no new detection logic.
     * @param {TokenHUDLike} app  The TokenHUD application.
     * @param {HTMLElement | JQuery} html  The rendered HUD.
     */
    static onVehicleInteriorHUDRender(app: TokenHUDLike, html: HTMLElement | JQuery): void {
        const actor = app.object?.document?.actor;
        if (!hasInteriorScene(actor, game.scenes as SceneLookup)) return;
        const root = TokenDocumentWH40K.#hudRoot(html);
        if (root === null) return;

        const button = document.createElement('button');
        button.type = 'button';
        // `control-icon` is Foundry's own HUD button class, so the control inherits
        // core's HUD styling instead of carrying a hand-rolled copy of it.
        button.classList.add('control-icon', 'wh40k-token-interior');
        button.dataset['action'] = 'openVehicleInterior';
        button.title = game.i18n.localize('WH40K.Vehicle.OpenInterior');
        button.setAttribute('aria-label', button.title);
        button.innerHTML = '<i class="fa-solid fa-door-open"></i>';
        button.addEventListener('click', () => {
            void openInteriorScene(actor, game.scenes as SceneLookup);
        });

        (root.querySelector('.col.left') ?? root).appendChild(button);
    }

    /**
     * Add Enter / Exit Vehicle to a vehicle token's HUD (#508).
     *
     * Acts on the CONTROLLED tokens rather than on the vehicle: "put these
     * characters into that vehicle" is the gesture, and it lets a GM embark the
     * whole party in one click. A player controls only their own token, so the
     * ownership rule ("a player may embark their own character; the GM may move
     * anyone") falls out of Foundry's own control rules rather than needing a
     * second permission check here.
     *
     * The button flips to Exit when every selected token is already aboard this
     * vehicle, so one control covers both directions without a second icon.
     * @param {TokenHUDLike} app  The TokenHUD application.
     * @param {HTMLElement | JQuery} html  The rendered HUD.
     */
    static onVehicleEmbarkHUDRender(app: TokenHUDLike, html: HTMLElement | JQuery): void {
        const vehicleToken = app.object?.document;
        const vehicle = vehicleToken?.actor;
        if (!isVehicleActor(vehicle)) return;
        const root = TokenDocumentWH40K.#hudRoot(html);
        if (root === null || vehicleToken === undefined) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.classList.add('control-icon', 'wh40k-token-embark');
        button.dataset['action'] = 'toggleVehicleEmbark';
        button.title = game.i18n.localize('WH40K.Vehicle.Embark');
        button.setAttribute('aria-label', button.title);
        button.innerHTML = '<i class="fa-solid fa-person-to-portal"></i>';
        button.addEventListener('click', () => {
            void TokenDocumentWH40K.#toggleEmbark(vehicleToken);
        });

        (root.querySelector('.col.left') ?? root).appendChild(button);
    }

    /**
     * Embark every controlled character token into the vehicle, or disembark them
     * when they are already aboard it.
     * @param {TokenDocument} vehicleToken  The vehicle token whose HUD was used.
     */
    static async #toggleEmbark(vehicleToken: TokenDocument): Promise<void> {
        const vehicle = vehicleToken.actor;
        const selected = (canvas.tokens?.controlled ?? []).map((t) => t.document).filter((doc) => doc.id !== vehicleToken.id);
        const riders = selected.map((doc) => doc.actor).filter((actor) => actor !== null);
        if (riders.length === 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.Vehicle.NoTokenSelected'));
            return;
        }

        const vehicleUuid = vehicle?.uuid;
        /* eslint-disable no-restricted-syntax -- boundary: Foundry types `setFlag`/`unsetFlag` over the DECLARED flag scopes, which is not assignable to the plain `(scope: string, …)` shape the embark module works against; the same reason `TokenWithFlags` exists above. One cast per side, at the boundary. */
        const target = vehicle as unknown as Parameters<typeof embark>[1];
        for (const rider of riders) {
            const aboard = readAboard(rider);
            const passenger = rider as unknown as Parameters<typeof embark>[0];
            /* eslint-enable no-restricted-syntax */
            // eslint-disable-next-line no-await-in-loop -- deliberate: each embark re-reads the roster, so capacity is enforced against the writes already made rather than against a stale snapshot
            await (aboard !== null && aboard.vehicleUuid === vehicleUuid ? disembark(passenger) : embark(passenger, target));
        }
    }

    /**
     * Inject movement action buttons into the Token HUD.
     * @param {TokenHUD} app - The TokenHUD application
     * @param {HTMLElement} html - The rendered HTML
     */
    static onTokenHUDRender(app: TokenHUDLike, html: HTMLElement | JQuery): void {
        const token = app.object?.document;
        const actor = token?.actor;
        const movement = actor?.system.movement as Record<string, number> | undefined;
        if (movement === undefined) return;

        const movementTypes = (CONFIG.wh40k as Wh40kTokenConfig).movementTypes;
        if (token === undefined) return;
        const activeType = (token as TokenWithFlags).getFlag(SYSTEM_ID, 'movementAction');
        const $html = TokenDocumentWH40K.#hudRoot(html);
        if ($html === null) return;

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
            const speed: number | undefined = movement[type];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Record<string,number> index may return undefined at runtime
            if (speed === undefined) continue;

            const btn = document.createElement('button');
            btn.classList.add('wh40k-token-movement__btn');
            if (type === activeType) btn.classList.add('active');
            btn.dataset['movementType'] = type;
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
        const config: MovementTypeConfig | undefined = movementTypes[type];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Record<string,MovementTypeConfig> index may return undefined at runtime
        const label = config !== undefined ? game.i18n.localize(config.label) : type;
        const speed = (token.actor?.system.movement as Record<string, number> | undefined)?.[type];
        void token.update({ flags: { 'wh40k-rpg': { movementAction: type } } } as TokenDocument.UpdateInput);
        ui.notifications.info(`${label}: ${speed}m set as active movement mode.`);
    }
}
