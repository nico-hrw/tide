import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

export type InkToolType = 'pen' | 'marker' | 'eraser' | 'select';
export type PencilInputMode = 'text' | 'draw';

export interface InkPoint {
  x: number;
  y: number;
  p?: number;
}

export interface InkStroke {
  id: string;
  tool: 'pen' | 'marker';
  color: string;
  size: number;
  opacity: number;
  points: InkPoint[];
}

export const PencilInkExtension = Extension.create({
  name: 'pencilInk',

  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          inkStrokes: {
            default: [],
          },
        },
      },
    ];
  },
});

export function getEditorInkStrokes(editor: Editor | null): InkStroke[] {
  const raw: unknown = editor?.state.doc.attrs?.inkStrokes;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw as InkStroke[];
}

export function setEditorInkStrokes(editor: Editor | null, strokes: InkStroke[]): void {
  if (!editor || editor.isDestroyed) {
    return;
  }
  editor.view.dispatch(editor.state.tr.setDocAttribute('inkStrokes', strokes));
}
