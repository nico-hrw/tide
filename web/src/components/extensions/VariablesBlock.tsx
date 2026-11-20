'use client';

import { useState, type MouseEvent } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { Globe, Variable } from 'lucide-react';
import { formatResult } from '@/lib/formula/format';
import { parseDefinitionLines, setGlobalAtLine } from '@/lib/formula/scope';
import { isErr } from '@/lib/formula/types';
import { VariablesBlockNode, type VariablesBlockOptions } from './VariablesBlockNode';
import { scopeForDoc } from './variablesScope';

function VariablesView({ node, updateAttributes, editor, extension }: ReactNodeViewProps) {
    const code = String(node.attrs.code ?? '');
    const [editing, setEditing] = useState(() => !String(node.attrs.code ?? '').trim());

    const isEditing = editing && editor.isEditable;
    const scope = isEditing
        ? null
        : scopeForDoc(editor.state.doc, (extension.options as VariablesBlockOptions)?.getGlobals ?? (() => []));
    const lines = isEditing ? [] : parseDefinitionLines(code);

    return (
        <NodeViewWrapper
            className="my-4 rounded-xl border border-t2-line bg-t2-surface overflow-hidden"
            onMouseDown={(e: MouseEvent) => {
                if (isEditing) e.stopPropagation();
            }}
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-t2-line-soft">
                <div className="flex items-center gap-2 text-xs font-semibold text-t2-ink">
                    <Variable className="w-4 h-4 text-t2-ink" />
                    <span>Variablen dieser Notiz</span>
                </div>
                <button
                    type="button"
                    disabled={!editor.isEditable}
                    onClick={() => setEditing((v) => !v)}
                    className="text-[11px] font-semibold rounded-[7px] px-2 py-[3px] text-t2-ink-2 bg-t2-sub hover:bg-t2-hover disabled:opacity-40 transition-colors"
                >
                    {isEditing ? 'Fertig' : 'Bearbeiten'}
                </button>
            </div>

            {isEditing ? (
                <div className="p-3 bg-t2-sub">
                    <textarea
                        className="w-full bg-transparent font-mono text-[13px] text-t2-ink placeholder:text-t2-ink-3 outline-none resize-none"
                        spellCheck={false}
                        rows={Math.max(3, code.split('\n').length + 1)}
                        value={code}
                        onChange={(e) => updateAttributes({ code: e.target.value })}
                        placeholder={"zins = 3,9 %\n@kurs_usd = 0,92\nrate(b, z, n) = RMZ(z / 12, n, -b)"}
                    />
                </div>
            ) : lines.length === 0 ? (
                <div className="text-xs text-t2-ink-3 italic p-4 text-center">
                    Keine Variablen definiert
                </div>
            ) : (
                <div>
                    {lines.map(({ line, def }) => {
                        const val = def.params ? undefined : scope?.variable(def.name);
                        return (
                            <div
                                key={`${line}-${def.name}`}
                                className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-mono border-b border-t2-line-soft last:border-b-0"
                            >
                                <span className="text-t2-ink font-medium min-w-[110px]">
                                    {def.params ? `${def.name}(${def.params.join(', ')})` : def.name}
                                </span>
                                <span className="text-t2-ink-3">=</span>
                                <span className="flex-1 text-t2-ink min-w-0 truncate">{def.expr}</span>
                                {def.params ? (
                                    <span className="text-xs text-t2-ink-2">Funktion</span>
                                ) : (
                                    val !== undefined && (
                                        <span
                                            className={
                                                isErr(val)
                                                    ? 'text-xs text-t2-late font-semibold tabular-nums'
                                                    : 'text-xs text-t2-ink-2 tabular-nums'
                                            }
                                            title={isErr(val) ? val.detail : undefined}
                                        >
                                            {isErr(val) ? val.error : `= ${formatResult(val)}`}
                                        </span>
                                    )
                                )}
                                <button
                                    type="button"
                                    disabled={!editor.isEditable}
                                    onClick={() => updateAttributes({ code: setGlobalAtLine(code, line, !def.global) })}
                                    className={
                                        def.global
                                            ? 'ml-auto flex items-center gap-1.5 text-[11px] font-semibold font-sans rounded-[7px] px-2 py-[3px] bg-t2-accent text-t2-accent-ink transition-colors'
                                            : 'ml-auto flex items-center gap-1.5 text-[11px] font-semibold font-sans rounded-[7px] px-2 py-[3px] text-t2-ink-2 bg-t2-sub hover:bg-t2-hover transition-colors'
                                    }
                                >
                                    <Globe className="w-3.5 h-3.5" />
                                    <span>{def.global ? 'global' : 'lokal'}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </NodeViewWrapper>
    );
}

export const VariablesBlock = VariablesBlockNode.extend({
    addNodeView() {
        return ReactNodeViewRenderer(VariablesView);
    },
});
