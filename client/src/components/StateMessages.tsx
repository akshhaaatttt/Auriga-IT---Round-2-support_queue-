import { AlertCircle, RotateCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-slate-100">
        <Icon aria-hidden className="size-6 text-slate-500" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry: () => void;
  compact?: boolean;
}

export function ErrorState({ title, message, onRetry, compact = false }: ErrorStateProps) {
  if (compact) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
        <AlertCircle aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">
          <span className="font-semibold">{title}</span> {message}
        </span>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div role="alert" className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-red-100">
        <AlertCircle aria-hidden className="size-6 text-red-700" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>
      <div className="mt-5">
        <RetryButton onRetry={onRetry} />
      </div>
    </div>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50"
    >
      <RotateCw aria-hidden className="size-4" />
      Try again
    </button>
  );
}
