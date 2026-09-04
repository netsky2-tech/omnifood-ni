import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../database/app_database.dart';
import '../models/inventory/product_entity.dart';
import 'local_auth_service.dart';

enum ActivationCheckStatus {
  pass,
  fail,
}

class ActivationCheckResult {
  final String checkCode;
  final ActivationCheckStatus status;
  final String? reason;
  final Map<String, dynamic> details;
  final DateTime evaluatedAt;

  const ActivationCheckResult({
    required this.checkCode,
    required this.status,
    this.reason,
    this.details = const {},
    required this.evaluatedAt,
  });

  bool get isPass => status == ActivationCheckStatus.pass;
  bool get isFail => status == ActivationCheckStatus.fail;
}

class ActivationRequiredConfigParams {
  final String tenantId;
  final int requiredFiscalRevision;
  final String requiredFiscalFingerprint;
  final String verificationProductId;
  final int? verificationProductRevision;
  final String? verificationProductFingerprint;

  const ActivationRequiredConfigParams({
    required this.tenantId,
    required this.requiredFiscalRevision,
    required this.requiredFiscalFingerprint,
    required this.verificationProductId,
    this.verificationProductRevision,
    this.verificationProductFingerprint,
  });
}

class ActivationAuthorizedUserParams {
  final String tenantId;
  final String authorizedUserId;
  final String? testPin;

  const ActivationAuthorizedUserParams({
    required this.tenantId,
    required this.authorizedUserId,
    this.testPin,
  });
}

class ActivationAdapterSummary {
  final bool isReady;
  final ActivationCheckResult requiredConfigResult;
  final ActivationCheckResult authorizedUserResult;
  final List<String> blockers;

  const ActivationAdapterSummary({
    required this.isReady,
    required this.requiredConfigResult,
    required this.authorizedUserResult,
    this.blockers = const [],
  });
}

class ActivationRequiredConfigAdapter {
  final AppDatabase _database;
  final LocalAuthService _localAuth;

  ActivationRequiredConfigAdapter({
    required AppDatabase database,
    LocalAuthService? localAuthService,
  })  : _database = database,
        _localAuth = localAuthService ?? LocalAuthService();

  static String canonicalizeJcs(dynamic value) {
    if (value == null) return 'null';
    if (value is bool) return value ? 'true' : 'false';
    if (value is num) {
      if (!value.isFinite) throw ArgumentError('Non-finite number');
      if (value is double && value == value.toInt()) {
        return value.toInt().toString();
      }
      return value.toString();
    }
    if (value is String) return jsonEncode(value);
    if (value is List) {
      final items = value.map(canonicalizeJcs).join(',');
      return '[$items]';
    }
    if (value is Map<String, dynamic>) {
      final sortedKeys = value.keys.toList()..sort();
      final entries = sortedKeys
          .where((k) => value[k] != null)
          .map((k) => '${jsonEncode(k)}:${canonicalizeJcs(value[k])}')
          .join(',');
      return '{$entries}';
    }
    throw ArgumentError('Unsupported type: ${value.runtimeType}');
  }

  static String computeProductFingerprint(
    ProductEntity product, {
    String? tenantId,
  }) {
    final payload = <String, dynamic>{
      'id': product.id,
      'isActive': product.isActive,
      'name': product.name,
      'sellPrice': product.sellPrice,
      'tenantId': product.tenantId ?? tenantId ?? '',
      'uom': product.uom,
    };
    final canonical = canonicalizeJcs(payload);
    return sha256.convert(utf8.encode(canonical)).toString();
  }

