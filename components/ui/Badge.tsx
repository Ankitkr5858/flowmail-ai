import React from 'react';
import { cn } from './cn';

type Variant = 'default' | 'success' | 'info' | 'warning' | 'danger';

const VARIANT: Record<Variant, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
};

export function Badge({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border', VARIANT[variant], className)}
      {...props}
    />
  );
}


