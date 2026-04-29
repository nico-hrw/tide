// Types for the invisible .{noteId}_style.json sidecar file.
// This file is NEVER shown in the sidebar (dot-file convention).
// All canvas layout data lives here; the .md / TipTap JSON stays clean.

// ─── Element Types ───────────────────────────────────────────────────────────

export type CanvasElementType = 'image' | 'text-widget';

interface BaseCanvasElement {
    /** Client-generated UUID for this element */
    id: string;
    type: CanvasElementType;
    /**
     * The `data-block-id` of the TipTap block this element is anchored to.
     * When that block is deleted, the anchor is automatically re-assigned
     * to the nearest surviving block by the CanvasLayer recovery logic.
     */
    anchorBlockId: string;
    /**
     * Pixel offset from the anchor block's right edge (positive = further right).
     * On mobile this is ignored; elements render inline below their anchor.
     */
    offsetX: number;
    /**
     * Pixel offset from the anchor block's top edge (positive = further down).
     */
    offsetY: number;
    /** Optional explicit width in pixels */
    width?: number;
    /** Optional explicit height in pixels */
    height?: number;
    /** Layering priority (higher = in front) */
    zIndex?: number;
}

/**
 * An image dropped or pasted onto the canvas.
 * The image blob is stored encrypted in the BlobStore under `blobId`.
 */
export interface ImageElement extends BaseCanvasElement {
    type: 'image';
    /** ID of the encrypted blob in object storage */
    blobId: string;
    /** Base64-encoded encrypted AES key (wrapped with the user's RSA public key) */
    encryptedKey: string;
    /** Base64-encoded AES-GCM IV used to encrypt the blob */
    iv: string;
    /** Original MIME type of the image e.g. "image/png" */
    mimeType: string;
    /** Rotation in degrees, applied around the image's center. Defaults to 0. */
    rotation?: number;
}

/**
 * A text snippet "popped out" of the note body.
 * The text is removed from the TipTap doc and stored here as plain text.
 */
export interface TextWidgetElement extends BaseCanvasElement {
    type: 'text-widget';
    /** The extracted plain-text content */
    content: string;
    /** Optional background tint for the callout card */
    backgroundColor?: string;
    /** Optional text color override */
    color?: string;
    /** Standard color modes for readability on images/backgrounds */
    colorMode?: 'black' | 'white' | 'inverse';
}

export type CanvasElement = ImageElement | TextWidgetElement;

// ─── Sidecar File Shape ───────────────────────────────────────────────────────

/**
 * The full shape of the .{noteId}_style.json sidecar.
 *
 * Storage:
 *   - Saved as a regular encrypted blob under the deterministic ID `{noteId}_style`
 *   - Content is JSON-serialised, then encrypted with the same file key as the note
 *   - Never listed in the sidebar (dot-file prefix on the virtual filename)
 */
export interface StyleFile {
    /** Schema version – bump when the shape changes incompatibly */
    version: 1;
    /** The ID of the parent note this sidecar belongs to */
    noteId: string;
    /** All floating elements anchored to blocks in this note */
    elements: CanvasElement[];
}

// ─── Runtime helpers ──────────────────────────────────────────────────────────

/** Create an empty, valid StyleFile for a new note */
export function createEmptyStyleFile(noteId: string): StyleFile {
    return { version: 1, noteId, elements: [] };
}

/** Type-guard: is the element an image? */
export function isImageElement(el: CanvasElement): el is ImageElement {
    return el.type === 'image';
}

/** Type-guard: is the element a text-widget? */
export function isTextWidget(el: CanvasElement): el is TextWidgetElement {
    return el.type === 'text-widget';
}
