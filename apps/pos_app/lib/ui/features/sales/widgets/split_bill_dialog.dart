import 'package:flutter/material.dart';
import '../../../../domain/models/sales/cart_item.dart';
import '../../../../domain/services/sales/split_bill_engine.dart';
import '../../../../domain/services/sales/tip_engine.dart';

/// Modal dialog for splitting bills in restaurant and hybrid dining environments.
class SplitBillDialog extends StatefulWidget {
  final List<CartItem> cart;
  final double commercialRate;
  final void Function(SplitBillShare share)? onPayShare;

  const SplitBillDialog({
    super.key,
    required this.cart,
    this.commercialRate = 36.50,
    this.onPayShare,
  });

  @override
  State<SplitBillDialog> createState() => _SplitBillDialogState();
}

class _SplitBillDialogState extends State<SplitBillDialog> {
  int _selectedTabIndex = 0; // 0: Partes Iguales, 1: Por Ítems
  int _coverCount = 2;
  TipType _tipType = TipType.suggestedTenPercent;
  double _customTipPercentage = 15.0;
  double _fixedTipAmount = 0.0;

  // Itemized split state: cartItemIndex -> coverIndex (1-based)
  final Map<int, int> _itemAssignments = {};
  int _itemizedCoverCount = 2;

  double get _cartSubtotal => widget.cart.fold(
        0.0,
        (sum, item) => sum + item.subtotal + item.modifiersTotal,
      );

  double get _cartTax => widget.cart.fold(
        0.0,
        (sum, item) => sum + item.taxAmount,
      );

  TipCalculation get _tipCalculation => TipEngine.calculate(
        subtotalNio: _cartSubtotal,
        taxNio: _cartTax,
        discountNio: 0.0,
        tipType: _tipType,
        customPercentage: _customTipPercentage,
        fixedAmount: _fixedTipAmount,
        commercialRate: widget.commercialRate,
      );

  SplitBillResult get _equalSplitResult => SplitBillEngine.splitEqual(
        subtotalNio: _cartSubtotal,
        taxNio: _cartTax,
        tipNio: _tipCalculation.tipAmountNio,
        discountNio: 0.0,
        coverCount: _coverCount,
        commercialRate: widget.commercialRate,
      );

