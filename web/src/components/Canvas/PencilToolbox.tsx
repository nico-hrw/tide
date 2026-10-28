'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Pen,
    Highlighter,
    Eraser,
    Lasso,
    Type,
    Undo2,
    Redo2,
    Trash2,
    ChevronDown,
    Pencil,
} from 'lucide-react';
import { DT } from '@/lib/designTokens';
import type { InkToolType, PencilInputMode } from '@/components/extensions/PencilInkExtension';

export interface PencilToolboxProps {
    mode: PencilInputMode;
    onModeChange: (mode: PencilInputMode) => void;
    activeTool: InkToolType;
    onToolChange: (tool: InkToolType) => void;
    strokeColor: string;
    onColorChange: (color: string) => void;
    strokeSize: number;
    onSizeChange: (size: number) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    selectedCount: number;
    onDeleteSelected: () => void;
    strokeCount: number;
}

interface ToolDefinition {
    id: InkToolType;
    label: string;
    title: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
}

const DRAWING_TOOLS: ToolDefinition[] = [
    {
        id: 'pen',
        label: 'Stift',
        title: 'Kugelschreiber',
        icon: Pen,
    },
    {
        id: 'marker',
        label: 'Marker',
        title: 'Marker',
        icon: Highlighter,
    },
    {
        id: 'eraser',
        label: 'Radierer',
        title: 'Radierer',
        icon: Eraser,
    },
    {
        id: 'select',
        label: 'Auswahl',
        title: 'Auswahl (Umranden zum Bewegen)',
        icon: Lasso,
    },
];

const COLOR_PRESETS: Array<{ value: string; label: string }> = [
    { value: DT.foreground, label: 'Schwarz' },
    { value: DT.accent, label: 'Blau' },
    { value: DT.danger, label: 'Rot' },
    { value: DT.status.success.fg, label: 'Grün' },
    { value: DT.status.warning.fg, label: 'Gelb / Orange' },
    { value: DT.borderControl, label: 'Schiefergrau' },
];

const SIZE_PRESETS: Array<{ value: number; dotSize: number; label: string }> = [
    { value: 2, dotSize: 5, label: 'Fein (2px)' },
    { value: 4, dotSize: 8, label: 'Mittel (4px)' },
    { value: 7, dotSize: 12, label: 'Breit (7px)' },
];

function detectIPadOrTablet(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return (
        navigator.maxTouchPoints > 1 &&
        /Macintosh|iPad/i.test(navigator.userAgent)
    );
}

