// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'invoice.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

Invoice _$InvoiceFromJson(Map<String, dynamic> json) {
  return _Invoice.fromJson(json);
}

/// @nodoc
mixin _$Invoice {
  String get id => throw _privateConstructorUsedError; // UUID
  String get number =>
      throw _privateConstructorUsedError; // Formatted: 001-001-01-00000001
  DateTime get createdAt => throw _privateConstructorUsedError;
  String get userId => throw _privateConstructorUsedError;
  double get subtotal => throw _privateConstructorUsedError;
  double get totalTax => throw _privateConstructorUsedError;
  double get total => throw _privateConstructorUsedError;
  bool get isCanceled => throw _privateConstructorUsedError;
  String? get voidReason => throw _privateConstructorUsedError;
  SyncStatus get syncStatus => throw _privateConstructorUsedError;
  PaymentStatus get paymentStatus => throw _privateConstructorUsedError;
  InvoiceType get type => throw _privateConstructorUsedError;
  String? get customerId => throw _privateConstructorUsedError;
  bool get globalTaxOverride => throw _privateConstructorUsedError;
  String? get relatedInvoiceId => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InvoiceCopyWith<Invoice> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InvoiceCopyWith<$Res> {
  factory $InvoiceCopyWith(Invoice value, $Res Function(Invoice) then) =
      _$InvoiceCopyWithImpl<$Res, Invoice>;
  @useResult
  $Res call(
      {String id,
      String number,
      DateTime createdAt,
      String userId,
      double subtotal,
      double totalTax,
      double total,
      bool isCanceled,
      String? voidReason,
      SyncStatus syncStatus,
      PaymentStatus paymentStatus,
      InvoiceType type,
      String? customerId,
      bool globalTaxOverride,
      String? relatedInvoiceId});
}

/// @nodoc
class _$InvoiceCopyWithImpl<$Res, $Val extends Invoice>
    implements $InvoiceCopyWith<$Res> {
  _$InvoiceCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? number = null,
    Object? createdAt = null,
    Object? userId = null,
    Object? subtotal = null,
    Object? totalTax = null,
    Object? total = null,
    Object? isCanceled = null,
    Object? voidReason = freezed,
    Object? syncStatus = null,
    Object? paymentStatus = null,
    Object? type = null,
    Object? customerId = freezed,
    Object? globalTaxOverride = null,
    Object? relatedInvoiceId = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      number: null == number
          ? _value.number
          : number // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      subtotal: null == subtotal
          ? _value.subtotal
          : subtotal // ignore: cast_nullable_to_non_nullable
              as double,
      totalTax: null == totalTax
          ? _value.totalTax
          : totalTax // ignore: cast_nullable_to_non_nullable
              as double,
      total: null == total
          ? _value.total
          : total // ignore: cast_nullable_to_non_nullable
              as double,
      isCanceled: null == isCanceled
          ? _value.isCanceled
          : isCanceled // ignore: cast_nullable_to_non_nullable
              as bool,
      voidReason: freezed == voidReason
          ? _value.voidReason
          : voidReason // ignore: cast_nullable_to_non_nullable
              as String?,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as SyncStatus,
      paymentStatus: null == paymentStatus
          ? _value.paymentStatus
          : paymentStatus // ignore: cast_nullable_to_non_nullable
              as PaymentStatus,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as InvoiceType,
      customerId: freezed == customerId
          ? _value.customerId
          : customerId // ignore: cast_nullable_to_non_nullable
              as String?,
      globalTaxOverride: null == globalTaxOverride
          ? _value.globalTaxOverride
          : globalTaxOverride // ignore: cast_nullable_to_non_nullable
              as bool,
      relatedInvoiceId: freezed == relatedInvoiceId
          ? _value.relatedInvoiceId
          : relatedInvoiceId // ignore: cast_nullable_to_non_nullable
              as String?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InvoiceImplCopyWith<$Res> implements $InvoiceCopyWith<$Res> {
  factory _$$InvoiceImplCopyWith(
          _$InvoiceImpl value, $Res Function(_$InvoiceImpl) then) =
      __$$InvoiceImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String number,
      DateTime createdAt,
      String userId,
      double subtotal,
      double totalTax,
      double total,
      bool isCanceled,
      String? voidReason,
      SyncStatus syncStatus,
      PaymentStatus paymentStatus,
      InvoiceType type,
      String? customerId,
      bool globalTaxOverride,
      String? relatedInvoiceId});
}

