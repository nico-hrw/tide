import React, { useState } from 'react';
import { SettingsPageHeader } from '../ui/SettingsLayout';
import { useT } from '../useT';
import { ExtensionsList } from '../extensions/ExtensionsList';
import { ExtensionSubpage } from '../extensions/ExtensionSubpage';
import { findExtension } from '../extensions/extensionCatalog';
import { useExtensionSwitch } from '../extensions/useExtensionSwitch';
import { SmartIslandConfig } from '../extensions/configs/SmartIslandConfig';
import { McpConfig } from '../extensions/configs/McpConfig';
import { JobPlannerConfig } from '../extensions/configs/JobPlannerConfig';
import { ReferencesConfig } from '../extensions/configs/ReferencesConfig';
import { MobileConnectionConfig } from '../extensions/configs/MobileConnectionConfig';

export interface ExtensionsPageProps {
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    groups?: { id: string; title: string }[];
    /** Id der geoeffneten Unterseite (steuert das Modal, damit die mobile Leiste Bescheid weiss) */
    subpage: string | null;
    onSubpage: (id: string | null) => void;
}

export function ExtensionsPage({ enabledExtensions, onToggleExtension, groups = [], subpage, onSubpage }: ExtensionsPageProps) {
    const t = useT();
    const [query, setQuery] = useState('');
    const sw = useExtensionSwitch(onToggleExtension);

    const def = subpage ? findExtension(subpage) : undefined;
    if (subpage && def?.hasPage) {
        return (
            <ExtensionSubpage
                id={subpage}
                enabled={enabledExtensions.includes(subpage)}
                onToggle={sw.toggle}
                pendingOff={sw.pendingOff}
                onConfirmOff={sw.confirmOff}
                onCancelOff={sw.cancel}
                onBack={() => {
                    sw.cancel();
                    onSubpage(null);
                }}
            >
                {subpage === 'smart_island' && <SmartIslandConfig isSocialEnabled={enabledExtensions.includes('social')} />}
                {subpage === 'mcp' && <McpConfig />}
                {subpage === 'job_planner' && <JobPlannerConfig groups={groups} />}
                {subpage === 'references' && <ReferencesConfig />}
                {subpage === 'mobile_connection' && <MobileConnectionConfig />}
            </ExtensionSubpage>
        );
    }

    return (
        <div>
            <SettingsPageHeader title={t('nav.extensions')} lead={t('page.extensions.lead')} />
            <ExtensionsList
                enabled={enabledExtensions}
                query={query}
                onQueryChange={setQuery}
                onOpen={(id) => {
                    sw.cancel();
                    onSubpage(id);
                }}
                onToggle={sw.toggle}
                pendingOff={sw.pendingOff}
                onConfirmOff={sw.confirmOff}
                onCancelOff={sw.cancel}
            />
        </div>
    );
}
