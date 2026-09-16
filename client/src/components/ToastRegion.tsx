import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { Toast } from '../hooks/useToasts';
import { cn } from '../utils/cn';

interface ToastRegionProps {
  toasts: readonly Toast[];
  onDismiss: (id: number) => void;
}

export function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => {
        const success = toast.tone === 'success';
        const Icon = success ? CheckCircle2 : AlertCircle;
        return (
          <div
            key={toast.id}
            role={success ? 'status' : 'alert'}
            className="pointer-events-auto flex animate-toast-in items-center gap-2.5 rounded-lg bg-ink py-2.5 pr-2 pl-3 text-sm text-white shadow-(--shadow-overlay)"
          >
            <Icon aria-hidden className={cn('size-4 shrink-0', success ? 'text-on-ink-success' : 'text-on-ink-danger')} />
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="btn h-7 w-7 px-0 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