export const PencilToolbox: React.FC<PencilToolboxProps> = ({
    mode,
    onModeChange,
    activeTool,
    onToolChange,
    strokeColor,
    onColorChange,
    strokeSize,
    onSizeChange,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    selectedCount,
    onDeleteSelected,
    strokeCount,
}) => {
    const [isTabletOrPenDetected, setIsTabletOrPenDetected] = useState<boolean>(() =>
        detectIPadOrTablet()
    );
    const [manuallyOpened, setManuallyOpened] = useState<boolean>(false);
    const [isMinimized, setIsMinimized] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleResize = () => {
            if (detectIPadOrTablet()) {
                setIsTabletOrPenDetected(true);
            }
        };

        const handlePointerEvent = (e: PointerEvent) => {
            if (e.pointerType === 'pen') {
                setIsTabletOrPenDetected((prev) => {
                    if (!prev) {
                        setIsMinimized(false);
                    }
                    return true;
                });
            }
        };

        const handleToggleEvent = () => {
            if (isTabletOrPenDetected) {
                setIsMinimized((prev) => !prev);
            } else {
                setManuallyOpened((prev) => {
                    if (!prev) {
                        setIsMinimized(false);
                        return true;
                    }
                    setIsMinimized((m) => !m);
                    return true;
                });
            }
        };

        window.addEventListener('resize', handleResize, { passive: true });
        window.addEventListener('pointerdown', handlePointerEvent, { passive: true });
        window.addEventListener('pointermove', handlePointerEvent, { passive: true });
        window.addEventListener('tide:toggle-pencil-toolbox', handleToggleEvent);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('pointerdown', handlePointerEvent);
            window.removeEventListener('pointermove', handlePointerEvent);
            window.removeEventListener('tide:toggle-pencil-toolbox', handleToggleEvent);
        };
    }, []);

    const handleSelectDrawingTool = useCallback(
        (tool: InkToolType) => {
            if (mode !== 'draw') {
                onModeChange('draw');
            }
            onToolChange(tool);
        },
        [mode, onModeChange, onToolChange]
    );

    const handleSelectColor = useCallback(
        (color: string) => {
            if (mode !== 'draw') {
                onModeChange('draw');
            }
            if (activeTool === 'eraser' || activeTool === 'select') {
                onToolChange('pen');
            }
            onColorChange(color);
        },
        [mode, activeTool, onModeChange, onToolChange, onColorChange]
    );

    const handleSelectSize = useCallback(
        (size: number) => {
            if (mode !== 'draw') {
                onModeChange('draw');
            }
            onSizeChange(size);
        },
        [mode, onModeChange, onSizeChange]
    );

    const isVisible = isTabletOrPenDetected || manuallyOpened;
    if (!isVisible) {
        return null;
    }

    if (isMinimized) {
        return (
            <button
                type="button"
                onClick={() => {
                    setManuallyOpened(true);
                    setIsMinimized(false);
                }}
                title="Apple Pencil & Zeichenwerkzeuge öffnen"
                className="fixed bottom-4 right-4 z-[110] flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-transform active:scale-95 shadow-sm"
                style={{
                    backgroundColor: 'var(--surface-card, var(--sidebar-bg))',
                    backdropFilter: 'blur(' + DT.blur + ')',
                    WebkitBackdropFilter: 'blur(' + DT.blur + ')',
                    borderRadius: DT.radius,
                    boxShadow: DT.shadowFloat,
                    border: '1px solid var(--border-color)',
                    color: 'var(--foreground)',
                }}
            >
                <Pencil size={14} style={{ color: mode === 'draw' ? DT.accent : undefined }} />
                <span>Pencil</span>
                {strokeCount > 0 && (
                    <span
                        className="px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                            borderRadius: DT.radiusSm,
                            backgroundColor: DT.status.info.bg,
                            color: DT.foreground,
                        }}
                    >
                        {strokeCount}
                    </span>
                )}
            </button>
        );
    }

    return (
        <div
            role="toolbar"
            aria-label="Apple Pencil und Zeichen-Werkzeugleiste"
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] flex flex-wrap items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 max-w-[96vw] select-none"
            style={{
                backgroundColor: 'var(--surface-card, var(--sidebar-bg))',
                backdropFilter: 'blur(' + DT.blur + ')',
                WebkitBackdropFilter: 'blur(' + DT.blur + ')',
                borderRadius: DT.cardRadius,
                boxShadow: DT.shadowFloat,
                border: '1px solid var(--border-color)',
                color: 'var(--foreground)',
            }}
        >
            {/* Left: Mode Switcher (Scribble Text vs Freehand Draw) */}
            <div
                className="flex items-center p-0.5"
                style={{
                    backgroundColor: 'var(--sidebar-bg)',
                    borderRadius: DT.radius,
                    border: '1px solid var(--border-color)',
                }}
            >
                <button
                    type="button"
                    onClick={() => onModeChange('text')}
                    title="Text (Scribble) — Handschrift wird automatisch in Text umgewandelt"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                        borderRadius: DT.radiusSm,
                        backgroundColor: mode === 'text' ? DT.accent : 'transparent',
                        color: mode === 'text' ? '#ffffff' : 'var(--foreground)',
                    }}
                >
                    <Type size={14} />
                    <span className="hidden sm:inline">Text (Scribble)</span>
                </button>
                <button
                    type="button"
                    onClick={() => onModeChange('draw')}
                    title="Malen / Schreiben — Freihand-Skizzen & Handschrift auf der Notiz"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                        borderRadius: DT.radiusSm,
                        backgroundColor: mode === 'draw' ? DT.accent : 'transparent',
                        color: mode === 'draw' ? '#ffffff' : 'var(--foreground)',
                    }}
                >
                    <Pencil size={14} />
                    <span className="hidden sm:inline">Malen / Schreiben</span>
                </button>
            </div>

            <div className="h-5 w-px" style={{ backgroundColor: 'var(--border-color)' }} />

            {/* Center: Drawing Tools (Pen, Marker, Eraser, Lasso Select) */}
            <div className="flex items-center gap-1">
                {DRAWING_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isSelected = mode === 'draw' && activeTool === tool.id;
                    return (
                        <button
                            key={tool.id}
                            type="button"
                            onClick={() => handleSelectDrawingTool(tool.id)}
                            title={tool.title}
                            className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 transition-all"
                            style={{
                                borderRadius: DT.radius,
                                backgroundColor: isSelected ? DT.accent : 'transparent',
                                color: isSelected ? '#ffffff' : 'var(--foreground)',
                            }}
                        >
                            <Icon size={15} />
                        </button>
                    );
                })}
            </div>

            <div className="h-5 w-px" style={{ backgroundColor: 'var(--border-color)' }} />

            {/* Right: Color Presets, Stroke Thickness, Undo/Redo, Selection Delete, Minimize */}
            <div className="flex items-center gap-1.5">
                {COLOR_PRESETS.map((preset) => {
                    const isCurrentColor =
                        strokeColor.toLowerCase() === preset.value.toLowerCase();
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleSelectColor(preset.value)}
                            title={`Farbe: ${preset.label}`}
                            className="w-5 h-5 rounded-full flex items-center justify-center transition-transform"
                            style={{
                                backgroundColor: preset.value,
                                transform: isCurrentColor ? 'scale(1.18)' : 'scale(1)',
                                boxShadow: isCurrentColor
                                    ? `0 0 0 2px var(--background), 0 0 0 3.5px ${DT.accent}`
                                    : `inset 0 0 0 1px ${DT.modal.scrim}`,
                            }}
                        />
                    );
                })}
            </div>

            <div className="h-5 w-px" style={{ backgroundColor: 'var(--border-color)' }} />

            {/* 3 Stroke Thickness Presets */}
            <div className="flex items-center gap-1">
                {SIZE_PRESETS.map((preset) => {
                    const isCurrentSize = strokeSize === preset.value;
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleSelectSize(preset.value)}
                            title={`Strichstärke: ${preset.label}`}
                            className="w-7 h-7 flex items-center justify-center transition-colors"
                            style={{
                                borderRadius: DT.radius,
                                backgroundColor: isCurrentSize
                                    ? 'var(--sidebar-bg)'
                                    : 'transparent',
                                border: isCurrentSize
                                    ? `1px solid ${DT.accent}`
                                    : '1px solid transparent',
                            }}
                        >
                            <span
                                className="rounded-full"
                                style={{
                                    width: `${preset.dotSize}px`,
                                    height: `${preset.dotSize}px`,
                                    backgroundColor: 'var(--foreground)',
                                    display: 'block',
                                }}
                            />
                        </button>
                    );
                })}
            </div>

            <div className="h-5 w-px" style={{ backgroundColor: 'var(--border-color)' }} />

            {/* Undo / Redo / Selection Delete / Minimize */}
            <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Rückgängig"
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center transition-opacity disabled:opacity-35"
                    style={{ borderRadius: DT.radius }}
                >
                    <Undo2 size={15} />
                </button>
                <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Wiederholen"
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center transition-opacity disabled:opacity-35"
                    style={{ borderRadius: DT.radius }}
                >
                    <Redo2 size={15} />
                </button>

                {selectedCount > 0 && (
                    <button
                        type="button"
                        onClick={onDeleteSelected}
                        title={`Ausgewählte Elemente löschen (${selectedCount})`}
                        className="flex items-center gap-1 px-2 h-7 sm:h-8 text-xs font-medium transition-opacity hover:opacity-90"
                        style={{
                            borderRadius: DT.radius,
                            backgroundColor: DT.status.danger.bg,
                            color: DT.status.danger.fg,
                        }}
                    >
                        <Trash2 size={13} />
                        <span>{selectedCount}</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setIsMinimized(true)}
                    title="Werkzeugleiste minimieren"
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
                    style={{ borderRadius: DT.radius }}
                >
                    <ChevronDown size={15} />
                </button>
            </div>
        </div>
    );
};

export default PencilToolbox;
