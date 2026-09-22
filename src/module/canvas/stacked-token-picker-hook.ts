/**
 * Canvas shell for the stacked-token picker (#569).
 *
 * The geometry, ordering and placement are the PURE, unit-tested helpers in
 * `stacked-token-picker.ts`; this file is the thin adapter that (a) turns the
 * live `canvas.tokens` placeables into the plain {@link StackTokenLike} shape in
 * SCREEN space, (b) draws the bust palette as a small DOM overlay, and (c) wires
 * click-to-select and clean dismissal. It touches Foundry canvas / DOM globals,
 * so it is exercised live rather than in the unit suite — every branch that can
 * runs through the tested helpers.
 */

import { t } from '../i18n/t.ts';
import {
    bustObjectPosition,
    computePalettePlacement,
    detectStackAt,
    isStack,
    orderStack,
    type Point,
    raiseToTopSort,
    type Rect,
    type StackTokenLike,
} from './stacked-token-picker.ts';
import { parseTokenFrameFlag, resolveTokenFrameFlag } from './token-mask.ts';

/** The slice of a live Foundry Token placeable this shell reads. */
interface LiveToken {
    id: string;
    name?: string | null;
    visible?: boolean;
    isOwner?: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Token#bounds is a PIXI.Rectangle; only the plain x/y/width/height are read
    bounds?: { x: number; y: number; width: number; height: number };
    center?: { x: number; y: number };
    document?: {
        elevation?: number | null;
        sort?: number | null;
        getFlag: (scope: string, key: string) => object | boolean | undefined;
        texture?: { src?: string | null };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `TokenDocument#update` takes a free-form data bag and resolves to the opaque updated document
        update?: (data: object) => Promise<unknown>;
    };
    actor?: { img?: string | null; prototypeToken?: { getFlag?: (scope: string, key: string) => object | boolean | undefined } | null } | null;
    control?: (options?: { releaseOthers?: boolean }) => void;
}

/** The world→screen affine transform the token layer is drawn with. */
interface WorldTransform {
    a: number;
    d: number;
    tx: number;
    ty: number;
}

const PALETTE_ID = 'wh40k-stacked-token-picker';
const BUST_PX = 44;
const GAP_PX = 6;
const PAD_PX = 6;
/** Grace after the pointer leaves the stack before the palette dismisses, so the
 *  cursor can travel from the tokens to the palette without it vanishing. */
const DISMISS_GRACE_MS = 120;

/**
 * The picker singleton: one palette at a time, installed once on canvas ready.
 * Kept as a class so its listeners have a stable `this` to add/remove and the
 * teardown is exact (no leaked DOM or handlers — an acceptance criterion).
 */
class StackedTokenPicker {
    #palette: HTMLElement | null = null;
    #dismissTimer: number | null = null;
    #onKeydown: ((event: KeyboardEvent) => void) | null = null;
    /** The stack the open palette is showing, so a click can raise the token to its top. */
    #currentStack: StackTokenLike[] = [];

    /** Register the hover hook. Idempotent-safe: Foundry dedupes identical fns. */
    install(): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Hooks.on('hoverToken') passes the framework Token placeable; adapted to LiveToken here
        Hooks.on('hoverToken', (token: object, hovered: boolean) => this.#onHoverToken(token as unknown as LiveToken, hovered));
        // A selection or a pan/zoom invalidates the palette's anchor — drop it.
        Hooks.on('controlToken', () => this.#dismiss());
        Hooks.on('canvasPan', () => this.#dismiss());
    }

    #onHoverToken(token: LiveToken, hovered: boolean): void {
        if (!hovered) {
            this.#scheduleDismiss();
            return;
        }
        const transform = this.#worldTransform();
        const point = this.#screenCenter(token, transform);
        if (transform === null || point === null) return;

        const tokens = this.#screenTokens(transform);
        const stack = orderStack(detectStackAt(tokens, point));
        if (!isStack(stack)) {
            this.#scheduleDismiss();
            return;
        }
        // `.at(0)` is `StackTokenLike | undefined` under both tsconfigs, so the
        // guard is honest to each parser (avoids the noUncheckedIndexedAccess mismatch).
        const top = stack.at(0);
        if (top === undefined) return;
        this.#render(stack, top.bounds);
    }

    /** Every selectable token, mapped to screen-space {@link StackTokenLike}. */
    #screenTokens(transform: WorldTransform): StackTokenLike[] {
        // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.tokens.placeables is the framework token layer; each entry adapted to LiveToken
        const placeables = (canvas.tokens?.placeables ?? []) as unknown as LiveToken[];
        const out: StackTokenLike[] = [];
        for (const token of placeables) {
            if (!this.#selectable(token) || token.bounds === undefined) continue;
            out.push({
                id: token.id,
                name: token.name ?? '',
                elevation: token.document?.elevation ?? 0,
                sort: token.document?.sort ?? 0,
                bounds: this.#toScreenRect(token.bounds, transform),
                img: token.actor?.img ?? token.document?.texture?.src ?? '',
                selectable: true,
            });
        }
        return out;
    }

    /** The local user may select a token that is visible AND owned (GM owns all). */
    #selectable(token: LiveToken): boolean {
        const visible = token.visible !== false;
        return visible && (game.user.isGM || token.isOwner === true);
    }

