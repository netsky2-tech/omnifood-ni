import {
  resolveCompanyIdentity,
  type TenantIdentityColumns,
} from './company-identity.service';

const presentTenant: TenantIdentityColumns = {
  name: '  Pupusería La Casita, S.A.  ',
  ruc: ' J0310001234567 ',
  address: 'Barrio El Huente, León',
  phone: '+505 2512 3456',
  email: 'facturacion@lacasita.ni',
};

describe('resolveCompanyIdentity — the single S15 absence decision point', () => {
  it('declares every field present with its trimmed value', () => {
    const identity = resolveCompanyIdentity(presentTenant);
    expect(identity.name).toEqual({
      present: true,
      value: 'Pupusería La Casita, S.A.',
    });
    expect(identity.ruc).toEqual({ present: true, value: 'J0310001234567' });
    expect(identity.address).toEqual({
      present: true,
      value: 'Barrio El Huente, León',
    });
    expect(identity.phone).toEqual({ present: true, value: '+505 2512 3456' });
    expect(identity.email).toEqual({
      present: true,
      value: 'facturacion@lacasita.ni',
    });
  });

  it('declares null, undefined and blank values as ABSENT — never as empty strings', () => {
    const identity = resolveCompanyIdentity({
      name: 'La Casita',
      ruc: null,
      address: undefined,
      phone: '   ',
      email: '',
    });
    expect(identity.name).toEqual({ present: true, value: 'La Casita' });
    expect(identity.ruc).toEqual({ present: false });
    expect(identity.address).toEqual({ present: false });
    expect(identity.phone).toEqual({ present: false });
    expect(identity.email).toEqual({ present: false });
    // The renderer can never read a null or '' out of this shape.
    for (const field of Object.values(identity)) {
      if (field.present) {
        expect(typeof field.value).toBe('string');
        expect(field.value.length).toBeGreaterThan(0);
        expect(field.value).toBe(field.value.trim());
      }
    }
  });

  it('survives the fully-absent tenant, even the schema-required name', () => {
    const identity = resolveCompanyIdentity(null);
    expect(identity).toEqual({
      name: { present: false },
      ruc: { present: false },
      address: { present: false },
      phone: { present: false },
      email: { present: false },
    });
  });

  it('never fabricates a value: presence is truth only for non-blank text', () => {
    const identity = resolveCompanyIdentity({
      name: 'x',
      ruc: '0',
      address: '\t\n',
      phone: 'no',
      email: 'n/a',
    });
    expect(identity.ruc).toEqual({ present: true, value: '0' });
    expect(identity.address).toEqual({ present: false });
  });
});
