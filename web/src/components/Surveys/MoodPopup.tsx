'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { useSurveyStore } from '@/store/useSurveyStore';
import type { MoodType } from '@/types/surveys';

interface SparkItem {
  id: number;
  tx: string;
  ty: string;
  size: string;
  color: string;
}

interface MoodOption {
  type: MoodType;
  label: string;
}

const MOOD_OPTIONS: MoodOption[] = [
  { type: 'bad', label: 'Schlecht' },
  { type: 'okay', label: 'Okay' },
  { type: 'good', label: 'Super' },
];

const HIGHLIGHT_CLASSES: Record<MoodType, { card: string; text: string }> = {
  bad: {
    card: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    text: 'text-rose-600 dark:text-rose-400',
  },
  okay: {
    card: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    text: 'text-amber-600 dark:text-amber-400',
  },
  good: {
    card: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
};

export const MoodPopup: React.FC = () => {
  const {
    isPopupOpen,
    isMoodTrackerEnabled,
    checkShouldPrompt,
    setIsPopupOpen,
    dismissPrompt,
    addMoodResponse,
  } = useSurveyStore();

  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [sparks, setSparks] = useState<SparkItem[]>([]);

  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Periodic prompt check (on mount and every 60s)
  useEffect(() => {
    if (!isMoodTrackerEnabled) return;

    const check = () => {
      if (checkShouldPrompt()) {
        setIsPopupOpen(true);
      }
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [isMoodTrackerEnabled, checkShouldPrompt, setIsPopupOpen]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
    };
  }, []);

  const handleSelectMood = (mood: MoodType, label: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSelectedMood(mood);
    setFeedbackText(`„${label}“ gespeichert ✓`);

    const palettes: Record<MoodType, string[]> = {
      bad: ['#38BDF8', '#FB7185', '#FBBF24', '#93C5FD'],
      okay: ['#FACC15', '#FB923C', '#A3E635', '#FDE047'],
      good: ['#34D399', '#FBBF24', '#F43F5E', '#60A5FA', '#A78BFA'],
    };

    const colors = palettes[mood];
    const newSparks: SparkItem[] = [];
    const sparkCount = 12;

    for (let i = 0; i < sparkCount; i++) {
      const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.3;
      const distance = 1.6 + Math.random() * 1.1; // rem
      const tx = (Math.cos(angle) * distance).toFixed(2);
      const ty = (Math.sin(angle) * distance).toFixed(2);
      const size = (0.25 + Math.random() * 0.22).toFixed(2);

      newSparks.push({
        id: i,
        tx: `${tx}rem`,
        ty: `${ty}rem`,
        size: `${size}rem`,
        color: colors[i % colors.length],
      });
    }
    setSparks(newSparks);

    // After 300ms: show feedback banner & persist response
    feedbackTimeoutRef.current = setTimeout(() => {
      setShowFeedback(true);
      void addMoodResponse(mood);
    }, 300);

    // After 1200ms: close popup smoothly
    hideTimeoutRef.current = setTimeout(() => {
      setIsDismissed(true);
      cleanupTimeoutRef.current = setTimeout(() => {
        setIsPopupOpen(false);
        setIsSubmitting(false);
        setIsDismissed(false);
        setShowFeedback(false);
        setSelectedMood(null);
        setSparks([]);
      }, 350);
    }, 1200);
  };

  const handleDismiss = () => {
    if (isDismissed) return;
    setIsDismissed(true);
    cleanupTimeoutRef.current = setTimeout(() => {
      dismissPrompt();
      setIsDismissed(false);
      setIsSubmitting(false);
      setShowFeedback(false);
      setSelectedMood(null);
      setSparks([]);
    }, 350);
  };

  if (!isPopupOpen && !isSubmitting && !isDismissed) {
    return null;
  }

  return (
    <>
      <style>{`
        .mood-card {
          transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                      transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .mood-card.dismissed {
          opacity: 0;
          transform: scale(0.95);
          pointer-events: none;
        }

        .mood-emoji-btn {
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
                      background-color 0.25s ease,
                      border-color 0.25s ease,
                      opacity 0.25s ease;
        }

        .mood-emoji-btn:active {
          transform: scale(0.94);
        }

        @keyframes sadSway {
          0% { transform: scale(1) rotate(0deg) translateY(0); }
          20% { transform: scale(1.16) rotate(-11deg) translateY(0.1rem); }
          45% { transform: scale(1.14) rotate(9deg) translateY(0.15rem); }
          70% { transform: scale(1.12) rotate(-6deg) translateY(0.1rem); }
          100% { transform: scale(1.08) rotate(0deg) translateY(0); }
        }
        @keyframes tearDrop {
          0% { opacity: 0; transform: translateY(-0.15rem) scale(0.5); }
          25% { opacity: 1; transform: translateY(0.05rem) scale(1.05); }
          80% { opacity: 0.95; transform: translateY(0.45rem) scale(0.95); }
          100% { opacity: 0; transform: translateY(0.65rem) scale(0.7); }
        }
        @keyframes sadBrowLeft {
          0%, 100% { transform: rotate(0deg); }
          40% { transform: rotate(-12deg) translateY(0.06rem); }
        }
        @keyframes sadBrowRight {
          0%, 100% { transform: rotate(0deg); }
          40% { transform: rotate(12deg) translateY(0.06rem); }
        }

        @keyframes neutralTilt {
          0% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.16) rotate(-9deg); }
          55% { transform: scale(1.15) rotate(9deg); }
          80% { transform: scale(1.10) rotate(-3deg); }
          100% { transform: scale(1.08) rotate(0deg); }
        }
        @keyframes neutralEyesLook {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2.6px); }
          60% { transform: translateX(2.6px); }
        }
        @keyframes neutralMouthWobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-6deg); }
          60% { transform: rotate(6deg); }
        }

        @keyframes happyBounce {
          0% { transform: translateY(0) scale(1, 1); }
          20% { transform: translateY(0.15rem) scale(1.12, 0.88); }
          45% { transform: translateY(-0.45rem) scale(0.96, 1.18); }
          70% { transform: translateY(0.05rem) scale(1.12, 0.94); }
          88% { transform: translateY(-0.15rem) scale(1.06, 1.10); }
          100% { transform: translateY(0) scale(1.08, 1.08); }
        }
        @keyframes happyCheeks {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          45% { opacity: 0.95; transform: scale(1.28); }
        }

        @keyframes sparkBurst {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) translate(0, 0) scale(0.35);
          }
          70% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) scale(1.15);
          }
        }

        .mood-spark {
          position: absolute;
          top: 50%;
          left: 50%;
          pointer-events: none;
          border-radius: 9999px;
          animation: sparkBurst 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Desktop PC: Hover micro-animations */
        @media (hover: hover) and (pointer: fine) {
          .mood-emoji-btn[data-mood="bad"]:not(.is-playing):hover .emoji-face {
            animation: sadSway 1.05s cubic-bezier(0.34, 1.4, 0.64, 1) infinite;
            transform-origin: center center;
          }
          .mood-emoji-btn[data-mood="bad"]:not(.is-playing):hover .sad-tear {
            animation: tearDrop 1.05s ease-in infinite;
          }
          .mood-emoji-btn[data-mood="bad"]:not(.is-playing):hover .sad-brow-l {
            animation: sadBrowLeft 1.05s ease-in-out infinite;
            transform-origin: 20px 21px;
          }
          .mood-emoji-btn[data-mood="bad"]:not(.is-playing):hover .sad-brow-r {
            animation: sadBrowRight 1.05s ease-in-out infinite;
            transform-origin: 36px 21px;
          }

          .mood-emoji-btn[data-mood="okay"]:not(.is-playing):hover .emoji-face {
            animation: neutralTilt 1.05s cubic-bezier(0.34, 1.4, 0.64, 1) infinite;
            transform-origin: center center;
          }
          .mood-emoji-btn[data-mood="okay"]:not(.is-playing):hover .neutral-eyes {
            animation: neutralEyesLook 1.05s ease-in-out infinite;
          }
          .mood-emoji-btn[data-mood="okay"]:not(.is-playing):hover .neutral-mouth {
            animation: neutralMouthWobble 1.05s ease-in-out infinite;
            transform-origin: 28px 36px;
          }

          .mood-emoji-btn[data-mood="good"]:not(.is-playing):hover .emoji-face {
            animation: happyBounce 1.0s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
            transform-origin: center bottom;
          }
          .mood-emoji-btn[data-mood="good"]:not(.is-playing):hover .happy-cheek {
            animation: happyCheeks 1.0s ease-in-out infinite;
            transform-origin: center center;
          }
        }

        /* Click / Tap Active Animation (.is-playing) on both Mobile & PC */
        .mood-emoji-btn[data-mood="bad"].is-playing .emoji-face {
          animation: sadSway 1.05s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
          transform-origin: center center;
        }
        .mood-emoji-btn[data-mood="bad"].is-playing .sad-tear {
          animation: tearDrop 1.05s ease-in forwards;
        }
        .mood-emoji-btn[data-mood="bad"].is-playing .sad-brow-l {
          animation: sadBrowLeft 1.05s ease-in-out forwards;
          transform-origin: 20px 21px;
        }
        .mood-emoji-btn[data-mood="bad"].is-playing .sad-brow-r {
          animation: sadBrowRight 1.05s ease-in-out forwards;
          transform-origin: 36px 21px;
        }

        .mood-emoji-btn[data-mood="okay"].is-playing .emoji-face {
          animation: neutralTilt 1.05s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
          transform-origin: center center;
        }
        .mood-emoji-btn[data-mood="okay"].is-playing .neutral-eyes {
          animation: neutralEyesLook 1.05s ease-in-out forwards;
        }
        .mood-emoji-btn[data-mood="okay"].is-playing .neutral-mouth {
          animation: neutralMouthWobble 1.05s ease-in-out forwards;
          transform-origin: 28px 36px;
        }

        .mood-emoji-btn[data-mood="good"].is-playing .emoji-face {
          animation: happyBounce 1.0s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          transform-origin: center bottom;
        }
        .mood-emoji-btn[data-mood="good"].is-playing .happy-cheek {
          animation: happyCheeks 1.0s ease-in-out forwards;
          transform-origin: center center;
        }
      `}</style>

      <aside
        role="dialog"
        aria-labelledby="moodQuestion"
        aria-modal="false"
        className={`mood-card fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 z-50 w-[calc(100%-2rem)] max-w-sm bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-neutral-200/90 dark:border-neutral-800 rounded-[1.75rem] shadow-2xl p-5 shadow-black/10 flex flex-col gap-3.5 select-none ${
          isDismissed ? 'dismissed' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h2
            id="moodQuestion"
            className="text-[0.95rem] sm:text-base font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            Wie geht es dir gerade?
          </h2>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Schließen"
            className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Mood Buttons */}
        <div className="grid grid-cols-3 gap-2.5">
          {MOOD_OPTIONS.map((mood) => {
            const isSelected = selectedMood === mood.type;
            const isOtherSelected = selectedMood !== null && !isSelected;

            let cardClasses = 'bg-neutral-50/95 dark:bg-neutral-800/80 border-neutral-100 dark:border-neutral-700/80';
            let labelClasses = 'text-neutral-600 dark:text-neutral-400';

            if (isSelected) {
              cardClasses = `${HIGHLIGHT_CLASSES[mood.type].card} is-playing`;
              labelClasses = HIGHLIGHT_CLASSES[mood.type].text;
            } else if (isOtherSelected) {
              cardClasses = `${cardClasses} opacity-40 scale-95 pointer-events-none`;
            }

            return (
              <button
                key={mood.type}
                type="button"
                data-mood={mood.type}
                data-label={mood.label}
                onClick={() => handleSelectMood(mood.type, mood.label)}
                disabled={isSubmitting}
                className={`mood-emoji-btn relative flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl border cursor-pointer ${cardClasses}`}
              >
                <div className="relative w-[3.25rem] h-[3.25rem] flex items-center justify-center">
                  {mood.type === 'bad' && (
                    <svg
                      className="emoji-face w-full h-full overflow-visible drop-shadow-sm"
                      viewBox="0 0 56 56"
                      fill="none"
                    >
                      <defs>
                        <radialGradient id="gradMoodSad" cx="35%" cy="30%" r="70%">
                          <stop offset="0%" stopColor="#FFE680" />
                          <stop offset="65%" stopColor="#FFC436" />
                          <stop offset="100%" stopColor="#F59E0B" />
                        </radialGradient>
                      </defs>
                      <circle cx="28" cy="28" r="23" fill="url(#gradMoodSad)" />
                      <path
                        className="sad-brow-l"
                        d="M15.5 22.5C17.5 20.5 20.5 20 23 20.5"
                        stroke="#78350F"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                      <path
                        className="sad-brow-r"
                        d="M40.5 22.5C38.5 20.5 35.5 20 33 20.5"
                        stroke="#78350F"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                      <ellipse cx="20" cy="26.5" rx="2.5" ry="3" fill="#451A03" />
                      <circle cx="19.2" cy="25.5" r="0.9" fill="#FFFFFF" />
                      <ellipse cx="36" cy="26.5" rx="2.5" ry="3" fill="#451A03" />
                      <circle cx="35.2" cy="25.5" r="0.9" fill="#FFFFFF" />
                      <path
                        d="M21 39.5C23.5 36.2 32.5 36.2 35 39.5"
                        stroke="#78350F"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                      />
                      <path
                        className="sad-tear opacity-0"
                        d="M39.5 30.5C39.5 30.5 42 34 42 35.6C42 37 40.9 38.1 39.5 38.1C38.1 38.1 37 37 37 35.6C37 34 39.5 30.5 39.5 30.5Z"
                        fill="#38BDF8"
                      />
                    </svg>
                  )}

                  {mood.type === 'okay' && (
                    <svg
                      className="emoji-face w-full h-full overflow-visible drop-shadow-sm"
                      viewBox="0 0 56 56"
                      fill="none"
                    >
                      <defs>
                        <radialGradient id="gradMoodOkay" cx="35%" cy="30%" r="70%">
                          <stop offset="0%" stopColor="#FFE885" />
                          <stop offset="65%" stopColor="#FACC15" />
                          <stop offset="100%" stopColor="#EAB308" />
                        </radialGradient>
                      </defs>
                      <circle cx="28" cy="28" r="23" fill="url(#gradMoodOkay)" />
                      <path d="M16.5 21.5H23" stroke="#78350F" strokeWidth="2.3" strokeLinecap="round" />
                      <path d="M33 21.5H39.5" stroke="#78350F" strokeWidth="2.3" strokeLinecap="round" />
                      <g className="neutral-eyes">
                        <circle cx="20" cy="26.5" r="2.7" fill="#451A03" />
                        <circle cx="19.2" cy="25.6" r="0.9" fill="#FFFFFF" />
                        <circle cx="36" cy="26.5" r="2.7" fill="#451A03" />
                        <circle cx="35.2" cy="25.6" r="0.9" fill="#FFFFFF" />
                      </g>
                      <path
                        className="neutral-mouth"
                        d="M21 36.5H35"
                        stroke="#78350F"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}

                  {mood.type === 'good' && (
                    <svg
                      className="emoji-face w-full h-full overflow-visible drop-shadow-sm"
                      viewBox="0 0 56 56"
                      fill="none"
                    >
                      <defs>
                        <radialGradient id="gradMoodGood" cx="35%" cy="28%" r="72%">
                          <stop offset="0%" stopColor="#FFF099" />
                          <stop offset="60%" stopColor="#FBBF24" />
                          <stop offset="100%" stopColor="#F59E0B" />
                        </radialGradient>
                      </defs>
                      <circle cx="28" cy="28" r="23" fill="url(#gradMoodGood)" />
                      <ellipse className="happy-cheek opacity-45" cx="14.5" cy="31" rx="3.8" ry="2.4" fill="#FB7185" />
                      <ellipse className="happy-cheek opacity-45" cx="41.5" cy="31" rx="3.8" ry="2.4" fill="#FB7185" />
                      <path
                        d="M16.5 25.5C17.8 22.5 22.2 22.5 23.5 25.5"
                        stroke="#451A03"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M32.5 25.5C33.8 22.5 38.2 22.5 39.5 25.5"
                        stroke="#451A03"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                      />
                      <path d="M18.5 32.5C20.5 39.5 35.5 39.5 37.5 32.5H18.5Z" fill="#78350F" />
                      <path
                        d="M21.5 36.2C24 38.2 32 38.2 34.5 36.2C33 34.8 23 34.8 21.5 36.2Z"
                        fill="#FB7185"
                      />
                    </svg>
                  )}

                  {/* Spark Particles */}
                  {isSelected && (
                    <div className="spark-container absolute inset-0 pointer-events-none">
                      {sparks.map((spark) => (
                        <span
                          key={spark.id}
                          className="mood-spark"
                          style={
                            {
                              '--tx': spark.tx,
                              '--ty': spark.ty,
                              width: spark.size,
                              height: spark.size,
                              backgroundColor: spark.color,
                            } as React.CSSProperties
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>

                <span className={`mood-label text-[0.75rem] font-bold transition-colors ${labelClasses}`}>
                  {mood.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Feedback Banner */}
        <div
          className={`items-center justify-center gap-1.5 pt-0.5 text-[0.8rem] font-extrabold text-emerald-600 dark:text-emerald-400 transition-opacity duration-300 ${
            showFeedback ? 'flex opacity-100' : 'hidden opacity-0'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{feedbackText}</span>
        </div>
      </aside>
    </>
  );
};
