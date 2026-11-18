import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SettingsBlock, SettingsRow } from '../ui/SettingsLayout';
import { Button, StatusPill } from '../ui/Controls';
import { useT } from '../useT';

interface DeviceInfo {
    ios: boolean;
    ipad: boolean;
    standalone: boolean;
}

function detectDevice(): DeviceInfo {
    const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return {
        ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || touchMac,
        ipad: /iPad/.test(navigator.userAgent) || touchMac,
        standalone:
            window.matchMedia('(display-mode: standalone)').matches ||
            ('standalone' in navigator && Boolean((navigator as { standalone?: boolean }).standalone)),
    };
}

/** Zeile + aufklappbare Anleitung, Tide als App zu installieren (iPad/iOS oder Browser/Desktop). */
export function InstallGuide() {
    const t = useT();
    // Nur im Browser gerendert (das Modal haengt erst nach dem Oeffnen ein), daher ist ein direkter Start moeglich.
    const [device] = useState<DeviceInfo>(() => (typeof window === 'undefined' ? { ios: false, ipad: false, standalone: false } : detectDevice()));
    const [open, setOpen] = useState(false);

    const steps = device.ios
        ? [t('install.ios1'), t('install.ios2'), t('install.ios3')]
        : [t('install.pwa1'), t('install.pwa2'), t('install.pwa3')];

    return (
        <>
            <SettingsRow
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        {device.ipad ? t('install.titleIpad') : t('install.title')}
                        {device.standalone && <StatusPill>{t('install.installed')}</StatusPill>}
                    </span>
                }
                description={device.ipad ? t('install.descIpad') : t('install.desc')}
            >
                <Button onClick={() => setOpen((v) => !v)} aria-expanded={open} icon={open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}>
                    {open ? t('install.hide') : t('install.show')}
                </Button>
            </SettingsRow>
            {open && (
                <SettingsBlock className="bg-t2-sub">
                    <b className="mb-3 block text-[12px] font-semibold uppercase tracking-[0.04em] text-t2-ink-3">
                        {device.ios ? t('install.headingIos') : t('install.headingPwa')}
                    </b>
                    <ol className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                        {steps.map((s, i) => (
                            <li key={i} className="flex gap-2.5 rounded-ui bg-t2-surface p-3 ring-1 ring-t2-line">
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-t2-sub text-[11px] font-semibold text-t2-ink-2">{i + 1}</span>
                                <span className="text-[13px] leading-relaxed text-t2-ink-2">{s}</span>
                            </li>
                        ))}
                    </ol>
                </SettingsBlock>
            )}
        </>
    );
}
