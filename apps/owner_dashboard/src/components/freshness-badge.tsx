interface FreshnessBadgeProps {
  generatedAt: string;
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("es-NI", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Managua",
    });
  } catch {
    return isoString;
  }
}

export function FreshnessBadge({ generatedAt }: FreshnessBadgeProps) {
  const time = formatTime(generatedAt);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
      Actualizado {time} (CST)
    </span>
  );
}
