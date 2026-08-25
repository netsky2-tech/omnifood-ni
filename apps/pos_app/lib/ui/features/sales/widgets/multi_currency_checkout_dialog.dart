import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../../domain/models/sales/payment.dart';
import '../../../../domain/services/sales/currency_checkout_calculator.dart';

class MultiCurrencyCheckoutDialog extends StatefulWidget {
  const MultiCurrencyCheckoutDialog({super.key});

  @override
  State<MultiCurrencyCheckoutDialog> createState() =>
      _MultiCurrencyCheckoutDialogState();
}

class _MultiCurrencyCheckoutDialogState
    extends State<MultiCurrencyCheckoutDialog> {
  PaymentMethod _selectedMethod = PaymentMethod.cash;
  String _tenderCurrency = 'NIO';
  String _changeCurrencyPreference = 'NIO';
  final TextEditingController _tenderAmountController = TextEditingController();

  late CurrencyCheckoutCalculator _calculator;

  @override
  void initState() {
    super.initState();
    final vm = context.read<SaleViewModel>();
    _calculator = CurrencyCheckoutCalculator(
      commercialRate: vm.commercialRate,
      bcnOfficialRate: vm.bcnOfficialRate,
    );
    _tenderAmountController.text = vm.total.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _tenderAmountController.dispose();
    super.dispose();
  }

  void _onTenderCurrencyChanged(String newCurrency) {
    if (_tenderCurrency == newCurrency) return;
    final vm = context.read<SaleViewModel>();
    setState(() {
      _tenderCurrency = newCurrency;
      if (newCurrency == 'USD') {
        final totalUsd = _calculator.calculateTotalUsd(vm.total);
        _tenderAmountController.text = totalUsd.toStringAsFixed(2);
      } else {
        _tenderAmountController.text = vm.total.toStringAsFixed(2);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final totalNio = viewModel.total;
    final totalUsd = _calculator.calculateTotalUsd(totalNio);

    final tenderAmount =
        double.tryParse(_tenderAmountController.text.trim()) ?? 0.0;

    final breakdown = _calculator.calculateTender(
      totalNio: totalNio,
      tenderAmount: tenderAmount,
      tenderCurrency: _tenderCurrency,
      changeCurrencyPreference: _changeCurrencyPreference,
    );

    final suggestions = _calculator.getSuggestedDenominations(
      totalNio: totalNio,
      currency: _tenderCurrency,
    );

    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: colorScheme.primary, width: 2),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 720),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Cobro y Facturación',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    visualDensity: VisualDensity.compact,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 4),

              // FX Rates Badges
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  Chip(
                    avatar: const Icon(Icons.currency_exchange, size: 14),
                    label: Text(
                      'TC Comercial: ${viewModel.commercialRate.toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 11),
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
                  Chip(
                    avatar: const Icon(Icons.account_balance, size: 14),
                    label: Text(
                      'TC BCN: ${viewModel.bcnOfficialRate.toStringAsFixed(4)}',
                      style: const TextStyle(fontSize: 11),
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Scrollable Main Content Area
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Total to pay Display
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceVariant.withOpacity(0.4),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: colorScheme.outlineVariant),
                        ),
                        child: Column(
                          children: [
                            const Text(
                              'TOTAL A COBRAR',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 1.1,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'C\$ ${totalNio.toStringAsFixed(2)}',
                              style: TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.bold,
                                color: colorScheme.primary,
                              ),
                            ),
                            Text(
                              '(\$${totalUsd.toStringAsFixed(2)} USD)',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Payment Method Selector
                      SegmentedButton<PaymentMethod>(
                        segments: const [
                          ButtonSegment(
                            value: PaymentMethod.cash,
                            label: Text('Efectivo'),
                            icon: Icon(Icons.money),
                          ),
                          ButtonSegment(
                            value: PaymentMethod.card,
                            label: Text('Tarjeta'),
                            icon: Icon(Icons.credit_card),
                          ),
                          ButtonSegment(
                            value: PaymentMethod.qr,
                            label: Text('QR'),
                            icon: Icon(Icons.qr_code),
                          ),
                        ],
                        selected: {_selectedMethod},
                        onSelectionChanged: (newSelection) {
                          setState(() {
                            _selectedMethod = newSelection.first;
                          });
                        },
                      ),
                      const SizedBox(height: 12),

                      if (_selectedMethod == PaymentMethod.cash) ...[
                        // Tender Currency Selection
                        const Text(
                          'Moneda Recibida',
                          style: TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 8,
                          children: [
                            ChoiceChip(
                              label: const Text('NIO (C\$)'),
                              selected: _tenderCurrency == 'NIO',
                              onSelected: (selected) {
                                if (selected) _onTenderCurrencyChanged('NIO');
                              },
                            ),
                            ChoiceChip(
                              label: const Text('USD (\$)'),
                              selected: _tenderCurrency == 'USD',
                              onSelected: (selected) {
                                if (selected) _onTenderCurrencyChanged('USD');
                              },
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),

                        // Tender Amount Input
                        TextField(
                          controller: _tenderAmountController,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          decoration: InputDecoration(
                            labelText: 'Monto Recibido',
                            prefixText:
                                _tenderCurrency == 'USD' ? '\$ ' : 'C\$ ',
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 8),

                        // Quick Cash Suggestion Chips
                        const Text(
                          'Billetes Sugeridos',
                          style: TextStyle(fontSize: 11, color: Colors.grey),
                        ),
                        const SizedBox(height: 4),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: suggestions.map((sug) {
                              final label = _tenderCurrency == 'USD'
                                  ? '\$ ${sug.toStringAsFixed(sug % 1 == 0 ? 0 : 2)}'
                                  : 'C\$ ${sug.toStringAsFixed(sug % 1 == 0 ? 0 : 2)}';
                              return Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: ActionChip(
                                  label: Text(label,
                                      style: const TextStyle(fontSize: 12)),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () {
                                    setState(() {
                                      _tenderAmountController.text =
                                          sug.toStringAsFixed(
                                              sug % 1 == 0 ? 0 : 2);
                                    });
                                  },
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                        const SizedBox(height: 10),

                        // Change Currency Preference
                        const Text(
                          'Preferencia de Vuelto',
                          style: TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 8,
                          children: [
                            ChoiceChip(
                              label: const Text('Vuelto en NIO (C\$)'),
                              selected: _changeCurrencyPreference == 'NIO',
                              onSelected: (selected) {
                                if (selected) {
                                  setState(() {
                                    _changeCurrencyPreference = 'NIO';
                                  });
                                }
                              },
                            ),
                            ChoiceChip(
                              label: const Text('Vuelto en USD (\$)'),
                              selected: _changeCurrencyPreference == 'USD',
                              onSelected: (selected) {
                                if (selected) {
                                  setState(() {
                                    _changeCurrencyPreference = 'USD';
                                  });
                                }
                              },
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),

                        // Breakdown & Change / Remaining Display
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: breakdown.isSufficient
                                ? Colors.green.withOpacity(0.08)
                                : Colors.red.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: breakdown.isSufficient
                                  ? Colors.green.shade400
                                  : Colors.red.shade400,
                            ),
                          ),
                          child: Column(
                            children: [
                              if (breakdown.isSufficient) ...[
                                Text(
                                  _changeCurrencyPreference == 'USD'
                                      ? 'Vuelto: \$${breakdown.effectiveChange.toStringAsFixed(2)} USD'
                                      : 'Vuelto: C\$ ${breakdown.effectiveChange.toStringAsFixed(2)}',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.green.shade700,
                                  ),
                                ),
                                if (_changeCurrencyPreference == 'USD')
                                  Text(
                                    'Equivalente: C\$ ${breakdown.changeNio.toStringAsFixed(2)} NIO',
                                    style: const TextStyle(fontSize: 11),
                                  )
                                else
                                  Text(
                                    'Equivalente: \$${breakdown.changeUsd.toStringAsFixed(2)} USD',
                                    style: const TextStyle(fontSize: 11),
                                  ),
                              ] else ...[
                                Text(
                                  'Faltan C\$ ${breakdown.remainingNio.toStringAsFixed(2)}',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.red.shade700,
                                  ),
                                ),
                                Text(
                                  '(\$${breakdown.remainingUsd.toStringAsFixed(2)} USD)',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.red.shade700,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // Action Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('CANCELAR'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: (_selectedMethod == PaymentMethod.cash &&
                              !breakdown.isSufficient)
                          ? null
                          : () async {
                              final payment = _selectedMethod ==
                                      PaymentMethod.cash
                                  ? Payment(
                                      id: '',
                                      invoiceId: '',
                                      method: PaymentMethod.cash,
                                      amount: breakdown.tenderAmount,
                                      currency: breakdown.tenderCurrency,
                                      exchangeRate: viewModel.commercialRate,
                                      amountNio: breakdown.tenderAmountNio,
                                      changeGiven: breakdown.effectiveChange,
                                      changeCurrency: breakdown.changeCurrency,
                                      createdAt: DateTime.now(),
                                    )
                                  : Payment(
                                      id: '',
                                      invoiceId: '',
                                      method: _selectedMethod,
                                      amount: totalNio,
                                      currency: 'NIO',
                                      exchangeRate: viewModel.commercialRate,
                                      amountNio: totalNio,
                                      changeGiven: 0.0,
                                      changeCurrency: 'NIO',
                                      createdAt: DateTime.now(),
                                    );

                              await viewModel.processSale(
                                [_selectedMethod],
                                customPayments: [payment],
                              );

                              if (context.mounted) {
                                Navigator.of(context).pop();
                              }
                            },
                      child: const Text('COBRAR'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
