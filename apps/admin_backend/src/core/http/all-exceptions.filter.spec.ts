import { ArgumentsHost, HttpException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { TenantContextRequiredError } from '../database/tenant-transaction';

interface HostDouble {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
}

function makeHost(): HostDouble {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const response = { status, json };
  const request = { method: 'GET', url: '/api/test' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
    getType: () => 'http',
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps TenantContextRequiredError to HTTP 400 with a stable message that leaks no internals', () => {
    const { host, status, json } = makeHost();

    filter.catch(new TenantContextRequiredError(), host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({ statusCode: 400, message: expect.any(String) }),
    );
    // The response body must not leak internals: no error class name, no SQL.
    expect(JSON.stringify(body)).not.toContain('TenantContextRequiredError');
    expect(JSON.stringify(body)).not.toContain('set_config');
    expect(JSON.stringify(body)).not.toContain('app.tenant_id');
  });

  it('lets an HttpException keep its own status and response', () => {
    const { host, status, json } = makeHost();
    const original = { statusCode: 409, message: 'conflict happened' };

    filter.catch(new HttpException(original, 409), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(original);
  });

  it('maps an unrelated Error to HTTP 500 with "Internal server error"', () => {
    const { host, status, json } = makeHost();

    filter.catch(new Error('database exploded'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith('Internal server error');
  });
});
