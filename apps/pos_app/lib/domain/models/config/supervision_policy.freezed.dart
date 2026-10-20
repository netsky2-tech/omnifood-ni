// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'supervision_policy.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

SupervisionPolicy _$SupervisionPolicyFromJson(Map<String, dynamic> json) {
  return _SupervisionPolicy.fromJson(json);
}

/// @nodoc
mixin _$SupervisionPolicy {
  /// The roles that can authorize on behalf of the tenant.
  Set<String> get authorizingRoles => throw _privateConstructorUsedError;

  /// The shift close (Corte Z): the fiscal duty that MUST be completable.
  /// In a food park it is: an unclosed shift is a worse fiscal problem than
  /// a self-authorized one.
  bool get selfAuthorizationAllowedCloseBox =>
      throw _privateConstructorUsedError;

  /// Opening the cash drawer by hand: money in and out of the drawer.
  bool get selfAuthorizationAllowedCashDrawer =>
      throw _privateConstructorUsedError;

  /// A manual discount: money out of the price.
  bool get selfAuthorizationAllowedManualDiscount =>
      throw _privateConstructorUsedError;

  /// The quantity an extra takes out of the stock: a DATA question, not a
  /// control one. The evidence (who, how much, why) is the control.
  bool get supervisorRequiredForModifierQuantity =>
      throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $SupervisionPolicyCopyWith<SupervisionPolicy> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $SupervisionPolicyCopyWith<$Res> {
  factory $SupervisionPolicyCopyWith(
          SupervisionPolicy value, $Res Function(SupervisionPolicy) then) =
      _$SupervisionPolicyCopyWithImpl<$Res, SupervisionPolicy>;
  @useResult
  $Res call(
      {Set<String> authorizingRoles,
      bool selfAuthorizationAllowedCloseBox,
      bool selfAuthorizationAllowedCashDrawer,
      bool selfAuthorizationAllowedManualDiscount,
      bool supervisorRequiredForModifierQuantity});
}

/// @nodoc
class _$SupervisionPolicyCopyWithImpl<$Res, $Val extends SupervisionPolicy>
    implements $SupervisionPolicyCopyWith<$Res> {
  _$SupervisionPolicyCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? authorizingRoles = null,
    Object? selfAuthorizationAllowedCloseBox = null,
    Object? selfAuthorizationAllowedCashDrawer = null,
    Object? selfAuthorizationAllowedManualDiscount = null,
    Object? supervisorRequiredForModifierQuantity = null,
  }) {
    return _then(_value.copyWith(
      authorizingRoles: null == authorizingRoles
          ? _value.authorizingRoles
          : authorizingRoles // ignore: cast_nullable_to_non_nullable
              as Set<String>,
      selfAuthorizationAllowedCloseBox: null == selfAuthorizationAllowedCloseBox
          ? _value.selfAuthorizationAllowedCloseBox
          : selfAuthorizationAllowedCloseBox // ignore: cast_nullable_to_non_nullable
              as bool,
      selfAuthorizationAllowedCashDrawer: null ==
              selfAuthorizationAllowedCashDrawer
          ? _value.selfAuthorizationAllowedCashDrawer
          : selfAuthorizationAllowedCashDrawer // ignore: cast_nullable_to_non_nullable
              as bool,
      selfAuthorizationAllowedManualDiscount: null ==
              selfAuthorizationAllowedManualDiscount
          ? _value.selfAuthorizationAllowedManualDiscount
          : selfAuthorizationAllowedManualDiscount // ignore: cast_nullable_to_non_nullable
              as bool,
      supervisorRequiredForModifierQuantity: null ==
              supervisorRequiredForModifierQuantity
          ? _value.supervisorRequiredForModifierQuantity
          : supervisorRequiredForModifierQuantity // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$SupervisionPolicyImplCopyWith<$Res>
    implements $SupervisionPolicyCopyWith<$Res> {
  factory _$$SupervisionPolicyImplCopyWith(_$SupervisionPolicyImpl value,
          $Res Function(_$SupervisionPolicyImpl) then) =
      __$$SupervisionPolicyImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {Set<String> authorizingRoles,
      bool selfAuthorizationAllowedCloseBox,
      bool selfAuthorizationAllowedCashDrawer,
      bool selfAuthorizationAllowedManualDiscount,
      bool supervisorRequiredForModifierQuantity});
}

/// @nodoc
class __$$SupervisionPolicyImplCopyWithImpl<$Res>
    extends _$SupervisionPolicyCopyWithImpl<$Res, _$SupervisionPolicyImpl>
    implements _$$SupervisionPolicyImplCopyWith<$Res> {
  __$$SupervisionPolicyImplCopyWithImpl(_$SupervisionPolicyImpl _value,
      $Res Function(_$SupervisionPolicyImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? authorizingRoles = null,
    Object? selfAuthorizationAllowedCloseBox = null,
    Object? selfAuthorizationAllowedCashDrawer = null,
    Object? selfAuthorizationAllowedManualDiscount = null,
    Object? supervisorRequiredForModifierQuantity = null,
  }) {
    return _then(_$SupervisionPolicyImpl(
      authorizingRoles: null == authorizingRoles
          ? _value._authorizingRoles
          : authorizingRoles // ignore: cast_nullable_to_non_nullable
              as Set<String>,
      selfAuthorizationAllowedCloseBox: null == selfAuthorizationAllowedCloseBox
          ? _value.selfAuthorizationAllowedCloseBox
          : selfAuthorizationAllowedCloseBox // ignore: cast_nullable_to_non_nullable
              as bool,
      selfAuthorizationAllowedCashDrawer: null ==
              selfAuthorizationAllowedCashDrawer
          ? _value.selfAuthorizationAllowedCashDrawer
          : selfAuthorizationAllowedCashDrawer // ignore: cast_nullable_to_non_nullable
              as bool,
      selfAuthorizationAllowedManualDiscount: null ==
              selfAuthorizationAllowedManualDiscount
          ? _value.selfAuthorizationAllowedManualDiscount
          : selfAuthorizationAllowedManualDiscount // ignore: cast_nullable_to_non_nullable
              as bool,
      supervisorRequiredForModifierQuantity: null ==
              supervisorRequiredForModifierQuantity
          ? _value.supervisorRequiredForModifierQuantity
          : supervisorRequiredForModifierQuantity // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$SupervisionPolicyImpl implements _SupervisionPolicy {
  const _$SupervisionPolicyImpl(
      {final Set<String> authorizingRoles = const <String>{'OWNER', 'MANAGER'},
      this.selfAuthorizationAllowedCloseBox = true,
      this.selfAuthorizationAllowedCashDrawer = false,
      this.selfAuthorizationAllowedManualDiscount = false,
      this.supervisorRequiredForModifierQuantity = false})
      : _authorizingRoles = authorizingRoles;

  factory _$SupervisionPolicyImpl.fromJson(Map<String, dynamic> json) =>
      _$$SupervisionPolicyImplFromJson(json);

  /// The roles that can authorize on behalf of the tenant.
  final Set<String> _authorizingRoles;

  /// The roles that can authorize on behalf of the tenant.
  @override
  @JsonKey()
  Set<String> get authorizingRoles {
    if (_authorizingRoles is EqualUnmodifiableSetView) return _authorizingRoles;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableSetView(_authorizingRoles);
  }

  /// The shift close (Corte Z): the fiscal duty that MUST be completable.
  /// In a food park it is: an unclosed shift is a worse fiscal problem than
  /// a self-authorized one.
  @override
  @JsonKey()
  final bool selfAuthorizationAllowedCloseBox;

  /// Opening the cash drawer by hand: money in and out of the drawer.
  @override
  @JsonKey()
  final bool selfAuthorizationAllowedCashDrawer;

  /// A manual discount: money out of the price.
  @override
  @JsonKey()
  final bool selfAuthorizationAllowedManualDiscount;

  /// The quantity an extra takes out of the stock: a DATA question, not a
  /// control one. The evidence (who, how much, why) is the control.
  @override
  @JsonKey()
  final bool supervisorRequiredForModifierQuantity;

  @override
  String toString() {
    return 'SupervisionPolicy(authorizingRoles: $authorizingRoles, selfAuthorizationAllowedCloseBox: $selfAuthorizationAllowedCloseBox, selfAuthorizationAllowedCashDrawer: $selfAuthorizationAllowedCashDrawer, selfAuthorizationAllowedManualDiscount: $selfAuthorizationAllowedManualDiscount, supervisorRequiredForModifierQuantity: $supervisorRequiredForModifierQuantity)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$SupervisionPolicyImpl &&
            const DeepCollectionEquality()
                .equals(other._authorizingRoles, _authorizingRoles) &&
            (identical(other.selfAuthorizationAllowedCloseBox,
                    selfAuthorizationAllowedCloseBox) ||
                other.selfAuthorizationAllowedCloseBox ==
                    selfAuthorizationAllowedCloseBox) &&
            (identical(other.selfAuthorizationAllowedCashDrawer,
                    selfAuthorizationAllowedCashDrawer) ||
                other.selfAuthorizationAllowedCashDrawer ==
                    selfAuthorizationAllowedCashDrawer) &&
            (identical(other.selfAuthorizationAllowedManualDiscount,
                    selfAuthorizationAllowedManualDiscount) ||
                other.selfAuthorizationAllowedManualDiscount ==
                    selfAuthorizationAllowedManualDiscount) &&
            (identical(other.supervisorRequiredForModifierQuantity,
                    supervisorRequiredForModifierQuantity) ||
                other.supervisorRequiredForModifierQuantity ==
                    supervisorRequiredForModifierQuantity));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      const DeepCollectionEquality().hash(_authorizingRoles),
      selfAuthorizationAllowedCloseBox,
      selfAuthorizationAllowedCashDrawer,
      selfAuthorizationAllowedManualDiscount,
      supervisorRequiredForModifierQuantity);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$SupervisionPolicyImplCopyWith<_$SupervisionPolicyImpl> get copyWith =>
      __$$SupervisionPolicyImplCopyWithImpl<_$SupervisionPolicyImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$SupervisionPolicyImplToJson(
      this,
    );
  }
}

abstract class _SupervisionPolicy implements SupervisionPolicy {
  const factory _SupervisionPolicy(
          {final Set<String> authorizingRoles,
          final bool selfAuthorizationAllowedCloseBox,
          final bool selfAuthorizationAllowedCashDrawer,
          final bool selfAuthorizationAllowedManualDiscount,
          final bool supervisorRequiredForModifierQuantity}) =
      _$SupervisionPolicyImpl;

  factory _SupervisionPolicy.fromJson(Map<String, dynamic> json) =
      _$SupervisionPolicyImpl.fromJson;

  @override

  /// The roles that can authorize on behalf of the tenant.
  Set<String> get authorizingRoles;
  @override

  /// The shift close (Corte Z): the fiscal duty that MUST be completable.
  /// In a food park it is: an unclosed shift is a worse fiscal problem than
  /// a self-authorized one.
  bool get selfAuthorizationAllowedCloseBox;
  @override

  /// Opening the cash drawer by hand: money in and out of the drawer.
  bool get selfAuthorizationAllowedCashDrawer;
  @override

  /// A manual discount: money out of the price.
  bool get selfAuthorizationAllowedManualDiscount;
  @override

  /// The quantity an extra takes out of the stock: a DATA question, not a
  /// control one. The evidence (who, how much, why) is the control.
  bool get supervisorRequiredForModifierQuantity;
  @override
  @JsonKey(ignore: true)
  _$$SupervisionPolicyImplCopyWith<_$SupervisionPolicyImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
