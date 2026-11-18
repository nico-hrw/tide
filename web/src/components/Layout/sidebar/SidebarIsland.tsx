"use client";

import DesktopIsland from "@/components/island/DesktopIsland";

interface SidebarIslandProps {
    selectedDate?: Date;
    onSelect?: (date: Date) => void;
}

/**
 * Smart Island der Seitenleiste (Desktop): ein Quadrat unten links mit dem Monatsraster.
 * Die Karte wächst aus dem Quadrat über die Seitenleisten-Grenze (Portal in DesktopIsland).
 */
export default function SidebarIsland({ selectedDate, onSelect }: SidebarIslandProps) {
    return (
        <div className="flex-none p-3">
            <DesktopIsland slotClassName="block aspect-square w-full" selectedDate={selectedDate} onSelectDate={onSelect} />
        </div>
    );
}
