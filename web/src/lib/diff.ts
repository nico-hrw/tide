export interface LinePatchOp {
    lineIndex: number;
    deleteCount: number;
    insertLines: string[];
}

export interface DiffChange {
    type: 'added' | 'removed' | 'equal';
    text: string;
}

/**
 * Generates a line-based patch between oldStr and newStr.
 */
export function createLinePatch(oldStr: string, newStr: string): LinePatchOp[] {
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');
    
    const dp: number[][] = Array(oldLines.length + 1).fill(null).map(() => Array(newLines.length + 1).fill(0));
    
    for (let i = 1; i <= oldLines.length; i++) {
        for (let j = 1; j <= newLines.length; j++) {
            if (oldLines[i-1] === newLines[j-1]) {
                dp[i][j] = dp[i-1][j-1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
            }
        }
    }
    
    const ops: LinePatchOp[] = [];
    let i = oldLines.length;
    let j = newLines.length;
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i-1] === newLines[j-1]) {
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
            const line = newLines[j-1];
            const lastOp = ops[ops.length - 1];
            if (lastOp && lastOp.lineIndex === i && lastOp.deleteCount === 0) {
                lastOp.insertLines.unshift(line);
            } else {
                ops.push({ lineIndex: i, deleteCount: 0, insertLines: [line] });
            }
            j--;
        } else {
            const lastOp = ops[ops.length - 1];
            if (lastOp && lastOp.lineIndex === i - 1 && lastOp.insertLines.length === 0) {
                lastOp.lineIndex = i - 1;
                lastOp.deleteCount++;
            } else {
                ops.push({ lineIndex: i - 1, deleteCount: 1, insertLines: [] });
            }
            i--;
        }
    }
    
    return ops.reverse();
}

/**
 * Applies a line-based patch to sourceStr.
 */
export function applyLinePatch(sourceStr: string, patch: LinePatchOp[]): string {
    const lines = sourceStr.split('\n');
    const sorted = [...patch].sort((a, b) => b.lineIndex - a.lineIndex);
    for (const op of sorted) {
        lines.splice(op.lineIndex, op.deleteCount, ...op.insertLines);
    }
    return lines.join('\n');
}

/**
 * Computes word-by-word diff changes between oldText and newText.
 */
export function diffWords(oldText: string, newText: string): DiffChange[] {
    if (!oldText) return [{ type: 'added', text: newText }];
    if (!newText) return [{ type: 'removed', text: oldText }];

    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);
    
    const dp: number[][] = Array(oldWords.length + 1).fill(null).map(() => Array(newWords.length + 1).fill(0));
    
    for (let i = 1; i <= oldWords.length; i++) {
        for (let j = 1; j <= newWords.length; j++) {
            if (oldWords[i-1] === newWords[j-1]) {
                dp[i][j] = dp[i-1][j-1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
            }
        }
    }
    
    const result: DiffChange[] = [];
    let i = oldWords.length;
    let j = newWords.length;
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i-1] === newWords[j-1]) {
            result.unshift({ type: 'equal', text: oldWords[i-1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
            result.unshift({ type: 'added', text: newWords[j-1] });
            j--;
        } else {
            result.unshift({ type: 'removed', text: oldWords[i-1] });
            i--;
        }
    }
    
    const coalesced: DiffChange[] = [];
    for (const change of result) {
        const last = coalesced[coalesced.length - 1];
        if (last && last.type === change.type) {
            last.text += change.text;
        } else {
            coalesced.push({ ...change });
        }
    }
    
    return coalesced;
}

/**
 * Extracts plain text from a TipTap JSON node recursively.
 */
export function getPlainTextFromJSON(node: any): string {
    if (!node) return "";
    if (node.type === 'text') return node.text || "";
    let text = "";
    if (Array.isArray(node.content)) {
        for (const child of node.content) {
            text += getPlainTextFromJSON(child);
        }
    }
    if (['paragraph', 'heading', 'listItem', 'tableRow'].includes(node.type)) {
        text += "\n";
    }
    return text;
}
