import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModifierGroupForm } from "./modifier-group-form";
import { modifierGroupFormSchema, modifierOptionFormSchema } from "./schema";
import { type ModifierGroup } from "./types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeactivateModifierOption,
  useReactivateModifierOption,
} from "./use-modifiers";
import { toast } from "@/hooks/use-toast";

vi.mock("./use-modifiers");
vi.mock("@/hooks/use-toast");
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const mockGroup: ModifierGroup = {
  id: "group-1",
  name: "Leche",
  min_selected: 0,
  max_selected: 3,
  allow_quantities: true,
  sort_order: 2,
  is_active: true,
  options: [
    {
      id: "opt-1",
      name: "Entera",
      price_delta: 5,
      is_default: true,
      sort_order: 0,
    },
    {
      id: "opt-2",
      name: "Deslactosada",
      price_delta: 0,
      is_default: false,
      sort_order: 1,
    },
  ],
};

const renderForm = (initialData?: ModifierGroup | null) => {
  const onSuccess = vi.fn();
  render(
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grupo de modificadores</DialogTitle>
        </DialogHeader>
        <ModifierGroupForm
          initialData={initialData}
          onSuccess={onSuccess}
          onCancel={vi.fn()}
        />
      </DialogContent>
    </Dialog>,
  );
  return { onSuccess };
};

