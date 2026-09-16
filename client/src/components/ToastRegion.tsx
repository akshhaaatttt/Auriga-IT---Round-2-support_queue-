import { CheckCircle2, AlertCircle, X } from 'lucide-react';
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
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2 : AlertCircle;
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm shadow-lg',
              toast.tone === 'success' ? 'border-emerald-200' : 'border-red-200',
            )}
          >
            <Icon
              aria-hidden
              className={cn('mt-0.5 size-4 shrink-0', toast.tone === 'success' ? 'text-emerald-600' : 'text-red-600')}
            />
            <p className="flex-1 text-slate-800">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
