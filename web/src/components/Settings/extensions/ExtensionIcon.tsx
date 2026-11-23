import React from 'react';
import { Bookmark, Briefcase, Calculator, FileText, Flame, ListTodo, MessageSquare, Puzzle, Smartphone, Sparkles, Terminal } from 'lucide-react';

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
    mcp: Terminal,
    varsheet: Calculator,
};

export function ExtensionIcon({ id, className }: { id: string; className?: string }) {
    const Icon = ICONS[id] ?? Puzzle;
    return <Icon className={className} />;
}
