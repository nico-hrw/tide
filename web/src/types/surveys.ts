export type MoodType = 'bad' | 'okay' | 'good';

export interface MoodData {
    mood: MoodType;
    score: number;
    label: string;
    note?: string;
}

export interface SurveyResponseItem {
    id: string;
    user_id?: string;
    survey_id: string;
    data: string;
    created_at: string;
    updated_at?: string;
    parsedData?: MoodData;
}

export interface SurveyConfig {
    moodTrackerEnabled: boolean;
    dailyPromptsCount: number;
    lastPromptSlot?: string;
}
