import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiFetch } from '@/lib/api';
import type { MoodData, MoodType, SurveyResponseItem } from '@/types/surveys';

export interface SurveyState {
    responses: SurveyResponseItem[];
    isMoodTrackerEnabled: boolean;
    lastPromptSlot: string | null;
    isPopupOpen: boolean;
    isLoading: boolean;
    error: string | null;

    setMoodTrackerEnabled: (enabled: boolean) => void;
    setIsPopupOpen: (open: boolean) => void;
    fetchResponses: () => Promise<void>;
    addMoodResponse: (mood: MoodType, note?: string) => Promise<void>;
    deleteResponse: (id: string) => Promise<void>;
    checkShouldPrompt: () => boolean;
    dismissPrompt: () => void;
}

const MOOD_META: Record<MoodType, { score: number; label: string }> = {
    bad: { score: 1, label: 'Bad' },
    okay: { score: 2, label: 'Okay' },
    good: { score: 3, label: 'Good' },
};

export function getCurrentSlotIdentifier(now: Date = new Date()): string | null {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    let slotIndex: number | null = null;
    // Slot 0: 07:00 - 11:00
    if (totalMinutes >= 7 * 60 && totalMinutes < 11 * 60) {
        slotIndex = 0;
    } else if (totalMinutes >= 11 * 60 && totalMinutes < 15 * 60) {
        // Slot 1: 11:00 - 15:00
        slotIndex = 1;
    } else if (totalMinutes >= 15 * 60 && totalMinutes < 19 * 60) {
        // Slot 2: 15:00 - 19:00
        slotIndex = 2;
    } else if (totalMinutes >= 19 * 60 && totalMinutes <= 23 * 60 + 30) {
        // Slot 3: 19:00 - 23:30
        slotIndex = 3;
    }

    if (slotIndex === null) {
        return null;
    }

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    return `${today}_slot_${slotIndex}`;
}

function parseItem(item: SurveyResponseItem): SurveyResponseItem {
    if (item.parsedData) {
        return item;
    }
    if (typeof item.data === 'string') {
        try {
            const parsed = JSON.parse(item.data) as MoodData;
            return {
                ...item,
                parsedData: parsed,
            };
        } catch {
            return item;
        }
    }
    return item;
}

export const useSurveyStore = create<SurveyState>()(
    persist(
        (set, get) => ({
            responses: [],
            isMoodTrackerEnabled: true,
            lastPromptSlot: null,
            isPopupOpen: false,
            isLoading: false,
            error: null,

            setMoodTrackerEnabled: (enabled: boolean) => {
                set({ isMoodTrackerEnabled: enabled });
            },

            setIsPopupOpen: (open: boolean) => {
                set({ isPopupOpen: open });
            },

            fetchResponses: async () => {
                set({ isLoading: true, error: null });
                try {
                    const res = await apiFetch('/api/v1/surveys/responses?survey_id=mood_tracker');
                    if (res.ok) {
                        const raw = await res.json();
                        let items: SurveyResponseItem[] = [];
                        if (Array.isArray(raw)) {
                            items = raw;
                        } else if (raw && Array.isArray(raw.responses)) {
                            items = raw.responses;
                        } else if (raw && Array.isArray(raw.data)) {
                            items = raw.data;
                        }

                        const parsedServerItems = items.map(parseItem);
                        const localItems = get().responses;

                        // Merge by ID, server items taking precedence while keeping unique local items
                        const mergedMap = new Map<string, SurveyResponseItem>();
                        for (const item of localItems) {
                            mergedMap.set(item.id, parseItem(item));
                        }
                        for (const item of parsedServerItems) {
                            mergedMap.set(item.id, item);
                        }

                        const merged = Array.from(mergedMap.values()).sort(
                            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        );

                        set({ responses: merged, isLoading: false });
                        return;
                    }
                    // Non-ok response fallback to local
                    set({ isLoading: false });
                } catch (err) {
                    console.warn('[useSurveyStore] Failed to fetch responses from server, fallback to local:', err);
                    set({
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Failed to fetch responses',
                    });
                }
            },

            addMoodResponse: async (mood: MoodType, note?: string) => {
                const now = new Date();
                const currentSlot = getCurrentSlotIdentifier(now);
                const meta = MOOD_META[mood];
                const moodData: MoodData = {
                    mood,
                    score: meta ? meta.score : 2,
                    label: meta ? meta.label : mood,
                    ...(note?.trim() ? { note: note.trim() } : {}),
                };

                const newId =
                    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                        ? crypto.randomUUID()
                        : `resp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

                const newResponse: SurveyResponseItem = {
                    id: newId,
                    survey_id: 'mood_tracker',
                    data: JSON.stringify(moodData),
                    created_at: now.toISOString(),
                    updated_at: now.toISOString(),
                    parsedData: moodData,
                };

                // Optimistic local update
                set((state) => ({
                    responses: [newResponse, ...state.responses.filter((r) => r.id !== newId)],
                    lastPromptSlot: currentSlot ?? state.lastPromptSlot,
                    isPopupOpen: false,
                }));

                try {
                    await apiFetch('/api/v1/surveys/responses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: newResponse.id,
                            survey_id: newResponse.survey_id,
                            data: newResponse.data,
                            created_at: newResponse.created_at,
                        }),
                    });
                } catch (err) {
                    console.warn('[useSurveyStore] Failed to sync mood response to server:', err);
                }
            },

            deleteResponse: async (id: string) => {
                set((state) => ({
                    responses: state.responses.filter((r) => r.id !== id),
                }));

                try {
                    await apiFetch(`/api/v1/surveys/responses/${id}`, {
                        method: 'DELETE',
                    });
                } catch (err) {
                    console.warn('[useSurveyStore] Failed to delete survey response on server:', err);
                }
            },

            checkShouldPrompt: () => {
                const { isMoodTrackerEnabled, lastPromptSlot } = get();
                if (!isMoodTrackerEnabled) {
                    return false;
                }

                const currentSlot = getCurrentSlotIdentifier();
                if (!currentSlot) {
                    return false;
                }

                return lastPromptSlot !== currentSlot;
            },

            dismissPrompt: () => {
                const currentSlot = getCurrentSlotIdentifier();
                set((state) => ({
                    isPopupOpen: false,
                    lastPromptSlot: currentSlot ?? state.lastPromptSlot,
                }));
            },
        }),
        {
            name: 'tide_surveys_store',
            partialize: (state) => ({
                responses: state.responses,
                isMoodTrackerEnabled: state.isMoodTrackerEnabled,
                lastPromptSlot: state.lastPromptSlot,
            }),
        }
    )
);
