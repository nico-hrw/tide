"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  className?: string;
  bodyClassName?: string;
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'max-w-[520px]',
  className = '',
  bodyClassName = '',
  showCloseButton = true,
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isMounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#111827]/20"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
        >
          <motion.div
            key="modal-container"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidth} max-h-[calc(100vh-64px)] flex flex-col bg-white dark:bg-[#18181b] rounded-[24px] border border-[#e5e7eb] dark:border-zinc-800 shadow-[0px_24px_64px_rgba(17,24,39,0.16)] overflow-hidden ${className}`.trim()}
          >
            {(title || description || showCloseButton) && (
              <div
                className={`flex justify-between gap-4 p-6 sm:p-8 pb-4 shrink-0 ${
                  description ? 'items-start' : 'items-center'
                }`}
              >
                <div className="min-w-0 flex-1">
                  {title && (
                    typeof title === 'string' ? (
                      <h2
                        id="modal-title"
                        className="text-2xl font-semibold leading-9 text-[#111827] dark:text-white"
                      >
                        {title}
                      </h2>
                    ) : (
                      <div id="modal-title">{title}</div>
                    )
                  )}
                  {description && (
                    typeof description === 'string' ? (
                      <p
                        id="modal-description"
                        className="text-base leading-6 text-[#596170] dark:text-zinc-400 mt-1"
                      >
                        {description}
                      </p>
                    ) : (
                      <div id="modal-description">{description}</div>
                    )
                  )}
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="h-[44px] w-[44px] shrink-0 rounded-[12px] bg-[#f9fafb] hover:bg-[#f3f4f6] dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center transition-colors text-[#111827] dark:text-zinc-200 cursor-pointer"
                  >
                    <X size={20} strokeWidth={1.7} />
                  </button>
                )}
              </div>
            )}

            <div className={`px-6 sm:px-8 py-4 overflow-y-auto flex-1 ${bodyClassName}`.trim()}>
              {children}
            </div>

            {footer && (
              <div className="px-6 sm:px-8 pt-4 pb-6 sm:pb-8 flex items-center justify-end gap-3 border-t border-[#e5e7eb] dark:border-zinc-800/60 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