/// @nodoc
class __$$InvoiceImplCopyWithImpl<$Res>
    extends _$InvoiceCopyWithImpl<$Res, _$InvoiceImpl>
    implements _$$InvoiceImplCopyWith<$Res> {
  __$$InvoiceImplCopyWithImpl(
      _$InvoiceImpl _value, $Res Function(_$InvoiceImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? number = null,
    Object? createdAt = null,
    Object? userId = null,
    Object? subtotal = null,
    Object? totalTax = null,
    Object? total = null,
    Object? isCanceled = null,
    Object? voidReason = freezed,
    Object? syncStatus = null,
    Object? paymentStatus = null,
    Object? type = null,
    Object? customerId = freezed,
    Object? globalTaxOverride = null,
    Object? relatedInvoiceId = freezed,
  }) {
    return _then(_$InvoiceImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      number: null == number
          ? _value.number
          : number // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      subtotal: null == subtotal
          ? _value.subtotal
          : subtotal // ignore: cast_nullable_to_non_nullable
              as double,
      totalTax: null == totalTax
          ? _value.totalTax
          : totalTax // ignore: cast_nullable_to_non_nullable
              as double,
      total: null == total
          ? _value.total
          : total // ignore: cast_nullable_to_non_nullable
              as double,
      isCanceled: null == isCanceled
          ? _value.isCanceled
          : isCanceled // ignore: cast_nullable_to_non_nullable
              as bool,
      voidReason: freezed == voidReason
          ? _value.voidReason
          : voidReason // ignore: cast_nullable_to_non_nullable
              as String?,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as SyncStatus,
      paymentStatus: null == paymentStatus
          ? _value.paymentStatus
          : paymentStatus // ignore: cast_nullable_to_non_nullable
              as PaymentStatus,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as InvoiceType,
      customerId: freezed == customerId
          ? _value.customerId
          : customerId // ignore: cast_nullable_to_non_nullable
              as String?,
      globalTaxOverride: null == globalTaxOverride
          ? _value.globalTaxOverride
          : globalTaxOverride // ignore: cast_nullable_to_non_nullable
              as bool,
      relatedInvoiceId: freezed == relatedInvoiceId
          ? _value.relatedInvoiceId
          : relatedInvoiceId // ignore: cast_nullable_to_non_nullable
              as String?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InvoiceImpl implements _Invoice {
  const _$InvoiceImpl(
      {required this.id,
      required this.number,
      required this.createdAt,
      required this.userId,
      required this.subtotal,
      required this.totalTax,
      required this.total,
      this.isCanceled = false,
      this.voidReason,
      this.syncStatus = SyncStatus.pending,
      this.paymentStatus = PaymentStatus.pending,
      this.type = InvoiceType.regular,
      this.customerId,
      this.globalTaxOverride = false,
      this.relatedInvoiceId});

  factory _$InvoiceImpl.fromJson(Map<String, dynamic> json) =>
      _$$InvoiceImplFromJson(json);

  @override
  final String id;
// UUID
  @override
  final String number;
// Formatted: 001-001-01-00000001
  @override
  final DateTime createdAt;
  @override
  final String userId;
  @override
  final double subtotal;
  @override
  final double totalTax;
  @override
  final double total;
  @override
  @JsonKey()
  final bool isCanceled;
  @override
  final String? voidReason;
  @override
  @JsonKey()
  final SyncStatus syncStatus;
  @override
  @JsonKey()
  final PaymentStatus paymentStatus;
  @override
  @JsonKey()
  final InvoiceType type;
  @override
  final String? customerId;
  @override
  @JsonKey()
  final bool globalTaxOverride;
  @override
  final String? relatedInvoiceId;

  @override
  String toString() {
    return 'Invoice(id: $id, number: $number, createdAt: $createdAt, userId: $userId, subtotal: $subtotal, totalTax: $totalTax, total: $total, isCanceled: $isCanceled, voidReason: $voidReason, syncStatus: $syncStatus, paymentStatus: $paymentStatus, type: $type, customerId: $customerId, globalTaxOverride: $globalTaxOverride, relatedInvoiceId: $relatedInvoiceId)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InvoiceImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.number, number) || other.number == number) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.userId, userId) || other.userId == userId) &&
            (identical(other.subtotal, subtotal) ||
                other.subtotal == subtotal) &&
            (identical(other.totalTax, totalTax) ||
                other.totalTax == totalTax) &&
            (identical(other.total, total) || other.total == total) &&
            (identical(other.isCanceled, isCanceled) ||
                other.isCanceled == isCanceled) &&
            (identical(other.voidReason, voidReason) ||
                other.voidReason == voidReason) &&
            (identical(other.syncStatus, syncStatus) ||
                other.syncStatus == syncStatus) &&
            (identical(other.paymentStatus, paymentStatus) ||
                other.paymentStatus == paymentStatus) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.customerId, customerId) ||
                other.customerId == customerId) &&
            (identical(other.globalTaxOverride, globalTaxOverride) ||
                other.globalTaxOverride == globalTaxOverride) &&
            (identical(other.relatedInvoiceId, relatedInvoiceId) ||
                other.relatedInvoiceId == relatedInvoiceId));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      number,
      createdAt,
      userId,
      subtotal,
      totalTax,
      total,
      isCanceled,
      voidReason,
      syncStatus,
      paymentStatus,
      type,
      customerId,
      globalTaxOverride,
      relatedInvoiceId);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InvoiceImplCopyWith<_$InvoiceImpl> get copyWith =>
      __$$InvoiceImplCopyWithImpl<_$InvoiceImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InvoiceImplToJson(
      this,
    );
  }
}

abstract class _Invoice implements Invoice {
  const factory _Invoice(
      {required final String id,
      required final String number,
      required final DateTime createdAt,
      required final String userId,
      required final double subtotal,
      required final double totalTax,
      required final double total,
      final bool isCanceled,
      final String? voidReason,
      final SyncStatus syncStatus,
      final PaymentStatus paymentStatus,
      final InvoiceType type,
      final String? customerId,
      final bool globalTaxOverride,
      final String? relatedInvoiceId}) = _$InvoiceImpl;

  factory _Invoice.fromJson(Map<String, dynamic> json) = _$InvoiceImpl.fromJson;

  @override
  String get id;
  @override // UUID
  String get number;
  @override // Formatted: 001-001-01-00000001
  DateTime get createdAt;
  @override
  String get userId;
  @override
  double get subtotal;
  @override
  double get totalTax;
  @override
  double get total;
  @override
  bool get isCanceled;
  @override
  String? get voidReason;
  @override
  SyncStatus get syncStatus;
  @override
  PaymentStatus get paymentStatus;
  @override
  InvoiceType get type;
  @override
  String? get customerId;
  @override
  bool get globalTaxOverride;
  @override
  String? get relatedInvoiceId;
  @override
  @JsonKey(ignore: true)
  _$$InvoiceImplCopyWith<_$InvoiceImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
