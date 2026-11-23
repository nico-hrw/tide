export const BACKUP_TIERS = [
    { name: "10 minutes", minAgeMs: 10 * 60 * 1000 },
    { name: "30 minutes", minAgeMs: 30 * 60 * 1000 },
    { name: "1 hour", minAgeMs: 60 * 60 * 1000 },
    { name: "1 day", minAgeMs: 24 * 60 * 60 * 1000 },
    { name: "2 days", minAgeMs: 2 * 24 * 60 * 60 * 1000 },
    { name: "1 week", minAgeMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type BackupSlotName = (typeof BACKUP_TIERS)[number]["name"];

export interface BackupSlotMeta {
    slotName: BackupSlotName;
    updatedAtMs: number;
}

export type BackupCascadeAction =
    | { type: "promote"; fromSlot: BackupSlotName; toSlot: BackupSlotName; updatedAtMs: number }
    | { type: "write"; toSlot: BackupSlotName; contentString: string; updatedAtMs: number };

export function isBackupSlotName(name: string): name is BackupSlotName {
    return BACKUP_TIERS.some((tier) => tier.name === name);
}

function canonicalStringify(value: unknown, isTopLevel: boolean): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalStringify(item, false)).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
        .filter((key) => !(isTopLevel && key === "__yjs"))
        .sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key], false)}`);
    return `{${entries.join(",")}}`;
}

export function areSnapshotsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) {
        return false;
    }
    if (a === b) {
        return true;
    }
    try {
        const parsedA: unknown = JSON.parse(a);
        const parsedB: unknown = JSON.parse(b);
        return canonicalStringify(parsedA, true) === canonicalStringify(parsedB, true);
    } catch {
        return a.trim() === b.trim();
    }
}

function clampTimestamp(ts: number | null | undefined, nowMs: number): number {
    if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
        return Math.min(ts, nowMs);
    }
    return nowMs;
}

export function chooseArchiveCandidate(params: {
    previousContent: string | null;
    previousCapturedAtMs: number | null;
    currentContent: string;
    hasExistingBackups: boolean;
    nowMs: number;
}): { contentString: string; capturedAtMs: number } | null {
    const { previousContent, previousCapturedAtMs, currentContent, hasExistingBackups, nowMs } = params;

    if (
        previousContent !== null &&
        previousContent.trim().length > 0 &&
        !areSnapshotsEquivalent(previousContent, currentContent)
    ) {
        return {
            contentString: previousContent,
            capturedAtMs: clampTimestamp(previousCapturedAtMs, nowMs),
        };
    }

    if (!hasExistingBackups && currentContent.trim().length > 0) {
        // First ever save of a note: store an initial baseline snapshot so subsequent edits can diff against it.
        return {
            contentString: currentContent,
            capturedAtMs: nowMs,
        };
    }

    return null;
}

export function planBackupCascade(params: {
    existingSlots: Partial<Record<BackupSlotName, BackupSlotMeta>>;
    newestSlotContent: string | null;
    incomingContent: string;
    incomingCapturedAtMs: number;
    nowMs: number;
}): BackupCascadeAction[] {
    const { existingSlots, newestSlotContent, incomingContent, incomingCapturedAtMs, nowMs } = params;

    if (!incomingContent || incomingContent.trim().length === 0) {
        return [];
    }

    if (newestSlotContent !== null && areSnapshotsEquivalent(newestSlotContent, incomingContent)) {
        return [];
    }

    const writeTs = clampTimestamp(incomingCapturedAtMs, nowMs);
    const slot0 = existingSlots["10 minutes"];

    if (!slot0) {
        return [{ type: "write", toSlot: "10 minutes", contentString: incomingContent, updatedAtMs: writeTs }];
    }

    if (nowMs - slot0.updatedAtMs < BACKUP_TIERS[0].minAgeMs) {
        return [];
    }

    const promotions: Array<{ type: "promote"; fromSlot: BackupSlotName; toSlot: BackupSlotName; updatedAtMs: number }> = [];
    for (let k = 1; k < BACKUP_TIERS.length; k++) {
        const fromTier = BACKUP_TIERS[k - 1];
        const toTier = BACKUP_TIERS[k];
        const fromMeta = existingSlots[fromTier.name];
        if (!fromMeta) {
            break;
        }
        const toMeta = existingSlots[toTier.name];
        if (!toMeta) {
            promotions.push({
                type: "promote",
                fromSlot: fromTier.name,
                toSlot: toTier.name,
                updatedAtMs: fromMeta.updatedAtMs,
            });
            break;
        }
        if (nowMs - toMeta.updatedAtMs < toTier.minAgeMs) {
            // toMeta is still fresh for its tier; preserve it and stop cascading.
            break;
        }
        promotions.push({
            type: "promote",
            fromSlot: fromTier.name,
            toSlot: toTier.name,
            updatedAtMs: fromMeta.updatedAtMs,
        });
    }

    return [
        ...promotions.reverse(),
        { type: "write", toSlot: "10 minutes", contentString: incomingContent, updatedAtMs: writeTs },
    ];
}
