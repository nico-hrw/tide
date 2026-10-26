import React, { useState, useEffect } from 'react';
import {
    Globe,
    Tablet,
    Check,
    ChevronDown,
    ChevronUp,
    Share,
    Plus,
    Sparkles,
    Download
} from 'lucide-react';
import APIAccessSettings from '../APIAccessSettings';

export interface SyncCloudTabProps {
    view?: 'all' | 'access' | 'info';
}

export const SyncCloudTab: React.FC<SyncCloudTabProps> = ({ view = 'all' }) => {
    const [isIOSDevice, setIsIOSDevice] = useState(false);
    const [isIPadDevice, setIsIPadDevice] = useState(false);
    const [isStandaloneApp, setIsStandaloneApp] = useState(false);
    const [showInstallGuide, setShowInstallGuide] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
            const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const ipad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsIOSDevice(ios);
            setIsIPadDevice(ipad);
            const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean((navigator as { standalone?: boolean }).standalone));
            setIsStandaloneApp(standalone);
        }
    }, []);

    const renderInfoSection = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-center p-8">
                <div className="text-center">
                    <div className="w-16 h-16 bg-[#111827] dark:bg-zinc-800 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg transform rotate-3">
                        <Globe className="text-white w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">inside tide</h2>
                    <p className="text-gray-500 text-sm mt-1">E2E Encrypted Knowledge & Collaboration</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Web Client</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">v1.2.0-alpha</div>
                </div>
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cloud Node</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">Go v1.3 Core</div>
                </div>
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Database</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">SQLite 3</div>
                </div>
            </div>

            {/* iPad / Tablet / Device Installation Helper */}
            <div className="rounded-2xl border border-gray-100 dark:border-white/10 bg-gray-50/70 dark:bg-white/5 overflow-hidden transition-all shadow-xs">
                <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                            <Tablet className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                    {isIPadDevice ? 'App auf iPad installieren' : 'App auf iPad / Gerät installieren'}
                                </h3>
                                {isStandaloneApp && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tracking-wide flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        Als App installiert
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {isIPadDevice
                                    ? 'Perfekt für iPad im Querformat (Landscape) mit Tastatur & Vollbild'
                                    : 'Installiere Tide als eigenständige App für schnellen Zugriff & Vollbildmodus'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowInstallGuide((prev) => !prev)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 border border-gray-200/80 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-zinc-700/80 shadow-xs transition-colors shrink-0"
                    >
                        <span>{showInstallGuide ? 'Anleitung schließen' : 'Anleitung anzeigen'}</span>
                        {showInstallGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {showInstallGuide && (
                    <div className="px-5 pb-5 pt-1 border-t border-gray-200/50 dark:border-white/5 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        {isIOSDevice ? (
                            <div className="space-y-3 pt-2">
                                <div className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                    <span>Installation via Safari (iPad / iPhone)</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/5 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">1</span>
                                            <Share className="w-3.5 h-3.5" />
                                            <span>Schritt 1</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            Tippe in Safari oben rechts bzw. unten auf das <strong className="text-gray-900 dark:text-white font-semibold">Teilen-Symbol</strong> (Viereck mit Pfeil nach oben).
                                        </p>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/5 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">2</span>
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Schritt 2</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            Scrolle in der Aktionsliste nach unten und wähle <strong className="text-gray-900 dark:text-white font-semibold">&quot;Zum Home-Bildschirm&quot;</strong> (+).
                                        </p>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/5 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">3</span>
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Schritt 3</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            Tippe oben rechts auf <strong className="text-gray-900 dark:text-white font-semibold">&quot;Hinzufügen&quot;</strong>. Die App erscheint als eigenständige Vollbild-App auf deinem Home-Bildschirm.
                                        </p>
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2.5">
                                    <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
                                    <span>
                                        <strong>Landscape-Support:</strong> Tide passt sich nahtlos an die Ausrichtung deines iPads an – ideal auf Magic Keyboard Docks oder im Ständer.
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 pt-2">
                                <div className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                    <span>PWA Installation (Browser & Desktop)</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/5 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">1</span>
                                            <Download className="w-3.5 h-3.5" />
                                            <span>Schritt 1</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            Klicke in deinem Browser auf das Installations-Symbol in der Adressleiste oder öffne das Menü (⋮ oder …).
                                        </p>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/5 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">2</span>
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Schritt 2</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            Wähle im Menü <strong className="text-gray-900 dark:text-white font-semibold">&quot;App installieren&quot;</strong> bzw. <strong className="text-gray-900 dark:text-white font-semibold">&quot;Tide installieren&quot;</strong>.
                                        </p>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/5 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                                            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-[11px] font-bold">3</span>
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Schritt 3</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                            Bestätige die Installation. Tide öffnet sich ab sofort als eigenständige Vollbild-App.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="text-center text-xs text-gray-400 mt-8 pt-8 border-t border-gray-100 dark:border-white/5">
                © {new Date().getFullYear()} tide. All rights reserved.
            </div>
        </div>
    );

    if (view === 'access') {
        return <APIAccessSettings />;
    }

    if (view === 'info') {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {renderInfoSection()}
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <APIAccessSettings />
            <div className="pt-8 border-t border-gray-100 dark:border-white/5">
                {renderInfoSection()}
            </div>
        </div>
    );
};

export default SyncCloudTab;
