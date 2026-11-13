import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mcpVisual: {
      toggleAiFocus: () => ReturnType;
      copyBlockAddress: (noteId?: string) => ReturnType;
      copySelectionForAi: (noteId?: string) => ReturnType;
    };
  }
}

export const TARGET_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
] as const;

export const MCP_VISUAL_STYLES = `
.ai-focus-highlight {
  position: relative;
  border-left: 3px solid #8b5cf6 !important;
  background-color: rgba(139, 92, 246, 0.06);
  padding-left: 0.5rem;
  border-radius: 0 4px 4px 0;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.ai-focus-highlight::after {
  content: "AI Focus";
  position: absolute;
  top: 0.25rem;
  right: 0.5rem;
  font-size: 0.65rem;
  line-height: 1;
  font-weight: 500;
  letter-spacing: 0.025em;
  padding: 2px 6px;
  border-radius: 9999px;
  background-color: rgba(139, 92, 246, 0.15);
  color: #7c3aed;
  pointer-events: none;
  user-select: none;
}
`;

export function injectMcpVisualStyles(): void {
  if (typeof document === 'undefined') return;
  const styleId = 'mcp-visual-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = MCP_VISUAL_STYLES;
    document.head.appendChild(style);
  }
}

export function formatBlockAddress(noteId: string, blockId: string): string {
  const trimmed = noteId.trim();
  return trimmed ? `note://${trimmed}#${blockId}` : `#${blockId}`;
}

export function formatAiSelectionSnippet(noteId: string, blockId: string, text: string): string {
  const address = noteId.trim() ? formatBlockAddress(noteId, blockId) : `#${blockId}`;
  const cleanText = text.trim();
  if (!cleanText) return `> [Ref: ${address}]`;
  const quoteLines = cleanText.split('\n').map((l) => `> ${l}`).join('\n');
  return `> [Ref: ${address}]\n${quoteLines}`;
}

function findBlockIdAndText(
  state: EditorState,
  view?: EditorView
): { blockId: string | null; blockText: string } {
  const { $from } = state.selection;
  let blockText = '';
  let foundId: string | null = null;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const isTarget = (TARGET_BLOCK_TYPES as readonly string[]).includes(node.type.name) || node.isBlock;
    if (isTarget) {
      if (!blockText) blockText = node.textContent;
      const rawId = node.attrs?.blockId;
      if (typeof rawId === 'string' && rawId.trim().length > 0) {
        foundId = rawId.trim();
        break;
      }
      if (view) {
        const dom = view.nodeDOM($from.before(depth));
        if (dom instanceof HTMLElement) {
          const attrId = dom.getAttribute('data-block-id');
          if (attrId && attrId.trim().length > 0) {
            foundId = attrId.trim();
            break;
          }
        }
      }
    }
  }
  return { blockId: foundId, blockText };
}

export const McpVisualExtension = Extension.create({
  name: 'mcpVisual',

  onCreate() {
    injectMcpVisualStyles();
  },

  addGlobalAttributes() {
    return [
      {
        types: [...TARGET_BLOCK_TYPES],
        attributes: {
          aiFocus: {
            default: false,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-ai-focus') === 'true',
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.aiFocus ? { 'data-ai-focus': 'true', class: 'ai-focus-highlight' } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleAiFocus:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            const isTarget = (TARGET_BLOCK_TYPES as readonly string[]).includes(node.type.name) || node.isBlock;
            if (isTarget) {
              if (dispatch) {
                const pos = $from.before(depth);
                const currentAiFocus = Boolean(node.attrs?.aiFocus);
                dispatch(
                  state.tr.setNodeMarkup(
                    pos,
                    node.type,
                    { ...node.attrs, aiFocus: !currentAiFocus },
                    node.marks
                  )
                );
              }
              return true;
            }
          }
          return false;
        },

      copyBlockAddress:
        (noteId?: string) =>
        ({ state, view }) => {
          const { blockId } = findBlockIdAndText(state, view);
          if (!blockId) return false;

          const targetNoteId = noteId !== undefined && noteId !== '' ? noteId : 'active';
          const address = formatBlockAddress(targetNoteId, blockId);
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(address);
            return true;
          }
          return false;
        },

      copySelectionForAi:
        (noteId?: string) =>
        ({ state, view }) => {
          const { from, to, empty } = state.selection;
          const { blockId, blockText } = findBlockIdAndText(state, view);
          if (!blockId) return false;

          const textToCopy = empty ? blockText : state.doc.textBetween(from, to, '\n');
          const snippet = formatAiSelectionSnippet(noteId ?? '', blockId, textToCopy);
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(snippet);
            return true;
          }
          return false;
        },
    };
  },
});

export default McpVisualExtension;
