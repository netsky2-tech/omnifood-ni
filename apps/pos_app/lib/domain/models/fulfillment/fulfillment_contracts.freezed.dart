// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'fulfillment_contracts.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

FulfillmentTopology _$FulfillmentTopologyFromJson(Map<String, dynamic> json) {
  return _FulfillmentTopology.fromJson(json);
}

/// @nodoc
mixin _$FulfillmentTopology {
  String get tenantId => throw _privateConstructorUsedError;
  int get contractVersion => throw _privateConstructorUsedError;
  int get revision => throw _privateConstructorUsedError;
  TenantOperationMode get operationMode => throw _privateConstructorUsedError;
  Set<FulfillmentChannel> get channels => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $FulfillmentTopologyCopyWith<FulfillmentTopology> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $FulfillmentTopologyCopyWith<$Res> {
  factory $FulfillmentTopologyCopyWith(
          FulfillmentTopology value, $Res Function(FulfillmentTopology) then) =
      _$FulfillmentTopologyCopyWithImpl<$Res, FulfillmentTopology>;
  @useResult
  $Res call(
      {String tenantId,
      int contractVersion,
      int revision,
      TenantOperationMode operationMode,
      Set<FulfillmentChannel> channels});
}

/// @nodoc
class _$FulfillmentTopologyCopyWithImpl<$Res, $Val extends FulfillmentTopology>
    implements $FulfillmentTopologyCopyWith<$Res> {
  _$FulfillmentTopologyCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? tenantId = null,
    Object? contractVersion = null,
    Object? revision = null,
    Object? operationMode = null,
    Object? channels = null,
  }) {
    return _then(_value.copyWith(
      tenantId: null == tenantId
          ? _value.tenantId
          : tenantId // ignore: cast_nullable_to_non_nullable
              as String,
      contractVersion: null == contractVersion
          ? _value.contractVersion
          : contractVersion // ignore: cast_nullable_to_non_nullable
              as int,
      revision: null == revision
          ? _value.revision
          : revision // ignore: cast_nullable_to_non_nullable
              as int,
      operationMode: null == operationMode
          ? _value.operationMode
          : operationMode // ignore: cast_nullable_to_non_nullable
              as TenantOperationMode,
      channels: null == channels
          ? _value.channels
          : channels // ignore: cast_nullable_to_non_nullable
              as Set<FulfillmentChannel>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$FulfillmentTopologyImplCopyWith<$Res>
    implements $FulfillmentTopologyCopyWith<$Res> {
  factory _$$FulfillmentTopologyImplCopyWith(_$FulfillmentTopologyImpl value,
          $Res Function(_$FulfillmentTopologyImpl) then) =
      __$$FulfillmentTopologyImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String tenantId,
      int contractVersion,
      int revision,
      TenantOperationMode operationMode,
      Set<FulfillmentChannel> channels});
}

/// @nodoc
class __$$FulfillmentTopologyImplCopyWithImpl<$Res>
    extends _$FulfillmentTopologyCopyWithImpl<$Res, _$FulfillmentTopologyImpl>
    implements _$$FulfillmentTopologyImplCopyWith<$Res> {
  __$$FulfillmentTopologyImplCopyWithImpl(_$FulfillmentTopologyImpl _value,
      $Res Function(_$FulfillmentTopologyImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? tenantId = null,
    Object? contractVersion = null,
    Object? revision = null,
    Object? operationMode = null,
    Object? channels = null,
  }) {
    return _then(_$FulfillmentTopologyImpl(
      tenantId: null == tenantId
          ? _value.tenantId
          : tenantId // ignore: cast_nullable_to_non_nullable
              as String,
      contractVersion: null == contractVersion
          ? _value.contractVersion
          : contractVersion // ignore: cast_nullable_to_non_nullable
              as int,
      revision: null == revision
          ? _value.revision
          : revision // ignore: cast_nullable_to_non_nullable
              as int,
      operationMode: null == operationMode
          ? _value.operationMode
          : operationMode // ignore: cast_nullable_to_non_nullable
              as TenantOperationMode,
      channels: null == channels
          ? _value._channels
          : channels // ignore: cast_nullable_to_non_nullable
              as Set<FulfillmentChannel>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$FulfillmentTopologyImpl implements _FulfillmentTopology {
  const _$FulfillmentTopologyImpl(
      {required this.tenantId,
      required this.contractVersion,
      required this.revision,
      required this.operationMode,
      required final Set<FulfillmentChannel> channels})
      : _channels = channels;

  factory _$FulfillmentTopologyImpl.fromJson(Map<String, dynamic> json) =>
      _$$FulfillmentTopologyImplFromJson(json);

  @override
  final String tenantId;
  @override
  final int contractVersion;
  @override
  final int revision;
  @override
  final TenantOperationMode operationMode;
  final Set<FulfillmentChannel> _channels;
  @override
  Set<FulfillmentChannel> get channels {
    if (_channels is EqualUnmodifiableSetView) return _channels;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableSetView(_channels);
  }

  @override
  String toString() {
    return 'FulfillmentTopology(tenantId: $tenantId, contractVersion: $contractVersion, revision: $revision, operationMode: $operationMode, channels: $channels)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$FulfillmentTopologyImpl &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.contractVersion, contractVersion) ||
                other.contractVersion == contractVersion) &&
            (identical(other.revision, revision) ||
                other.revision == revision) &&
            (identical(other.operationMode, operationMode) ||
                other.operationMode == operationMode) &&
            const DeepCollectionEquality().equals(other._channels, _channels));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, tenantId, contractVersion,
      revision, operationMode, const DeepCollectionEquality().hash(_channels));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$FulfillmentTopologyImplCopyWith<_$FulfillmentTopologyImpl> get copyWith =>
      __$$FulfillmentTopologyImplCopyWithImpl<_$FulfillmentTopologyImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$FulfillmentTopologyImplToJson(
      this,
    );
  }
}

abstract class _FulfillmentTopology implements FulfillmentTopology {
  const factory _FulfillmentTopology(
          {required final String tenantId,
          required final int contractVersion,
          required final int revision,
          required final TenantOperationMode operationMode,
          required final Set<FulfillmentChannel> channels}) =
      _$FulfillmentTopologyImpl;

  factory _FulfillmentTopology.fromJson(Map<String, dynamic> json) =
      _$FulfillmentTopologyImpl.fromJson;

  @override
  String get tenantId;
  @override
  int get contractVersion;
  @override
  int get revision;
  @override
  TenantOperationMode get operationMode;
  @override
  Set<FulfillmentChannel> get channels;
  @override
  @JsonKey(ignore: true)
  _$$FulfillmentTopologyImplCopyWith<_$FulfillmentTopologyImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

DgiInvoiceIdentity _$DgiInvoiceIdentityFromJson(Map<String, dynamic> json) {
  return _DgiInvoiceIdentity.fromJson(json);
}

/// @nodoc
mixin _$DgiInvoiceIdentity {
  String get invoiceId => throw _privateConstructorUsedError;
  String get invoiceNumber => throw _privateConstructorUsedError;
  bool get isCanceled => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $DgiInvoiceIdentityCopyWith<DgiInvoiceIdentity> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $DgiInvoiceIdentityCopyWith<$Res> {
  factory $DgiInvoiceIdentityCopyWith(
          DgiInvoiceIdentity value, $Res Function(DgiInvoiceIdentity) then) =
      _$DgiInvoiceIdentityCopyWithImpl<$Res, DgiInvoiceIdentity>;
  @useResult
  $Res call({String invoiceId, String invoiceNumber, bool isCanceled});
}

/// @nodoc
class _$DgiInvoiceIdentityCopyWithImpl<$Res, $Val extends DgiInvoiceIdentity>
    implements $DgiInvoiceIdentityCopyWith<$Res> {
  _$DgiInvoiceIdentityCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? invoiceId = null,
    Object? invoiceNumber = null,
    Object? isCanceled = null,
  }) {
    return _then(_value.copyWith(
      invoiceId: null == invoiceId
          ? _value.invoiceId
          : invoiceId // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceNumber: null == invoiceNumber
          ? _value.invoiceNumber
          : invoiceNumber // ignore: cast_nullable_to_non_nullable
              as String,
      isCanceled: null == isCanceled
          ? _value.isCanceled
          : isCanceled // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$DgiInvoiceIdentityImplCopyWith<$Res>
    implements $DgiInvoiceIdentityCopyWith<$Res> {
  factory _$$DgiInvoiceIdentityImplCopyWith(_$DgiInvoiceIdentityImpl value,
          $Res Function(_$DgiInvoiceIdentityImpl) then) =
      __$$DgiInvoiceIdentityImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String invoiceId, String invoiceNumber, bool isCanceled});
}

/// @nodoc
class __$$DgiInvoiceIdentityImplCopyWithImpl<$Res>
    extends _$DgiInvoiceIdentityCopyWithImpl<$Res, _$DgiInvoiceIdentityImpl>
    implements _$$DgiInvoiceIdentityImplCopyWith<$Res> {
  __$$DgiInvoiceIdentityImplCopyWithImpl(_$DgiInvoiceIdentityImpl _value,
      $Res Function(_$DgiInvoiceIdentityImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? invoiceId = null,
    Object? invoiceNumber = null,
    Object? isCanceled = null,
  }) {
    return _then(_$DgiInvoiceIdentityImpl(
      invoiceId: null == invoiceId
          ? _value.invoiceId
          : invoiceId // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceNumber: null == invoiceNumber
          ? _value.invoiceNumber
          : invoiceNumber // ignore: cast_nullable_to_non_nullable
              as String,
      isCanceled: null == isCanceled
          ? _value.isCanceled
          : isCanceled // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$DgiInvoiceIdentityImpl extends _DgiInvoiceIdentity {
  const _$DgiInvoiceIdentityImpl(
      {required this.invoiceId,
      required this.invoiceNumber,
      this.isCanceled = false})
      : super._();

  factory _$DgiInvoiceIdentityImpl.fromJson(Map<String, dynamic> json) =>
      _$$DgiInvoiceIdentityImplFromJson(json);

  @override
  final String invoiceId;
  @override
  final String invoiceNumber;
  @override
  @JsonKey()
  final bool isCanceled;

  @override
  String toString() {
    return 'DgiInvoiceIdentity(invoiceId: $invoiceId, invoiceNumber: $invoiceNumber, isCanceled: $isCanceled)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$DgiInvoiceIdentityImpl &&
            (identical(other.invoiceId, invoiceId) ||
                other.invoiceId == invoiceId) &&
            (identical(other.invoiceNumber, invoiceNumber) ||
                other.invoiceNumber == invoiceNumber) &&
            (identical(other.isCanceled, isCanceled) ||
                other.isCanceled == isCanceled));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, invoiceId, invoiceNumber, isCanceled);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$DgiInvoiceIdentityImplCopyWith<_$DgiInvoiceIdentityImpl> get copyWith =>
      __$$DgiInvoiceIdentityImplCopyWithImpl<_$DgiInvoiceIdentityImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$DgiInvoiceIdentityImplToJson(
      this,
    );
  }
}

abstract class _DgiInvoiceIdentity extends DgiInvoiceIdentity {
  const factory _DgiInvoiceIdentity(
      {required final String invoiceId,
      required final String invoiceNumber,
      final bool isCanceled}) = _$DgiInvoiceIdentityImpl;
  const _DgiInvoiceIdentity._() : super._();

  factory _DgiInvoiceIdentity.fromJson(Map<String, dynamic> json) =
      _$DgiInvoiceIdentityImpl.fromJson;

  @override
  String get invoiceId;
  @override
  String get invoiceNumber;
  @override
  bool get isCanceled;
  @override
  @JsonKey(ignore: true)
  _$$DgiInvoiceIdentityImplCopyWith<_$DgiInvoiceIdentityImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

RouteProfile _$RouteProfileFromJson(Map<String, dynamic> json) {
  return _RouteProfile.fromJson(json);
}

/// @nodoc
mixin _$RouteProfile {
  FulfillmentAction get action => throw _privateConstructorUsedError;
  String get station => throw _privateConstructorUsedError;
  int? get revision => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $RouteProfileCopyWith<RouteProfile> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RouteProfileCopyWith<$Res> {
  factory $RouteProfileCopyWith(
          RouteProfile value, $Res Function(RouteProfile) then) =
      _$RouteProfileCopyWithImpl<$Res, RouteProfile>;
  @useResult
  $Res call({FulfillmentAction action, String station, int? revision});
}

/// @nodoc
class _$RouteProfileCopyWithImpl<$Res, $Val extends RouteProfile>
    implements $RouteProfileCopyWith<$Res> {
  _$RouteProfileCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? action = null,
    Object? station = null,
    Object? revision = freezed,
  }) {
    return _then(_value.copyWith(
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as FulfillmentAction,
      station: null == station
          ? _value.station
          : station // ignore: cast_nullable_to_non_nullable
              as String,
      revision: freezed == revision
          ? _value.revision
          : revision // ignore: cast_nullable_to_non_nullable
              as int?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$RouteProfileImplCopyWith<$Res>
    implements $RouteProfileCopyWith<$Res> {
  factory _$$RouteProfileImplCopyWith(
          _$RouteProfileImpl value, $Res Function(_$RouteProfileImpl) then) =
      __$$RouteProfileImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({FulfillmentAction action, String station, int? revision});
}

/// @nodoc
class __$$RouteProfileImplCopyWithImpl<$Res>
    extends _$RouteProfileCopyWithImpl<$Res, _$RouteProfileImpl>
    implements _$$RouteProfileImplCopyWith<$Res> {
  __$$RouteProfileImplCopyWithImpl(
      _$RouteProfileImpl _value, $Res Function(_$RouteProfileImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? action = null,
    Object? station = null,
    Object? revision = freezed,
  }) {
    return _then(_$RouteProfileImpl(
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as FulfillmentAction,
      station: null == station
          ? _value.station
          : station // ignore: cast_nullable_to_non_nullable
              as String,
      revision: freezed == revision
          ? _value.revision
          : revision // ignore: cast_nullable_to_non_nullable
              as int?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$RouteProfileImpl extends _RouteProfile {
  const _$RouteProfileImpl(
      {required this.action, required this.station, this.revision})
      : super._();

  factory _$RouteProfileImpl.fromJson(Map<String, dynamic> json) =>
      _$$RouteProfileImplFromJson(json);

  @override
  final FulfillmentAction action;
  @override
  final String station;
  @override
  final int? revision;

  @override
  String toString() {
    return 'RouteProfile(action: $action, station: $station, revision: $revision)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RouteProfileImpl &&
            (identical(other.action, action) || other.action == action) &&
            (identical(other.station, station) || other.station == station) &&
            (identical(other.revision, revision) ||
                other.revision == revision));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, action, station, revision);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$RouteProfileImplCopyWith<_$RouteProfileImpl> get copyWith =>
      __$$RouteProfileImplCopyWithImpl<_$RouteProfileImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$RouteProfileImplToJson(
      this,
    );
  }
}

abstract class _RouteProfile extends RouteProfile {
  const factory _RouteProfile(
      {required final FulfillmentAction action,
      required final String station,
      final int? revision}) = _$RouteProfileImpl;
  const _RouteProfile._() : super._();

  factory _RouteProfile.fromJson(Map<String, dynamic> json) =
      _$RouteProfileImpl.fromJson;

  @override
  FulfillmentAction get action;
  @override
  String get station;
  @override
  int? get revision;
  @override
  @JsonKey(ignore: true)
  _$$RouteProfileImplCopyWith<_$RouteProfileImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

FulfillmentLine _$FulfillmentLineFromJson(Map<String, dynamic> json) {
  return _FulfillmentLine.fromJson(json);
}

/// @nodoc
mixin _$FulfillmentLine {
  String get id => throw _privateConstructorUsedError;
  RouteProfile? get profile => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $FulfillmentLineCopyWith<FulfillmentLine> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $FulfillmentLineCopyWith<$Res> {
  factory $FulfillmentLineCopyWith(
          FulfillmentLine value, $Res Function(FulfillmentLine) then) =
      _$FulfillmentLineCopyWithImpl<$Res, FulfillmentLine>;
  @useResult
  $Res call({String id, RouteProfile? profile});

  $RouteProfileCopyWith<$Res>? get profile;
}

/// @nodoc
class _$FulfillmentLineCopyWithImpl<$Res, $Val extends FulfillmentLine>
    implements $FulfillmentLineCopyWith<$Res> {
  _$FulfillmentLineCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? profile = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      profile: freezed == profile
          ? _value.profile
          : profile // ignore: cast_nullable_to_non_nullable
              as RouteProfile?,
    ) as $Val);
  }

  @override
  @pragma('vm:prefer-inline')
  $RouteProfileCopyWith<$Res>? get profile {
    if (_value.profile == null) {
      return null;
    }

    return $RouteProfileCopyWith<$Res>(_value.profile!, (value) {
      return _then(_value.copyWith(profile: value) as $Val);
    });
  }
}

/// @nodoc
abstract class _$$FulfillmentLineImplCopyWith<$Res>
    implements $FulfillmentLineCopyWith<$Res> {
  factory _$$FulfillmentLineImplCopyWith(_$FulfillmentLineImpl value,
          $Res Function(_$FulfillmentLineImpl) then) =
      __$$FulfillmentLineImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String id, RouteProfile? profile});

  @override
  $RouteProfileCopyWith<$Res>? get profile;
}

/// @nodoc
class __$$FulfillmentLineImplCopyWithImpl<$Res>
    extends _$FulfillmentLineCopyWithImpl<$Res, _$FulfillmentLineImpl>
    implements _$$FulfillmentLineImplCopyWith<$Res> {
  __$$FulfillmentLineImplCopyWithImpl(
      _$FulfillmentLineImpl _value, $Res Function(_$FulfillmentLineImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? profile = freezed,
  }) {
    return _then(_$FulfillmentLineImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      profile: freezed == profile
          ? _value.profile
          : profile // ignore: cast_nullable_to_non_nullable
              as RouteProfile?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$FulfillmentLineImpl implements _FulfillmentLine {
  const _$FulfillmentLineImpl({required this.id, this.profile});

  factory _$FulfillmentLineImpl.fromJson(Map<String, dynamic> json) =>
      _$$FulfillmentLineImplFromJson(json);

  @override
  final String id;
  @override
  final RouteProfile? profile;

  @override
  String toString() {
    return 'FulfillmentLine(id: $id, profile: $profile)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$FulfillmentLineImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.profile, profile) || other.profile == profile));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, profile);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$FulfillmentLineImplCopyWith<_$FulfillmentLineImpl> get copyWith =>
      __$$FulfillmentLineImplCopyWithImpl<_$FulfillmentLineImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$FulfillmentLineImplToJson(
      this,
    );
  }
}

abstract class _FulfillmentLine implements FulfillmentLine {
  const factory _FulfillmentLine(
      {required final String id,
      final RouteProfile? profile}) = _$FulfillmentLineImpl;

  factory _FulfillmentLine.fromJson(Map<String, dynamic> json) =
      _$FulfillmentLineImpl.fromJson;

  @override
  String get id;
  @override
  RouteProfile? get profile;
  @override
  @JsonKey(ignore: true)
  _$$FulfillmentLineImplCopyWith<_$FulfillmentLineImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

RoutedFulfillmentLine _$RoutedFulfillmentLineFromJson(
    Map<String, dynamic> json) {
  return _RoutedFulfillmentLine.fromJson(json);
}

/// @nodoc
mixin _$RoutedFulfillmentLine {
  String get id => throw _privateConstructorUsedError;
  FulfillmentAction get action => throw _privateConstructorUsedError;
  String get station => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $RoutedFulfillmentLineCopyWith<RoutedFulfillmentLine> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RoutedFulfillmentLineCopyWith<$Res> {
  factory $RoutedFulfillmentLineCopyWith(RoutedFulfillmentLine value,
          $Res Function(RoutedFulfillmentLine) then) =
      _$RoutedFulfillmentLineCopyWithImpl<$Res, RoutedFulfillmentLine>;
  @useResult
  $Res call({String id, FulfillmentAction action, String station});
}

/// @nodoc
class _$RoutedFulfillmentLineCopyWithImpl<$Res,
        $Val extends RoutedFulfillmentLine>
    implements $RoutedFulfillmentLineCopyWith<$Res> {
  _$RoutedFulfillmentLineCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? action = null,
    Object? station = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as FulfillmentAction,
      station: null == station
          ? _value.station
          : station // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$RoutedFulfillmentLineImplCopyWith<$Res>
    implements $RoutedFulfillmentLineCopyWith<$Res> {
  factory _$$RoutedFulfillmentLineImplCopyWith(
          _$RoutedFulfillmentLineImpl value,
          $Res Function(_$RoutedFulfillmentLineImpl) then) =
      __$$RoutedFulfillmentLineImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String id, FulfillmentAction action, String station});
}

/// @nodoc
class __$$RoutedFulfillmentLineImplCopyWithImpl<$Res>
    extends _$RoutedFulfillmentLineCopyWithImpl<$Res,
        _$RoutedFulfillmentLineImpl>
    implements _$$RoutedFulfillmentLineImplCopyWith<$Res> {
  __$$RoutedFulfillmentLineImplCopyWithImpl(_$RoutedFulfillmentLineImpl _value,
      $Res Function(_$RoutedFulfillmentLineImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? action = null,
    Object? station = null,
  }) {
    return _then(_$RoutedFulfillmentLineImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as FulfillmentAction,
      station: null == station
          ? _value.station
          : station // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$RoutedFulfillmentLineImpl implements _RoutedFulfillmentLine {
  const _$RoutedFulfillmentLineImpl(
      {required this.id, required this.action, required this.station});

  factory _$RoutedFulfillmentLineImpl.fromJson(Map<String, dynamic> json) =>
      _$$RoutedFulfillmentLineImplFromJson(json);

  @override
  final String id;
  @override
  final FulfillmentAction action;
  @override
  final String station;

  @override
  String toString() {
    return 'RoutedFulfillmentLine(id: $id, action: $action, station: $station)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RoutedFulfillmentLineImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.action, action) || other.action == action) &&
            (identical(other.station, station) || other.station == station));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, action, station);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$RoutedFulfillmentLineImplCopyWith<_$RoutedFulfillmentLineImpl>
      get copyWith => __$$RoutedFulfillmentLineImplCopyWithImpl<
          _$RoutedFulfillmentLineImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$RoutedFulfillmentLineImplToJson(
      this,
    );
  }
}

abstract class _RoutedFulfillmentLine implements RoutedFulfillmentLine {
  const factory _RoutedFulfillmentLine(
      {required final String id,
      required final FulfillmentAction action,
      required final String station}) = _$RoutedFulfillmentLineImpl;

  factory _RoutedFulfillmentLine.fromJson(Map<String, dynamic> json) =
      _$RoutedFulfillmentLineImpl.fromJson;

  @override
  String get id;
  @override
  FulfillmentAction get action;
  @override
  String get station;
  @override
  @JsonKey(ignore: true)
  _$$RoutedFulfillmentLineImplCopyWith<_$RoutedFulfillmentLineImpl>
      get copyWith => throw _privateConstructorUsedError;
}

ConfigurationAlert _$ConfigurationAlertFromJson(Map<String, dynamic> json) {
  return _ConfigurationAlert.fromJson(json);
}

/// @nodoc
mixin _$ConfigurationAlert {
  String get lineId => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ConfigurationAlertCopyWith<ConfigurationAlert> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ConfigurationAlertCopyWith<$Res> {
  factory $ConfigurationAlertCopyWith(
          ConfigurationAlert value, $Res Function(ConfigurationAlert) then) =
      _$ConfigurationAlertCopyWithImpl<$Res, ConfigurationAlert>;
  @useResult
  $Res call({String lineId});
}

/// @nodoc
class _$ConfigurationAlertCopyWithImpl<$Res, $Val extends ConfigurationAlert>
    implements $ConfigurationAlertCopyWith<$Res> {
  _$ConfigurationAlertCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? lineId = null,
  }) {
    return _then(_value.copyWith(
      lineId: null == lineId
          ? _value.lineId
          : lineId // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ConfigurationAlertImplCopyWith<$Res>
    implements $ConfigurationAlertCopyWith<$Res> {
  factory _$$ConfigurationAlertImplCopyWith(_$ConfigurationAlertImpl value,
          $Res Function(_$ConfigurationAlertImpl) then) =
      __$$ConfigurationAlertImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String lineId});
}

/// @nodoc
class __$$ConfigurationAlertImplCopyWithImpl<$Res>
    extends _$ConfigurationAlertCopyWithImpl<$Res, _$ConfigurationAlertImpl>
    implements _$$ConfigurationAlertImplCopyWith<$Res> {
  __$$ConfigurationAlertImplCopyWithImpl(_$ConfigurationAlertImpl _value,
      $Res Function(_$ConfigurationAlertImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? lineId = null,
  }) {
    return _then(_$ConfigurationAlertImpl(
      lineId: null == lineId
          ? _value.lineId
          : lineId // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ConfigurationAlertImpl implements _ConfigurationAlert {
  const _$ConfigurationAlertImpl({required this.lineId});

  factory _$ConfigurationAlertImpl.fromJson(Map<String, dynamic> json) =>
      _$$ConfigurationAlertImplFromJson(json);

  @override
  final String lineId;

  @override
  String toString() {
    return 'ConfigurationAlert(lineId: $lineId)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ConfigurationAlertImpl &&
            (identical(other.lineId, lineId) || other.lineId == lineId));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, lineId);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ConfigurationAlertImplCopyWith<_$ConfigurationAlertImpl> get copyWith =>
      __$$ConfigurationAlertImplCopyWithImpl<_$ConfigurationAlertImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ConfigurationAlertImplToJson(
      this,
    );
  }
}

abstract class _ConfigurationAlert implements ConfigurationAlert {
  const factory _ConfigurationAlert({required final String lineId}) =
      _$ConfigurationAlertImpl;

  factory _ConfigurationAlert.fromJson(Map<String, dynamic> json) =
      _$ConfigurationAlertImpl.fromJson;

  @override
  String get lineId;
  @override
  @JsonKey(ignore: true)
  _$$ConfigurationAlertImplCopyWith<_$ConfigurationAlertImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

RoutingResult _$RoutingResultFromJson(Map<String, dynamic> json) {
  return _RoutingResult.fromJson(json);
}

/// @nodoc
mixin _$RoutingResult {
  List<RoutedFulfillmentLine> get lines => throw _privateConstructorUsedError;
  List<ConfigurationAlert> get alerts => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $RoutingResultCopyWith<RoutingResult> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RoutingResultCopyWith<$Res> {
  factory $RoutingResultCopyWith(
          RoutingResult value, $Res Function(RoutingResult) then) =
      _$RoutingResultCopyWithImpl<$Res, RoutingResult>;
  @useResult
  $Res call(
      {List<RoutedFulfillmentLine> lines, List<ConfigurationAlert> alerts});
}

/// @nodoc
class _$RoutingResultCopyWithImpl<$Res, $Val extends RoutingResult>
    implements $RoutingResultCopyWith<$Res> {
  _$RoutingResultCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? lines = null,
    Object? alerts = null,
  }) {
    return _then(_value.copyWith(
      lines: null == lines
          ? _value.lines
          : lines // ignore: cast_nullable_to_non_nullable
              as List<RoutedFulfillmentLine>,
      alerts: null == alerts
          ? _value.alerts
          : alerts // ignore: cast_nullable_to_non_nullable
              as List<ConfigurationAlert>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$RoutingResultImplCopyWith<$Res>
    implements $RoutingResultCopyWith<$Res> {
  factory _$$RoutingResultImplCopyWith(
          _$RoutingResultImpl value, $Res Function(_$RoutingResultImpl) then) =
      __$$RoutingResultImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {List<RoutedFulfillmentLine> lines, List<ConfigurationAlert> alerts});
}

/// @nodoc
class __$$RoutingResultImplCopyWithImpl<$Res>
    extends _$RoutingResultCopyWithImpl<$Res, _$RoutingResultImpl>
    implements _$$RoutingResultImplCopyWith<$Res> {
  __$$RoutingResultImplCopyWithImpl(
      _$RoutingResultImpl _value, $Res Function(_$RoutingResultImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? lines = null,
    Object? alerts = null,
  }) {
    return _then(_$RoutingResultImpl(
      lines: null == lines
          ? _value._lines
          : lines // ignore: cast_nullable_to_non_nullable
              as List<RoutedFulfillmentLine>,
      alerts: null == alerts
          ? _value._alerts
          : alerts // ignore: cast_nullable_to_non_nullable
              as List<ConfigurationAlert>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$RoutingResultImpl extends _RoutingResult {
  const _$RoutingResultImpl(
      {required final List<RoutedFulfillmentLine> lines,
      required final List<ConfigurationAlert> alerts})
      : _lines = lines,
        _alerts = alerts,
        super._();

  factory _$RoutingResultImpl.fromJson(Map<String, dynamic> json) =>
      _$$RoutingResultImplFromJson(json);

  final List<RoutedFulfillmentLine> _lines;
  @override
  List<RoutedFulfillmentLine> get lines {
    if (_lines is EqualUnmodifiableListView) return _lines;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_lines);
  }

  final List<ConfigurationAlert> _alerts;
  @override
  List<ConfigurationAlert> get alerts {
    if (_alerts is EqualUnmodifiableListView) return _alerts;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_alerts);
  }

  @override
  String toString() {
    return 'RoutingResult(lines: $lines, alerts: $alerts)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RoutingResultImpl &&
            const DeepCollectionEquality().equals(other._lines, _lines) &&
            const DeepCollectionEquality().equals(other._alerts, _alerts));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      const DeepCollectionEquality().hash(_lines),
      const DeepCollectionEquality().hash(_alerts));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$RoutingResultImplCopyWith<_$RoutingResultImpl> get copyWith =>
      __$$RoutingResultImplCopyWithImpl<_$RoutingResultImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$RoutingResultImplToJson(
      this,
    );
  }
}

abstract class _RoutingResult extends RoutingResult {
  const factory _RoutingResult(
      {required final List<RoutedFulfillmentLine> lines,
      required final List<ConfigurationAlert> alerts}) = _$RoutingResultImpl;
  const _RoutingResult._() : super._();

  factory _RoutingResult.fromJson(Map<String, dynamic> json) =
      _$RoutingResultImpl.fromJson;

  @override
  List<RoutedFulfillmentLine> get lines;
  @override
  List<ConfigurationAlert> get alerts;
  @override
  @JsonKey(ignore: true)
  _$$RoutingResultImplCopyWith<_$RoutingResultImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

PrintJob _$PrintJobFromJson(Map<String, dynamic> json) {
  return _PrintJob.fromJson(json);
}

/// @nodoc
mixin _$PrintJob {
  int get sequence => throw _privateConstructorUsedError;
  PrintDocumentKind get kind => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PrintJobCopyWith<PrintJob> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PrintJobCopyWith<$Res> {
  factory $PrintJobCopyWith(PrintJob value, $Res Function(PrintJob) then) =
      _$PrintJobCopyWithImpl<$Res, PrintJob>;
  @useResult
  $Res call({int sequence, PrintDocumentKind kind});
}

/// @nodoc
class _$PrintJobCopyWithImpl<$Res, $Val extends PrintJob>
    implements $PrintJobCopyWith<$Res> {
  _$PrintJobCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? sequence = null,
    Object? kind = null,
  }) {
    return _then(_value.copyWith(
      sequence: null == sequence
          ? _value.sequence
          : sequence // ignore: cast_nullable_to_non_nullable
              as int,
      kind: null == kind
          ? _value.kind
          : kind // ignore: cast_nullable_to_non_nullable
              as PrintDocumentKind,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$PrintJobImplCopyWith<$Res>
    implements $PrintJobCopyWith<$Res> {
  factory _$$PrintJobImplCopyWith(
          _$PrintJobImpl value, $Res Function(_$PrintJobImpl) then) =
      __$$PrintJobImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({int sequence, PrintDocumentKind kind});
}

/// @nodoc
class __$$PrintJobImplCopyWithImpl<$Res>
    extends _$PrintJobCopyWithImpl<$Res, _$PrintJobImpl>
    implements _$$PrintJobImplCopyWith<$Res> {
  __$$PrintJobImplCopyWithImpl(
      _$PrintJobImpl _value, $Res Function(_$PrintJobImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? sequence = null,
    Object? kind = null,
  }) {
    return _then(_$PrintJobImpl(
      sequence: null == sequence
          ? _value.sequence
          : sequence // ignore: cast_nullable_to_non_nullable
              as int,
      kind: null == kind
          ? _value.kind
          : kind // ignore: cast_nullable_to_non_nullable
              as PrintDocumentKind,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$PrintJobImpl implements _PrintJob {
  const _$PrintJobImpl({required this.sequence, required this.kind});

  factory _$PrintJobImpl.fromJson(Map<String, dynamic> json) =>
      _$$PrintJobImplFromJson(json);

  @override
  final int sequence;
  @override
  final PrintDocumentKind kind;

  @override
  String toString() {
    return 'PrintJob(sequence: $sequence, kind: $kind)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PrintJobImpl &&
            (identical(other.sequence, sequence) ||
                other.sequence == sequence) &&
            (identical(other.kind, kind) || other.kind == kind));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, sequence, kind);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PrintJobImplCopyWith<_$PrintJobImpl> get copyWith =>
      __$$PrintJobImplCopyWithImpl<_$PrintJobImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PrintJobImplToJson(
      this,
    );
  }
}

abstract class _PrintJob implements PrintJob {
  const factory _PrintJob(
      {required final int sequence,
      required final PrintDocumentKind kind}) = _$PrintJobImpl;

  factory _PrintJob.fromJson(Map<String, dynamic> json) =
      _$PrintJobImpl.fromJson;

  @override
  int get sequence;
  @override
  PrintDocumentKind get kind;
  @override
  @JsonKey(ignore: true)
  _$$PrintJobImplCopyWith<_$PrintJobImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

PrintPlan _$PrintPlanFromJson(Map<String, dynamic> json) {
  return _PrintPlan.fromJson(json);
}

/// @nodoc
mixin _$PrintPlan {
  List<PrintJob> get jobs => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PrintPlanCopyWith<PrintPlan> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PrintPlanCopyWith<$Res> {
  factory $PrintPlanCopyWith(PrintPlan value, $Res Function(PrintPlan) then) =
      _$PrintPlanCopyWithImpl<$Res, PrintPlan>;
  @useResult
  $Res call({List<PrintJob> jobs});
}

/// @nodoc
class _$PrintPlanCopyWithImpl<$Res, $Val extends PrintPlan>
    implements $PrintPlanCopyWith<$Res> {
  _$PrintPlanCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? jobs = null,
  }) {
    return _then(_value.copyWith(
      jobs: null == jobs
          ? _value.jobs
          : jobs // ignore: cast_nullable_to_non_nullable
              as List<PrintJob>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$PrintPlanImplCopyWith<$Res>
    implements $PrintPlanCopyWith<$Res> {
  factory _$$PrintPlanImplCopyWith(
          _$PrintPlanImpl value, $Res Function(_$PrintPlanImpl) then) =
      __$$PrintPlanImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({List<PrintJob> jobs});
}

/// @nodoc
class __$$PrintPlanImplCopyWithImpl<$Res>
    extends _$PrintPlanCopyWithImpl<$Res, _$PrintPlanImpl>
    implements _$$PrintPlanImplCopyWith<$Res> {
  __$$PrintPlanImplCopyWithImpl(
      _$PrintPlanImpl _value, $Res Function(_$PrintPlanImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? jobs = null,
  }) {
    return _then(_$PrintPlanImpl(
      jobs: null == jobs
          ? _value._jobs
          : jobs // ignore: cast_nullable_to_non_nullable
              as List<PrintJob>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$PrintPlanImpl extends _PrintPlan {
  const _$PrintPlanImpl({required final List<PrintJob> jobs})
      : _jobs = jobs,
        super._();

  factory _$PrintPlanImpl.fromJson(Map<String, dynamic> json) =>
      _$$PrintPlanImplFromJson(json);

  final List<PrintJob> _jobs;
  @override
  List<PrintJob> get jobs {
    if (_jobs is EqualUnmodifiableListView) return _jobs;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_jobs);
  }

  @override
  String toString() {
    return 'PrintPlan(jobs: $jobs)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PrintPlanImpl &&
            const DeepCollectionEquality().equals(other._jobs, _jobs));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, const DeepCollectionEquality().hash(_jobs));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PrintPlanImplCopyWith<_$PrintPlanImpl> get copyWith =>
      __$$PrintPlanImplCopyWithImpl<_$PrintPlanImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PrintPlanImplToJson(
      this,
    );
  }
}

abstract class _PrintPlan extends PrintPlan {
  const factory _PrintPlan({required final List<PrintJob> jobs}) =
      _$PrintPlanImpl;
  const _PrintPlan._() : super._();

  factory _PrintPlan.fromJson(Map<String, dynamic> json) =
      _$PrintPlanImpl.fromJson;

  @override
  List<PrintJob> get jobs;
  @override
  @JsonKey(ignore: true)
  _$$PrintPlanImplCopyWith<_$PrintPlanImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

PrintTransition _$PrintTransitionFromJson(Map<String, dynamic> json) {
  return _PrintTransition.fromJson(json);
}

/// @nodoc
mixin _$PrintTransition {
  PrintAttemptState get state => throw _privateConstructorUsedError;
  bool get canRetry => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PrintTransitionCopyWith<PrintTransition> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PrintTransitionCopyWith<$Res> {
  factory $PrintTransitionCopyWith(
          PrintTransition value, $Res Function(PrintTransition) then) =
      _$PrintTransitionCopyWithImpl<$Res, PrintTransition>;
  @useResult
  $Res call({PrintAttemptState state, bool canRetry});
}

/// @nodoc
class _$PrintTransitionCopyWithImpl<$Res, $Val extends PrintTransition>
    implements $PrintTransitionCopyWith<$Res> {
  _$PrintTransitionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? state = null,
    Object? canRetry = null,
  }) {
    return _then(_value.copyWith(
      state: null == state
          ? _value.state
          : state // ignore: cast_nullable_to_non_nullable
              as PrintAttemptState,
      canRetry: null == canRetry
          ? _value.canRetry
          : canRetry // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$PrintTransitionImplCopyWith<$Res>
    implements $PrintTransitionCopyWith<$Res> {
  factory _$$PrintTransitionImplCopyWith(_$PrintTransitionImpl value,
          $Res Function(_$PrintTransitionImpl) then) =
      __$$PrintTransitionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({PrintAttemptState state, bool canRetry});
}

/// @nodoc
class __$$PrintTransitionImplCopyWithImpl<$Res>
    extends _$PrintTransitionCopyWithImpl<$Res, _$PrintTransitionImpl>
    implements _$$PrintTransitionImplCopyWith<$Res> {
  __$$PrintTransitionImplCopyWithImpl(
      _$PrintTransitionImpl _value, $Res Function(_$PrintTransitionImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? state = null,
    Object? canRetry = null,
  }) {
    return _then(_$PrintTransitionImpl(
      state: null == state
          ? _value.state
          : state // ignore: cast_nullable_to_non_nullable
              as PrintAttemptState,
      canRetry: null == canRetry
          ? _value.canRetry
          : canRetry // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$PrintTransitionImpl extends _PrintTransition {
  const _$PrintTransitionImpl({required this.state, required this.canRetry})
      : super._();

  factory _$PrintTransitionImpl.fromJson(Map<String, dynamic> json) =>
      _$$PrintTransitionImplFromJson(json);

  @override
  final PrintAttemptState state;
  @override
  final bool canRetry;

  @override
  String toString() {
    return 'PrintTransition(state: $state, canRetry: $canRetry)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PrintTransitionImpl &&
            (identical(other.state, state) || other.state == state) &&
            (identical(other.canRetry, canRetry) ||
                other.canRetry == canRetry));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, state, canRetry);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PrintTransitionImplCopyWith<_$PrintTransitionImpl> get copyWith =>
      __$$PrintTransitionImplCopyWithImpl<_$PrintTransitionImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PrintTransitionImplToJson(
      this,
    );
  }
}

abstract class _PrintTransition extends PrintTransition {
  const factory _PrintTransition(
      {required final PrintAttemptState state,
      required final bool canRetry}) = _$PrintTransitionImpl;
  const _PrintTransition._() : super._();

  factory _PrintTransition.fromJson(Map<String, dynamic> json) =
      _$PrintTransitionImpl.fromJson;

  @override
  PrintAttemptState get state;
  @override
  bool get canRetry;
  @override
  @JsonKey(ignore: true)
  _$$PrintTransitionImplCopyWith<_$PrintTransitionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
