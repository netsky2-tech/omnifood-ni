/**
 * EntitySearchSelect (§17.6 slice S2) — the reusable governed selector.
 *
 * The component is hook-driven: it never fetches and never filters. These
 * tests pin the three contract pillars the standard demands:
 *   1. flexible search delegation — the operator's text travels to the
 *      query surface verbatim (no client-side exact-id/exact-name matching),
 *      and a case/accent/partial match renders and selects;
 *   2. selection carries the ID for the payload while the operator sees the
 *      human label;
 *   3. the standard's states: loading, legitimate empty, empty-by-filter,
 *      error (with retry), and "ver todos" for long result sets.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { EntitySearchSelect, type EntitySearchOption } from "./entity-search-select";

const CAFE_DE_OLLA: EntitySearchOption = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Café de Olla",
  hint: "unidad",
};

const CAPUCHINO: EntitySearchOption = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "CAPUCHINO",
};

function Harness(props: Partial<Parameters<typeof EntitySearchSelect>[0]> = {}) {
  const [search, setSearch] = useState(props.search ?? "");
  const [value, setValue] = useState(props.value ?? "");
  return (
    <EntitySearchSelect
      inputId="entity-search"
      label="Producto"
      value={value}
      onChange={setValue}
      options={props.options ?? []}
      search={search}
      onSearchChange={setSearch}
      isLoading={props.isLoading}
      isError={props.isError}
      onRetry={props.onRetry}
      emptyMessage={props.emptyMessage}
      selectedLabel={props.selectedLabel}
      total={props.total}
      onVerTodos={props.onVerTodos}
    />
  );
}

describe("EntitySearchSelect — flexible search delegation (§17.6)", () => {
  it("hands the operator's text to the query surface verbatim (case, accents and partials are not second-guessed client-side)", () => {
    const onSearchChange = vi.fn();
    render(
      <EntitySearchSelect
        inputId="entity-search"
        label="Producto"
        value=""
        onChange={vi.fn()}
        options={[]}
        search=""
        onSearchChange={onSearchChange}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Producto" }), {
      target: { value: "cAfÉ" },
    });
    // The raw keystrokes travel; any accent/case/partial tolerance is the
    // backend ?search= predicate's job, not a local filter here.
    expect(onSearchChange).toHaveBeenCalledWith("cAfÉ");
  });

  it("renders a match that is neither an exact id nor an exact name (case + accent + partial), and hides the id from the operator", () => {
    render(<Harness options={[CAFE_DE_OLLA, CAPUCHINO]} />);
    const list = screen.getByRole("listbox", { name: "Producto" });
    // The human labels render; the payload ids never appear as copy.
    expect(list).toHaveTextContent("Café de Olla");
    expect(list).toHaveTextContent("CAPUCHINO");
    expect(list.textContent).not.toMatch(/11111111|22222222/);
  });

  it("selecting a row reports the option's ID while the visible copy stays the human label", () => {
    const onChange = vi.fn();
    render(
      <EntitySearchSelect
        inputId="entity-search"
        label="Producto"
        value=""
        onChange={onChange}
        options={[CAFE_DE_OLLA]}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: /Café de Olla/ }));
    // The payload datum is the id...
    expect(onChange).toHaveBeenCalledWith(CAFE_DE_OLLA.id);
  });

  it("shows the selection as the human label with the id absent from the selection copy", () => {
    render(
      <EntitySearchSelect
        inputId="entity-search"
        label="Producto"
        value={CAFE_DE_OLLA.id}
        onChange={vi.fn()}
        options={[CAFE_DE_OLLA]}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    const chip = screen.getByText(/Seleccionado:/);
    expect(chip).toHaveTextContent("Seleccionado: Café de Olla");
    expect(chip).not.toHaveTextContent(CAFE_DE_OLLA.id);
  });

  it("falls back to the consumer-supplied label for a stored selection outside the current results (edit mode)", () => {
    render(
      <EntitySearchSelect
        inputId="entity-search"
        label="Producto"
        value={CAFE_DE_OLLA.id}
        onChange={vi.fn()}
        options={[]}
        search=""
        onSearchChange={vi.fn()}
        selectedLabel="Café de Olla"
      />,
    );
    expect(screen.getByText(/Seleccionado:/)).toHaveTextContent(
      "Café de Olla",
    );
  });

  it("Quitar clears the selection to the empty value", () => {
    const onChange = vi.fn();
    render(
      <EntitySearchSelect
        inputId="entity-search"
        label="Producto"
        value={CAFE_DE_OLLA.id}
        onChange={onChange}
        options={[CAFE_DE_OLLA]}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Quitar/ }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("EntitySearchSelect — keyboard interaction", () => {
  it("moves the highlight with the arrows and selects the highlighted row with Enter", () => {
    const onChange = vi.fn();
    render(
      <EntitySearchSelect
        inputId="entity-search"
        label="Producto"
        value=""
        onChange={onChange}
        options={[CAFE_DE_OLLA, CAPUCHINO]}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Producto" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(CAPUCHINO.id);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(CAFE_DE_OLLA.id);
  });

  it("Escape only drops the highlight; it never mutates the selection", () => {
    const onChange = vi.fn();
    render(
      <EntitySearchSelect
        inputId="entity-search"
        label="Producto"
        value=""
        onChange={onChange}
        options={[CAFE_DE_OLLA]}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Producto" }), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EntitySearchSelect — the standard's states", () => {
  it("loading: renders the searching state before any rows exist", () => {
    render(<Harness isLoading options={[]} />);
    expect(screen.getByTestId("entity-search-loading")).toHaveTextContent(
      "Buscando…",
    );
  });

  it("loading with previous rows keeps the list and shows the refreshing hint instead of flashing empty", () => {
    render(<Harness isLoading options={[CAFE_DE_OLLA]} />);
    expect(screen.getByRole("option", { name: /Café de Olla/ })).toBeInTheDocument();
    expect(screen.getByText("Actualizando…")).toBeInTheDocument();
  });

  it("legitimate empty: no term and an empty dataset shows the consumer's empty copy", () => {
    render(<Harness options={[]} emptyMessage="No hay productos todavía." />);
    expect(screen.getByTestId("entity-search-empty")).toHaveTextContent(
      "No hay productos todavía.",
    );
  });

  it("empty-by-filter: a term with no matches gets the no-results copy quoting the term", () => {
    render(<Harness search="zzz" options={[]} />);
    expect(screen.getByTestId("entity-search-no-results")).toHaveTextContent(
      'Sin resultados para «zzz»',
    );
  });

  it("error: shows the error state and its Reintentar affordance calls the retry", () => {
    const onRetry = vi.fn();
    render(<Harness isError onRetry={onRetry} />);
    expect(screen.getByTestId("entity-search-error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ver todos: appears only when the term matched more rows than the list shows, and calls the consumer's action", () => {
    const onVerTodos = vi.fn();
    const { rerender } = render(
      <Harness
        search="cafe"
        options={[CAFE_DE_OLLA]}
        total={120}
        onVerTodos={onVerTodos}
      />,
    );
    const button = screen.getByTestId("entity-search-ver-todos");
    expect(button).toHaveTextContent("Ver todos los resultados (120)");
    fireEvent.click(button);
    expect(onVerTodos).toHaveBeenCalledTimes(1);

    // Fewer matches than shown → no affordance.
    rerender(
      <Harness
        search="cafe"
        options={[CAFE_DE_OLLA]}
        total={1}
        onVerTodos={onVerTodos}
      />,
    );
    expect(
      screen.queryByTestId("entity-search-ver-todos"),
    ).not.toBeInTheDocument();
  });

  it("ver todos never renders without a term: the unfiltered list already is the whole catalog", () => {
    render(<Harness options={[CAFE_DE_OLLA]} total={500} onVerTodos={vi.fn()} />);
    expect(
      screen.queryByTestId("entity-search-ver-todos"),
    ).not.toBeInTheDocument();
  });
});
