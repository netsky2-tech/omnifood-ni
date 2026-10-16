import * as React from 'react';
import { cn } from '@/lib/utils';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
}

/**
 * Semantic variants mirror the `badge.tsx` palette (§48: one semantic system,
 * not two). Each variant carries border + tinted background + dark-mode
 * equivalent — never a near-white tint (§42.1/§62: color communicates state).
 * The icon tint is included so every variant keeps icon + text signals (§46).
 */
/**
 * R18/S15: the semantic ramp lives in the tokens of DESIGN_BACKOFFICE.md §2.
 * The base status color carries the border and the icon, the `-50` token
 * carries the surface, and WORDS are written in the `-700` text shade — the
 * base color on its own tint fails WCAG AA for small text (warning 2.07:1,
 * info 3.38:1, destructive 4.41:1). `design-token-vocabulary.test.ts` pins the
 * rule; the `dark:*` stopgaps are outside the v1 system (dark mode is not
 * defined) and are kept verbatim where they already existed.
 */
const alertVariants = {
  default: 'border-border bg-card text-card-foreground',
  destructive:
    'border-destructive/25 bg-destructive-50 text-destructive-700 dark:border-destructive [&>svg]:text-destructive-700',
  success:
    'border-secondary-700/25 bg-secondary-50 text-secondary-700 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300 [&>svg]:text-secondary-700 dark:[&>svg]:text-emerald-400',
  warning:
    'border-warning/30 bg-warning-50 text-warning-700 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300 [&>svg]:text-warning-700 dark:[&>svg]:text-amber-400',
  info: 'border-info/30 bg-info-50 text-info-700 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-300 [&>svg]:text-info-700 dark:[&>svg]:text-blue-400',
} as const;

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
        alertVariants[variant],
        className,
      )}
      {...props}
    />
  )
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  )
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };