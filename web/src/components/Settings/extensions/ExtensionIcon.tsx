import React from 'react';
import { Bookmark, Briefcase, FileText, Flame, ListTodo, MessageSquare, Puzzle, Smartphone, Smile, Sparkles, Terminal } from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    todos: ListTodo,
    job_planner: Briefcase,
    messenger: MessageSquare,
    summary: Flame,
    smart_island: Sparkles,
    smart_date_detection: Sparkles,
    references: Bookmark,
    mobile_connection: Smartphone,
    file_support: FileText,
    surveys: Smile,
    mcp: Terminal,
};

export function ExtensionIcon({ id, className }: { id: string; className?: string }) {
    const Icon = ICONS[id] ?? Puzzle;
    return <Icon className={className} />;
}
