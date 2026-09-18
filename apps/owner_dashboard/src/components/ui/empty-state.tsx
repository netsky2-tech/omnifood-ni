import React, { type ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title?: string;
  message?: string;
  description?: string;
  icon?: ReactNode | React.ElementType;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  message,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  const textMessage = message ?? description;

  const renderIcon = () => {
    if (!icon) {
      return <FolderOpen className="h-6 w-6 stroke-[1.5]" />;
    }
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === "function" || (typeof icon === "object" && icon !== null && "render" in icon)) {
      const IconComp = icon as React.ElementType;
      return <IconComp className="h-6 w-6 stroke-[1.5]" />;
    }
    return icon as ReactNode;
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 p-8 sm:p-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {renderIcon()}
      </div>
      {title && (
        <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      )}
      {textMessage && <p className="max-w-sm text-sm text-muted-foreground">{textMessage}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
