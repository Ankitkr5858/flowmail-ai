import React from 'react';
import { X } from 'lucide-react';

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading,
}: {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="font-semibold text-slate-900">{title}</div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Close">
            <X className="app-icon w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          {description && <div className="text-sm text-slate-700 whitespace-pre-line">{description}</div>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold disabled:opacity-50"
          >
            {isLoading ? 'Working…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}


