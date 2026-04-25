export function extractTimeFromText(text: string): { title: string; startMins: number | null; endMins: number | null } {
    // Regex matches formats like "14:00", "14.30", "14 Uhr", "2 pm", "2:30pm"
    // Capture groups: 1=hours, 2=minutes, 3=meridian, 4="Uhr"
    const timeRegex = /\b([0-1]?[0-9]|2[0-3])(?:[:.]([0-5][0-9]))?\s*(am|pm|a\.m\.|p\.m\.|uhr)?\b/gi;
    
    let match;
    const times: { startIdx: number, endIdx: number, mins: number }[] = [];
    
    while ((match = timeRegex.exec(text)) !== null) {
        let hours = parseInt(match[1], 10);
        let minutes = match[2] ? parseInt(match[2], 10) : 0;
        const meridian = match[3]?.toLowerCase();

        // Handle AM/PM
        if (meridian && meridian.includes('p') && hours < 12) hours += 12;
        if (meridian && meridian.includes('a') && hours === 12) hours = 0;

        // "Uhr" implies 24h, no change needed usually unless we want to enforce logic

        times.push({
            startIdx: match.index,
            endIdx: match.index + match[0].length,
            mins: hours * 60 + minutes
        });

        // Limit to 2 times
        if (times.length === 2) break;
    }

    let startMins: number | null = null;
    let endMins: number | null = null;
    let title = text;

    if (times.length > 0) {
        startMins = times[0].mins;
        
        if (times.length === 2) {
            if (times[1].mins > times[0].mins) {
                endMins = times[1].mins;
            } else {
                // Not chronologically after, ignore second time
                endMins = startMins + 60;
                times.pop(); // Remove from extraction so it stays in title
            }
        } else {
            endMins = startMins + 60;
        }

        // Remove the matched times from the text to form the title
        // Go backwards to not mess up indices
        for (let i = times.length - 1; i >= 0; i--) {
            const t = times[i];
            title = title.substring(0, t.startIdx) + title.substring(t.endIdx);
        }
        
        // Clean up extra spaces, dashes, commas that might be left over
        title = title.replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return { title: title || 'New Event', startMins, endMins };
}
