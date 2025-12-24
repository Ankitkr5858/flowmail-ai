import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<SelectOption<T>>;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  buttonClassName,
  menuClassName,
  disabled,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const el = rootRef.current;
      const menuEl = menuRef.current;
      const t = e.target as Node;
      // Root contains the trigger; menu is portaled to document.body, so include it too.
      if (el && el.contains(t)) return;
      if (menuEl && menuEl.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = buttonRef.current;
    if (!el) return;

    const compute = () => {
      const r = el.getBoundingClientRect();
      const margin = 8;
      const viewportH = window.innerHeight;
      const maxHeight = Math.max(160, viewportH - r.bottom - margin);
      setMenuRect({
        left: Math.round(r.left),
        top: Math.round(r.bottom + 8),
        width: Math.round(r.width),
        maxHeight: Math.round(maxHeight),
      });
    };

    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        ref={buttonRef}
        className={cn(
          'w-full inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-sky-500',
          disabled && 'opacity-50 cursor-not-allowed',
          buttonClassName
        )}
      >
        <span className={cn('truncate', !selected && 'text-slate-400')}>
          {selected?.label ?? placeholder ?? 'Select…'}
        </span>
        <ChevronDown className={cn('app-icon app-icon-muted w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && menuRect
        ? createPortal(
            <div
              ref={menuRef}
              className={cn(
                'fixed z-[200] rounded-xl border border-slate-200 bg-white shadow-lg overflow-auto',
                menuClassName
              )}
              style={{
                left: menuRect.left,
                top: menuRect.top,
                width: menuRect.width,
                maxHeight: menuRect.maxHeight,
              }}
              role="listbox"
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2.5 text-left text-sm flex items-center gap-2',
                      'hover:bg-slate-50 text-slate-700',
                      isSelected && 'bg-sky-50 text-slate-900',
                      opt.disabled && 'opacity-50 cursor-not-allowed hover:bg-white'
                    )}
                  >
                    <span className="w-4 h-4 flex items-center justify-center">
                      {isSelected ? <Check className="app-icon app-icon-brand w-4 h-4" /> : null}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}


