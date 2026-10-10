import { useId, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Governed entity selector (§17.6): an input that searches, a list of
 * results, keyboard interaction, and the standard's states.
 *
 * §17.6 contract — "búsqueda textual flexible":
 * - the search TEXT is handed to the consumer verbatim via onSearchChange;
 *   this component never filters, never compares ids and never demands an
 *   exact name. Flexible matching across several columns (case, accents,
 *   partials) is the query surface's job (useProductSearch → backend
 *   ?search=), so every form shares one contract instead of inventing its
 *   own client-side filter.
 * - for long result sets (total > shown) it renders a "Ver todos" affordance;
 *   what it does is the consumer's decision (onVerTodos).
 *
 * The component is driven entirely by props — it fetches nothing itself — so
 * the same selector serves products, categories or any other entity the
 * consumer backs with a hook, in single or list form.
 */

export interface EntitySearchOption {
  id: string;
  /** Human label shown to the operator; never an identifier. */
  label: string;
  /** Optional secondary line (e.g. uom, category). */
  hint?: string;
}

interface EntitySearchCommonProps {
  /** DOM id of the search input (used by the Label's htmlFor). */
  inputId: string;
  /** Visible label for the whole control. */
  label: string;
  /** Rows to show, exactly as the consumer's hook returned them. */
  options: EntitySearchOption[];
  /** Current search text (controlled). */
  search: string;
  /** Called with the operator's search text, verbatim. */
  onSearchChange: (term: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  /** Retry affordance for the error state (typically the query's refetch). */
  onRetry?: () => void;
  /** Copy when there is nothing to select at all (no term, empty dataset). */
  emptyMessage?: string;
  /** Total matching rows server-side, when the source is paginated. */
  total?: number;
  /** Fallback "long list" threshold when `total` is unknown. Default 25. */
  verTodosThreshold?: number;
  /** "Ver todos" action; the button renders only when this is provided. */
  onVerTodos?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export type EntitySearchSelectProps = EntitySearchCommonProps &
  (
    | {
        /** Single mode (default): one governed selection. */
        multiple?: false;
        /** Selected entity id; '' means nothing selected. */
        value: string;
        /** Receives the chosen entity id (the payload datum, not the label). */
        onChange: (id: string) => void;
        /**
         * Label for the stored selection when it is not among `options`
         * (edit mode: the stored id's row may be outside the search results).
         */
        selectedLabel?: string;
      }
    | {
        /**
         * Multi mode: a governed LIST selection (e.g. eligibleProductIds) —
         * the same §17.6 contract for a plural datum, so the next form that
         * needs a list does not have to invent one.
         */
        multiple: true;
        /** The picked entity ids, in payload order. */
        value: string[];
        /**
         * Called with the clicked row's id on EVERY click: the consumer owns
         * add/remove (toggle) semantics, so re-clicking a picked row is the
         * consumer's un-pick.
         */
        onToggle: (id: string) => void;
        /**
         * Per-id label renderer for stored rows outside the current results
         * (edit mode). Must render the human label, never a raw identifier.
         */
        renderSelectedLabel?: (id: string) => React.ReactNode;
      }
  );

const LIST_MAX_HEIGHT_CLASS = "max-h-56 overflow-y-auto";

export function EntitySearchSelect(props: EntitySearchSelectProps) {
  const {
    inputId,
    label,
    options,
    search,
    onSearchChange,
    isLoading = false,
    isError = false,
    onRetry,
    emptyMessage = "No hay registros todavía.",
    total,
    verTodosThreshold = 25,
    onVerTodos,
    placeholder = "Escriba para buscar…",
    disabled = false,
  } = props;

  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);

  const term = search.trim();
  // Reset the keyboard highlight whenever the result set changes shape —
  // during render (the React-recommended adjustment) instead of in an
  // effect, which would start a cascading render.
  const [seenOptions, setSeenOptions] = useState(options);
  const [seenTerm, setSeenTerm] = useState(term);
  if (seenOptions !== options || seenTerm !== term) {
    setSeenOptions(options);
    setSeenTerm(term);
    setActiveIndex(-1);
  }

  // Mode normalization: the JSX below works on plain locals so the
  // discriminated union is narrowed once, here, and never re-tested.
  const multi = props.multiple === true;
  const multiProps = multi ? props : undefined;
  const singleProps = multi ? undefined : props;
  const selectedIds: string[] = multiProps
    ? multiProps.value
    : singleProps?.value
      ? [singleProps.value]
      : [];

  const pick = (id: string) => {
    if (multiProps) multiProps.onToggle(id);
    else singleProps?.onChange(id);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) pick(option.id);
    } else if (event.key === "Escape") {
      setActiveIndex(-1);
    }
  };

  const hasTerm = term.length > 0;
  const showVerTodos =
    !!onVerTodos &&
    hasTerm &&
    options.length > 0 &&
    (total !== undefined
      ? total > options.length
      : options.length >= verTodosThreshold);

  // Human label for a selection chip. An id the current results (or the
  // consumer's edit-mode fallback) cannot resolve renders as a SHORT id —
  // never the raw full identifier.
  const chipLabelFor = (id: string): React.ReactNode => {
    const option = options.find((o) => o.id === id);
    if (option) return option.label;
    if (multiProps?.renderSelectedLabel) return multiProps.renderSelectedLabel(id);
    if (singleProps?.selectedLabel) return singleProps.selectedLabel;
    return `…${id.slice(-8)}`;
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          autoComplete="off"
          className="pl-9"
          placeholder={placeholder}
          value={search}
          disabled={disabled}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="space-y-1">
          {selectedIds.map((id) => {
            const display = chipLabelFor(id);
            const removeLabel =
              typeof display === "string"
                ? `Quitar ${display} de la selección`
                : "Quitar de la selección";
            return (
              <div
                key={id}
                className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2"
              >
                <span className="text-sm font-medium">
                  {multi ? display : `Seleccionado: ${display}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={removeLabel}
                  onClick={() => (multiProps ? multiProps.onToggle(id) : singleProps?.onChange(""))}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  Quitar
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div
        id={listId}
        role="listbox"
        aria-label={label}
        className={cn(
          "rounded-md border",
          LIST_MAX_HEIGHT_CLASS,
        )}
      >
        {isLoading && options.length === 0 ? (
          <p
            data-testid="entity-search-loading"
            className="flex items-center gap-2 p-3 text-sm text-muted-foreground"
          >
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Buscando…
          </p>
        ) : isError ? (
          <div
            data-testid="entity-search-error"
            className="space-y-2 p-3 text-sm text-destructive"
          >
            <p>No se pudo cargar la búsqueda.</p>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
              >
                Reintentar
              </Button>
            )}
          </div>
        ) : hasTerm && options.length === 0 ? (
          // Empty-by-filter: the term matched nothing. Distinct copy from the
          // legitimate empty below, per the standard's state separation.
          <p
            data-testid="entity-search-no-results"
            className="p-3 text-sm text-muted-foreground"
          >
            Sin resultados para «{term}». Pruebe con otra ortografía o con
            menos palabras.
          </p>
        ) : !hasTerm && options.length === 0 ? (
          // Legitimate empty: nothing to select at all (empty first use).
          <p
            data-testid="entity-search-empty"
            className="p-3 text-sm text-muted-foreground"
          >
            {emptyMessage}
          </p>
        ) : (
          <>
            {isLoading && options.length > 0 && (
              <p className="flex items-center gap-2 border-b p-2 text-xs text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                Actualizando…
              </p>
            )}
            {options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                id={`${listId}-option-${index}`}
                aria-selected={selectedIds.includes(option.id)}
                className={cn(
                  "block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                  activeIndex === index && "bg-muted/60",
                  selectedIds.includes(option.id) &&
                    "bg-primary/10 font-medium text-primary",
                )}
                onClick={() => pick(option.id)}
              >
                <span className="block">{option.label}</span>
                {option.hint && (
                  <span className="block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                )}
              </button>
            ))}
            {showVerTodos && (
              <button
                type="button"
                data-testid="entity-search-ver-todos"
                className="block w-full border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted/60 focus-visible:outline-none"
                onClick={onVerTodos}
              >
                {total !== undefined
                  ? `Ver todos los resultados (${total})`
                  : "Ver todos"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
