import { ExecutionContext } from '@nestjs/common';
import {
  extractCurrentUser,
  isCurrentUserPayload,
  type CurrentUserPayload,
} from './current-user.decorator';

const createMockExecutionContext = (request: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
    getType: () => 'http',
  }) as unknown as ExecutionContext;

describe('CurrentUser decorator and guards', () => {
  const validUser: CurrentUserPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    tenant_id: 'tenant-456',
    role: 'ADMIN',
  };

  describe('isCurrentUserPayload', () => {
    it('returns true for a valid CurrentUserPayload object', () => {
      expect(isCurrentUserPayload(validUser)).toBe(true);
    });

    it('returns false for null or non-objects', () => {
      expect(isCurrentUserPayload(null)).toBe(false);
      expect(isCurrentUserPayload(undefined)).toBe(false);
      expect(isCurrentUserPayload('string')).toBe(false);
      expect(isCurrentUserPayload(123)).toBe(false);
    });

    it('returns false if any required property is missing or wrong type', () => {
      expect(
        isCurrentUserPayload({
          sub: 'user-123',
          email: 'test@example.com',
          tenant_id: 'tenant-456',
          // missing role
        }),
      ).toBe(false);

      expect(
        isCurrentUserPayload({
          sub: 123,
          email: 'test@example.com',
          tenant_id: 'tenant-456',
          role: 'ADMIN',
        }),
      ).toBe(false);
    });
  });

  describe('extractCurrentUser', () => {
    it('returns the entire payload when no specific property is requested', () => {
      const ctx = createMockExecutionContext({ user: validUser });
      expect(extractCurrentUser(undefined, ctx)).toEqual(validUser);
    });

    it('returns the requested property when a field is provided', () => {
      const ctx = createMockExecutionContext({ user: validUser });
      expect(extractCurrentUser('sub', ctx)).toBe('user-123');
      expect(extractCurrentUser('email', ctx)).toBe('test@example.com');
      expect(extractCurrentUser('tenant_id', ctx)).toBe('tenant-456');
      expect(extractCurrentUser('role', ctx)).toBe('ADMIN');
    });

    it('returns undefined when user is not present on request', () => {
      const ctx = createMockExecutionContext({});
      expect(extractCurrentUser(undefined, ctx)).toBeUndefined();
      expect(extractCurrentUser('sub', ctx)).toBeUndefined();
    });

    it('returns undefined when user fails runtime type guard validation', () => {
      const ctx = createMockExecutionContext({
        user: { sub: 'user-123' },
      });
      expect(extractCurrentUser(undefined, ctx)).toBeUndefined();
    });

    it('returns undefined when request is undefined or not an object', () => {
      const ctx = createMockExecutionContext(undefined);
      expect(extractCurrentUser(undefined, ctx)).toBeUndefined();
    });
  });
});