  Future<ActivationCheckResult> checkRequiredConfigLocal(
    ActivationRequiredConfigParams params,
  ) async {
    final now = DateTime.now().toUtc();
    final trimmedTenant = params.tenantId.trim();

    // 1. Fiscal Config Local Checks
    final localFiscal =
        await _database.fiscalConfigLocalDao.getByTenantId(trimmedTenant);
    if (localFiscal == null) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason:
            'Fiscal configuration not found in local SQLite for tenant $trimmedTenant',
        evaluatedAt: now,
      );
    }

    if (localFiscal.revision != params.requiredFiscalRevision) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason:
            'Fiscal revision mismatch (local: ${localFiscal.revision}, required: ${params.requiredFiscalRevision})',
        details: {
          'localRevision': localFiscal.revision,
          'requiredRevision': params.requiredFiscalRevision,
        },
        evaluatedAt: now,
      );
    }

    if (localFiscal.fingerprint != params.requiredFiscalFingerprint) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason:
            'Fiscal fingerprint mismatch (local: ${localFiscal.fingerprint}, required: ${params.requiredFiscalFingerprint})',
        details: {
          'localFingerprint': localFiscal.fingerprint,
          'requiredFingerprint': params.requiredFiscalFingerprint,
        },
        evaluatedAt: now,
      );
    }

    try {
      final decoded = jsonDecode(localFiscal.payload);
      if (decoded is! Map) {
        return ActivationCheckResult(
          checkCode: 'REQUIRED_CONFIG_LOCAL',
          status: ActivationCheckStatus.fail,
          reason: 'Fiscal payload is corrupt (not an object)',
          evaluatedAt: now,
        );
      }
    } catch (_) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason: 'Fiscal payload is corrupt (JSON parse error)',
        evaluatedAt: now,
      );
    }

    // 2. Verification Product Local Checks
    final product = await _database.productDao
        .findProductById(params.verificationProductId.trim());
    if (product == null) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason:
            'Verification product ${params.verificationProductId} not found in local SQLite',
        evaluatedAt: now,
      );
    }

    if (product.tenantId != null &&
        product.tenantId!.isNotEmpty &&
        product.tenantId != trimmedTenant) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason:
            'Verification product belongs to tenant ${product.tenantId}, expected $trimmedTenant',
        details: {
          'productTenantId': product.tenantId,
          'expectedTenantId': trimmedTenant,
        },
        evaluatedAt: now,
      );
    }

    if (!product.isActive) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason: 'Verification product is marked inactive',
        details: {'productId': product.id, 'isActive': false},
        evaluatedAt: now,
      );
    }

    if (product.sellPrice <= 0) {
      return ActivationCheckResult(
        checkCode: 'REQUIRED_CONFIG_LOCAL',
        status: ActivationCheckStatus.fail,
        reason: 'Verification product sellPrice must be greater than 0',
        details: {'productId': product.id, 'sellPrice': product.sellPrice},
        evaluatedAt: now,
      );
    }

    if (params.verificationProductFingerprint != null &&
        params.verificationProductFingerprint!.trim().isNotEmpty) {
      final expectedFingerprint =
          params.verificationProductFingerprint!.trim();
      final actualFingerprint =
          computeProductFingerprint(product, tenantId: trimmedTenant);
      if (actualFingerprint != expectedFingerprint) {
        return ActivationCheckResult(
          checkCode: 'REQUIRED_CONFIG_LOCAL',
          status: ActivationCheckStatus.fail,
          reason:
              'Verification product fingerprint mismatch (local: $actualFingerprint, required: $expectedFingerprint)',
          details: {
            'localFingerprint': actualFingerprint,
            'expectedFingerprint': expectedFingerprint,
          },
          evaluatedAt: now,
        );
      }
    }

    // All checks pass
    return ActivationCheckResult(
      checkCode: 'REQUIRED_CONFIG_LOCAL',
      status: ActivationCheckStatus.pass,
      details: {
        'fiscalRevision': localFiscal.revision,
        'fiscalFingerprint': localFiscal.fingerprint,
        'productId': product.id,
        'productName': product.name,
        'productPrice': product.sellPrice,
      },
      evaluatedAt: now,
    );
  }

  Future<ActivationCheckResult> checkAuthorizedUserLocal(
    ActivationAuthorizedUserParams params,
  ) async {
    final now = DateTime.now().toUtc();
    final trimmedTenant = params.tenantId.trim();
    final identifier = params.authorizedUserId.trim();

    // 1. Resolve User
    var user = await _database.userDao.findUserById(identifier);
    if (user == null && identifier.contains('@')) {
      user = await _database.userDao.findUserByEmail(identifier);
    }
    if (user == null) {
      // Try username fallback
      final allUsers = await _database.userDao.findAllUsers();
      for (final u in allUsers) {
        final email = u.email?.trim().toLowerCase();
        if (email != null && email.split('@').first == identifier.toLowerCase()) {
          user = u;
          break;
        }
      }
    }

    if (user == null) {
      return ActivationCheckResult(
        checkCode: 'AUTHORIZED_USER_LOCAL',
        status: ActivationCheckStatus.fail,
        reason: 'Authorized user $identifier not found in local SQLite',
        evaluatedAt: now,
      );
    }

    // 2. Active check
    if (!user.isActive) {
      return ActivationCheckResult(
        checkCode: 'AUTHORIZED_USER_LOCAL',
        status: ActivationCheckStatus.fail,
        reason: 'Authorized user is inactive',
        details: {'userId': user.id, 'isActive': false},
        evaluatedAt: now,
      );
    }

    // 3. Tenant Isolation
    if (user.tenantId != null &&
        user.tenantId!.isNotEmpty &&
        user.tenantId != trimmedTenant) {
      return ActivationCheckResult(
        checkCode: 'AUTHORIZED_USER_LOCAL',
        status: ActivationCheckStatus.fail,
        reason:
            'Authorized user belongs to tenant ${user.tenantId}, expected $trimmedTenant',
        details: {
          'userTenantId': user.tenantId,
          'expectedTenantId': trimmedTenant,
        },
        evaluatedAt: now,
      );
    }

    // 4. Security Profile & Offline Credentials
    final profile = await _database.securityProfileDao.findByUserId(user.id);
    if (profile == null) {
      return ActivationCheckResult(
        checkCode: 'AUTHORIZED_USER_LOCAL',
        status: ActivationCheckStatus.fail,
        reason: 'No security profile found for authorized user',
        details: {'userId': user.id},
        evaluatedAt: now,
      );
    }

    final hasPin = profile.isPinEnabled &&
        profile.pinHash != null &&
        profile.pinHash!.trim().isNotEmpty;
    final hasTotp = profile.isTotpEnabled &&
        profile.totpSecretSeed != null &&
        profile.totpSecretSeed!.trim().isNotEmpty;

    if (!hasPin && !hasTotp) {
      return ActivationCheckResult(
        checkCode: 'AUTHORIZED_USER_LOCAL',
        status: ActivationCheckStatus.fail,
        reason: 'No offline credentials configured for authorized user',
        details: {
          'userId': user.id,
          'isPinEnabled': profile.isPinEnabled,
          'isTotpEnabled': profile.isTotpEnabled,
        },
        evaluatedAt: now,
      );
    }

    // 5. Offline Credential Verification
    if (params.testPin != null) {
      if (!hasPin) {
        return ActivationCheckResult(
          checkCode: 'AUTHORIZED_USER_LOCAL',
          status: ActivationCheckStatus.fail,
          reason: 'PIN authentication is not enabled for user',
          details: {'userId': user.id},
          evaluatedAt: now,
        );
      }

      final isPinValid = _localAuth.verifyPin(params.testPin!, profile.pinHash!);
      if (!isPinValid) {
        return ActivationCheckResult(
          checkCode: 'AUTHORIZED_USER_LOCAL',
          status: ActivationCheckStatus.fail,
          reason: 'Offline PIN verification failed for authorized user',
          details: {'userId': user.id},
          evaluatedAt: now,
        );
      }
    }

    // All checks pass
    return ActivationCheckResult(
      checkCode: 'AUTHORIZED_USER_LOCAL',
      status: ActivationCheckStatus.pass,
      details: {
        'userId': user.id,
        'userName': user.name,
        'userRole': user.role,
        'tenantId': user.tenantId,
        'pinEnabled': profile.isPinEnabled,
        'totpEnabled': profile.isTotpEnabled,
      },
      evaluatedAt: now,
    );
  }

  Future<ActivationAdapterSummary> evaluateAll({
    required ActivationRequiredConfigParams configParams,
    required ActivationAuthorizedUserParams userParams,
  }) async {
    final configResult = await checkRequiredConfigLocal(configParams);
    final userResult = await checkAuthorizedUserLocal(userParams);

    final blockers = <String>[];
    if (configResult.isFail) {
      blockers.add(configResult.reason ?? 'REQUIRED_CONFIG_LOCAL failed');
    }
    if (userResult.isFail) {
      blockers.add(userResult.reason ?? 'AUTHORIZED_USER_LOCAL failed');
    }

    return ActivationAdapterSummary(
      isReady: blockers.isEmpty,
      requiredConfigResult: configResult,
      authorizedUserResult: userResult,
      blockers: blockers,
    );
  }
}
