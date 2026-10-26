'use client';

import React, { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motionTransitions } from '../../lib/motion-tokens';

export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'success'
  | 'link'
  | 'gradient';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /** Visual presentation style */
  variant?: ButtonVariant;
  /** Dimension scale */
  size?: ButtonSize;
  /** Loading state displaying an animated spinner */
  isLoading?: boolean;
  /** Text or element displayed during loading */
  loadingText?: string;
  /** Icon placed before the button children */
  leftIcon?: React.ReactNode;
  /** Icon placed after the button children */
  rightIcon?: React.ReactNode;
  /** Expand button to fill 100% of container width */
  fullWidth?: boolean;
  /** Button content */
  children?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-xs border border-transparent font-medium cursor-pointer',
  primary:
    'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] shadow-xs border border-transparent font-medium cursor-pointer',
  secondary:
    'bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.98] cursor-pointer',
  outline:
    'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white cursor-pointer shadow-xs',
  ghost:
    'bg-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent cursor-pointer',
  destructive:
    'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white cursor-pointer',
  success:
    'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white cursor-pointer',
  link:
    'bg-transparent text-zinc-900 dark:text-zinc-100 underline-offset-4 hover:underline p-0 h-auto border-0 shadow-none inline-flex cursor-pointer',
  gradient:
    'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200 hover:bg-zinc-800 dark:hover:bg-zinc-200 relative overflow-hidden cursor-pointer shadow-xs',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-6 text-base rounded-lg gap-2.5',
  icon: 'h-10 w-10 p-0 rounded-lg justify-center shrink-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={isDisabled}
        whileTap={isDisabled ? undefined : { scale: 0.98 }}
        transition={motionTransitions.springSnappy}
        aria-busy={isLoading}
        className={cn(
          'relative inline-flex items-center justify-center font-medium select-none focus-ring transition-all duration-150',
          variantStyles[variant],
          variant !== 'link' && sizeStyles[size],
          fullWidth && 'w-full',
          isDisabled && 'opacity-40 cursor-not-allowed pointer-events-none',
          className
        )}
        {...props}
      >
        {/* Loading Spinner or Left Icon */}
        {isLoading ? (
          <Loader2 className={cn('animate-spin shrink-0', size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')} />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}

        {/* Button Content */}
        {isLoading && loadingText ? (
          <span>{loadingText}</span>
        ) : (
          children && <span>{children}</span>
        )}

        {/* Right Icon */}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
