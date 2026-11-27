import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useDataStore, type CalendarColorPalette } from '@/store/useDataStore';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';
import { useCalendarShareRules, useCalendarShareStore } from '@/store/useCalendarShareStore';
import { getPaletteCategories, resolveCategoryIndex } from '@/lib/calendarColors';
import type { SettingsPageId } from '../settingsPages';
import type { CalendarGroup } from '../calendar/CalendarGroupsSection';
import { CalendarShareDialog } from '../calendar/CalendarShareDialog';
import { TagSettingsRow, type TagDeleteOptions } from '../tags/TagSettingsRow';
import {
    SettingsCard,
    SettingsEmpty,
    SettingsLinkRow,
    SettingsPage,
    SettingsPageHeader,
    SettingsRow,
    SettingsSection,
} from '../ui/SettingsLayout';
import { Button, TextField, Toggle } from '../ui/Controls';
import { PaletteDropdown } from '../ui/PaletteDropdown';
import { useT } from '../useT';

export interface TagsPageProps {
    enabledExtensions?: string[];
    groups?: CalendarGroup[];
    hiddenGroupIds?: string[];
    onToggleGroupVisibility?: (id: string) => void;
    onUpdateGroup?: (id: string, updates: Partial<CalendarGroup>) => void;
    onDeleteGroup?: (e: React.MouseEvent, id: string) => void;
    onDeleteGroupWithOptions?: (id: string, options: TagDeleteOptions) => void;
    onDeleteGroupEvents?: (id: string) => void;
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
    onNavigate: (page: SettingsPageId) => void;
}

export function TagsPage({
    enabledExtensions = [],
    groups = [],
    hiddenGroupIds = [],
    onToggleGroupVisibility,
    onUpdateGroup,
    onDeleteGroup,
    onDeleteGroupWithOptions,
    onDeleteGroupEvents,
    onCreateGroup,
    onNavigate,
}: TagsPageProps) {
    const t = useT();
    const {
        calendarColorPalette,
        tagInheritCalendarPalette,
        setTagInheritCalendarPalette,
        tagColorPalette,
        setTagColorPalette,
        calendarTagColorOverrideIds,
        toggleCalendarTagColorOverride,
        hiddenTagIds,
        toggleHiddenTag,
    } = useDataStore();
    const plannerGroupId = useJobPlannerStore((s) => s.pluginGroupId);
    const rules = useCalendarShareRules();
    const [newName, setNewName] = useState('');
    const [shareGroupId, setShareGroupId] = useState<string | null>(null);

    useEffect(() => {
        void useCalendarShareStore.getState().load();
    }, []);

    const plannerActive = enabledExtensions.includes('job_planner');
    const protectedGroupId = plannerActive ? plannerGroupId : null;
    const activePalette = tagInheritCalendarPalette ? calendarColorPalette : tagColorPalette;
    const shareGroup = groups.find((g) => g.id === shareGroupId);
    const withShare = (g: CalendarGroup): CalendarGroup => ({ ...g, share: g.share ?? rules[g.id] });

    const handleTagPaletteChange = (palette: CalendarColorPalette) => {
        setTagColorPalette(palette);
        const targetColors = getPaletteCategories(palette);
        for (const g of groups) {
            const idx = resolveCategoryIndex(g.color);
            const nextHex = targetColors[idx]?.hex ?? targetColors[0].hex;
            onUpdateGroup?.(g.id, { color: nextHex });
        }
    };

    const create = async () => {
        if (!newName.trim() || !onCreateGroup) return;
        await onCreateGroup(newName.trim());
        setNewName('');
    };

    return (
        <div>
            <SettingsPageHeader title={t('nav.tags')} lead={t('page.tags.lead')} />
            <SettingsPage>
                <SettingsSection title={t('tags.colors')} hint={t('tags.colorsHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('tags.inheritCalendar')} description={t('tags.inheritCalendarDesc')}>
                            <Toggle
                                checked={tagInheritCalendarPalette}
                                onChange={setTagInheritCalendarPalette}
                                label={t('tags.inheritCalendar')}
                            />
                        </SettingsRow>
                        {tagInheritCalendarPalette ? (
                            <SettingsLinkRow title={t('tags.goToCalendar')} onClick={() => onNavigate('calendar')} />
                        ) : (
                            <SettingsRow title={t('tags.palette')} description={t('tags.paletteDesc')}>
                                <PaletteDropdown
                                    value={tagColorPalette}
                                    onChange={handleTagPaletteChange}
                                    ariaLabel={t('tags.palette')}
                                />
                            </SettingsRow>
                        )}
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('cal.groups')} hint={t('cal.groupsHint')}>
                    <SettingsCard>
                        {groups.length === 0 && <SettingsEmpty>{t('cal.noGroups')}</SettingsEmpty>}
                        {groups.map((g) => (
                            <TagSettingsRow
                                key={g.id}
                                group={withShare(g)}
                                activePalette={activePalette}
                                hidden={hiddenGroupIds.includes(g.id)}
                                isProtected={Boolean(protectedGroupId && g.id === protectedGroupId)}
                                colorOverride={calendarTagColorOverrideIds.includes(g.id)}
                                onToggleColorOverride={toggleCalendarTagColorOverride}
                                hiddenByDefault={hiddenTagIds.includes(g.id)}
                                onToggleHiddenByDefault={toggleHiddenTag}
                                onToggleVisibility={onToggleGroupVisibility}
                                onUpdate={onUpdateGroup}
                                onShare={(id) => setShareGroupId(id)}
                                onDelete={onDeleteGroup}
                                onDeleteWithOptions={onDeleteGroupWithOptions}
                                onDeleteEvents={onDeleteGroupEvents}
                            />
                        ))}
                        <SettingsRow title={t('cal.newGroup')} htmlFor="set-new-tag">
                            <TextField
                                id="set-new-tag"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && void create()}
                                placeholder={t('cal.newGroupPlaceholder')}
                            />
                            <Button
                                onClick={() => void create()}
                                disabled={!newName.trim()}
                                icon={<Plus className="h-[15px] w-[15px]" />}
                            >
                                {t('cal.createGroup')}
                            </Button>
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>
            </SettingsPage>

            {shareGroup && (
                <CalendarShareDialog
                    group={{ id: shareGroup.id, title: shareGroup.title }}
                    onClose={() => setShareGroupId(null)}
                />
            )}
        </div>
    );
}
