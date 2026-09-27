import { render, screen, waitFor, within, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { RecipesPage } from '@/features/recipes/recipes-page';
import { SuggestionReview } from '@/features/recipes/suggestion-review';
import { usePendingSuggestions, useActiveRecipe } from '@/features/recipes/use-recipes';
import { suggestionsQueryKey } from '@/features/recipes/recipes-api';
import { setTokens, clearTokens } from '@/lib/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { toast } from '@/hooks/use-toast';
import type { RecipeSuggestionListItem, RecipeSnapshot } from '@/features/recipes/types';

vi.mock('@/features/catalog/use-product', () => ({
  useProducts: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

// Exact backend guard message from recipe.service.ts assertProductTypeSupportsRecipe (#612).
const GUARD_400_MESSAGE =
  'El producto "Flan Simple" es de tipo SIMPLE y no admite recetas: una receta requiere un producto de tipo Compuesto o Preparado. Corrija el tipo del producto en Catálogo → tipo de producto.';

const NOT_FOUND_404_MESSAGE = 'No existe la versión de receta solicitada.';

const NETWORK_ERROR_MESSAGE =
  'Error de conexión. Verifique su acceso a internet o disponibilidad del servidor.';

const TENANT_A = { id: 'tenant-A', name: 'Tenant A', slug: 'tenant-a', ruc: 'X', active: true };
const TENANT_B = { id: 'tenant-B', name: 'Tenant B', slug: 'tenant-b', ruc: 'Y', active: true };

const TENANT_B_SUGGESTIONS: RecipeSuggestionListItem[] = [
  {
    recipeVersionId: 'rv-b1',
    productId: 'pb1',
    productName: 'Vigorón (plantilla)',
    versionNumber: 1,
    componentCount: 1,
    hasActivePublishedVersion: false,
  },
];

const SUGGESTIONS: RecipeSuggestionListItem[] = [
  {
    recipeVersionId: 'rv-t1',
    productId: 'p1',
    productName: 'Gallopinto (plantilla)',
    versionNumber: 1,
    componentCount: 2,
    hasActivePublishedVersion: false,
  },
  {
    recipeVersionId: 'rv-t2',
    productId: 'p2',
    productName: 'Nacatamal (plantilla)',
    versionNumber: 2,
    componentCount: 0,
    hasActivePublishedVersion: true,
  },
];

const SNAPSHOT: RecipeSnapshot = {
  recipeVersion: {
    id: 'rv-t1',
    tenant_id: 'tenant-A',
    product_id: 'p1',
    version_number: 1,
    is_active: false,
    fecha_inicio_vigencia: null,
    fecha_fin_vigencia: null,
    pos_document_id: null,
    product_name: 'Gallopinto (plantilla)',
    yield_quantity: 10,
    technical_shrink_pct: 5,
    version_note: 'Plantilla industria',
    pos_created_at: null,
    published_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  components: [
    {
      id: 'rd1',
      tenant_id: 'tenant-A',
      recipe_version_id: 'rv-t1',
      insumo_id: 'i1',
      quantity: 0.5,
      gross_quantity: 0.5,
      technical_shrink_pct: 5,
      ingredient_name: 'Arroz',
      ingredient_type: 'INSUMO',
      component_uom: 'kg',
      reference_version_id: null,
    },
    {
      id: 'rd2',
      tenant_id: 'tenant-A',
      recipe_version_id: 'rv-t1',
      insumo_id: 'sr1',
      quantity: 1,
      gross_quantity: 1,
      technical_shrink_pct: 0,
      ingredient_name: 'Sofrito',
      ingredient_type: 'SUB_RECIPE',
      component_uom: 'un',
      reference_version_id: null,
    },
  ],
};

const ACTIVE_SNAPSHOT: RecipeSnapshot = {
  ...SNAPSHOT,
  recipeVersion: { ...SNAPSHOT.recipeVersion, id: 'rv-published', is_active: true, published_at: '2026-01-02T00:00:00Z' },
};

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => data,
  } as unknown as Response;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

// Mutable per-test routing state for the fetch stub.
const state = {
  suggestions: [] as RecipeSuggestionListItem[],
  /** Optional scripted payloads for consecutive suggestions fetches. */
  suggestionsQueue: [] as RecipeSuggestionListItem[][],
  snapshot: SNAPSHOT as RecipeSnapshot,
  holdSnapshot: false,
  snapshotFail: false,
  publishImpl: null as null | (() => Response | Promise<Response>),
};

let releaseSnapshot: ((response: Response) => void) | null = null;

const calls: string[] = [];

async function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = urlOf(input);
  calls.push(url);

  if (url.includes('/recipes/suggestions')) {
    const payload = state.suggestionsQueue.length > 0 ? state.suggestionsQueue.shift()! : state.suggestions;
    return jsonResponse(payload);
  }
  if (url.includes('/insumos')) {
    return jsonResponse([]);
  }
  if (url.includes('/snapshot')) {
    if (state.holdSnapshot) {
      return new Promise<Response>((resolve) => {
        releaseSnapshot = (response) => resolve(response);
      });
    }
    if (state.snapshotFail) return jsonResponse({}, 500);
    return jsonResponse(state.snapshot);
  }
  if (url.includes('/publish')) {
    if (state.publishImpl) return state.publishImpl();
    return jsonResponse(state.snapshot);
  }
  if (url.includes('/products/') && url.endsWith('/active')) {
    return jsonResponse(ACTIVE_SNAPSHOT);
  }
  return jsonResponse({}, 404);
}

const fetchMock = vi.fn(routeFetch);

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>);
}

function renderReview() {
  return renderWithClient(<SuggestionReview />);
}

async function openDetail(productName: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: `Ver detalle de ${productName}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // mockImplementation from earlier tests must not leak into later ones.
  fetchMock.mockReset();
  fetchMock.mockImplementation(routeFetch);
  calls.length = 0;
  state.suggestions = [];
  state.suggestionsQueue = [];
  state.snapshot = SNAPSHOT;
  state.holdSnapshot = false;
  state.snapshotFail = false;
  state.publishImpl = null;
  releaseSnapshot = null;
  vi.stubGlobal('fetch', fetchMock);
  setTokens({ accessToken: 'test-access', refreshToken: 'test-refresh' });
  useAuthStore.setState({ tenant: TENANT_A as never });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
  useAuthStore.setState({ tenant: null });
  sessionStorage.clear();
});

function snapshotCalls(): string[] {
  return calls.filter((c) => c.includes('/snapshot'));
}

describe('#523 T3 — Suggestion review (w11)', () => {
  it('item 1: Sugerencias tab renders the pending count as a badge on the page', async () => {
    state.suggestions = SUGGESTIONS;
    render(<QueryClientProvider client={makeClient()}><RecipesPage /></QueryClientProvider>);

    const tab = await screen.findByRole('button', { name: /Sugerencias/ });
    await waitFor(() => expect(within(tab).getByText('2')).toBeInTheDocument());
  });

  it('item 1: with zero suggestions the tab shows an empty state, not a blank table', async () => {
    state.suggestions = [];
    const user = userEvent.setup();
    render(<QueryClientProvider client={makeClient()}><RecipesPage /></QueryClientProvider>);

    await user.click(await screen.findByRole('button', { name: /Sugerencias/ }));
    expect(await screen.findByText('No hay sugerencias pendientes')).toBeInTheDocument();
  });

  it('item 2: rows render product, version, component count and the replacement signal', async () => {
    state.suggestions = SUGGESTIONS;
    renderReview();

    expect(await screen.findByText('Gallopinto (plantilla)')).toBeInTheDocument();
    const row1 = screen.getByText('Gallopinto (plantilla)').closest('tr')!;
    expect(within(row1).getByText('v1')).toBeInTheDocument();
    expect(within(row1).getByText('2')).toBeInTheDocument();
    expect(within(row1).queryByText('Reemplazo')).not.toBeInTheDocument();

    const row2 = screen.getByText('Nacatamal (plantilla)').closest('tr')!;
    expect(within(row2).getByText('v2')).toBeInTheDocument();
    expect(within(row2).getByText('Reemplazo')).toBeInTheDocument();
  });

  it('item 3: opening a row loads the snapshot and renders components with type, quantity and shrink', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    renderReview();
    await openDetail('Gallopinto (plantilla)');

    expect(await screen.findByText('Arroz')).toBeInTheDocument();
    expect(screen.getByText('Sofrito')).toBeInTheDocument();
    expect(screen.getByText('Insumo')).toBeInTheDocument();
    expect(screen.getByText('Sub-receta')).toBeInTheDocument();
    expect(screen.getByText('0.5 kg')).toBeInTheDocument();
    expect(screen.getByText('Merma técnica')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
  });

  it('item 3: detail shows an explicit loading state and an explicit error state', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    state.holdSnapshot = true;
    renderReview();
    await openDetail('Gallopinto (plantilla)');

    expect(await screen.findByText('Cargando detalle de la receta...')).toBeInTheDocument();

    // Release the held request as a failure: the error state is explicit.
    act(() => releaseSnapshot?.(jsonResponse({}, 500)));
    expect(await screen.findByText('Error al cargar el detalle')).toBeInTheDocument();
  });

  it('item 4: publish is disabled until the row snapshot has loaded', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    state.holdSnapshot = true;
    renderReview();
    await openDetail('Gallopinto (plantilla)');

    await screen.findByText('Cargando detalle de la receta...');
    // Decision 2: the button is rendered but disabled until the snapshot loads.
    expect(screen.getByRole('button', { name: 'Publicar receta' })).toBeDisabled();

    act(() => releaseSnapshot?.(jsonResponse(SNAPSHOT)));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publicar receta' })).toBeEnabled();
    });
  });

  it('item 5: publish success invalidates suggestions and the product active recipe; row leaves the list', async () => {
    // 1st suggestions call returns the row; the post-publish refetch returns empty.
    state.suggestionsQueue = [[SUGGESTIONS[0]!], []];

    function ActiveRecipeProbe({ productId }: { productId: string }) {
      useActiveRecipe(productId, true);
      return null;
    }

    render(
      <QueryClientProvider client={makeClient()}>
        <SuggestionReview />
        <ActiveRecipeProbe productId="p1" />
      </QueryClientProvider>,
    );

    await openDetail('Gallopinto (plantilla)');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Publicar receta' }));

    // Row leaves the pending list (suggestions invalidated and refetched empty).
    expect(await screen.findByText('No hay sugerencias pendientes')).toBeInTheDocument();

    // Suggestions list refetched after invalidation, and the product's active
    // recipe query invalidated (initial probe fetch + post-publish refetch).
    const suggestionsCalls = calls.filter((c) => c.includes('/recipes/suggestions'));
    expect(suggestionsCalls.length).toBeGreaterThanOrEqual(2);
    const activeCalls = calls.filter((c) => c.includes('/products/p1/active'));
    expect(activeCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('item 5: publish success shows a success toast', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    renderReview();
    await openDetail('Gallopinto (plantilla)');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Publicar receta' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(vi.mocked(toast).mock.calls.some((c) => c[0]?.variant === 'success')).toBe(true);
  });

  it('item 6: publish 400 keeps the exact backend guard message visible on the row', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    state.publishImpl = () => jsonResponse({ message: GUARD_400_MESSAGE, error: 'Bad Request', statusCode: 400 }, 400);
    renderReview();
    await openDetail('Gallopinto (plantilla)');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Publicar receta' }));

    // Toast surfaces the message...
    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: GUARD_400_MESSAGE }),
      );
    });

    // ...and the row keeps showing the exact message (inline alert), after the
    // toast is gone (toast is mocked out, so any render is row-only).
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(GUARD_400_MESSAGE);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(GUARD_400_MESSAGE);
  });

  it('item 7: publish 404 shows the not-found message on the row', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    state.publishImpl = () => jsonResponse({ message: NOT_FOUND_404_MESSAGE }, 404);
    renderReview();
    await openDetail('Gallopinto (plantilla)');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Publicar receta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_FOUND_404_MESSAGE);
  });

  it('item 7: publish network failure shows the connection message, distinguishable from 404', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    state.publishImpl = () => {
      throw new TypeError('Failed to fetch');
    };
    renderReview();
    await openDetail('Gallopinto (plantilla)');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Publicar receta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
  });

  it('item 8: list fetch is tenant-scoped through the query key', async () => {
    const client = makeClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { rerender } = renderHook(() => usePendingSuggestions(), { wrapper });
    await waitFor(() => expect(calls.filter((c) => c.includes('/recipes/suggestions')).length).toBe(1));

    act(() => {
      useAuthStore.setState({ tenant: TENANT_B as never });
    });
    rerender();

    await waitFor(() => expect(calls.filter((c) => c.includes('/recipes/suggestions')).length).toBe(2));

    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['recipes', 'tenant-A', 'suggestions']);
    expect(keys).toContainEqual(['recipes', 'tenant-B', 'suggestions']);
  });

  it('item 9: no snapshot request fires for a row that is never opened; opening fetches exactly once', async () => {
    state.suggestions = SUGGESTIONS;
    renderReview();

    expect(await screen.findByText('Gallopinto (plantilla)')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.includes('/recipes/suggestions')).length).toBeGreaterThan(0));
    expect(snapshotCalls()).toHaveLength(0);

    const user = userEvent.setup();
    const toggle = () => screen.getByRole('button', { name: 'Ver detalle de Gallopinto (plantilla)' });
    await user.click(toggle());
    await waitFor(() => expect(snapshotCalls().length).toBe(1));
    expect(snapshotCalls()[0]).toContain('/recipes/rv-t1/snapshot');
    expect(screen.getByText('Ocultar detalle')).toBeInTheDocument();

    // Closing does not re-fetch, and the other row was never opened.
    await user.click(toggle());
    expect(snapshotCalls()).toHaveLength(1);
    expect(calls.filter((c) => c.includes('/recipes/rv-t2/snapshot'))).toHaveLength(0);
  });

  it('fix 1: the exported key builder produces the canonical suggestions key', () => {
    expect(suggestionsQueryKey('tenant-A')).toEqual(['recipes', 'tenant-A', 'suggestions']);
  });

  it('fix 1: the page badge and the canonical hook share one suggestions query and one fetch', async () => {
    state.suggestions = SUGGESTIONS;
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <RecipesPage />
        <SuggestionReview />
      </QueryClientProvider>,
    );

    // Both observers resolve: the tab badge and the review list.
    const tab = await screen.findByRole('button', { name: /Sugerencias/ });
    await waitFor(() => expect(within(tab).getByText('2')).toBeInTheDocument());
    expect(await screen.findByText('Gallopinto (plantilla)')).toBeInTheDocument();

    // One cache entry built by the shared builder serves both observers.
    const suggestionsQueries = client
      .getQueryCache()
      .getAll()
      .filter((q) => Array.isArray(q.queryKey) && q.queryKey[2] === 'suggestions');
    expect(suggestionsQueries).toHaveLength(1);
    expect(suggestionsQueries[0]!.queryKey).toEqual(suggestionsQueryKey('tenant-A'));
    expect(calls.filter((c) => c.includes('/recipes/suggestions'))).toHaveLength(1);
  });

  it('fix 3: with the snapshot unresolved, clicking cannot fire a publish request', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    state.holdSnapshot = true;
    renderReview();
    await openDetail('Gallopinto (plantilla)');

    const publish = await screen.findByRole('button', { name: 'Publicar receta' });
    expect(publish).toBeDisabled();

    const user = userEvent.setup();
    await user.click(publish);
    expect(calls.filter((c) => c.includes('/publish'))).toHaveLength(0);
  });

  it('fix 3: while one publish is in flight, no second publish request fires for any row', async () => {
    state.suggestions = [SUGGESTIONS[0]!];
    // Publish request is held in flight for the whole test.
    state.publishImpl = () => new Promise<Response>(() => {});
    renderReview();
    await openDetail('Gallopinto (plantilla)');

    const user = userEvent.setup();
    const publish = await screen.findByRole('button', { name: 'Publicar receta' });
    expect(publish).toBeEnabled();
    await user.click(publish);
    await waitFor(() => expect(calls.filter((c) => c.includes('/publish'))).toHaveLength(1));

    // Mutation in flight: the publish action is disabled, and a second click
    // on any row cannot produce another publish request.
    expect(screen.getByRole('button', { name: 'Publicar receta' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Publicar receta' }));
    expect(calls.filter((c) => c.includes('/publish'))).toHaveLength(1);
  });

  it('fix 4: after a tenant switch the DOM renders only the new tenant rows', async () => {
    state.suggestions = SUGGESTIONS;
    renderReview();

    expect(await screen.findByText('Gallopinto (plantilla)')).toBeInTheDocument();
    expect(screen.getByText('Nacatamal (plantilla)')).toBeInTheDocument();

    state.suggestions = TENANT_B_SUGGESTIONS;
    act(() => {
      useAuthStore.setState({ tenant: TENANT_B as never });
    });

    // The tenant-scoped key changes, a fresh fetch resolves, and tenant A's
    // product names never leak into tenant B's rendered list.
    expect(await screen.findByText('Vigorón (plantilla)')).toBeInTheDocument();
    expect(screen.queryByText('Gallopinto (plantilla)')).not.toBeInTheDocument();
    expect(screen.queryByText('Nacatamal (plantilla)')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.includes('/recipes/suggestions')).length).toBeGreaterThanOrEqual(2);
  });
});
