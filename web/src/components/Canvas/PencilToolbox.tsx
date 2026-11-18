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
                title="Zeichenwerkzeuge öffnen"
                aria-label="Zeichenwerkzeuge öffnen"
                className={`${FLOAT} fixed right-4 z-[110] flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-t2-ink active:scale-95 transition-transform`}
                style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
            >
                <Pencil size={16} className={mode === 'draw' ? 'text-t2-blue' : ''} />
                Stift
                {strokeCount > 0 && <span className="rounded-full bg-t2-sub px-1.5 text-[11px] text-t2-ink-2">{strokeCount}</span>}
            </button>
        );
    }

    return (
        <div
            role="toolbar"
            aria-label="Zeichenwerkzeuge"
            onPointerDown={(e) => e.stopPropagation()}
            className={`${FLOAT} fixed left-1/2 z-[120] flex max-w-[96vw] -translate-x-1/2 items-center gap-1 rounded-[18px] p-1.5 text-t2-ink select-none`}
            style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
            {/* Mode: handwriting converted to text vs. free drawing */}
            <div className="flex items-center gap-0.5 rounded-[12px] bg-t2-sub p-0.5">
                <button
                    type="button"
                    onClick={() => onModeChange('text')}
                    title="Schreiben: Handschrift wird zu Text"
                    aria-pressed={mode === 'text'}
                    className={`${TOUCH} rounded-[10px] ${mode === 'text' ? ACTIVE : IDLE}`}
                >
                    <Type size={17} />
                </button>
                <button
                    type="button"
                    onClick={() => onModeChange('draw')}
                    title="Zeichnen: Freihand auf der Notiz"
                    aria-pressed={mode === 'draw'}
                    className={`${TOUCH} rounded-[10px] ${mode === 'draw' ? ACTIVE : IDLE}`}
                >
                    <Pencil size={17} />
                </button>
            </div>

            <Divider />

            <div className="flex items-center gap-0.5">
                {DRAWING_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isSelected = mode === 'draw' && activeTool === tool.id;
                    return (
                        <button
                            key={tool.id}
                            type="button"
                            onClick={() => handleSelectDrawingTool(tool.id)}
                            title={tool.title}
                            aria-pressed={isSelected}
                            className={`${TOUCH} rounded-[12px] ${isSelected ? ACTIVE : IDLE}`}
                        >
                            <Icon size={17} />
                        </button>
                    );
                })}
            </div>

            <Divider />

            <div className="flex items-center">
                {COLOR_PRESETS.map((preset) => {
                    const isCurrentColor = strokeColor.toLowerCase() === preset.value.toLowerCase();
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleSelectColor(preset.value)}
                            title={`Farbe: ${preset.label}`}
                            aria-pressed={isCurrentColor}
                            className="flex h-9 w-8 items-center justify-center"
                        >
                            <span
                                className="block h-[18px] w-[18px] rounded-full transition-transform"
                                style={{
                                    backgroundColor: preset.value,
                                    transform: isCurrentColor ? 'scale(1.15)' : 'scale(1)',
                                    boxShadow: isCurrentColor
                                        ? '0 0 0 2px var(--t2-surface), 0 0 0 3.5px var(--t2-ink)'
                                        : 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                                }}
                            />
                        </button>
                    );
                })}
            </div>

            <Divider />

            <div className="flex items-center">
                {SIZE_PRESETS.map((preset) => {
                    const isCurrentSize = strokeSize === preset.value;
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleSelectSize(preset.value)}
                            title={`Strichstärke: ${preset.label}`}
                            aria-pressed={isCurrentSize}
                            className={`flex h-10 w-9 items-center justify-center rounded-[12px] ${isCurrentSize ? 'bg-t2-sub' : 'hover:bg-t2-hover'}`}
                        >
                            <span
                                className="block rounded-full bg-t2-ink"
                                style={{ width: preset.dotSize, height: preset.dotSize, opacity: isCurrentSize ? 1 : 0.55 }}
                            />
                        </button>
                    );
                })}
            </div>

            <Divider />

            <div className="flex items-center gap-0.5">
                <button type="button" onClick={onUndo} disabled={!canUndo} title="Rückgängig" aria-label="Rückgängig" className={`${TOUCH} rounded-[12px] ${IDLE} disabled:opacity-30 disabled:hover:bg-transparent`}>
                    <Undo2 size={17} />
                </button>
                <button type="button" onClick={onRedo} disabled={!canRedo} title="Wiederholen" aria-label="Wiederholen" className={`${TOUCH} rounded-[12px] ${IDLE} disabled:opacity-30 disabled:hover:bg-transparent`}>
                    <Redo2 size={17} />
                </button>

                {selectedCount > 0 && (
                    <button
                        type="button"
                        onClick={onDeleteSelected}
                        title={`Auswahl löschen (${selectedCount})`}
                        className="flex h-10 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-medium text-t2-now hover:bg-t2-hover"
                    >
                        <Trash2 size={15} />
                        {selectedCount}
                    </button>
                )}

                <button type="button" onClick={() => setIsMinimized(true)} title="Leiste minimieren" aria-label="Leiste minimieren" className={`${TOUCH} rounded-[12px] text-t2-ink-3 hover:bg-t2-hover`}>
                    <ChevronDown size={17} />
                </button>
            </div>
        </div>
    );
};

// Shared look: solid surface with a hairline ring, no blur, so it stays smooth while drawing.
const FLOAT = 'bg-t2-surface shadow-[0_0_0_1px_var(--t2-line),0_10px_30px_rgba(0,0,0,0.10)]';
// 40px touch targets for the Pencil and fingers.
const TOUCH = 'flex h-10 w-10 items-center justify-center transition-colors';
const ACTIVE = 'bg-t2-ink text-t2-bg';
const IDLE = 'text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink';

function Divider() {
    return <div className="mx-1 h-6 w-px bg-t2-line" />;
}

export default PencilToolbox;
