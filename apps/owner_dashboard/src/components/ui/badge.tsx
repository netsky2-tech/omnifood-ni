import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  // R18/S15: token ramp (DESIGN_BACKOFFICE.md §2). `success` stays a SOLID
  // dark fill with light text — the owner decision badge-success-variant.test
  // pins — now expressed as secondary-700 (white on it: 9.29:1). The tinted
  // variants write their words in the -700 text shade, never in the base
  // status color, which fails AA on its own tint.
  const variantStyles = {
    default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'border-transparent bg-muted text-muted-foreground hover:bg-muted/80',
    destructive: 'border-destructive/25 bg-destructive-50 text-destructive-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300',
    outline: 'border-border text-foreground',
    success: 'border-secondary-700 bg-secondary-700 text-secondary-foreground shadow-sm',
    warning: 'border-warning/30 bg-warning-50 text-warning-700 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300',
    info: 'border-info/30 bg-info-50 text-info-700 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-300',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };