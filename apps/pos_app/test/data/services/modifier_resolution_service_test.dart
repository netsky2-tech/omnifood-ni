import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/modifiers/modifier_group_entity.dart';
import 'package:pos_app/data/models/modifiers/modifier_option_entity.dart';
import 'package:pos_app/data/models/modifiers/category_modifier_group_entity.dart';
import 'package:pos_app/data/models/modifiers/product_modifier_group_entity.dart';
import 'package:pos_app/data/services/modifier_resolution_service.dart';

void main() {
  ModifierGroupEntity groupRow(
    String id,
    String name, {
    int minSelected = 0,
    int maxSelected = 1,
    bool allowQuantities = false,
    int sortOrder = 0,
    bool isActive = true,
  }) =>
      ModifierGroupEntity(
        id: id,
        name: name,
        minSelected: minSelected,
        maxSelected: maxSelected,
        allowQuantities: allowQuantities,
        sortOrder: sortOrder,
        isActive: isActive,
      );

  ModifierOptionEntity optionRow(
    String id,
    String groupId,
    String name, {
    double priceDelta = 0.0,
    bool isDefault = false,
    int sortOrder = 0,
    bool isActive = true,
  }) =>
      ModifierOptionEntity(
        id: id,
        groupId: groupId,
        name: name,
        priceDelta: priceDelta,
        isDefault: isDefault,
        sortOrder: sortOrder,
        isActive: isActive,
      );

  CategoryModifierGroupEntity categoryAttachment(
    String id,
    String catalogValueId,
    String groupId,
    int sortOrder,
  ) =>
      CategoryModifierGroupEntity(
        id: id,
        catalogValueId: catalogValueId,
        catalogCode: 'BEBIDAS',
        groupId: groupId,
        sortOrder: sortOrder,
      );

  ProductModifierGroupEntity productAttachment(
    String id,
    String productId,
    String groupId,
    int sortOrder,
  ) =>
      ProductModifierGroupEntity(
        id: id,
        productId: productId,
        groupId: groupId,
        sortOrder: sortOrder,
      );

  group('ModifierResolutionService.resolveEffective (server rule §30)', () {
    test('category-only attachment resolves as source category', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: 'cat-bebidas',
        groups: [groupRow('grp-1', 'Leche')],
        options: [optionRow('opt-1', 'grp-1', 'Entera', priceDelta: 5.0)],
        categoryAttachments: [categoryAttachment('catt-1', 'cat-bebidas', 'grp-1', 0)],
        productAttachments: [],
      );

      expect(result, hasLength(1));
      expect(result.first.id, 'grp-1');
      expect(result.first.source, 'category');
      expect(result.first.options, hasLength(1));
      expect(result.first.options.first.priceDelta, 5.0);
      expect(result.first.minSelected, 0);
      expect(result.first.maxSelected, 1);
      expect(result.first.allowQuantities, false);
    });

    test('product-only attachment resolves as source product', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: null,
        groups: [groupRow('grp-2', 'Extras')],
        options: [],
        categoryAttachments: [],
        productAttachments: [productAttachment('patt-1', 'prod-1', 'grp-2', 0)],
      );

      expect(result, hasLength(1));
      expect(result.first.id, 'grp-2');
      expect(result.first.source, 'product');
      expect(result.first.options, isEmpty);
    });

    test('double-attached group appears ONCE with source product, ordered by the PRODUCT attachment', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: 'cat-bebidas',
        groups: [groupRow('grp-1', 'Leche')],
        options: [],
        categoryAttachments: [
          // Lower category sort_order must NOT win the ordering.
          categoryAttachment('catt-1', 'cat-bebidas', 'grp-1', 0),
        ],
        productAttachments: [
          productAttachment('patt-1', 'prod-1', 'grp-1', 7),
        ],
      );

      expect(result, hasLength(1));
      expect(result.first.source, 'product');
      // No category item precedes it and it is the single occurrence.
      expect(result.map((entry) => entry.source), everyElement('product'));
    });

    test('mixed blocks: every category item first, then every product item, each block ordered by attachment sort_order then group name', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: 'cat-bebidas',
        groups: [
          groupRow('grp-a1', 'Aguardiente'),
          groupRow('grp-a2', 'Bebidas Calientes'),
          groupRow('grp-b', 'Leche'),
          groupRow('grp-p', 'Extras'),
        ],
        options: [],
        categoryAttachments: [
          categoryAttachment('catt-1', 'cat-bebidas', 'grp-b', 2),
          categoryAttachment('catt-2', 'cat-bebidas', 'grp-a2', 1),
          categoryAttachment('catt-3', 'cat-bebidas', 'grp-a1', 1),
        ],
        productAttachments: [productAttachment('patt-1', 'prod-1', 'grp-p', 0)],
      );

      expect(result.map((entry) => entry.id).toList(), [
        // Category block: sort_order 1 first, tie broken by group name ASC
        // ('Aguardiente' < 'Bebidas Calientes').
        'grp-a1',
        'grp-a2',
        'grp-b',
        // Product block last.
        'grp-p',
      ]);
      expect(result.take(3).map((e) => e.source), everyElement('category'));
      expect(result.last.source, 'product');
    });

    test('inactive group drops from either side; inactive option drops from an active group', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: 'cat-bebidas',
        groups: [
          groupRow('grp-active', 'Leche'),
          groupRow('grp-inactive-cat', 'Eliminado Heredado', isActive: false),
          groupRow('grp-inactive-prod', 'Eliminado Propio', isActive: false),
        ],
        options: [
          optionRow('opt-1', 'grp-active', 'Entera'),
          optionRow('opt-gone', 'grp-active', 'Vieja', isActive: false),
        ],
        categoryAttachments: [
          categoryAttachment('catt-1', 'cat-bebidas', 'grp-active', 0),
          categoryAttachment('catt-2', 'cat-bebidas', 'grp-inactive-cat', 1),
        ],
        productAttachments: [
          productAttachment('patt-1', 'prod-1', 'grp-inactive-prod', 0),
        ],
      );

      expect(result.map((entry) => entry.id), ['grp-active']);
      expect(result.first.options.map((option) => option.id), ['opt-1']);
    });

    test('null categoryId resolves to product-side only, never a failure', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: null,
        groups: [groupRow('grp-2', 'Extras')],
        options: [],
        categoryAttachments: [categoryAttachment('catt-1', 'cat-x', 'grp-2', 0)],
        productAttachments: [productAttachment('patt-1', 'prod-1', 'grp-2', 0)],
      );

      expect(result, hasLength(1));
      expect(result.first.source, 'product');
    });

    test('a dangling attachment (group not in the loaded set) is skipped, never a crash', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: 'cat-bebidas',
        groups: [groupRow('grp-1', 'Leche')],
        options: [],
        categoryAttachments: [
          categoryAttachment('catt-1', 'cat-bebidas', 'grp-ghost', 0),
        ],
        productAttachments: [
          productAttachment('patt-1', 'prod-1', 'grp-ghost-2', 0),
        ],
      );

      expect(result, isEmpty);
    });

    test('options are ordered by (sort_order, name, id) and only active ones ride', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: 'cat-bebidas',
        groups: [groupRow('grp-1', 'Leche')],
        options: [
          optionRow('opt-b', 'grp-1', 'B', sortOrder: 1),
          optionRow('opt-a', 'grp-1', 'A', sortOrder: 1),
          optionRow('opt-c', 'grp-1', 'C', sortOrder: 0),
          optionRow('opt-off', 'grp-1', 'D', isActive: false),
          // Option of a group that is NOT returned: never leaks.
          optionRow('opt-other', 'grp-other', 'X'),
        ],
        categoryAttachments: [categoryAttachment('catt-1', 'cat-bebidas', 'grp-1', 0)],
        productAttachments: [],
      );

      expect(result, hasLength(1));
      expect(result.first.options.map((option) => option.id).toList(), [
        'opt-c',
        'opt-a',
        'opt-b',
      ]);
    });

    test('source is exactly the two documented literals', () {
      final result = ModifierResolutionService.resolveEffective(
        productId: 'prod-1',
        categoryId: 'cat-bebidas',
        groups: [groupRow('grp-1', 'Leche'), groupRow('grp-2', 'Extras')],
        options: [],
        categoryAttachments: [categoryAttachment('catt-1', 'cat-bebidas', 'grp-1', 0)],
        productAttachments: [productAttachment('patt-1', 'prod-1', 'grp-2', 0)],
      );

      expect(result.map((entry) => entry.source).toSet(), {'category', 'product'});
    });
  });
}
