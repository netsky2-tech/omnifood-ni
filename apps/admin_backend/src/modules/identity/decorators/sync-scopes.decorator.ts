import { SetMetadata } from '@nestjs/common';
import { DeviceSyncScope } from '../entities/device-sync-credential.entity';

export const SYNC_SCOPES_KEY = 'sync_scopes';

/**
 * Decorator to require dedicated device sync scopes on routes or controllers.
 * @param scopes List of required DeviceSyncScope values (e.g. 'sync:push', 'sync:pull')
 */
export const RequireSyncScopes = (...scopes: DeviceSyncScope[]) =>
  SetMetadata(SYNC_SCOPES_KEY, scopes);
