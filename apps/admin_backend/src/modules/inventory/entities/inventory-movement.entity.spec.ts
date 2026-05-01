import { InventoryMovement, MovementType } from './inventory-movement.entity';

describe('InventoryMovement Entity', () => {
  it('should be defined', () => {
    const movement = new InventoryMovement();
    expect(movement).toBeDefined();
  });

  it('should have correct properties', () => {
    const movement = new InventoryMovement();
    movement.insumoId = 'insumo-123';
    movement.type = MovementType.SALE;
    movement.quantity = -18.5;
    movement.previousStock = 1000;
    movement.newStock = 981.5;
    movement.reason = 'Venta POS #123';

    expect(movement.insumoId).toBe('insumo-123');
    expect(movement.type).toBe(MovementType.SALE);
    expect(movement.quantity).toBe(-18.5);
    expect(movement.previousStock).toBe(1000);
    expect(movement.newStock).toBe(981.5);
    expect(movement.reason).toBe('Venta POS #123');
  });
});