describe("modifierGroupFormSchema", () => {
  const validBase = {
    name: "Leche",
    min_selected: 0,
    max_selected: 1,
    allow_quantities: false,
    sort_order: 0,
  };

  it("accepts a valid group payload", () => {
    const result = modifierGroupFormSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("requires a non-blank name with a Spanish message", () => {
    const result = modifierGroupFormSchema.safeParse({
      ...validBase,
      name: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldError = result.error.issues.find(
        (issue) => issue.path[0] === "name",
      );
      expect(fieldError?.message).toBe("El nombre es requerido");
    }
  });

  it("rejects a negative min_selected", () => {
    const result = modifierGroupFormSchema.safeParse({
      ...validBase,
      min_selected: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a max_selected below 1", () => {
    const result = modifierGroupFormSchema.safeParse({
      ...validBase,
      max_selected: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects max_selected below min_selected with a Spanish message", () => {
    const result = modifierGroupFormSchema.safeParse({
      ...validBase,
      min_selected: 3,
      max_selected: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("El máximo no puede ser menor que el mínimo"),
        ),
      ).toBe(true);
    }
  });

  it("accepts NEGATIVE option price deltas (discount options are legitimate)", () => {
    const result = modifierOptionFormSchema.safeParse({
      name: "Sin cebolla",
      price_delta: -15.5,
      is_default: false,
      sort_order: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price_delta).toBe(-15.5);
    }
  });

  it("rejects a blank option name", () => {
    const result = modifierOptionFormSchema.safeParse({
      name: " ",
      price_delta: 0,
      is_default: false,
      sort_order: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("ModifierGroupForm", () => {
  const mockCreateGroup = { mutateAsync: vi.fn(), isPending: false };
  const mockUpdateGroup = { mutateAsync: vi.fn(), isPending: false };
  const mockCreateOption = { mutateAsync: vi.fn(), isPending: false };
  const mockUpdateOption = { mutateAsync: vi.fn(), isPending: false };
  const mockDeactivateOption = { mutateAsync: vi.fn(), isPending: false };
  const mockReactivateOption = { mutateAsync: vi.fn(), isPending: false };

  beforeEach(() => {
    vi.clearAllMocks();
    (useCreateModifierGroup as any).mockReturnValue(mockCreateGroup);
    (useUpdateModifierGroup as any).mockReturnValue(mockUpdateGroup);
    (useCreateModifierOption as any).mockReturnValue(mockCreateOption);
    (useUpdateModifierOption as any).mockReturnValue(mockUpdateOption);
    (useDeactivateModifierOption as any).mockReturnValue(mockDeactivateOption);
    (useReactivateModifierOption as any).mockReturnValue(mockReactivateOption);
    (toast as any).mockImplementation(vi.fn());
    mockCreateGroup.mutateAsync.mockResolvedValue({
      ...mockGroup,
      id: "new-1",
    });
  });

  it("renders the group fields with friendly Spanish labels and placeholders", () => {
    renderForm(null);

    expect(screen.getByLabelText("Nombre *")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ej: Leche, Extras"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mínimo de selección")).toBeInTheDocument();
    expect(screen.getByLabelText("Máximo de selección")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /permitir cantidades/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear/i })).toBeInTheDocument();
  });

  it("shows Spanish validation errors for a blank name and max below min", async () => {
    renderForm(null);

    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Leche" },
    });
    fireEvent.change(screen.getByLabelText("Mínimo de selección"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Máximo de selección"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(
        screen.getByText("El máximo no puede ser menor que el mínimo"),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Mínimo de selección"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(screen.getByText("El nombre es requerido")).toBeInTheDocument();
    });
    expect(mockCreateGroup.mutateAsync).not.toHaveBeenCalled();
  });

  it("submits a typed payload on create", async () => {
    renderForm(null);

    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Leche" },
    });
    fireEvent.change(screen.getByLabelText("Mínimo de selección"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Máximo de selección"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(mockCreateGroup.mutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mockCreateGroup.mutateAsync.mock.calls[0]![0];
    expect(payload).toEqual({
      name: "Leche",
      min_selected: 1,
      max_selected: 3,
      allow_quantities: false,
      sort_order: 0,
    });
  });

  it("pre-fills the group fields and option rows when editing", () => {
    renderForm(mockGroup);

    expect(screen.getByLabelText("Nombre *")).toHaveValue("Leche");
    expect(screen.getByLabelText("Mínimo de selección")).toHaveValue(0);
    expect(screen.getByLabelText("Máximo de selección")).toHaveValue(3);
    expect(screen.getByDisplayValue("Entera")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Deslactosada")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /agregar opción/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /actualizar/i }),
    ).toBeInTheDocument();
  });

  it("moves the default: selecting a new Predeterminado clears the previous one in the submitted payloads", async () => {
    renderForm(mockGroup);

    // Select the SECOND option as default; the first one must be cleared.
    const secondOptionDefault = screen.getByLabelText(/Deslactosada/i, {
      selector: 'input[type="radio"]',
    });
    fireEvent.click(secondOptionDefault);
    fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));

    await waitFor(() => {
      expect(mockUpdateGroup.mutateAsync).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockUpdateOption.mutateAsync).toHaveBeenCalledTimes(2);
    });

    const optionCalls = mockUpdateOption.mutateAsync.mock.calls.map(
      (call) => call[0],
    );
    const entera = optionCalls.find((call) => call.optionId === "opt-1");
    const deslactosada = optionCalls.find((call) => call.optionId === "opt-2");
    expect(entera?.input.is_default).toBe(false);
    expect(deslactosada?.input.is_default).toBe(true);
    // Never two defaults in one submission (backend invariant mirrored).
    const defaultsCount = optionCalls.filter(
      (call) => call.input.is_default,
    ).length;
    expect(defaultsCount).toBe(1);
  });

  it("accepts a negative price delta on an option row", async () => {
    renderForm(mockGroup);

    const enteraPrice = screen.getByLabelText(/precio adicional.*entera/i);
    fireEvent.change(enteraPrice, { target: { value: "-2" } });
    fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));

    await waitFor(() => {
      expect(mockUpdateOption.mutateAsync).toHaveBeenCalledTimes(2);
    });
    const optionCalls = mockUpdateOption.mutateAsync.mock.calls.map(
      (call) => call[0],
    );
    const entera = optionCalls.find((call) => call.optionId === "opt-1");
    expect(entera?.input.price_delta).toBe(-2);
  });

  it("maps a 409 conflict to the friendly Spanish message, never the raw body", async () => {
    mockCreateGroup.mutateAsync.mockRejectedValue({
      status: 409,
      responseBody: {
        message: 'Modifier group with name "Leche" already exists',
      },
    });
    renderForm(null);

    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Leche" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description:
            "Ya existe un grupo con ese nombre. Revise la vista «Inactivos»: quizá es un grupo desactivado que puede reactivarse.",
        }),
      );
    });
  });

  it("maps a network failure to the friendly connection message", async () => {
    mockCreateGroup.mutateAsync.mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    renderForm(null);

    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Leche" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "No se pudo conectar con el servidor",
        }),
      );
    });
  });

  describe("inactive option restoration", () => {
    // Backend option payloads carry `is_active`; the shared ModifierOption
    // type omits it, so the fixture casts the extra field.
    const groupWithInactiveOption: ModifierGroup = {
      ...mockGroup,
      options: [
        mockGroup.options[0]!,
        { ...mockGroup.options[1]!, is_active: false } as ModifierOption,
      ],
    };

    it("shows a Desactivada badge and an inline Activar button for an inactive option", () => {
      renderForm(groupWithInactiveOption);

      expect(screen.getByText("Desactivada")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Activar opción Deslactosada" }),
      ).toBeInTheDocument();
      // Active options get no activation affordance.
      expect(
        screen.queryByRole("button", { name: "Activar opción Entera" }),
      ).not.toBeInTheDocument();
    });

    it("reactivates the option through its own mutation, separate from the save flow", async () => {
      mockReactivateOption.mutateAsync.mockResolvedValue({ success: true });
      renderForm(groupWithInactiveOption);

      fireEvent.click(
        screen.getByRole("button", { name: "Activar opción Deslactosada" }),
      );

      await waitFor(() => {
        expect(mockReactivateOption.mutateAsync).toHaveBeenCalledWith({
          groupId: "group-1",
          optionId: "opt-2",
        });
      });
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Opción activada" }),
        );
      });
      // The badge clears and the standalone PATCH is NOT folded into the
      // group/option save submissions.
      expect(screen.queryByText("Desactivada")).not.toBeInTheDocument();
      expect(mockUpdateGroup.mutateAsync).not.toHaveBeenCalled();
      expect(mockUpdateOption.mutateAsync).not.toHaveBeenCalled();
    });
  });

  // R3-01: completed save steps are reconciled; retries attempt only pending work.
  describe("partial-save reconciliation (R3-01)", () => {
    it("does not duplicate a created option on retry: the returned id is adopted as a PATCH", async () => {
      const createMutate = vi.fn((args: any) =>
        args.input.name === "Queso"
          ? Promise.resolve({ id: "new-opt-1", name: "Queso" })
          : Promise.reject(new Error("boom")),
      );
      (useCreateModifierOption as any).mockReturnValue({
        mutateAsync: createMutate,
      });
      renderForm({ ...mockGroup, options: [] });
      fireEvent.click(screen.getByRole("button", { name: /agregar opción/i }));
      fireEvent.click(screen.getByRole("button", { name: /agregar opción/i }));
      const setName = (label: string, value: string) =>
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      setName("Nombre de la opción 1", "Queso");
      setName("Nombre de la opción 2", "Jamón");
      fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Error al guardar" }),
        ),
      );
      // Retry must PATCH row 1, never POST it again.
      fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));
      await waitFor(() =>
        expect(mockUpdateOption.mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ optionId: "new-opt-1" }),
        ),
      );
      expect(
        createMutate.mock.calls.filter(
          (call) => call[0].input.name === "Queso",
        ),
      ).toHaveLength(1);
    });

    it("retries only pending removals and treats a 404 retry as success", async () => {
      const deactivateMutate = vi.fn();
      let calls = 0;
      deactivateMutate.mockImplementation(() => {
        calls += 1;
        // opt-1 lands; opt-2 fails then answers 404 (already applied).
        if (calls === 1) return Promise.resolve({ success: true });
        return Promise.reject(
          calls === 2 ? new Error("boom") : { status: 404 },
        );
      });
      (useDeactivateModifierOption as any).mockReturnValue({
        mutateAsync: deactivateMutate,
        isPending: false,
      });
      const { onSuccess } = renderForm(mockGroup);
      fireEvent.click(screen.getByLabelText("Quitar opción Entera"));
      fireEvent.click(screen.getByLabelText("Quitar opción Deslactosada"));
      fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Error al guardar" }),
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Grupo actualizado" }),
        ),
      );
      expect(onSuccess).toHaveBeenCalled();
      // Retry re-attempted ONLY the still-pending opt-2, never opt-1.
      expect(
        deactivateMutate.mock.calls.map(
          (call) => (call[0] as { optionId: string }).optionId,
        ),
      ).toEqual(["opt-1", "opt-2", "opt-2"]);
    });
  });
});
