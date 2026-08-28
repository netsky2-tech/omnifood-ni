// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'printer_config.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

PrinterConfig _$PrinterConfigFromJson(Map<String, dynamic> json) {
  return _PrinterConfig.fromJson(json);
}

/// @nodoc
mixin _$PrinterConfig {
  PrinterDriverType get driverType => throw _privateConstructorUsedError;
  bool get autoPrintInvoice => throw _privateConstructorUsedError;
  bool get autoPrintKitchen => throw _privateConstructorUsedError;
  bool get openDrawerOnCash => throw _privateConstructorUsedError;
  int get paperWidthMm => throw _privateConstructorUsedError;
  String? get networkIp => throw _privateConstructorUsedError;
  int get networkPort => throw _privateConstructorUsedError;
  int get copies => throw _privateConstructorUsedError;
  String get headerBusinessName => throw _privateConstructorUsedError;
  String? get headerRuc => throw _privateConstructorUsedError;
  String? get headerAddress => throw _privateConstructorUsedError;
  String? get headerPhone => throw _privateConstructorUsedError;
  String? get logoBase64 => throw _privateConstructorUsedError;
  int? get logoWidth => throw _privateConstructorUsedError;
  int? get logoHeight => throw _privateConstructorUsedError;
  bool get isLogoEnabled => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PrinterConfigCopyWith<PrinterConfig> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PrinterConfigCopyWith<$Res> {
  factory $PrinterConfigCopyWith(
          PrinterConfig value, $Res Function(PrinterConfig) then) =
      _$PrinterConfigCopyWithImpl<$Res, PrinterConfig>;
  @useResult
  $Res call(
      {PrinterDriverType driverType,
      bool autoPrintInvoice,
      bool autoPrintKitchen,
      bool openDrawerOnCash,
      int paperWidthMm,
      String? networkIp,
      int networkPort,
      int copies,
      String headerBusinessName,
      String? headerRuc,
      String? headerAddress,
      String? headerPhone,
      String? logoBase64,
      int? logoWidth,
      int? logoHeight,
      bool isLogoEnabled});
}

/// @nodoc
class _$PrinterConfigCopyWithImpl<$Res, $Val extends PrinterConfig>
    implements $PrinterConfigCopyWith<$Res> {
  _$PrinterConfigCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? driverType = null,
    Object? autoPrintInvoice = null,
    Object? autoPrintKitchen = null,
    Object? openDrawerOnCash = null,
    Object? paperWidthMm = null,
    Object? networkIp = freezed,
    Object? networkPort = null,
    Object? copies = null,
    Object? headerBusinessName = null,
    Object? headerRuc = freezed,
    Object? headerAddress = freezed,
    Object? headerPhone = freezed,
    Object? logoBase64 = freezed,
    Object? logoWidth = freezed,
    Object? logoHeight = freezed,
    Object? isLogoEnabled = null,
  }) {
    return _then(_value.copyWith(
      driverType: null == driverType
          ? _value.driverType
          : driverType // ignore: cast_nullable_to_non_nullable
              as PrinterDriverType,
      autoPrintInvoice: null == autoPrintInvoice
          ? _value.autoPrintInvoice
          : autoPrintInvoice // ignore: cast_nullable_to_non_nullable
              as bool,
      autoPrintKitchen: null == autoPrintKitchen
          ? _value.autoPrintKitchen
          : autoPrintKitchen // ignore: cast_nullable_to_non_nullable
              as bool,
      openDrawerOnCash: null == openDrawerOnCash
          ? _value.openDrawerOnCash
          : openDrawerOnCash // ignore: cast_nullable_to_non_nullable
              as bool,
      paperWidthMm: null == paperWidthMm
          ? _value.paperWidthMm
          : paperWidthMm // ignore: cast_nullable_to_non_nullable
              as int,
      networkIp: freezed == networkIp
          ? _value.networkIp
          : networkIp // ignore: cast_nullable_to_non_nullable
              as String?,
      networkPort: null == networkPort
          ? _value.networkPort
          : networkPort // ignore: cast_nullable_to_non_nullable
              as int,
      copies: null == copies
          ? _value.copies
          : copies // ignore: cast_nullable_to_non_nullable
              as int,
      headerBusinessName: null == headerBusinessName
          ? _value.headerBusinessName
          : headerBusinessName // ignore: cast_nullable_to_non_nullable
              as String,
      headerRuc: freezed == headerRuc
          ? _value.headerRuc
          : headerRuc // ignore: cast_nullable_to_non_nullable
              as String?,
      headerAddress: freezed == headerAddress
          ? _value.headerAddress
          : headerAddress // ignore: cast_nullable_to_non_nullable
              as String?,
      headerPhone: freezed == headerPhone
          ? _value.headerPhone
          : headerPhone // ignore: cast_nullable_to_non_nullable
              as String?,
      logoBase64: freezed == logoBase64
          ? _value.logoBase64
          : logoBase64 // ignore: cast_nullable_to_non_nullable
              as String?,
      logoWidth: freezed == logoWidth
          ? _value.logoWidth
          : logoWidth // ignore: cast_nullable_to_non_nullable
              as int?,
      logoHeight: freezed == logoHeight
          ? _value.logoHeight
          : logoHeight // ignore: cast_nullable_to_non_nullable
              as int?,
      isLogoEnabled: null == isLogoEnabled
          ? _value.isLogoEnabled
          : isLogoEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$PrinterConfigImplCopyWith<$Res>
    implements $PrinterConfigCopyWith<$Res> {
  factory _$$PrinterConfigImplCopyWith(
          _$PrinterConfigImpl value, $Res Function(_$PrinterConfigImpl) then) =
      __$$PrinterConfigImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {PrinterDriverType driverType,
      bool autoPrintInvoice,
      bool autoPrintKitchen,
      bool openDrawerOnCash,
      int paperWidthMm,
      String? networkIp,
      int networkPort,
      int copies,
      String headerBusinessName,
      String? headerRuc,
      String? headerAddress,
      String? headerPhone,
      String? logoBase64,
      int? logoWidth,
      int? logoHeight,
      bool isLogoEnabled});
}

/// @nodoc
class __$$PrinterConfigImplCopyWithImpl<$Res>
    extends _$PrinterConfigCopyWithImpl<$Res, _$PrinterConfigImpl>
    implements _$$PrinterConfigImplCopyWith<$Res> {
  __$$PrinterConfigImplCopyWithImpl(
      _$PrinterConfigImpl _value, $Res Function(_$PrinterConfigImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? driverType = null,
    Object? autoPrintInvoice = null,
    Object? autoPrintKitchen = null,
    Object? openDrawerOnCash = null,
    Object? paperWidthMm = null,
    Object? networkIp = freezed,
    Object? networkPort = null,
    Object? copies = null,
    Object? headerBusinessName = null,
    Object? headerRuc = freezed,
    Object? headerAddress = freezed,
    Object? headerPhone = freezed,
    Object? logoBase64 = freezed,
    Object? logoWidth = freezed,
    Object? logoHeight = freezed,
    Object? isLogoEnabled = null,
  }) {
    return _then(_$PrinterConfigImpl(
      driverType: null == driverType
          ? _value.driverType
          : driverType // ignore: cast_nullable_to_non_nullable
              as PrinterDriverType,
      autoPrintInvoice: null == autoPrintInvoice
          ? _value.autoPrintInvoice
          : autoPrintInvoice // ignore: cast_nullable_to_non_nullable
              as bool,
      autoPrintKitchen: null == autoPrintKitchen
          ? _value.autoPrintKitchen
          : autoPrintKitchen // ignore: cast_nullable_to_non_nullable
              as bool,
      openDrawerOnCash: null == openDrawerOnCash
          ? _value.openDrawerOnCash
          : openDrawerOnCash // ignore: cast_nullable_to_non_nullable
              as bool,
      paperWidthMm: null == paperWidthMm
          ? _value.paperWidthMm
          : paperWidthMm // ignore: cast_nullable_to_non_nullable
              as int,
      networkIp: freezed == networkIp
          ? _value.networkIp
          : networkIp // ignore: cast_nullable_to_non_nullable
              as String?,
      networkPort: null == networkPort
          ? _value.networkPort
          : networkPort // ignore: cast_nullable_to_non_nullable
              as int,
      copies: null == copies
          ? _value.copies
          : copies // ignore: cast_nullable_to_non_nullable
              as int,
      headerBusinessName: null == headerBusinessName
          ? _value.headerBusinessName
          : headerBusinessName // ignore: cast_nullable_to_non_nullable
              as String,
      headerRuc: freezed == headerRuc
          ? _value.headerRuc
          : headerRuc // ignore: cast_nullable_to_non_nullable
              as String?,
      headerAddress: freezed == headerAddress
          ? _value.headerAddress
          : headerAddress // ignore: cast_nullable_to_non_nullable
              as String?,
      headerPhone: freezed == headerPhone
          ? _value.headerPhone
          : headerPhone // ignore: cast_nullable_to_non_nullable
              as String?,
      logoBase64: freezed == logoBase64
          ? _value.logoBase64
          : logoBase64 // ignore: cast_nullable_to_non_nullable
              as String?,
      logoWidth: freezed == logoWidth
          ? _value.logoWidth
          : logoWidth // ignore: cast_nullable_to_non_nullable
              as int?,
      logoHeight: freezed == logoHeight
          ? _value.logoHeight
          : logoHeight // ignore: cast_nullable_to_non_nullable
              as int?,
      isLogoEnabled: null == isLogoEnabled
          ? _value.isLogoEnabled
          : isLogoEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$PrinterConfigImpl implements _PrinterConfig {
  const _$PrinterConfigImpl(
      {this.driverType = PrinterDriverType.sunmiV2s,
      this.autoPrintInvoice = true,
      this.autoPrintKitchen = false,
      this.openDrawerOnCash = true,
      this.paperWidthMm = 58,
      this.networkIp,
      this.networkPort = 9100,
      this.copies = 1,
      this.headerBusinessName = 'OMNIFOOD NI',
      this.headerRuc,
      this.headerAddress,
      this.headerPhone,
      this.logoBase64,
      this.logoWidth,
      this.logoHeight,
      this.isLogoEnabled = false});

  factory _$PrinterConfigImpl.fromJson(Map<String, dynamic> json) =>
      _$$PrinterConfigImplFromJson(json);

  @override
  @JsonKey()
  final PrinterDriverType driverType;
  @override
  @JsonKey()
  final bool autoPrintInvoice;
  @override
  @JsonKey()
  final bool autoPrintKitchen;
  @override
  @JsonKey()
  final bool openDrawerOnCash;
  @override
  @JsonKey()
  final int paperWidthMm;
  @override
  final String? networkIp;
  @override
  @JsonKey()
  final int networkPort;
  @override
  @JsonKey()
  final int copies;
  @override
  @JsonKey()
  final String headerBusinessName;
  @override
  final String? headerRuc;
  @override
  final String? headerAddress;
  @override
  final String? headerPhone;
  @override
  final String? logoBase64;
  @override
  final int? logoWidth;
  @override
  final int? logoHeight;
  @override
  @JsonKey()
  final bool isLogoEnabled;

  @override
  String toString() {
    return 'PrinterConfig(driverType: $driverType, autoPrintInvoice: $autoPrintInvoice, autoPrintKitchen: $autoPrintKitchen, openDrawerOnCash: $openDrawerOnCash, paperWidthMm: $paperWidthMm, networkIp: $networkIp, networkPort: $networkPort, copies: $copies, headerBusinessName: $headerBusinessName, headerRuc: $headerRuc, headerAddress: $headerAddress, headerPhone: $headerPhone, logoBase64: $logoBase64, logoWidth: $logoWidth, logoHeight: $logoHeight, isLogoEnabled: $isLogoEnabled)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PrinterConfigImpl &&
            (identical(other.driverType, driverType) ||
                other.driverType == driverType) &&
            (identical(other.autoPrintInvoice, autoPrintInvoice) ||
                other.autoPrintInvoice == autoPrintInvoice) &&
            (identical(other.autoPrintKitchen, autoPrintKitchen) ||
                other.autoPrintKitchen == autoPrintKitchen) &&
            (identical(other.openDrawerOnCash, openDrawerOnCash) ||
                other.openDrawerOnCash == openDrawerOnCash) &&
            (identical(other.paperWidthMm, paperWidthMm) ||
                other.paperWidthMm == paperWidthMm) &&
            (identical(other.networkIp, networkIp) ||
                other.networkIp == networkIp) &&
            (identical(other.networkPort, networkPort) ||
                other.networkPort == networkPort) &&
            (identical(other.copies, copies) || other.copies == copies) &&
            (identical(other.headerBusinessName, headerBusinessName) ||
                other.headerBusinessName == headerBusinessName) &&
            (identical(other.headerRuc, headerRuc) ||
                other.headerRuc == headerRuc) &&
            (identical(other.headerAddress, headerAddress) ||
                other.headerAddress == headerAddress) &&
            (identical(other.headerPhone, headerPhone) ||
                other.headerPhone == headerPhone) &&
            (identical(other.logoBase64, logoBase64) ||
                other.logoBase64 == logoBase64) &&
            (identical(other.logoWidth, logoWidth) ||
                other.logoWidth == logoWidth) &&
            (identical(other.logoHeight, logoHeight) ||
                other.logoHeight == logoHeight) &&
            (identical(other.isLogoEnabled, isLogoEnabled) ||
                other.isLogoEnabled == isLogoEnabled));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      driverType,
      autoPrintInvoice,
      autoPrintKitchen,
      openDrawerOnCash,
      paperWidthMm,
      networkIp,
      networkPort,
      copies,
      headerBusinessName,
      headerRuc,
      headerAddress,
      headerPhone,
      logoBase64,
      logoWidth,
      logoHeight,
      isLogoEnabled);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PrinterConfigImplCopyWith<_$PrinterConfigImpl> get copyWith =>
      __$$PrinterConfigImplCopyWithImpl<_$PrinterConfigImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PrinterConfigImplToJson(
      this,
    );
  }
}

abstract class _PrinterConfig implements PrinterConfig {
  const factory _PrinterConfig(
      {final PrinterDriverType driverType,
      final bool autoPrintInvoice,
      final bool autoPrintKitchen,
      final bool openDrawerOnCash,
      final int paperWidthMm,
      final String? networkIp,
      final int networkPort,
      final int copies,
      final String headerBusinessName,
      final String? headerRuc,
      final String? headerAddress,
      final String? headerPhone,
      final String? logoBase64,
      final int? logoWidth,
      final int? logoHeight,
      final bool isLogoEnabled}) = _$PrinterConfigImpl;

  factory _PrinterConfig.fromJson(Map<String, dynamic> json) =
      _$PrinterConfigImpl.fromJson;

  @override
  PrinterDriverType get driverType;
  @override
  bool get autoPrintInvoice;
  @override
  bool get autoPrintKitchen;
  @override
  bool get openDrawerOnCash;
  @override
  int get paperWidthMm;
  @override
  String? get networkIp;
  @override
  int get networkPort;
  @override
  int get copies;
  @override
  String get headerBusinessName;
  @override
  String? get headerRuc;
  @override
  String? get headerAddress;
  @override
  String? get headerPhone;
  @override
  String? get logoBase64;
  @override
  int? get logoWidth;
  @override
  int? get logoHeight;
  @override
  bool get isLogoEnabled;
  @override
  @JsonKey(ignore: true)
  _$$PrinterConfigImplCopyWith<_$PrinterConfigImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
