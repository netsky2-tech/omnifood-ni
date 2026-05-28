import { SecurityProfile } from './security-profile.entity';

describe('SecurityProfile Entity', () => {
  it('should allow mapping isolated credentials by user', () => {
    const profile = new SecurityProfile();
    profile.user_id = 'user-1';
    profile.pin_hash = 'hashed-pin';
    profile.totp_secret_seed = 'totp-seed';
    profile.is_pin_enabled = true;
    profile.is_totp_enabled = true;

    expect(profile).toBeDefined();
    expect(profile.user_id).toBe('user-1');
    expect(profile.pin_hash).toBe('hashed-pin');
    expect(profile.totp_secret_seed).toBe('totp-seed');
    expect(profile.is_pin_enabled).toBe(true);
    expect(profile.is_totp_enabled).toBe(true);
  });

  it('should support nullable secrets for deactivated methods', () => {
    const profile = new SecurityProfile();
    profile.user_id = 'user-2';
    profile.pin_hash = null;
    profile.totp_secret_seed = null;
    profile.is_pin_enabled = false;
    profile.is_totp_enabled = false;

    expect(profile.user_id).toBe('user-2');
    expect(profile.pin_hash).toBeNull();
    expect(profile.totp_secret_seed).toBeNull();
    expect(profile.is_pin_enabled).toBe(false);
    expect(profile.is_totp_enabled).toBe(false);
  });
});
