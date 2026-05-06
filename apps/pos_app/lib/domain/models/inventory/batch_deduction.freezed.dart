// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'batch_deduction.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

BatchDeduction _$BatchDeductionFromJson(Map<String, dynamic> json) {
  return _BatchDeduction.fromJson(json);
}

/// @nodoc
mixin _$BatchDeduction {
  String get batchId => throw _privateConstructorUsedError;
  double get quantity => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $BatchDeductionCopyWith<BatchDeduction> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $BatchDeductionCopyWith<$Res> {
  factory $BatchDeductionCopyWith(
          BatchDeduction value, $Res Function(BatchDeduction) then) =
      _$BatchDeductionCopyWithImpl<$Res, BatchDeduction>;
  @useResult
  $Res call({String batchId, double quantity});
}

/// @nodoc
class _$BatchDeductionCopyWithImpl<$Res, $Val extends BatchDeduction>
    implements $BatchDeductionCopyWith<$Res> {
  _$BatchDeductionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? batchId = null,
    Object? quantity = null,
  }) {
    return _then(_value.copyWith(
      batchId: null == batchId
          ? _value.batchId
          : batchId // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$BatchDeductionImplCopyWith<$Res>
    implements $BatchDeductionCopyWith<$Res> {
  factory _$$BatchDeductionImplCopyWith(_$BatchDeductionImpl value,
          $Res Function(_$BatchDeductionImpl) then) =
      __$$BatchDeductionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String batchId, double quantity});
}

/// @nodoc
class __$$BatchDeductionImplCopyWithImpl<$Res>
    extends _$BatchDeductionCopyWithImpl<$Res, _$BatchDeductionImpl>
    implements _$$BatchDeductionImplCopyWith<$Res> {
  __$$BatchDeductionImplCopyWithImpl(
      _$BatchDeductionImpl _value, $Res Function(_$BatchDeductionImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? batchId = null,
    Object? quantity = null,
  }) {
    return _then(_$BatchDeductionImpl(
      batchId: null == batchId
          ? _value.batchId
          : batchId // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$BatchDeductionImpl implements _BatchDeduction {
  const _$BatchDeductionImpl({required this.batchId, required this.quantity});

  factory _$BatchDeductionImpl.fromJson(Map<String, dynamic> json) =>
      _$$BatchDeductionImplFromJson(json);

  @override
  final String batchId;
  @override
  final double quantity;

  @override
  String toString() {
    return 'BatchDeduction(batchId: $batchId, quantity: $quantity)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$BatchDeductionImpl &&
            (identical(other.batchId, batchId) || other.batchId == batchId) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, batchId, quantity);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$BatchDeductionImplCopyWith<_$BatchDeductionImpl> get copyWith =>
      __$$BatchDeductionImplCopyWithImpl<_$BatchDeductionImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$BatchDeductionImplToJson(
      this,
    );
  }
}

abstract class _BatchDeduction implements BatchDeduction {
  const factory _BatchDeduction(
      {required final String batchId,
      required final double quantity}) = _$BatchDeductionImpl;

  factory _BatchDeduction.fromJson(Map<String, dynamic> json) =
      _$BatchDeductionImpl.fromJson;

  @override
  String get batchId;
  @override
  double get quantity;
  @override
  @JsonKey(ignore: true)
  _$$BatchDeductionImplCopyWith<_$BatchDeductionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
