import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { NoteLayout } from '@/store/slices/types';
import { DEFAULT_PAGE, resolvePage, type SettingsPageId } from './settingsPages';
import { SettingsNav } from './SettingsNav';
import { cx } from './ui/cx';
import { useT, useTDynamic } from './useT';
import { AccountPage } from './pages/AccountPage';
import { AppearancePage } from './pages/AppearancePage';
import { CalendarPage } from './pages/CalendarPage';
import { NotesPage } from './pages/NotesPage';
import { TodosPage } from './pages/TodosPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { ExtensionsPage } from './pages/ExtensionsPage';
import { AccessPage } from './pages/AccessPage';
import { AboutPage } from './pages/AboutPage';
import type { ProfileUser } from './account/ProfileSections';
import type { CalendarGroup } from './calendar/CalendarGroupsSection';

/** Akzeptiert auch die alten Tab-Ids ('info', 'debug'), die auf neue Seiten abgebildet werden. */
type SettingsTabId = SettingsPageId | 'info' | 'debug';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: SettingsTabId;
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    userProfile?: ProfileUser;
    onLogout?: () => void;
    noteLayout?: NoteLayout;
    onSetNoteLayout?: (layout: NoteLayout) => void;
    groups?: CalendarGroup[];
    hiddenGroupIds?: string[];
    onToggleGroupVisibility?: (id: string) => void;
    onUpdateGroup?: (id: string, updates: Partial<CalendarGroup>) => void;
    onShareGroup?: (e: React.MouseEvent, id: string) => void;
    onDeleteGroup?: (e: React.MouseEvent, id: string) => void;
    onDeleteGroupEvents?: (id: string) => void;
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
}

type MobileView = 'list' | 'page';

/**
 * Aeusserer Rahmen: der Inhalt wird nur eingehaengt, solange das Modal offen ist, und bei
 * einem anderen Sprung (initialTab) neu aufgebaut. So startet der Zustand immer sauber.
 */
export default function SettingsModal(props: SettingsModalProps) {
    if (!props.isOpen) return null;
    return <SettingsModalBody key={props.initialTab ?? DEFAULT_PAGE} {...props} />;
}

function SettingsModalBody({
    onClose,
    initialTab,
    enabledExtensions,
    onToggleExtension,
    userProfile,
    onLogout,
    noteLayout = 'normal',
    onSetNoteLayout,
    groups = [],
    hiddenGroupIds = [],
    onToggleGroupVisibility,
    onUpdateGroup,
    onShareGroup,
    onDeleteGroup,
    onDeleteGroupEvents,
    onCreateGroup,
}: SettingsModalProps) {
    const t = useT();
    const td = useTDynamic();
    const [page, setPage] = useState<SettingsPageId>(resolvePage(initialTab));
    const [subpage, setSubpage] = useState<string | null>(null);
    // Schmale Breite: erst die Liste, dann die Unterseite. Ein ausdruecklicher Sprung (nicht "account") oeffnet direkt die Seite.
    const [mobileView, setMobileView] = useState<MobileView>(initialTab && initialTab !== DEFAULT_PAGE ? 'page' : 'list');

    // Beim Seitenwechsel wieder nach oben springen
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [page, subpage]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const select = (p: SettingsPageId) => {
        setPage(p);
        setSubpage(null);
        setMobileView('page');
    };

    const topTitle = mobileView === 'page' ? (subpage ? td(`ext.${subpage}.title`) : t(`nav.${page}`)) : t('title');
    const mobileBack = () => {
        if (subpage) setSubpage(null);
        else setMobileView('list');
    };

    return (
        <div className="pointer-events-none fixed inset-0 z-[1000] flex items-center justify-center sm:p-6">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="pointer-events-auto absolute inset-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--t2-ink) 20%, transparent)' }}
            />

            <motion.div
                initial={{ scale: 0.97, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                role="dialog"
                aria-modal="true"
                aria-label={t('title')}
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto relative flex h-full w-full max-w-[1060px] overflow-hidden bg-t2-bg text-[14px] leading-[1.45] text-t2-ink shadow-modal ring-1 ring-t2-line sm:h-[min(760px,92vh)] sm:rounded-modal"
            >
                {/* Liste der Gruppen */}
                <aside className={cx('min-h-0 w-full shrink-0 flex-col gap-2.5 overflow-y-auto bg-t2-sub px-4 py-[18px] sm:flex sm:w-[240px] sm:px-2.5 sm:py-3.5', mobileView === 'page' ? 'hidden' : 'flex')}>
                    <div className="flex items-center justify-between sm:block">
                        <h1 className="px-1 py-1.5 text-[28px] font-semibold tracking-[-0.02em] sm:px-2.5 sm:pb-0 sm:pt-1 sm:text-[17px]">{t('title')}</h1>
                        <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-ui p-2 text-t2-ink-2 hover:bg-t2-hover sm:hidden">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <SettingsNav active={page} onSelect={select} />
                </aside>

                {/* Seite */}
                <div className={cx('relative min-h-0 min-w-0 flex-1 flex-col sm:flex', mobileView === 'list' ? 'hidden' : 'flex')}>
                    <div className="sticky top-0 z-10 flex min-h-[48px] items-center border-b border-t2-line-soft bg-t2-bg px-1.5 sm:hidden">
                        <button type="button" onClick={mobileBack} className="flex items-center gap-0.5 rounded-ui px-2 py-1.5 font-medium text-t2-accent">
                            <ChevronLeft className="h-[15px] w-[15px]" aria-hidden />
                            {subpage ? t('nav.extensions') : t('title')}
                        </button>
                        <b className="pointer-events-none absolute left-1/2 max-w-[40%] -translate-x-1/2 truncate font-semibold">{topTitle}</b>
                        <button type="button" onClick={onClose} aria-label={t('common.close')} className="ml-auto rounded-ui p-2 text-t2-ink-2 hover:bg-t2-hover">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="absolute right-4 top-4 z-10 hidden h-9 w-9 items-center justify-center rounded-ui text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink sm:flex"
                    >
                        <X className="h-[18px] w-[18px]" />
                    </button>

                    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                        <div className="mx-auto max-w-[660px] px-5 pb-20 pt-[18px] sm:px-10 sm:pt-9">
                            {page === 'account' && <AccountPage userProfile={userProfile} onClose={onClose} onLogout={onLogout} />}
                            {page === 'appearance' && <AppearancePage />}
                            {page === 'calendar' && (
                                <CalendarPage
                                    groups={groups}
                                    hiddenGroupIds={hiddenGroupIds}
                                    onToggleGroupVisibility={onToggleGroupVisibility}
                                    onUpdateGroup={onUpdateGroup}
                                    onShareGroup={onShareGroup}
                                    onDeleteGroup={onDeleteGroup}
                                    onDeleteGroupEvents={onDeleteGroupEvents}
                                    onCreateGroup={onCreateGroup}
                                    enabledExtensions={enabledExtensions}
                                />
                            )}
                            {page === 'notes' && <NotesPage noteLayout={noteLayout} onSetNoteLayout={onSetNoteLayout} />}
                            {page === 'todos' && <TodosPage enabledExtensions={enabledExtensions} onToggleExtension={onToggleExtension} />}
                            {page === 'workspaces' && <WorkspacesPage />}
                            {page === 'extensions' && (
                                <ExtensionsPage
                                    enabledExtensions={enabledExtensions}
                                    onToggleExtension={onToggleExtension}
                                    groups={groups}
                                    subpage={subpage}
                                    onSubpage={setSubpage}
                                />
                            )}
                            {page === 'access' && <AccessPage />}
                            {page === 'about' && <AboutPage />}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