  SplitBillResult get _itemizedSplitResult {
    final List<ItemizedShareInput> shareInputs = [];

    for (int i = 1; i <= _itemizedCoverCount; i++) {
      final List<CartItem> assignedItems = [];
      for (int itemIdx = 0; itemIdx < widget.cart.length; itemIdx++) {
        if ((_itemAssignments[itemIdx] ?? 1) == i) {
          assignedItems.add(widget.cart[itemIdx]);
        }
      }

      shareInputs.add(
        ItemizedShareInput(
          shareIndex: i,
          label: 'Comensal $i',
          items: assignedItems,
          tipType: _tipType,
          customTipPercentage: _customTipPercentage,
          fixedTipAmount: _fixedTipAmount,
        ),
      );
    }

    return SplitBillEngine.splitByItems(
      shares: shareInputs,
      commercialRate: widget.commercialRate,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isCompact = constraints.maxWidth < 600;

          return Container(
            constraints: const BoxConstraints(maxWidth: 850, maxHeight: 680),
            padding: EdgeInsets.all(isCompact ? 12 : 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(context),
                const SizedBox(height: 10),
                _buildTabSelector(),
                const SizedBox(height: 10),
                _buildTipSelector(),
                const Divider(height: 20),
                Expanded(
                  child: isCompact
                      ? _buildCompactBody()
                      : _buildDesktopBody(),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.call_split_rounded, color: Colors.deepOrange, size: 26),
        const SizedBox(width: 8),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Dividir Cuenta',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              Text(
                'Gestión de comensales y propina voluntaria DGI',
                style: TextStyle(fontSize: 11, color: Colors.grey),
              ),
            ],
          ),
        ),
        IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }

  Widget _buildTabSelector() {
    return SegmentedButton<int>(
      segments: const [
        ButtonSegment(
          value: 0,
          label: Text('Partes Iguales', style: TextStyle(fontSize: 12)),
          icon: Icon(Icons.people_outline, size: 18),
        ),
        ButtonSegment(
          value: 1,
          label: Text('Por Ítems', style: TextStyle(fontSize: 12)),
          icon: Icon(Icons.receipt_long_outlined, size: 18),
        ),
      ],
      selected: {_selectedTabIndex},
      onSelectionChanged: (newSelection) {
        setState(() {
          _selectedTabIndex = newSelection.first;
        });
      },
    );
  }

  Widget _buildTipSelector() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          const Text('Propina: ', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
          const SizedBox(width: 4),
          ChoiceChip(
            key: const Key('tip_chip_10'),
            label: const Text('10% Sugerida', style: TextStyle(fontSize: 12)),
            selected: _tipType == TipType.suggestedTenPercent,
            onSelected: (selected) {
              if (selected) {
                setState(() => _tipType = TipType.suggestedTenPercent);
              }
            },
          ),
          const SizedBox(width: 6),
          ChoiceChip(
            key: const Key('tip_chip_15'),
            label: const Text('15%', style: TextStyle(fontSize: 12)),
            selected: _tipType == TipType.customPercentage && _customTipPercentage == 15.0,
            onSelected: (selected) {
              if (selected) {
                setState(() {
                  _tipType = TipType.customPercentage;
                  _customTipPercentage = 15.0;
                });
              }
            },
          ),
          const SizedBox(width: 6),
          ChoiceChip(
            key: const Key('tip_chip_20'),
            label: const Text('20%', style: TextStyle(fontSize: 12)),
            selected: _tipType == TipType.customPercentage && _customTipPercentage == 20.0,
            onSelected: (selected) {
              if (selected) {
                setState(() {
                  _tipType = TipType.customPercentage;
                  _customTipPercentage = 20.0;
                });
              }
            },
          ),
          const SizedBox(width: 6),
          ChoiceChip(
            key: const Key('tip_chip_none'),
            label: const Text('Sin Propina', style: TextStyle(fontSize: 12)),
            selected: _tipType == TipType.none,
            onSelected: (selected) {
              if (selected) {
                setState(() => _tipType = TipType.none);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildCompactBody() {
    final tip = _tipCalculation;
    final splitResult = _selectedTabIndex == 0 ? _equalSplitResult : _itemizedSplitResult;

    return SingleChildScrollView(
      key: const Key('split_dialog_compact_layout'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_selectedTabIndex == 0) _buildCoverStepper(),
          if (_selectedTabIndex == 1) _buildItemizedAssignmentSection(),
          const SizedBox(height: 10),
          _buildSummaryCard(tip),
          const SizedBox(height: 10),
          _buildSharesList(splitResult),
        ],
      ),
    );
  }

  Widget _buildDesktopBody() {
    final tip = _tipCalculation;
    final splitResult = _selectedTabIndex == 0 ? _equalSplitResult : _itemizedSplitResult;

    return Row(
      key: const Key('split_dialog_desktop_layout'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Left Column: Configuration & Totals
        Expanded(
          flex: 4,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_selectedTabIndex == 0) _buildCoverStepper(),
                if (_selectedTabIndex == 1) _buildItemizedAssignmentSection(),
                const SizedBox(height: 12),
                _buildSummaryCard(tip),
              ],
            ),
          ),
        ),
        const SizedBox(width: 16),
        // Right Column: Shares List & Payment Actions
        Expanded(
          flex: 5,
          child: _buildSharesList(splitResult),
        ),
      ],
    );
  }

  Widget _buildCoverStepper() {
    return Card(
      elevation: 0,
      color: Theme.of(context).colorScheme.surfaceVariant.withOpacity(0.4),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Flexible(
              child: Text(
                'Personas:',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton.filledTonal(
                  key: const Key('btn_decrement_covers'),
                  icon: const Icon(Icons.remove, size: 16),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  onPressed: _coverCount > 2
                      ? () => setState(() => _coverCount--)
                      : null,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    '$_coverCount Comensales',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ),
                IconButton.filledTonal(
                  key: const Key('btn_increment_covers'),
                  icon: const Icon(Icons.add, size: 16),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  onPressed: _coverCount < 20
                      ? () => setState(() => _coverCount++)
                      : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildItemizedAssignmentSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Expanded(
              child: Text(
                'Asignación de Ítems',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Comensales: ', style: TextStyle(fontSize: 12)),
                DropdownButton<int>(
                  value: _itemizedCoverCount,
                  isDense: true,
                  items: [2, 3, 4, 5, 6].map((count) {
                    return DropdownMenuItem(
                      value: count,
                      child: Text('$count'),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() => _itemizedCoverCount = val);
                    }
                  },
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 6),
        ...widget.cart.asMap().entries.map((entry) {
          final idx = entry.key;
          final item = entry.value;
          final currentCover = _itemAssignments[idx] ?? 1;

          return Card(
            margin: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              dense: true,
              title: Text(item.quantity > 1 ? '${item.productName} (x${item.quantity.toInt()})' : item.productName),
              subtitle: Text('C\$ ${(item.subtotal + item.modifiersTotal).toStringAsFixed(2)}'),
              trailing: DropdownButton<int>(
                key: Key('assign_item_${item.productId}_cover_$currentCover'),
                value: currentCover,
                items: List.generate(_itemizedCoverCount, (cIdx) => cIdx + 1).map((cNum) {
                  return DropdownMenuItem(
                    value: cNum,
                    child: Text('Comensal $cNum'),
                  );
                }).toList(),
                onChanged: (newCover) {
                  if (newCover != null) {
                    setState(() {
                      _itemAssignments[idx] = newCover;
                    });
                  }
                },
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildSummaryCard(TipCalculation tip) {
    return Card(
      elevation: 0,
      color: Colors.grey.shade100,
      child: Padding(
        padding: const EdgeInsets.all(10.0),
        child: Column(
          children: [
            Row(
              children: [
                const Expanded(child: Text('Subtotal:', style: TextStyle(fontSize: 12))),
                Text('C\$ ${_cartSubtotal.toStringAsFixed(2)}', style: const TextStyle(fontSize: 12)),
              ],
            ),
            const SizedBox(height: 3),
            Row(
              children: [
                const Expanded(child: Text('IVA (15%):', style: TextStyle(fontSize: 12))),
                Text('C\$ ${_cartTax.toStringAsFixed(2)}', style: const TextStyle(fontSize: 12)),
              ],
            ),
            const SizedBox(height: 3),
            Row(
              children: [
                Expanded(
                  child: Text('Propina (${tip.effectivePercentage.toInt()}%):', style: const TextStyle(fontSize: 12)),
                ),
                Text('C\$ ${tip.tipAmountNio.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 12, color: Colors.green, fontWeight: FontWeight.w600)),
              ],
            ),
            const Divider(height: 10),
            Row(
              children: [
                const Expanded(
                  child: Text('Total con Propina:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                ),
                Text(
                  'C\$ ${tip.totalWithTipNio.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.deepOrange),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSharesList(SplitBillResult splitResult) {
    return ListView.builder(
      key: const Key('itemized_shares_list'),
      shrinkWrap: true,
      physics: const ClampingScrollPhysics(),
      itemCount: splitResult.shares.length,
      itemBuilder: (context, index) {
        final share = splitResult.shares[index];

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 13,
                      backgroundColor: Colors.deepOrange.shade100,
                      child: Text(
                        '${share.shareIndex}',
                        style: const TextStyle(color: Colors.deepOrange, fontWeight: FontWeight.bold, fontSize: 11),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(share.label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'C\$ ${share.totalNio.toStringAsFixed(2)}',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          '\$ ${share.totalUsd.toStringAsFixed(2)}',
                          style: const TextStyle(fontSize: 10, color: Colors.grey),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Sub: C\$ ${share.subtotalNio.toStringAsFixed(2)} | Prop: C\$ ${share.tipNio.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 10, color: Colors.grey),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    FilledButton.tonal(
                      key: Key('btn_pay_share_${share.shareIndex}'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        minimumSize: const Size(54, 28),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () {
                        widget.onPayShare?.call(share);
                      },
                      child: const Text('Cobrar', style: TextStyle(fontSize: 10)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
