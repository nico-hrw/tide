'use client';

import React from 'react';
import type { IslandModel } from './useIslandModel';
import type { IslandText } from './islandText';
import IslandMonth from './IslandMonth';
import IslandCapture from './IslandCapture';
import { BellMark, DayView, NextView, NoticeView, RunningView } from './IslandViews';

export interface IslandBodyProps {
    model: IslandModel;
    text: IslandText;
    selectedDate?: Date;
    onSelectDate?: (d: Date) => void;
}

/** Der Inhalt zum aktuellen Zustand; beide Layouts (Desktop/Handy) zeigen dasselbe. */
export default function IslandBody({ model, text, selectedDate, onSelectDate }: IslandBodyProps) {
    switch (model.state) {
        case 'running':
            return <RunningView model={model} text={text} />;
        case 'next':
            return <NextView model={model} text={text} />;
        case 'day':
            return <DayView model={model} text={text} />;
        case 'capture':
            return <IslandCapture model={model} text={text} />;
        case 'notice':
            return model.noticeCollapsed ? <BellMark text={text} /> : <NoticeView model={model} text={text} />;
        default:
            return <IslandMonth model={model} selectedDate={selectedDate} onSelectDate={onSelectDate} />;
    }
}
