import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCatalogValueDto } from './create-catalog-value.dto';
import { UpdateCatalogValueDto } from './update-catalog-value.dto';

describe('Catalog value DTO validation', () => {
  it('trims create code and name before validation', async () => {
    const dto = plainToInstance(CreateCatalogValueDto, {
      code: ' kg ',
      name: ' Kilogramo ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.code).toBe('kg');
    expect(dto.name).toBe('Kilogramo');
  });

  it('rejects whitespace-only create code and name', async () => {
    const dto = plainToInstance(CreateCatalogValueDto, {
      code: '   ',
      name: '   ',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['code', 'name']),
    );
  });

  it('rejects create code with characters outside the stable whitelist', async () => {
    const dto = plainToInstance(CreateCatalogValueDto, {
      code: 'kg;drop',
      name: 'Kilogramo',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('code');
  });

  it('accepts seeded-compatible create code characters', async () => {
    const dto = plainToInstance(CreateCatalogValueDto, {
      code: 'INSUMOS_POS-1',
      name: 'Insumos POS',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects whitespace-only update name', async () => {
    const dto = plainToInstance(UpdateCatalogValueDto, { name: '   ' });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('name');
  });
});
