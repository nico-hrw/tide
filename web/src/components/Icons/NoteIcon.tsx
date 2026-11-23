import React from 'react';

interface NoteIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
    strokeWidth?: number;
}

/**
 * Tide's note icon: a soft rounded card with three lines of text. Same API as the lucide icons
 * (`size`, `className`, colour via `currentColor`), so it can replace `FileText` wherever a note is meant.
 */
export default function NoteIcon({ size = 16, strokeWidth = 1.7, className, ...rest }: NoteIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
            {...rest}
        >
            <rect x="4" y="3" width="16" height="18" rx="4.5" />
            <path d="M8.5 9h7" />
            <path d="M8.5 13h7" />
            <path d="M8.5 17h4" />
        </svg>
    );
}
