import React from 'react';
import { useDataStore } from '@/store/useDataStore';
import type { NoteLayout } from '@/store/slices/types';
import { useAnimatedEmojiEnabled, setAnimatedEmojiEnabled } from '@/lib/animatedEmoji';
import { SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { SelectField, Toggle } from '../ui/Controls';
import { useT } from '../useT';
import { NoteGraphView } from '../notes/NoteGraphView';

export interface NotesPageProps {
    noteLayout?: NoteLayout;
    onSetNoteLayout?: (layout: NoteLayout) => void;
}

const LAYOUTS = ['a4', 'thin', 'normal', 'wide', 'extra-wide'] as const;

export function NotesPage({ noteLayout, onSetNoteLayout }: NotesPageProps) {
    const t = useT();
    const animatedEmoji = useAnimatedEmojiEnabled();
    const { eventMentionStyle, setEventMentionStyle, eventMentionPreview, setEventMentionPreview, graphAnimation, setGraphAnimation } = useDataStore();

    return (
        <div>
            <SettingsPageHeader title={t('nav.notes')} lead={t('page.notes.lead')} />
            <SettingsPage>
                <SettingsSection title={t('notes.editor')} hint={t('notes.editorHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('notes.layout')} description={t('notes.layoutDesc')}>
                            <SelectField<NoteLayout>
                                label={t('notes.layout')}
                                value={noteLayout ?? 'a4'}
                                onChange={(l) => onSetNoteLayout?.(l)}
                                options={LAYOUTS.map((l) => ({ value: l as NoteLayout, label: t(`notes.layout.${l}`) }))}
                            />
                        </SettingsRow>
                        <SettingsRow title={t('notes.emoji')} description={t('notes.emojiDesc')}>
                            <Toggle checked={animatedEmoji} onChange={setAnimatedEmojiEnabled} label={t('notes.emoji')} />
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('notes.events')} hint={t('notes.eventsHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('notes.eventStyle')} description={t('notes.eventStyleDesc')}>
                            <SelectField
                                label={t('notes.eventStyle')}
                                value={eventMentionStyle}
                                onChange={setEventMentionStyle}
                                options={[
                                    { value: 'calendar', label: t('notes.styleCalendar') },
                                    { value: 'blue', label: t('notes.styleUniform') },
                                ]}
                            />
                        </SettingsRow>
                        <SettingsRow title={t('notes.eventPreview')} description={t('notes.eventPreviewDesc')}>
                            <SelectField
                                label={t('notes.eventPreview')}
                                value={eventMentionPreview}
                                onChange={setEventMentionPreview}
                                options={[
                                    { value: 'always', label: t('notes.previewAlways') },
                                    { value: 'hover', label: t('notes.previewHover') },
                                    { value: 'off', label: t('notes.previewOff') },
                                ]}
                            />
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>
                <SettingsSection title={t('notes.graph')} hint={t('notes.graphHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('notes.graphAnimation')} description={t('notes.graphAnimationDesc')}>
                            <Toggle checked={graphAnimation} onChange={setGraphAnimation} label={t('notes.graphAnimation')} />
                        </SettingsRow>
                    </SettingsCard>
                    <NoteGraphView />
                </SettingsSection>
            </SettingsPage>
        </div>
    );
}
