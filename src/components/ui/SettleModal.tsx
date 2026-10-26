'use client';

import React, { useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motionTransitions } from '../../lib/motion-tokens';

export interface SettleModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer area (typically action buttons) */
  footer?: React.ReactNode;
  /** Hide the close (X) button in the top-right */
  hideCloseButton?: boolean;
  /** Click on backdrop closes the modal (default true) */
  closeOnBackdrop?: boolean;
  /** Maximum width of the modal (Tailwind class) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  className?: string;
  contentClassName?: string;
}

const sizeMap: Record<NonNullable<SettleModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  full: 'max-w-[95vw]',
};

/**
 * SettleModal — Content has a tiny scale + settle instead of a generic fade.
 *
 * The panel scales from 0.94 -> 1.02 -> 1.0 (with a slight y travel), then the
 * inner content crossfades in with a tiny 0.98 -> 1.0 scale-up, so the
 * perceived motion is "settle" rather than "fade in".
 */
export const SettleModal: React.FC<SettleModalProps> = ({
  open,
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  hideCloseButton = false,
  closeOnBackdrop = true,
  size = 'md',
  className,
  contentClassName,
}) => {
  const isModalOpen = open ?? isOpen ?? false;
  const titleId = useId();

  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isModalOpen, onClose]);

  return (
    <AnimatePresence>
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          aria-labelledby={title ? titleId : undefined}
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop fades in softly */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionTransitions.easeSoft}
            onClick={() => closeOnBackdrop && onClose()}
          />

          {/* Panel: scale + slight overshoot for the "settle" feel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{
              opacity: 1,
              scale: [0.94, 1.02, 1],
              y: 0,
            }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{
              duration: 0.42,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={cn(
              'relative w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xl p-6 sm:p-8 focus:outline-none max-h-[92vh] overflow-y-auto select-none',
              sizeMap[size],
              className
            )}
          >
            {!hideCloseButton && (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus-ring cursor-pointer z-10"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Inner content does its own tiny scale/settle — a layer deeper than the panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.99, y: 2 }}
              transition={{
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.05,
              }}
              className={contentClassName}
            >
              {title && (
                <h2
                  id={titleId}
                  className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 pr-8"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">{description}</p>
              )}

              {children && <div className={cn(title || description ? 'mt-5' : '')}>{children}</div>}

              {footer && <div className="mt-6 flex justify-end gap-2.5 pt-4 border-t border-zinc-100 dark:border-zinc-800">{footer}</div>}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
