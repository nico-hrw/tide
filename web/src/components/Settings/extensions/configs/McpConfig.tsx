import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { SettingsBlock, SettingsCard, SettingsRow, SettingsSection } from '../../ui/SettingsLayout';
import { Button, StatusPill, Toggle } from '../../ui/Controls';
import { useT } from '../../useT';

const MCP_CONFIG_JSON = JSON.stringify({ mcpServers: { tide: { command: 'tide-daemon', args: ['mcp'] } } }, null, 2);

const MCP_TOOLS: ReadonlyArray<{ name: string; descKey: 'mcp.tool.search' | 'mcp.tool.outline' | 'mcp.tool.block' | 'mcp.tool.focused' | 'mcp.tool.patch' | 'mcp.tool.todos' }> = [
    { name: 'tide_search', descKey: 'mcp.tool.search' },
    { name: 'tide_get_note_outline', descKey: 'mcp.tool.outline' },
    { name: 'tide_get_block', descKey: 'mcp.tool.block' },
    { name: 'tide_get_focused_blocks', descKey: 'mcp.tool.focused' },
    { name: 'tide_patch_block', descKey: 'mcp.tool.patch' },
    { name: 'tide_list_todos', descKey: 'mcp.tool.todos' },
];

async function copyText(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
    }
}

export function McpConfig() {
    const t = useT();
    const [copied, setCopied] = useState(false);
    // Die drei Schalter waren bisher reiner lokaler Zustand (ohne Speicherung); das Verhalten bleibt gleich.
    const [highlighting, setHighlighting] = useState(true);
    const [blockIds, setBlockIds] = useState(true);
    const [targetedSend, setTargetedSend] = useState(true);

    const handleCopy = async () => {
        await copyText(MCP_CONFIG_JSON);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <SettingsSection title={t('mcp.setup')} hint={t('mcp.setupHint')}>
                <SettingsCard>
                    <SettingsBlock>
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <b className="block font-medium text-t2-ink">{t('mcp.config')}</b>
                                <small className="text-[12.5px] text-t2-ink-3">{t('mcp.configDesc')}</small>
                            </div>
                            <StatusPill>{t('ext.statusOn')}</StatusPill>
                        </div>
                        <div className="relative">
                            <pre className="overflow-x-auto rounded-card bg-t2-sub px-4 py-3.5 font-mono text-[12.5px] leading-[1.6] text-t2-ink ring-1 ring-t2-line">
                                <code>{MCP_CONFIG_JSON}</code>
                            </pre>
                            <Button className="absolute right-2 top-2" onClick={handleCopy} icon={copied ? <Check className="h-[15px] w-[15px]" /> : <Copy className="h-[15px] w-[15px]" />}>
                                {copied ? t('common.copied') : t('common.copy')}
                            </Button>
                        </div>
                    </SettingsBlock>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('mcp.features')} hint={t('mcp.featuresHint')}>
                <SettingsCard>
                    <SettingsRow title={t('mcp.highlight')} description={t('mcp.highlightDesc')}>
                        <Toggle checked={highlighting} onChange={setHighlighting} label={t('mcp.highlight')} />
                    </SettingsRow>
                    <SettingsRow title={t('mcp.blockIds')} description={t('mcp.blockIdsDesc')}>
                        <Toggle checked={blockIds} onChange={setBlockIds} label={t('mcp.blockIds')} />
                    </SettingsRow>
                    <SettingsRow title={t('mcp.targeted')} description={t('mcp.targetedDesc')}>
                        <Toggle checked={targetedSend} onChange={setTargetedSend} label={t('mcp.targeted')} />
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('mcp.tools')} hint={t('mcp.toolsHint')}>
                <SettingsCard>
                    {MCP_TOOLS.map((tool) => (
                        <div key={tool.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                            <code className="whitespace-nowrap font-mono text-[12.5px] text-t2-ink">{tool.name}</code>
                            <span className="text-[13px] text-t2-ink-3">{t(tool.descKey)}</span>
                        </div>
                    ))}
                </SettingsCard>
            </SettingsSection>
        </>
    );
}