    #worldTransform(): WorldTransform | null {
        // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.stage.worldTransform is a PIXI.Matrix; only a/d/tx/ty are read
        const m = (canvas.stage as unknown as { worldTransform?: WorldTransform } | undefined)?.worldTransform;
        if (m === undefined || typeof m.a !== 'number') return null;
        return m;
    }

    #toScreenRect(bounds: { x: number; y: number; width: number; height: number }, m: WorldTransform): Rect {
        return { x: bounds.x * m.a + m.tx, y: bounds.y * m.d + m.ty, width: bounds.width * m.a, height: bounds.height * m.d };
    }

    #screenCenter(token: LiveToken, m: WorldTransform | null): Point | null {
        if (m === null || token.center === undefined) return null;
        return { x: token.center.x * m.a + m.tx, y: token.center.y * m.d + m.ty };
    }

    /** The on-screen region the palette must stay inside — the canvas board rect. */
    #viewport(): Rect {
        const board = document.getElementById('board');
        if (board !== null) {
            const r = board.getBoundingClientRect();
            return { x: r.left, y: r.top, width: r.width, height: r.height };
        }
        return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    }

    #render(stack: StackTokenLike[], anchor: Rect): void {
        this.#clearDismiss();
        this.#dismiss();
        // Remember the stack AFTER dismiss (which clears it) so #select can raise
        // the clicked token above its neighbours.
        this.#currentStack = stack;

        const palette = document.createElement('div');
        palette.id = PALETTE_ID;
        palette.className = 'wh40k-rpg';
        palette.setAttribute('role', 'listbox');
        palette.setAttribute('aria-label', t('WH40K.Canvas.StackedPicker.Label'));

        const cols = stack.length <= 4 ? stack.length : Math.ceil(Math.sqrt(stack.length));
        const rows = Math.ceil(stack.length / cols);
        const width = cols * BUST_PX + (cols - 1) * GAP_PX + PAD_PX * 2;
        const height = rows * BUST_PX + (rows - 1) * GAP_PX + PAD_PX * 2;

        Object.assign(palette.style, {
            position: 'fixed',
            zIndex: '70',
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${BUST_PX}px)`,
            gap: `${GAP_PX}px`,
            padding: `${PAD_PX}px`,
            background: 'rgba(10,10,12,0.92)',
            border: '1px solid var(--wh40k-gold, #d4af37)',
            borderRadius: '6px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
        });

        for (const token of stack) palette.appendChild(this.#bust(token));

        palette.addEventListener('pointerenter', () => this.#clearDismiss());
        palette.addEventListener('pointerleave', () => this.#scheduleDismiss());

        document.body.appendChild(palette);
        const place = computePalettePlacement(anchor, { width, height }, this.#viewport());
        palette.style.left = `${place.x}px`;
        palette.style.top = `${place.y}px`;
        this.#palette = palette;

        this.#onKeydown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') this.#dismiss();
        };
        window.addEventListener('keydown', this.#onKeydown);
    }

    #bust(token: StackTokenLike): HTMLElement {
        const frame = parseTokenFrameFlag(this.#frameFor(token.id));
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-label', t('WH40K.Canvas.StackedPicker.SelectToken', { name: token.name }));
        button.title = token.name;
        button.dataset['tokenId'] = token.id;
        Object.assign(button.style, {
            width: `${BUST_PX}px`,
            height: `${BUST_PX}px`,
            padding: '0',
            border: '2px solid var(--wh40k-gold, #d4af37)',
            borderRadius: '50%',
            overflow: 'hidden',
            cursor: 'pointer',
            background: 'transparent',
        });

        const img = document.createElement('img');
        img.src = token.img;
        img.alt = token.name;
        Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', objectPosition: bustObjectPosition(frame), pointerEvents: 'none' });
        button.appendChild(img);

        button.addEventListener('click', () => this.#select(token.id));
        return button;
    }

    /** The raw tokenFrame flag for the placeable with this id, via token-mask. */
    #frameFor(id: string): object | boolean | undefined {
        // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.tokens.get returns the framework Token placeable; adapted to the FrameFlagSource shape resolveTokenFrameFlag reads
        const token = canvas.tokens?.get(id) as unknown as Parameters<typeof resolveTokenFrameFlag>[0] | undefined;
        return token === undefined ? undefined : resolveTokenFrameFlag(token);
    }

    #select(id: string): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.tokens.get returns the framework Token placeable; adapted to LiveToken (.control / .document.update)
        const token = canvas.tokens?.get(id) as unknown as LiveToken | undefined;
        token?.control?.({ releaseOthers: true });
        // Raise the clicked token to the top of the stack so it is the one now on
        // top on the canvas — the whole point of picking it out of the stack.
        const newSort = raiseToTopSort(this.#currentStack, id);
        if (newSort !== null && token?.document?.update !== undefined) {
            void token.document.update({ sort: newSort });
        }
        this.#dismiss();
    }

    #scheduleDismiss(): void {
        this.#clearDismiss();
        this.#dismissTimer = window.setTimeout(() => this.#dismiss(), DISMISS_GRACE_MS);
    }

    #clearDismiss(): void {
        if (this.#dismissTimer !== null) {
            window.clearTimeout(this.#dismissTimer);
            this.#dismissTimer = null;
        }
    }

    /** Tear the palette down exactly: remove the DOM node, the keydown handler and
     *  any pending dismiss timer, so nothing leaks between hovers. */
    #dismiss(): void {
        this.#clearDismiss();
        if (this.#onKeydown !== null) {
            window.removeEventListener('keydown', this.#onKeydown);
            this.#onKeydown = null;
        }
        this.#palette?.remove();
        this.#palette = null;
        this.#currentStack = [];
    }
}

let picker: StackedTokenPicker | null = null;

/** Install the stacked-token picker once. Called from the canvas-ready wiring. */
export function registerStackedTokenPicker(): void {
    if (picker !== null) return;
    picker = new StackedTokenPicker();
    picker.install();
}
