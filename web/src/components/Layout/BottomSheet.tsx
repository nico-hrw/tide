// web/src/components/Layout/BottomSheet.tsx
"use client";

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapHeight?: string;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapHeight = '90vh',
}: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — TODO(dark): already neutral, works in dark mode */}
          <motion.div
            key="bs-backdrop"
            className="fixed inset-0 z-[400] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet — TODO(dark): add dark:bg-gray-900 */}
          <motion.div
            key="bs-sheet"
            role="dialog"
            aria-modal="true"
            className="fixed bottom-0 left-0 right-0 z-[401] bg-white rounded-t-[28px] flex flex-col overflow-hidden"
            style={{ maxHeight: snapHeight }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          >
            {/* Drag handle — TODO(dark): dark:bg-gray-700 */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Optional title */}
            {title && (
              <div className="px-6 pt-3 pb-2 shrink-0">
                {/* TODO(dark): dark:text-gray-100 */}
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              </div>
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
