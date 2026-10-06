describe('publish-release ABI and version derivation', () => {
  function deriveAbiAndVersionCode(
    filename: string,
    baseBuildNumber: number,
  ): { abi: string; versionCode: number } {
    if (filename.includes('arm64-v8a')) {
      return { abi: 'arm64-v8a', versionCode: 2000 + baseBuildNumber };
    } else if (filename.includes('armeabi-v7a')) {
      return { abi: 'armeabi-v7a', versionCode: 1000 + baseBuildNumber };
    } else if (filename.includes('x86_64')) {
      return { abi: 'x86_64', versionCode: 4000 + baseBuildNumber };
    } else {
      return { abi: 'universal', versionCode: baseBuildNumber };
    }
  }

  it('correctly maps arm64-v8a APK to 2000 + buildNumber (Q80 terminal target)', () => {
    const result = deriveAbiAndVersionCode('app-arm64-v8a-release.apk', 2);
    expect(result.abi).toBe('arm64-v8a');
    expect(result.versionCode).toBe(2002);
  });

  it('correctly maps armeabi-v7a APK to 1000 + buildNumber', () => {
    const result = deriveAbiAndVersionCode('app-armeabi-v7a-release.apk', 2);
    expect(result.abi).toBe('armeabi-v7a');
    expect(result.versionCode).toBe(1002);
  });

  it('correctly maps x86_64 APK to 4000 + buildNumber', () => {
    const result = deriveAbiAndVersionCode('app-x86_64-release.apk', 2);
    expect(result.abi).toBe('x86_64');
    expect(result.versionCode).toBe(4002);
  });

  it('maps universal APK to base buildNumber', () => {
    const result = deriveAbiAndVersionCode('app-release.apk', 2);
    expect(result.abi).toBe('universal');
    expect(result.versionCode).toBe(2);
  });

  it('validates standard Flutter pubspec version regex', () => {
    const valid = '1.0.1+2';
    const match = valid.match(/^([0-9.]+)\+([0-9]+)$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('1.0.1');
    expect(parseInt(match![2], 10)).toBe(2);

    const invalid = '1.0.1';
    expect(invalid.match(/^([0-9.]+)\+([0-9]+)$/)).toBeNull();
  });
});
