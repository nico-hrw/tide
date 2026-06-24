// web/src/types/canvasNote.ts

export type CanvasNoteItemType = 'text' | 'image';

interface CanvasNoteItemBase {
    id: string;
    type: CanvasNoteItemType;
    x: number;
    y: number;
    width: number;
    zIndex: number;
    rotation?: number;
}

export interface CanvasTextItem extends CanvasNoteItemBase {
    type: 'text';
    content: string;
    fontSize?: number;
    color?: string;
}

export interface CanvasImageItem extends CanvasNoteItemBase {
    type: 'image';
    height?: number;
    blobId: string;
    encryptedKey: string;
    fileKeyJwk?: any;
    iv: string;
    mimeType: string;
}

export type CanvasNoteItem = CanvasTextItem | CanvasImageItem;

export interface CanvasNoteData {
    version: 1;
    noteId: string;
    canvasWidth: number;
    canvasHeight: number;
    items: CanvasNoteItem[];
}

export function createEmptyCanvasNote(noteId: string): CanvasNoteData {
    return {
        version: 1,
        noteId,
        canvasWidth: 4000,
        canvasHeight: 3000,
        items: [],
    };
}

export function isCanvasTextItem(item: CanvasNoteItem): item is CanvasTextItem {
    return item.type === 'text';
}

export function isCanvasImageItem(item: CanvasNoteItem): item is CanvasImageItem {
    return item.type === 'image';
}

export function isCanvasNoteData(data: unknown): data is CanvasNoteData {
    return (
        typeof data === 'object' && data !== null &&
        (data as any).version === 1 &&
        Array.isArray((data as any).items) &&
        typeof (data as any).canvasWidth === 'number'
    );
}
