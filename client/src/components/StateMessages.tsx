import { AlertTriangle, RotateCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'neutral' | 'success';
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center border-t border-line px-6 py-16 text-center">
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-full',
          tone === 'success' ? 'bg-success-soft text-success' : 'bg-surface-muted text-ink-subtle',
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-pretty text-ink-muted">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
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
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-danger-line bg-danger-soft px-4 py-2 text-sm text-danger-strong">
        <AlertTriangle aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{title}</span> <span className="text-ink-muted">{message}</span>
        </p>
        <button type="button" onClick={onRetry} className="btn btn-secondary h-8">
          <RotateCw aria-hidden className="size-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div role="alert" className="flex flex-col items-center border-t border-line px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger-strong">
        <AlertTriangle aria-hidden className="size-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-pretty text-ink-muted">{message}</p>
      <button type="button" onClick={onRetry} className="btn btn-secondary mt-5">
        <RotateCw aria-hidden className="size-4" />
        Try again
      </button>
    </div>
  );
}
