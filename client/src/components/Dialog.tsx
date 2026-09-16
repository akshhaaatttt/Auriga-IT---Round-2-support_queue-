import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../utils/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  variant?: 'modal' | 'drawer';
  children: ReactNode;
}

/**
 * Thin wrapper over the native <dialog> element, which provides focus trapping,
 * Escape-to-close, inert background and focus restoration without extra dependencies.
 */
export function Dialog({ open, onClose, title, description, variant = 'modal', children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40',
        variant === 'drawer'
          ? 'm-0 ml-auto h-dvh max-h-dvh w-full max-w-xl'
          : 'm-auto w-[calc(100%-2rem)] max-w-xl rounded-xl',
      )}
    >
      {open && (
        <div className={cn('flex flex-col', variant === 'drawer' ? 'h-full' : 'max-h-[90dvh]')}>
          <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold leading-snug">
                {title}
              </h2>
              {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
