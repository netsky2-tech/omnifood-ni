import { render, act } from '@testing-library/react';
import { Profiler } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { ProductPage } from '@/features/catalog/product-page';

vi.mock('@/features/catalog/use-catalog', () => ({
  useCatalogValues: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));

// Mock 25 products for page 1
const mock25Products = Array.from({ length: 25 }, (_, i) => ({
  id: `prod-${i + 1}`,
  tenant_id: 't1',
  name: `Producto Test ${i + 1}`,
  uom: 'UND',
  product_type: 'SIMPLE' as const,
  category_code: 'BEBIDAS',
  warehouse_id: null,
  is_perishable: false,
  stock: 100,
  averageCost: 10,
  sellPrice: 20,
  is_active: true,
  created_at: '2026-09-18T10:00:00Z',
  updated_at: '2026-09-18T10:00:00Z',
}));

vi.mock('@/features/catalog/use-product', () => ({
  usePaginatedProducts: vi.fn(() => ({
    data: {
      data: mock25Products,
      total: 10000,
      page: 1,
      pageSize: 25,
      totalPages: 400,
    },
    isLoading: false,
    error: null,
  })),
  useCreateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeactivateProduct: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

describe('ProductPage — React Render Profiling', () => {
  it('measures mount and update render durations with React Profiler', async () => {
    const renderProfiles: Array<{
      id: string;
      phase: 'mount' | 'update' | 'nested-update';
      actualDuration: number;
      baseDuration: number;
      startTime: number;
      commitTime: number;
    }> = [];

    const onRenderCallback = (
      id: string,
      phase: 'mount' | 'update' | 'nested-update',
      actualDuration: number,
      baseDuration: number,
      startTime: number,
      commitTime: number,
    ) => {
      renderProfiles.push({
        id,
        phase,
        actualDuration: Number(actualDuration.toFixed(2)),
        baseDuration: Number(baseDuration.toFixed(2)),
        startTime: Number(startTime.toFixed(2)),
        commitTime: Number(commitTime.toFixed(2)),
      });
    };

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Profiler id="ProductPage" onRender={onRenderCallback}>
          <ProductPage />
        </Profiler>
      </QueryClientProvider>,
    );

    // Trigger re-render to profile update phase
    act(() => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <Profiler id="ProductPage" onRender={onRenderCallback}>
            <ProductPage />
          </Profiler>
        </QueryClientProvider>,
      );
    });

    console.log('--- REACT PROFILER RESULTS (ProductPage with 25 items) ---');
    console.table(renderProfiles);

    expect(renderProfiles.length).toBeGreaterThanOrEqual(2);
    const mount = renderProfiles.find((p) => p.phase === 'mount');
    const update = renderProfiles.find((p) => p.phase === 'update');

    expect(mount).toBeDefined();
    expect(mount!.actualDuration).toBeLessThan(1000); // 1000ms threshold under heavy parallel test runner (standalone ~112ms)
    if (update) {
      expect(update.actualDuration).toBeLessThan(200);
    }
  });
});
