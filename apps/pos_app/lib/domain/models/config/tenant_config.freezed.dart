// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'tenant_config.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

TenantConfig _$TenantConfigFromJson(Map<String, dynamic> json) {
  return _TenantConfig.fromJson(json);
}

/// @nodoc
mixin _$TenantConfig {
  TenantOperationMode get operationMode => throw _privateConstructorUsedError;
  String get tenantId => throw _privateConstructorUsedError;
  String get tenantName => throw _privateConstructorUsedError;
  bool get buzzerPagerRequired => throw _privateConstructorUsedError;
  bool get tableServiceEnabled => throw _privateConstructorUsedError;
  bool get autoPrintKitchenTicket => throw _privateConstructorUsedError;
  Map<String, dynamic> get customSettings => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $TenantConfigCopyWith<TenantConfig> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $TenantConfigCopyWith<$Res> {
  factory $TenantConfigCopyWith(
          TenantConfig value, $Res Function(TenantConfig) then) =
      _$TenantConfigCopyWithImpl<$Res, TenantConfig>;
  @useResult
  $Res call(
      {TenantOperationMode operationMode,
      String tenantId,
      String tenantName,
      bool buzzerPagerRequired,
      bool tableServiceEnabled,
      bool autoPrintKitchenTicket,
      Map<String, dynamic> customSettings});
}

/// @nodoc
class _$TenantConfigCopyWithImpl<$Res, $Val extends TenantConfig>
    implements $TenantConfigCopyWith<$Res> {
  _$TenantConfigCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? operationMode = null,
    Object? tenantId = null,
    Object? tenantName = null,
    Object? buzzerPagerRequired = null,
    Object? tableServiceEnabled = null,
    Object? autoPrintKitchenTicket = null,
    Object? customSettings = null,
  }) {
    return _then(_value.copyWith(
      operationMode: null == operationMode
          ? _value.operationMode
          : operationMode // ignore: cast_nullable_to_non_nullable
              as TenantOperationMode,
      tenantId: null == tenantId
          ? _value.tenantId
          : tenantId // ignore: cast_nullable_to_non_nullable
              as String,
      tenantName: null == tenantName
          ? _value.tenantName
          : tenantName // ignore: cast_nullable_to_non_nullable
              as String,
      buzzerPagerRequired: null == buzzerPagerRequired
          ? _value.buzzerPagerRequired
          : buzzerPagerRequired // ignore: cast_nullable_to_non_nullable
              as bool,
      tableServiceEnabled: null == tableServiceEnabled
          ? _value.tableServiceEnabled
          : tableServiceEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
      autoPrintKitchenTicket: null == autoPrintKitchenTicket
          ? _value.autoPrintKitchenTicket
          : autoPrintKitchenTicket // ignore: cast_nullable_to_non_nullable
              as bool,
      customSettings: null == customSettings
          ? _value.customSettings
          : customSettings // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$TenantConfigImplCopyWith<$Res>
    implements $TenantConfigCopyWith<$Res> {
  factory _$$TenantConfigImplCopyWith(
          _$TenantConfigImpl value, $Res Function(_$TenantConfigImpl) then) =
      __$$TenantConfigImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {TenantOperationMode operationMode,
      String tenantId,
      String tenantName,
      bool buzzerPagerRequired,
      bool tableServiceEnabled,
      bool autoPrintKitchenTicket,
      Map<String, dynamic> customSettings});
}

/// @nodoc
class __$$TenantConfigImplCopyWithImpl<$Res>
    extends _$TenantConfigCopyWithImpl<$Res, _$TenantConfigImpl>
    implements _$$TenantConfigImplCopyWith<$Res> {
  __$$TenantConfigImplCopyWithImpl(
      _$TenantConfigImpl _value, $Res Function(_$TenantConfigImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? operationMode = null,
    Object? tenantId = null,
    Object? tenantName = null,
    Object? buzzerPagerRequired = null,
    Object? tableServiceEnabled = null,
    Object? autoPrintKitchenTicket = null,
    Object? customSettings = null,
  }) {
    return _then(_$TenantConfigImpl(
      operationMode: null == operationMode
          ? _value.operationMode
          : operationMode // ignore: cast_nullable_to_non_nullable
              as TenantOperationMode,
      tenantId: null == tenantId
          ? _value.tenantId
          : tenantId // ignore: cast_nullable_to_non_nullable
              as String,
      tenantName: null == tenantName
          ? _value.tenantName
          : tenantName // ignore: cast_nullable_to_non_nullable
              as String,
      buzzerPagerRequired: null == buzzerPagerRequired
          ? _value.buzzerPagerRequired
          : buzzerPagerRequired // ignore: cast_nullable_to_non_nullable
              as bool,
      tableServiceEnabled: null == tableServiceEnabled
          ? _value.tableServiceEnabled
          : tableServiceEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
      autoPrintKitchenTicket: null == autoPrintKitchenTicket
          ? _value.autoPrintKitchenTicket
          : autoPrintKitchenTicket // ignore: cast_nullable_to_non_nullable
              as bool,
      customSettings: null == customSettings
          ? _value._customSettings
          : customSettings // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$TenantConfigImpl extends _TenantConfig {
  const _$TenantConfigImpl(
      {this.operationMode = TenantOperationMode.foodparkQsr,
      this.tenantId = '',
      this.tenantName = '',
      this.buzzerPagerRequired = false,
      this.tableServiceEnabled = false,
      this.autoPrintKitchenTicket = false,
      final Map<String, dynamic> customSettings = const <String, dynamic>{}})
      : _customSettings = customSettings,
        super._();

  factory _$TenantConfigImpl.fromJson(Map<String, dynamic> json) =>
      _$$TenantConfigImplFromJson(json);

  @override
  @JsonKey()
  final TenantOperationMode operationMode;
  @override
  @JsonKey()
  final String tenantId;
  @override
  @JsonKey()
  final String tenantName;
  @override
  @JsonKey()
  final bool buzzerPagerRequired;
  @override
  @JsonKey()
  final bool tableServiceEnabled;
  @override
  @JsonKey()
  final bool autoPrintKitchenTicket;
  final Map<String, dynamic> _customSettings;
  @override
  @JsonKey()
  Map<String, dynamic> get customSettings {
    if (_customSettings is EqualUnmodifiableMapView) return _customSettings;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_customSettings);
  }

  @override
  String toString() {
    return 'TenantConfig(operationMode: $operationMode, tenantId: $tenantId, tenantName: $tenantName, buzzerPagerRequired: $buzzerPagerRequired, tableServiceEnabled: $tableServiceEnabled, autoPrintKitchenTicket: $autoPrintKitchenTicket, customSettings: $customSettings)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$TenantConfigImpl &&
            (identical(other.operationMode, operationMode) ||
                other.operationMode == operationMode) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.tenantName, tenantName) ||
                other.tenantName == tenantName) &&
            (identical(other.buzzerPagerRequired, buzzerPagerRequired) ||
                other.buzzerPagerRequired == buzzerPagerRequired) &&
            (identical(other.tableServiceEnabled, tableServiceEnabled) ||
                other.tableServiceEnabled == tableServiceEnabled) &&
            (identical(other.autoPrintKitchenTicket, autoPrintKitchenTicket) ||
                other.autoPrintKitchenTicket == autoPrintKitchenTicket) &&
            const DeepCollectionEquality()
                .equals(other._customSettings, _customSettings));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      operationMode,
      tenantId,
      tenantName,
      buzzerPagerRequired,
      tableServiceEnabled,
      autoPrintKitchenTicket,
      const DeepCollectionEquality().hash(_customSettings));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$TenantConfigImplCopyWith<_$TenantConfigImpl> get copyWith =>
      __$$TenantConfigImplCopyWithImpl<_$TenantConfigImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$TenantConfigImplToJson(
      this,
    );
  }
}

abstract class _TenantConfig extends TenantConfig {
  const factory _TenantConfig(
      {final TenantOperationMode operationMode,
      final String tenantId,
      final String tenantName,
      final bool buzzerPagerRequired,
      final bool tableServiceEnabled,
      final bool autoPrintKitchenTicket,
      final Map<String, dynamic> customSettings}) = _$TenantConfigImpl;
  const _TenantConfig._() : super._();

  factory _TenantConfig.fromJson(Map<String, dynamic> json) =
      _$TenantConfigImpl.fromJson;

  @override
  TenantOperationMode get operationMode;
  @override
  String get tenantId;
  @override
  String get tenantName;
  @override
  bool get buzzerPagerRequired;
  @override
  bool get tableServiceEnabled;
  @override
  bool get autoPrintKitchenTicket;
  @override
  Map<String, dynamic> get customSettings;
  @override
  @JsonKey(ignore: true)
  _$$TenantConfigImplCopyWith<_$TenantConfigImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
