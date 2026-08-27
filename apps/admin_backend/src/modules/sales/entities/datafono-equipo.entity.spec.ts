import { DatafonoEquipo } from './datafono-equipo.entity';

describe('DatafonoEquipo Entity Unit Tests', () => {
  it('should instantiate DatafonoEquipo with default values and proper attributes', () => {
    const datafono = new DatafonoEquipo();
    datafono.id = '99999999-9999-9999-9999-999999999999';
    datafono.tenantId = '11111111-1111-1111-1111-111111111111';
    datafono.nombre = 'BAC Terminal Caja 1';
    datafono.bancoAdquirente = 'BAC';
    datafono.numeroAfiliacion = 'AFIL-BAC-099';
    datafono.terminalIdBanco = 'TERM-BAC-01';
    datafono.tipoConexion = 'LOCAL_NETWORK_TCP';
    datafono.ipAddress = '192.168.1.150';
    datafono.port = 8080;
    datafono.activo = true;

    expect(datafono.id).toBe('99999999-9999-9999-9999-999999999999');
    expect(datafono.tenantId).toBe('11111111-1111-1111-1111-111111111111');
    expect(datafono.nombre).toBe('BAC Terminal Caja 1');
    expect(datafono.bancoAdquirente).toBe('BAC');
    expect(datafono.numeroAfiliacion).toBe('AFIL-BAC-099');
    expect(datafono.terminalIdBanco).toBe('TERM-BAC-01');
    expect(datafono.tipoConexion).toBe('LOCAL_NETWORK_TCP');
    expect(datafono.ipAddress).toBe('192.168.1.150');
    expect(datafono.port).toBe(8080);
    expect(datafono.activo).toBe(true);
  });
});
