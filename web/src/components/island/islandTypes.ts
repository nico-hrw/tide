import type { ParseResult } from '@/lib/dateParser';

/** Payload der Island-Ansicht `event_suggestion` (Datumserkennung im Editor, siehe useDateDetection). */
export interface EventSuggestionPayload {
    parseResult: ParseResult;
    blockId: string;
    onAccept: (final: { title: string; start: Date; end: Date }) => void;
    onDismiss: () => void;
}
