import { UserRound } from 'lucide-react';
import { cn } from '../utils/cn';
import { initials } from '../utils/format';

interface AvatarProps {
  name: string | null;
  size?: 'sm' | 'md';
}

/** Initials avatar; purely decorative because the name is always shown next to it. */
export function Avatar({ name, size = 'sm' }: AvatarProps) {
  const dimension = size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs';
  if (!name) {
    return (
      <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-subtle', dimension)}>
        <UserRound className="size-3.5" />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-hover ring-1 ring-brand-line', dimension)}>
      {initials(name)}
    </span>
  );
}
