import React from "react";

/** Fixed layout (start hour, length in hours, left %, width %) so the placeholder never jumps. */
const BARS = [
    { startHour: 9, hours: 1.5, left: 6, width: 82 },
    { startHour: 13, hours: 1, left: 6, width: 60 },
    { startHour: 16, hours: 2, left: 6, width: 74 },
] as const;

/** Pulsing grey bars shown in a day column while events have not been loaded yet. */
export const DayEventsSkeleton: React.FC<{ hourHeight: number }> = ({ hourHeight }) => (
    <div className="absolute inset-0 pointer-events-none z-[5]" aria-hidden="true">
        {BARS.map((bar, i) => (
            <div
                key={i}
                className="absolute animate-pulse bg-[var(--hover-bg)] rounded-[var(--radius)]"
                style={{
                    top: bar.startHour * hourHeight,
                    height: bar.hours * hourHeight - 4,
                    left: `${bar.left}%`,
                    width: `${bar.width}%`,
                }}
            />
        ))}
    </div>
);

export default DayEventsSkeleton;
