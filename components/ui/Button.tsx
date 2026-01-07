import React from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm icon-on-solid',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200',
  outline: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm icon-on-solid',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
  icon: 'h-10 w-10 p-0',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold transition-colors gap-2',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30',
        'disabled:opacity-50 disabled:pointer-events-none',
        size === 'icon' ? 'gap-0' : '',
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
});


