import { SYSTEM_ID } from '../constants.ts';

/**
 * Runtime circular token masks — tokens from plain rectangular portraits,
 * no pre-tokenized image variants.
 *
 * A token whose document carries `flags.wh40k-rpg.tokenFrame` gets its mesh
 * texture swapped for a GPU-generated circular bust: the source portrait is
 * cover-cropped around the flagged centre coordinates, scaled into a padded
 * content circle and alpha-masked into a RenderTexture. With the Dynamic
 * Token Ring enabled the content circle spans 75% of the frame — the same
 * ratio official ring subject art (and our baked pack busts) use, so the
 * bust seats inside the band instead of covering it.
 *
 * Why a RenderTexture swap and not `mesh.mask`: the ring band and the
 * subject are drawn by the SAME mesh (the ring sampler shader sources the
 * band from the spritesheet and the subject from the mesh texture), so
 * masking the mesh would clip the band off along with the art's corners.
 * Swapping the subject texture leaves the band sampler untouched —
 * verified by screenshot in the live e2e harness before this was built.
 *
 * The flag:
 *   flags.wh40k-rpg.tokenFrame = {
 *     cx?: number,       // centre of the bust in the source image, 0-1 (default 0.5)
 *     cy?: number,       // (default 0.3 — head-biased for portrait art)
 *     content?: number,  // content-circle fraction override (default: 0.75
 *   }                    //  with ring enabled, 1.0 without)
 */

export interface TokenFrameFlag {
    cx?: number;
    cy?: number;
    content?: number;
}

export interface FrameTransform {
    scale: number;
    x: number;
    y: number;
    radius: number;
}

/** Render-texture edge size: bust resolution independent of source size. */
const RT_SIZE = 512;
/** Content-circle fraction when the Dynamic Ring needs band clearance. */
const RING_CONTENT = 0.75;

/**
 * Pure geometry: place a `srcWidth`x`srcHeight` portrait into a `size`-px
 * square frame so the point (`cx`, `cy`) (source-fraction coordinates) sits
 * at the frame centre and the source's short side spans the content circle.
 */
export function computeFrameTransform(srcWidth: number, srcHeight: number, size: number, content: number, cx: number, cy: number): FrameTransform {
    const side = Math.min(srcWidth, srcHeight);
    const scale = (size * content) / side;
    return {
        scale,
        x: size / 2 - cx * srcWidth * scale,
        y: size / 2 - cy * srcHeight * scale,
        radius: (size * content) / 2,
    };
}

/** Narrow an arbitrary flag value to a usable TokenFrameFlag. */
export function parseTokenFrameFlag(value: object | boolean | undefined | null): Required<TokenFrameFlag> | null {
    if (value === undefined || value === null || value === false) return null;
    const raw: TokenFrameFlag = value === true ? {} : value;
    const clamp = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
    return {
        cx: clamp(raw.cx, 0.5),
        cy: clamp(raw.cy, 0.3),
        content: clamp(raw.content, 0),
    };
}

interface MeshLike {
    texture: PIXI.Texture;
}

interface MaskableToken {
    document: {
        getFlag: (scope: string, key: string) => object | boolean | undefined;
        texture: { src: string | null };
        ring: { enabled: boolean };
    };
    mesh: MeshLike | null;
    /** Core-protected resize: recomputes mesh scale from the CURRENT texture.
     * Called after the swap — the original transform was fitted to the
     * portrait's aspect and would stretch the square bust into an ellipse. */
    _refreshMeshSizeAndScale: () => void;
}

/** Generated busts keyed by source path + frame parameters; the WeakSet
 * marks our own RenderTextures so a cache hit is never re-used as a source. */
const generated = new Map<string, PIXI.RenderTexture>();
const ours = new WeakSet<PIXI.Texture>();

function buildBustTexture(source: PIXI.Texture, frame: Required<TokenFrameFlag>, content: number, renderer: PIXI.IRenderer): PIXI.RenderTexture {
    const t = computeFrameTransform(source.width, source.height, RT_SIZE, content, frame.cx, frame.cy);
    const sprite = new PIXI.Sprite(source);
    sprite.scale.set(t.scale);
    sprite.position.set(t.x, t.y);
    const circle = new PIXI.Graphics();
    circle.beginFill(0xffffff);
    circle.drawCircle(RT_SIZE / 2, RT_SIZE / 2, t.radius);
    circle.endFill();
    sprite.mask = circle;
    const container = new PIXI.Container();
    container.addChild(sprite, circle);
    const rt = PIXI.RenderTexture.create({ width: RT_SIZE, height: RT_SIZE });
    renderer.render(container, { renderTexture: rt });
    container.destroy({ children: true });
    return rt;
}

/**
 * `refreshToken` hook: apply the flagged circular bust to the token mesh.
 * Foundry re-assigns the source texture on every full draw, so this runs on
 * each refresh and is a no-op when the mesh already shows our bust.
 */
export function onRefreshToken(token: MaskableToken): void {
    const frame = parseTokenFrameFlag(token.document.getFlag(SYSTEM_ID, 'tokenFrame'));
    if (frame === null) return;
    const mesh = token.mesh;
    if (mesh?.texture.valid !== true) return;
    if (ours.has(mesh.texture)) return; // already showing the generated bust
    const content = frame.content > 0 ? frame.content : token.document.ring.enabled ? RING_CONTENT : 1.0;
    const key = `${token.document.texture.src ?? ''}|${frame.cx}|${frame.cy}|${content}`;
    // strict tsc types canvas.app as possibly undefined (pre-boot); the hook
    // only fires with a live canvas, but guard rather than assert.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fvtt-types and strict tsc disagree on canvas.app nullability
    const renderer = canvas.app?.renderer;
    if (renderer === undefined) return;
    let rt = generated.get(key);
    if (rt === undefined) {
        rt = buildBustTexture(mesh.texture, frame, content, renderer);
        generated.set(key, rt);
        ours.add(rt);
    }
    mesh.texture = rt;
    // The mesh transform was computed for the source portrait's aspect ratio;
    // re-derive it from the (square) bust or the disc renders as an ellipse.
    // Resize-only — no texture reassignment, so no refresh re-entry.
    token._refreshMeshSizeAndScale();
}
