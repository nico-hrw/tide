export function formatEventTime(startStr?: string): string {
    if (!startStr) return '';
    try {
        const d = new Date(startStr);
        if (isNaN(d.getTime())) return startStr;
        const hasTime = startStr.includes('T') || startStr.includes(':');
        if (hasTime) {
            return d.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        return d.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return startStr;
    }
}

export function isDocEmpty(parsed: unknown): boolean {
    if (!parsed) return true;
    if (typeof parsed === 'string') return parsed.trim().length === 0;
    if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as any;
        if (obj.type === 'doc') {
            if (Array.isArray(obj.attrs?.inkStrokes) && obj.attrs.inkStrokes.length > 0) return false;
            if (!obj.content || obj.content.length === 0) return true;
            for (const node of obj.content) {
                if (node.type !== 'paragraph') return false;
                if (node.content && node.content.length > 0) {
                    for (const textNode of node.content) {
                        if (textNode.type && textNode.type !== 'text') return false;
                        if (textNode.text && textNode.text.trim().length > 0) return false;
                    }
                }
            }
            return true;
        }
    }
    return false;
}

export function getCleanDocContent(content: any) {
    if (!content) return null;
    let parsed = content;
    if (typeof content === 'string') {
        try {
            parsed = JSON.parse(content);
        } catch (_) {
            return content;
        }
    }
    if (parsed && typeof parsed === 'object' && parsed.__yjs) {
        const { __yjs, ...clean } = parsed;
        return clean;
    }
    return parsed;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return btoa(binary);
}
