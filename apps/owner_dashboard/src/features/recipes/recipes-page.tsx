'use client';

import { useState } from 'react';
import { Plus, Search, ChefHat, Package, Edit } from 'lucide-react';
import { useProducts } from '@/features/catalog/use-product';
import { useActiveRecipe, useInsumos } from './use-recipes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RecipeForm } from './RecipeForm';
import { formatNumber } from '@/lib/utils';

export function RecipesPage() {
  const { data: products, isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useProducts('COMPOUND');
  const { data: insumos } = useInsumos();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<{ productId: string; productName: string } | null>(null);

  const { data: activeRecipe, refetch: refetchRecipe } = useActiveRecipe(selectedProductId || '', !!selectedProductId);

  const filteredProducts = products?.filter((p: { name: string; id: string }) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const handleOpenForm = (productId: string, productName: string) => {
    setEditingRecipe({ productId, productName });
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingRecipe(null);
    if (selectedProductId) refetchRecipe();
  };

  const handleFormSuccess = () => {
    handleFormClose();
  };

  if (productsLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Cargando productos">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (productsError) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>Error al cargar productos: {(productsError as Error).message}</p>
        <Button onClick={() => refetchProducts()} className="ml-2 mt-2" variant="outline" size="sm">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recetas y BOM</h1>
          <p className="text-sm text-muted-foreground">Gestione recetas de productos compuestos (ingredientes, rendimientos, versiones)</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="recipe-search" className="sr-only">Buscar productos compuestos</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="recipe-search"
            placeholder="Buscar por nombre o ID..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No se encontraron productos compuestos</p>
            <p className="text-sm">Cree un producto de tipo "Compuesto" en el catálogo para gestionar su receta</p>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              className={`relative border rounded-lg p-4 transition-all ${selectedProductId === product.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
              onClick={() => setSelectedProductId(product.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ChefHat className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{product.name}</h3>
                </div>
                <Badge variant={product.is_active ? 'success' : 'destructive'}>
                  {product.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Precio:</span>
                  <span className="font-medium tabular-nums">{formatNumber(product.sellPrice)} NIO</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Stock:</span>
                  <span className="font-medium tabular-nums">{formatNumber(product.stock)} {product.uom}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>UOM:</span>
                  <span className="font-medium">{product.uom}</span>
                </div>
              </div>

              {activeRecipe && activeRecipe.recipeVersion.product_id === product.id && activeRecipe.recipeVersion.version_number > 0 && (
                <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1 border-l-2 border-primary">
                  <div className="flex items-center gap-1 text-primary font-medium">
                    <ChefHat className="h-3 w-3" />
                    <span>Receta v{activeRecipe.recipeVersion.version_number} activa</span>
                  </div>
                  <div className="text-muted-foreground">
                    {activeRecipe.components.length} ingrediente{activeRecipe.components.length !== 1 ? 's' : ''}
                  </div>
                  <div className="text-muted-foreground">
                    Rendimiento: {formatNumber(activeRecipe.recipeVersion.yield_quantity)} {product.uom}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={(e) => { e.stopPropagation(); handleOpenForm(product.id, product.name); }}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Editar Receta
                  </Button>
                </div>
              )}

              {!activeRecipe || activeRecipe.recipeVersion.product_id !== product.id || activeRecipe.recipeVersion.version_number === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={(e) => { e.stopPropagation(); handleOpenForm(product.id, product.name); }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Crear Receta
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecipe ? `Editar Receta: ${editingRecipe.productName}` : 'Crear Nueva Receta'}
            </DialogTitle>
            <DialogDescription>
              {editingRecipe
                ? 'Modifique los ingredientes, cantidades y rendimiento de la receta'
                : 'Defina los ingredientes, cantidades, merma técnica y rendimiento del producto compuesto'}
            </DialogDescription>
          </DialogHeader>
          {editingRecipe && (
            <RecipeForm
              productId={editingRecipe.productId}
              productName={editingRecipe.productName}
              insumos={insumos ?? []}
              compoundProducts={products?.filter(p => p.id !== editingRecipe?.productId) ?? []}
              existingRecipe={activeRecipe && activeRecipe.recipeVersion.product_id === editingRecipe.productId ? activeRecipe : null}
              onSuccess={handleFormSuccess}
              onCancel={handleFormClose}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}