import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../utils/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small line above the title, e.g. a ticket reference. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  variant?: 'modal' | 'drawer';
  children: ReactNode;
}

/**
 * Thin wrapper over the native <dialog> element, which provides focus trapping,
 * Escape-to-close, an inert background and focus restoration without extra dependencies.
 */
export function Dialog({ open, onClose, title, eyebrow, description, variant = 'modal', children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const isDrawer = variant === 'drawer';

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'bg-surface p-0 text-ink shadow-(--shadow-overlay) backdrop:bg-ink/35 backdrop:backdrop-blur-[1px]',
        isDrawer
          ? 'm-0 ml-auto h-dvh max-h-dvh w-full max-w-[36rem] border-l border-line open:animate-drawer-in'
          : 'm-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-line open:animate-modal-in',
      )}
    >
      {open && (
        <div className={cn('flex flex-col', isDrawer ? 'h-full' : 'max-h-[min(90dvh,52rem)]')}>
          <div className="flex items-start gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              {eyebrow && <div className="mb-1">{eyebrow}</div>}
              <h2 id={titleId} className="text-lg leading-snug font-semibold text-pretty text-ink">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1 text-sm text-ink-muted">
                  {description}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon -mr-2">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 sm:px-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}
