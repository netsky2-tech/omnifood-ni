import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { DeviceSyncTokenController } from './device-sync-token.controller';
import { DeviceSyncCredentialService } from '../services/device-sync-credential.service';
import { RenewDeviceTokenDto } from '../dto/renew-device-token.dto';
import { DeviceCredentialRevokedException } from '../exceptions/device-credential-revoked.exception';

describe('DeviceSyncTokenController', () => {
  let controller: DeviceSyncTokenController;

  const mockService = {
    renewAccessToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceSyncTokenController],
      providers: [
        {
          provide: DeviceSyncCredentialService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<DeviceSyncTokenController>(
      DeviceSyncTokenController,
    );
    jest.clearAllMocks();
  });

  const validDto: RenewDeviceTokenDto = {
    credentialId: 'cred-1234-5678',
    renewalSecret: 'secret-val-123456789012345678901234567890',
    declarativeTenantId: 'tenant-100',
    declarativeDeviceId: 'device-pos-1',
    expectedCredentialVersion: 1,
  };

  it('exchanges renewal credential for access token returning camelCase contract', async () => {
    const expectedResponse = {
      accessToken: 'jwt.token.here',
      tokenType: 'Bearer' as const,
      expiresIn: 900,
      principal: {
        principalType: 'DEVICE_SYNC' as const,
        credentialId: 'cred-1234-5678',
        tenantId: 'tenant-100',
        deviceId: 'device-pos-1',
        scopes: ['sync:push', 'sync:pull'],
        credentialVersion: 1,
      },
    };

    mockService.renewAccessToken.mockResolvedValue(expectedResponse);

    const result = await controller.renewToken(validDto);

    expect(mockService.renewAccessToken).toHaveBeenCalledWith(validDto);
    expect(result).toEqual(expectedResponse);
    expect(result.accessToken).toBe('jwt.token.here');
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(900);
    expect(result.principal.deviceId).toBe('device-pos-1');
  });

  it('sanitizes and maps revoked credential errors to explicit code DEVICE_REVOKED via typed exception', async () => {
    mockService.renewAccessToken.mockRejectedValue(
      new DeviceCredentialRevokedException('Device credential is revoked'),
    );

    try {
      await controller.renewToken(validDto);
      fail('Expected UnauthorizedException');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const unauthErr = err as UnauthorizedException;
      const res = unauthErr.getResponse();
      expect(res).toEqual(
        expect.objectContaining({
          statusCode: 401,
          code: 'DEVICE_REVOKED',
          message: 'Device credential is revoked',
        }),
      );
    }
  });

  it('does NOT classify string message containing "revoked" as DEVICE_REVOKED without typed exception', async () => {
    mockService.renewAccessToken.mockRejectedValue(
      new UnauthorizedException('arbitrary revoked string in message'),
    );

    try {
      await controller.renewToken(validDto);
      fail('Expected UnauthorizedException');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const unauthErr = err as UnauthorizedException;
      const res = unauthErr.getResponse();
      const code =
        typeof res === 'object' && res !== null && 'code' in res
          ? (res as { code: string }).code
          : undefined;
      expect(code).not.toBe('DEVICE_REVOKED');
      expect(unauthErr.message).toBe('arbitrary revoked string in message');
    }
  });

  it('sanitizes wrong credentials / secret mismatch error', async () => {
    mockService.renewAccessToken.mockRejectedValue(
      new UnauthorizedException('Invalid device credentials'),
    );

    try {
      await controller.renewToken(validDto);
      fail('Expected UnauthorizedException');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const unauthErr = err as UnauthorizedException;
      const res = unauthErr.getResponse();
      expect(
        typeof res === 'object' && res !== null && 'code' in res
          ? (res as { code: string }).code
          : undefined,
      ).not.toBe('DEVICE_REVOKED');
      expect(unauthErr.message).toBe('Invalid device credentials');
    }
  });

  it('sanitizes expired credential error', async () => {
    mockService.renewAccessToken.mockRejectedValue(
      new UnauthorizedException('Device credential has expired'),
    );

    try {
      await controller.renewToken(validDto);
      fail('Expected UnauthorizedException');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toBe(
        'Device credential has expired',
      );
    }
  });

  it('sanitizes credential version mismatch error', async () => {
    mockService.renewAccessToken.mockRejectedValue(
      new UnauthorizedException('Credential version mismatch'),
    );

    await expect(controller.renewToken(validDto)).rejects.toThrow(
      'Credential version mismatch',
    );
  });

  it('sanitizes tenant or device binding mismatch error', async () => {
    mockService.renewAccessToken.mockRejectedValue(
      new UnauthorizedException(
        'Declarative tenant does not match credential binding',
      ),
    );

    await expect(controller.renewToken(validDto)).rejects.toThrow(
      'Declarative tenant does not match credential binding',
    );
  });
});
