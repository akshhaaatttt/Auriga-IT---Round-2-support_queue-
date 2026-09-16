import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationInfo } from '../types/api';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface PaginationProps {
  pagination: PaginationInfo;
  disabled: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export function Pagination({ pagination, disabled, onPageChange, onLimitChange }: PaginationProps) {
  const { page, limit, total, totalPages } = pagination;
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  const lastPage = Math.max(totalPages, 1);

  return (
    <nav
      aria-label="Queue pagination"
      className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
        <p aria-live="polite">
          <span className="font-mono font-medium text-ink tabular-nums">
            {first}–{last}
          </span>{' '}
          of <span className="font-mono font-medium text-ink tabular-nums">{total}</span> tickets
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="page-size" className="whitespace-nowrap">
            Rows per page
          </label>
          <select
            id="page-size"
            value={limit}
            disabled={disabled}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="control h-8 w-20"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary h-8"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </button>
        <span className="min-w-24 px-1 text-center text-sm text-ink-muted" aria-current="page">
          Page <span className="font-mono font-medium text-ink tabular-nums">{page}</span> of{' '}
          <span className="font-mono tabular-nums">{lastPage}</span>
        </span>
        <button
          type="button"
          className="btn btn-secondary h-8"
          disabled={disabled || page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </nav>
  );
}
