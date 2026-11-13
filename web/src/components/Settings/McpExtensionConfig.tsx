import React, { useState } from 'react';
import { Terminal, Copy, Check, Cpu, Sparkles, Eye, Share2 } from 'lucide-react';
import { DT } from '@/lib/designTokens';

export interface McpExtensionConfigProps {
    className?: string;
}

const MCP_CONFIG_JSON = JSON.stringify(
    {
        mcpServers: {
            tide: {
                command: 'tide-daemon',
                args: ['mcp'],
            },
        },
    },
    null,
    2
);

const SUPPORTED_TOOLS = [
    { name: 'tide_search', desc: 'Volltext- & Tag-Suche über Notizen' },
    { name: 'tide_get_note_outline', desc: 'Dokumentenstruktur & Überschriften' },
    { name: 'tide_get_block', desc: 'Einzelnen Block via #blk_id lesen' },
    { name: 'tide_get_focused_blocks', desc: 'Aktive Zeilen & Kontext-Ausschnitt' },
    { name: 'tide_patch_block', desc: 'Atomare Inline-Änderungen an Blöcken' },
    { name: 'tide_list_todos', desc: 'Todos & Tasks mit Status abfragen' },
];

export function McpExtensionConfig({ className = '' }: McpExtensionConfigProps) {
    const [copied, setCopied] = useState(false);
    const [visualHighlighting, setVisualHighlighting] = useState(true);
    const [blockIdAddressing, setBlockIdAddressing] = useState(true);
    const [targetedSend, setTargetedSend] = useState(true);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(MCP_CONFIG_JSON);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback if clipboard API is restricted
            const textArea = document.createElement('textarea');
            textArea.value = MCP_CONFIG_JSON;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className={`w-full space-y-5 text-sm ${className}`} style={{ fontFamily: DT.fontSans }}>
            {/* Header with status badge */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm">
                        <Terminal className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                                Model Context Protocol (MCP)
                            </h4>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Aktiv
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Local MCP Server / AI Agent Bridge
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Setup / Config Generator */}
            <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        Quick Setup (Claude Desktop &amp; Cursor)
                    </label>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 border border-gray-200/80 dark:border-zinc-700 transition-colors shadow-sm cursor-pointer"
                        title="In die Zwischenablage kopieren"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-emerald-600 dark:text-emerald-400">Kopiert!</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                <span>Konfiguration kopieren</span>
                            </>
                        )}
                    </button>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 bg-[#0d1117] text-zinc-100 p-3.5 font-mono text-xs shadow-inner">
                    <pre className="overflow-x-auto text-slate-200 leading-relaxed scrollbar-thin">
                        <code>{MCP_CONFIG_JSON}</code>
                    </pre>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Füge diesen Block in deine <code className="text-gray-700 dark:text-zinc-300 font-mono">claude_desktop_config.json</code> oder Cursor MCP-Einstellungen ein.
                </p>
            </div>

            {/* Features overview & settings */}
            <div className="space-y-2.5 pt-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Agenten-Funktionen &amp; Editor-Integration
                </label>
                <div className="grid gap-2">
                    {/* Feature 1 */}
                    <div className="flex items-start justify-between p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-zinc-800/80">
                        <div className="flex items-start gap-2.5 pr-3">
                            <Eye className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            <div>
                                <h5 className="text-xs font-semibold text-gray-900 dark:text-white">
                                    Visuelle Zeilen-Markierung
                                </h5>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    Visuelle Zeilen-Markierung für KI-Lesen aktiv
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setVisualHighlighting(!visualHighlighting)}
                            aria-label="Visuelle Zeilen-Markierung umschalten"
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                                visualHighlighting ? 'bg-blue-600' : 'bg-gray-300 dark:bg-zinc-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                                    visualHighlighting ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>

                    {/* Feature 2 */}
                    <div className="flex items-start justify-between p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-zinc-800/80">
                        <div className="flex items-start gap-2.5 pr-3">
                            <Cpu className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                            <div>
                                <h5 className="text-xs font-semibold text-gray-900 dark:text-white">
                                    Block-ID Adressierung
                                </h5>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    Block-ID Adressierung (#blk_xxx) im Editor aktiv
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setBlockIdAddressing(!blockIdAddressing)}
                            aria-label="Block-ID Adressierung umschalten"
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                                blockIdAddressing ? 'bg-blue-600' : 'bg-gray-300 dark:bg-zinc-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                                    blockIdAddressing ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>

                    {/* Feature 3 */}
                    <div className="flex items-start justify-between p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-zinc-800/80">
                        <div className="flex items-start gap-2.5 pr-3">
                            <Share2 className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                            <div>
                                <h5 className="text-xs font-semibold text-gray-900 dark:text-white">
                                    Abschnitt-Sharing
                                </h5>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    Gezieltes Senden selektierter Abschnitte an KI-Agenten
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setTargetedSend(!targetedSend)}
                            aria-label="Gezieltes Senden selektierter Abschnitte umschalten"
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                                targetedSend ? 'bg-blue-600' : 'bg-gray-300 dark:bg-zinc-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                                    targetedSend ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* Supported Tools List */}
            <div className="space-y-2.5 pt-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Verfügbare MCP Tools
                </label>
                <div className="flex flex-wrap gap-2">
                    {SUPPORTED_TOOLS.map((tool) => (
                        <div
                            key={tool.name}
                            title={tool.desc}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800/80 text-gray-800 dark:text-zinc-200 border border-gray-200 dark:border-zinc-700/60 hover:border-blue-400 dark:hover:border-blue-500/50 transition-colors shadow-xs"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            <code className="text-[11px] font-mono font-medium">{tool.name}</code>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default McpExtensionConfig;
