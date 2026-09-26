import {
  TENANT_SLUG_MAX_LENGTH,
  assignUniqueTenantSlug,
  normalizeTenantSlug,
} from './tenant-slug';

describe('normalizeTenantSlug', () => {
  it('lowercases and joins whitespace runs with single dashes', () => {
    expect(normalizeTenantSlug('Mi Negocio')).toBe('mi-negocio');
    expect(normalizeTenantSlug('La   Esquina   del   Sabor')).toBe(
      'la-esquina-del-sabor',
    );
  });

  it('strips every character outside [a-z0-9-]', () => {
    expect(normalizeTenantSlug('Café El Nica!')).toBe('caf-el-nica');
    expect(normalizeTenantSlug('Q80 Food Park 2024')).toBe(
      'q80-food-park-2024',
    );
  });

  it('trims leading and trailing dashes after stripping', () => {
    expect(normalizeTenantSlug('  --Weird--  Name  ')).toBe('weird---name');
    expect(normalizeTenantSlug('!!!name!!!')).toBe('name');
  });

  it('truncates to 50 chars on a dash boundary', () => {
    const dashed = 'a'.repeat(40) + '-' + 'b'.repeat(40);
    const slug = normalizeTenantSlug(dashed);
    expect(slug.length).toBeLessThanOrEqual(TENANT_SLUG_MAX_LENGTH);
    expect(slug).toBe('a'.repeat(40));

    const wordy =
      'uno-dos-tres-cuatro-cinco-seis-siete-ocho-nueve-diez-once-doce';
    const wordySlug = normalizeTenantSlug(wordy);
    expect(wordySlug.length).toBeLessThanOrEqual(TENANT_SLUG_MAX_LENGTH);
    expect(wordySlug.endsWith('-')).toBe(false);
    expect(wordySlug).toBe(
      'uno-dos-tres-cuatro-cinco-seis-siete-ocho-nueve',
    );
  });

  it('hard-truncates at 50 chars when no dash boundary exists', () => {
    const undashed = 'x'.repeat(60);
    expect(normalizeTenantSlug(undashed)).toBe('x'.repeat(50));
  });

  it('throws when normalization produces an empty slug', () => {
    expect(() => normalizeTenantSlug('')).toThrow();
    expect(() => normalizeTenantSlug('   ')).toThrow();
    expect(() => normalizeTenantSlug('!!!')).toThrow();
  });
});

describe('assignUniqueTenantSlug', () => {
  it('returns the base slug when it is free', () => {
    expect(assignUniqueTenantSlug('mi-negocio', new Set())).toBe('mi-negocio');
  });

  it('resolves collisions with -2, -3, ... suffixes', () => {
    const taken = new Set(['mi-negocio', 'mi-negocio-2']);
    expect(assignUniqueTenantSlug('mi-negocio', taken)).toBe('mi-negocio-3');
  });

  it('keeps suffixed candidates within the 50-char bound', () => {
    const base = 'x'.repeat(TENANT_SLUG_MAX_LENGTH);
    const slug = assignUniqueTenantSlug(base, new Set([base]));
    expect(slug.length).toBeLessThanOrEqual(TENANT_SLUG_MAX_LENGTH);
    expect(slug).toBe('x'.repeat(TENANT_SLUG_MAX_LENGTH - 2) + '-2');
  });
});
