import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';

/**
 * Copies clean text. Empty paragraphs and page breaks are left out of the copied slice, so other apps
 * get one blank line between paragraphs instead of two or three per empty paragraph. Only the copy
 * changes; the note keeps every block.
 */
function cleanFragment(fragment: Fragment): Fragment {
    const out: PMNode[] = [];
    fragment.forEach((node) => {
        if (node.type.name === 'pageBreak') return;
        if (node.isTextblock && node.content.size === 0) return;
        if (!node.isLeaf && node.content.size > 0) {
            out.push(node.copy(cleanFragment(node.content)));
            return;
        }
        out.push(node);
    });
    return Fragment.fromArray(out);
}

export const CleanClipboard = Extension.create({
    name: 'cleanClipboard',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('cleanClipboard'),
                props: {
                    transformCopied(slice) {
                        const content = cleanFragment(slice.content);
                        if (content.size === 0) return slice;
                        return new Slice(content, slice.openStart, slice.openEnd);
                    },
                },
            }),
        ];
    },
});

export default CleanClipboard;
