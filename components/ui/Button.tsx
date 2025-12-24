import React from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm icon-on-solid',
  secondary: 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm icon-on-solid',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-sm',
  icon: 'p-2',
};

export function Button({ className, variant = 'primary', size = 'md', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      disabled={disabled}
      {...props}
    />
  );
}


