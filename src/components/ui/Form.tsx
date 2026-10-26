'use client';

import React, { forwardRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motionTransitions } from '../../lib/motion-tokens';

/* ==========================================================================
   1. Form Root & Layout Items
   ========================================================================== */

export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}

export const Form = forwardRef<HTMLFormElement, FormProps>(
  ({ className, onSubmit, ...props }, ref) => (
    <form
      ref={ref}
      onSubmit={onSubmit}
      className={cn('space-y-4 w-full', className)}
      noValidate
      {...props}
    />
  )
);
Form.displayName = 'Form';

export interface FormItemProps extends React.HTMLAttributes<HTMLDivElement> {
  error?: string;
}

export const FormItem = forwardRef<HTMLDivElement, FormItemProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-1.5 w-full', className)} {...props} />
  )
);
FormItem.displayName = 'FormItem';

export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const FormLabel = forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'block text-xs font-medium text-[#FAFAFA] select-none tracking-tight',
        className
      )}
      {...props}
    >
      {children}
      {required && <span className="text-[#FF7A7A] ml-1" aria-hidden="true">*</span>}
    </label>
  )
);
FormLabel.displayName = 'FormLabel';

export const FormControl = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('relative', className)} {...props} />
  )
);
FormControl.displayName = 'FormControl';

export const FormDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-[11px] text-[#6B6B6B] leading-relaxed', className)}
      {...props}
    />
  )
);
FormDescription.displayName = 'FormDescription';

export interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  error?: string | null;
}

export const FormMessage = forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, error, children, ...props }, ref) => {
    const message = error || children;
    return (
      <AnimatePresence>
        {message ? (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={motionTransitions.springSnappy}
            className="overflow-hidden"
          >
            <p
              ref={ref}
              role="alert"
              className={cn(
                'text-[11px] text-[#FF7A7A] flex items-center gap-1.5 pt-0.5 font-medium',
                className
              )}
              {...props}
            >
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{message}</span>
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }
);
FormMessage.displayName = 'FormMessage';

/* ==========================================================================
   2. Input Component
   ========================================================================== */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional icon rendered at the start of input */
  leftIcon?: React.ReactNode;
  /** Optional icon rendered at the end of input */
  rightIcon?: React.ReactNode;
  /** Pass an error message or boolean to trigger danger styling */
  error?: string | boolean;
  /** For type="password", automatically provide a show/hide toggle icon */
  showPasswordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      leftIcon,
      rightIcon,
      error,
      showPasswordToggle = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === 'password';
    const computedType = isPassword && showPassword ? 'text' : type;

    return (
      <div className="relative w-full flex items-center">
        {leftIcon && (
          <div className="absolute left-3 text-[#525252] pointer-events-none flex items-center justify-center">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          type={computedType}
          disabled={disabled}
          className={cn(
            'w-full h-10 px-3.5 text-xs text-[#FAFAFA] placeholder:text-[#6B6B6B] bg-[#141414] rounded-lg border transition-all duration-150',
            'border-[#1F1F1F] hover:border-[#4A4A4A]',
            'focus:bg-[#141414] focus:border-[#4A4A4A] focus:outline-none focus:ring-1 focus:ring-[#FAFAFA]/20',
            leftIcon && 'pl-9',
            (rightIcon || (isPassword && showPasswordToggle)) && 'pr-9',
            error && 'border-rose-500/50 focus:border-rose-500',
            disabled && 'opacity-30 cursor-not-allowed bg-[#0E0E0E]',
            className
          )}
          {...props}
        />

        {isPassword && showPasswordToggle ? (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 text-[#525252] hover:text-[#FAFAFA] transition-colors rounded cursor-pointer"
          >
            {showPassword ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          rightIcon && (
            <div className="absolute right-3 text-[#525252] pointer-events-none flex items-center justify-center">
              {rightIcon}
            </div>
          )
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

/* ==========================================================================
   3. Checkbox Component
   ========================================================================== */

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: React.ReactNode;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      label,
      description,
      checked,
      defaultChecked = false,
      disabled,
      onChange,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const [isChecked, setIsChecked] = React.useState(defaultChecked);

    const isControlled = checked !== undefined;
    const currentChecked = isControlled ? checked : isChecked;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      if (!isControlled) {
        setIsChecked(e.target.checked);
      }
      if (onChange) {
        onChange(e);
      }
    };

    return (
      <div
        className={cn(
          'flex items-start gap-2.5 select-none',
          disabled && 'opacity-40 cursor-not-allowed',
          className
        )}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            checked={currentChecked}
            disabled={disabled}
            onChange={handleChange}
            className="peer sr-only"
            {...props}
          />
          <div
            onClick={(e) => {
              if (!disabled) {
                const input = document.getElementById(inputId) as HTMLInputElement;
                if (input) input.click();
              }
              e.preventDefault();
            }}
            className={cn(
              'w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all duration-150 cursor-pointer',
              currentChecked
                ? 'bg-[#FAFAFA] border-[#FAFAFA] text-[#050505]'
                : 'bg-[#141414] border-[#1F1F1F] hover:border-[#4A4A4A]',
              disabled && 'cursor-not-allowed'
            )}
          >
            {currentChecked && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={motionTransitions.springSnappy}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </motion.div>
            )}
          </div>
        </div>

        {(label || description) && (
          <label htmlFor={inputId} className="cursor-pointer text-left">
            {label && (
              <div className="text-xs font-medium text-[#FAFAFA] leading-tight">
                {label}
              </div>
            )}
            {description && (
              <div className="text-[11px] text-[#6B6B6B] mt-0.5 leading-relaxed">
                {description}
              </div>
            )}
          </label>
        )}
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';
