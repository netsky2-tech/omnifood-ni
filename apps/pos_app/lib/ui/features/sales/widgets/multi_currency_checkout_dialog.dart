import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../../../presentation/features/sales/view_models/sale_view_model.dart';
import '../../../../domain/models/sales/payment.dart';
import '../../../../domain/services/sales/currency_checkout_calculator.dart';
import '../../../../domain/services/sales/split_payment_calculator.dart';
import '../../../design_system/design_system.dart';

class MultiCurrencyCheckoutDialog extends StatefulWidget {
  const MultiCurrencyCheckoutDialog({super.key});

  @override
  State<MultiCurrencyCheckoutDialog> createState() =>
      _MultiCurrencyCheckoutDialogState();
}

class _MultiCurrencyCheckoutDialogState
    extends State<MultiCurrencyCheckoutDialog> {
  bool _isSplitMode = false;
  bool _isProcessing = false;

  /// Operator-facing failure surfaced INLINE inside the dialog (NHILOS §4.1:
  /// never hide a material side effect). Captured from the view model at
  /// failure time because the SnackBar path is occluded by this dialog.
  String? _inlineError;

  // Single Checkout State
  PaymentMethod _selectedMethod = PaymentMethod.cash;
  String _tenderCurrency = 'NIO';
  String _changeCurrencyPreference = 'NIO';
  final TextEditingController _tenderAmountController = TextEditingController();

  // Buzzer & Customer metadata
  final TextEditingController _buzzerController = TextEditingController();
  final TextEditingController _customerNameController = TextEditingController();
  String? _buzzerValidationMessage;

  // Card Datáfono State
  String _selectedBankPos = 'BAC';
  String _selectedCardBrand = 'VISA';
  String _selectedCardType = 'DEBITO';
  bool _isFastCheckout = true;
  bool _showManualVoucher = false;
  final TextEditingController _authCodeController = TextEditingController();
  final TextEditingController _last4Controller = TextEditingController();
  final TextEditingController _batchController = TextEditingController();

  // Split Checkout State
  late SplitPaymentCalculator _splitCalculator;
  final TextEditingController _splitAmountController = TextEditingController();
  PaymentMethod _splitSelectedMethod = PaymentMethod.cash;
  String _splitCurrency = 'NIO';

  late CurrencyCheckoutCalculator _singleCalculator;

  @override
  void initState() {
    super.initState();
    final vm = context.read<SaleViewModel>();
    _singleCalculator = CurrencyCheckoutCalculator(
      commercialRate: vm.activeCheckoutRate,
      bcnOfficialRate: vm.bcnOfficialRate,
    );
    _splitCalculator = SplitPaymentCalculator(
      totalNio: vm.total,
      commercialRate: vm.activeCheckoutRate,
    );

    _tenderAmountController.text = vm.total.toStringAsFixed(2);
    _splitAmountController.text = vm.total.toStringAsFixed(2);
    if (vm.buzzerNumber != null && vm.buzzerNumber!.isNotEmpty) {
      _buzzerController.text = vm.buzzerNumber!;
    }
    if (vm.customerName != null && vm.customerName!.isNotEmpty) {
      _customerNameController.text = vm.customerName!;
    }
  }

  @override
  void dispose() {
    _tenderAmountController.dispose();
    _buzzerController.dispose();
    _customerNameController.dispose();
    _authCodeController.dispose();
    _last4Controller.dispose();
    _batchController.dispose();
    _splitAmountController.dispose();
    super.dispose();
  }

  void _onTenderCurrencyChanged(String newCurrency) {
    if (_tenderCurrency == newCurrency) return;
    final vm = context.read<SaleViewModel>();
    setState(() {
      _tenderCurrency = newCurrency;
      if (newCurrency == 'USD') {
        final totalUsd = _singleCalculator.calculateTotalUsd(vm.total);
        _tenderAmountController.text = totalUsd.toStringAsFixed(2);
      } else {
        _tenderAmountController.text = vm.total.toStringAsFixed(2);
      }
    });
  }

  void _onSplitCurrencyChanged(String newCurrency) {
    if (_splitCurrency == newCurrency) return;
    setState(() {
      _splitCurrency = newCurrency;
      if (newCurrency == 'USD') {
        _splitAmountController.text = _splitCalculator.remainingUsd.toStringAsFixed(2);
      } else {
        _splitAmountController.text = _splitCalculator.remainingNio.toStringAsFixed(2);
      }
    });
  }

  void _addSplitPayment() {
    final amount = double.tryParse(_splitAmountController.text.trim()) ?? 0.0;
    if (amount <= 0) return;

    Payment payment;
    if (_splitSelectedMethod == PaymentMethod.cash) {
      payment = _splitCalculator.createCashPayment(
        tenderAmount: amount,
        tenderCurrency: _splitCurrency,
        changeCurrencyPreference: _splitCurrency,
      );
    } else if (_splitSelectedMethod == PaymentMethod.card) {
      final auth = _authCodeController.text.trim();
      final hasAuth = auth.isNotEmpty;
      payment = _splitCalculator.createCardPayment(
        amount: amount,
        currency: _splitCurrency,
        bankPos: _selectedBankPos,
        cardBrand: _selectedCardBrand,
        cardType: _selectedCardType,
        voucherCode: hasAuth ? auth : 'PENDIENTE',
        last4: _last4Controller.text.trim().isNotEmpty ? _last4Controller.text.trim() : null,
        batchNumber: _batchController.text.trim().isNotEmpty ? _batchController.text.trim() : null,
        isFastCheckout: !hasAuth,
      );
    } else {
      payment = _splitCalculator.createQrPayment(
        amount: amount,
        currency: _splitCurrency,
        reference: _authCodeController.text.trim().isNotEmpty ? _authCodeController.text.trim() : null,
      );
    }

    setState(() {
      _splitCalculator = _splitCalculator.addPayment(payment);
      // Reset inputs
      _authCodeController.clear();
      _last4Controller.clear();
      _batchController.clear();
      if (_splitCurrency == 'USD') {
        _splitAmountController.text = _splitCalculator.remainingUsd.toStringAsFixed(2);
      } else {
        _splitAmountController.text = _splitCalculator.remainingNio.toStringAsFixed(2);
      }
    });
  }

  void _removeSplitPayment(String id) {
    setState(() {
      _splitCalculator = _splitCalculator.removePayment(id);
      if (_splitCurrency == 'USD') {
        _splitAmountController.text = _splitCalculator.remainingUsd.toStringAsFixed(2);
      } else {
        _splitAmountController.text = _splitCalculator.remainingNio.toStringAsFixed(2);
      }
    });
  }

  Future<void> _submitSingleSale(SaleViewModel vm) async {
    if (_isProcessing) return;
    final tenderAmount =
        double.tryParse(_tenderAmountController.text.trim()) ?? 0.0;

    final breakdown = _singleCalculator.calculateTender(
      totalNio: vm.total,
      tenderAmount: tenderAmount,
      tenderCurrency: _tenderCurrency,
      changeCurrencyPreference: _changeCurrencyPreference,
    );

    if (!breakdown.isSufficient && _selectedMethod == PaymentMethod.cash) {
      return;
    }

    Payment payment;
    if (_selectedMethod == PaymentMethod.cash) {
      payment = Payment(
        id: const Uuid().v4(),
        invoiceId: '',
        method: PaymentMethod.cash,
        amount: breakdown.tenderAmount,
        currency: breakdown.tenderCurrency,
        exchangeRate: vm.commercialRate,
        amountNio: breakdown.tenderAmountNio,
        changeGiven: breakdown.effectiveChange,
        changeCurrency: breakdown.changeCurrency,
        createdAt: DateTime.now(),
      );
    } else if (_selectedMethod == PaymentMethod.card) {
      final auth = _authCodeController.text.trim();
      final hasAuth = auth.isNotEmpty;
      final rate = _tenderCurrency == 'USD' ? vm.commercialRate : 1.0;
      final amountNio = tenderAmount * rate;

      payment = Payment(
        id: const Uuid().v4(),
        invoiceId: '',
        method: PaymentMethod.card,
        amount: tenderAmount,
        currency: _tenderCurrency,
        exchangeRate: rate,
        amountNio: amountNio,
        changeGiven: 0.0,
        changeCurrency: _tenderCurrency,
        voucherCode: hasAuth ? auth : 'PENDIENTE',
        cardBrand: _selectedCardBrand,
        cardType: _selectedCardType,
        bankPos: _selectedBankPos,
        reconciliationStatus: hasAuth ? 'CONCILIADO' : 'PENDIENTE',
        last4: _last4Controller.text.trim().isNotEmpty ? _last4Controller.text.trim() : null,
        batchNumber: _batchController.text.trim().isNotEmpty ? _batchController.text.trim() : null,
        createdAt: DateTime.now(),
      );
    } else {
      final rate = _tenderCurrency == 'USD' ? vm.commercialRate : 1.0;
      payment = Payment(
        id: const Uuid().v4(),
        invoiceId: '',
        method: _selectedMethod,
        amount: tenderAmount,
        currency: _tenderCurrency,
        exchangeRate: rate,
        amountNio: tenderAmount * rate,
        changeGiven: 0.0,
        changeCurrency: _tenderCurrency,
        voucherCode: _authCodeController.text.trim().isNotEmpty ? _authCodeController.text.trim() : null,
        reconciliationStatus: 'CONCILIADO',
        createdAt: DateTime.now(),
      );
    }
    final buzzerText = _buzzerController.text.trim();
    final customerNameText = _customerNameController.text.trim();

    if (vm.tenantConfig?.buzzerPagerRequired == true && buzzerText.isEmpty) {
      setState(() {
        _isProcessing = false;
        _buzzerValidationMessage = 'El número de Buzzer/Pager es obligatorio.';
      });
      return;
    }

    setState(() => _isProcessing = true);
    try {
      await vm.processSale(
        [_selectedMethod],
        customPayments: [payment],
        buzzerNumber: buzzerText.isNotEmpty ? buzzerText : null,
        customerName: customerNameText.isNotEmpty ? customerNameText : null,
      );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Venta procesada con éxito'),
            backgroundColor: NhilosColors.success,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      // Go-live fix: keep the dialog open and show the failure INLINE at the
      // point of action. The SnackBar path is occluded by this dialog, so it
      // cannot be the only surface. The confirm button is re-enabled only
      // AFTER the failure state has been painted, so a rapid second tap can
      // never start a second attempt before the operator sees the error.
      if (mounted) {
        setState(() {
          _inlineError = vm.errorMessage ??
              'No se pudo procesar la venta. Intentá de nuevo.';
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _isProcessing = false);
        });
      }
    }
  }

  Future<void> _submitSplitSale(SaleViewModel vm) async {
    if (_isProcessing) return;
    if (!_splitCalculator.isFullyPaid) return;

    final buzzerText = _buzzerController.text.trim();
    final customerNameText = _customerNameController.text.trim();

    if (vm.tenantConfig?.buzzerPagerRequired == true && buzzerText.isEmpty) {
      setState(() {
        _isProcessing = false;
        _buzzerValidationMessage = 'El número de Buzzer/Pager es obligatorio.';
      });
      return;
    }

    final methods = _splitCalculator.payments.map((p) => p.method).toSet().toList();
    setState(() => _isProcessing = true);
    try {
      await vm.processSale(
        methods,
        customPayments: _splitCalculator.payments,
        buzzerNumber: buzzerText.isNotEmpty ? buzzerText : null,
        customerName: customerNameText.isNotEmpty ? customerNameText : null,
      );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Venta procesada con éxito'),
            backgroundColor: NhilosColors.success,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      // Same inline failure surface as the single-payment path.
      if (mounted) {
        setState(() {
          _inlineError = vm.errorMessage ??
              'No se pudo procesar la venta. Intentá de nuevo.';
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _isProcessing = false);
        });
      }
    }
  }

  /// Inline error region shown above the confirm button while the dialog
  /// stays open. Empty (zero-size) while there is no failure to show.
  Widget _buildInlineErrorSection() {
    final message = _inlineError;
    if (message == null) return const SizedBox.shrink();
    return Container(
      key: const Key('checkout_inline_error'),
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: NhilosColors.dangerLight,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: NhilosColors.dangerBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 20, color: NhilosColors.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: NhilosColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBuzzerPagerSection(SaleViewModel viewModel) {
    if (viewModel.supportsBuzzerPager != true) return const SizedBox.shrink();

    final isRequired = viewModel.tenantConfig?.buzzerPagerRequired ?? false;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        decoration: BoxDecoration(
          color: NhilosColors.neutralGray,
          borderRadius: NhilosRadii.buttonRadius,
          border: Border.all(
            color: _buzzerValidationMessage != null
                ? NhilosColors.dangerBorder
                : NhilosColors.border,
            width: 1,
          ),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.notifications_none_outlined,
                  size: 18,
                  color: NhilosColors.neutralGrayDark,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isRequired
                        ? 'BUZZER / PAGER DE ENTREGA (REQUERIDO)'
                        : 'BUZZER / PAGER DE ENTREGA (OPCIONAL)',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: NhilosColors.textPrimary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    key: const Key('checkout_buzzer_input'),
                    controller: _buzzerController,
                    decoration: InputDecoration(
                      labelText: isRequired ? 'Nº Buzzer *' : 'Nº Buzzer',
                      hintText: 'Ej: 15',
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      border: const OutlineInputBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                        borderSide: BorderSide(color: NhilosColors.border),
                      ),
                      enabledBorder: const OutlineInputBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                        borderSide: BorderSide(color: NhilosColors.border),
                      ),
                      focusedBorder: const OutlineInputBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                        borderSide: BorderSide(color: NhilosColors.brandPrimary, width: 1.5),
                      ),
                      errorText: _buzzerValidationMessage,
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (val) {
                      viewModel.setBuzzerNumber(val.trim());
                      if (_buzzerValidationMessage != null) {
                        setState(() => _buzzerValidationMessage = null);
                      }
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: TextField(
                    key: const Key('checkout_customer_name_input'),
                    controller: _customerNameController,
                    decoration: const InputDecoration(
                      labelText: 'Nombre Cliente',
                      hintText: 'Ej: Juan',
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                        borderSide: BorderSide(color: NhilosColors.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                        borderSide: BorderSide(color: NhilosColors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: NhilosRadii.buttonRadius,
                        borderSide: BorderSide(color: NhilosColors.brandPrimary, width: 1.5),
                      ),
                    ),
                    onChanged: (val) => viewModel.setCustomerName(val.trim()),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);
    final totalNio = viewModel.total;
    final totalUsd = _singleCalculator.calculateTotalUsd(totalNio);

    return Dialog(
      insetPadding: EdgeInsets.symmetric(
        horizontal: isHandheld ? 8 : 40,
        vertical: isHandheld ? 12 : 24,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: colorScheme.primary, width: 2),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: isHandheld ? double.infinity : 580,
          maxHeight: isHandheld ? MediaQuery.sizeOf(context).height * 0.95 : 780,
        ),
        child: Padding(
          padding: EdgeInsets.all(isHandheld ? 12 : 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header & Tabs
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      'Cobro y Facturación',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Mode Tabs: Cobro Simple vs Pago Dividido
              SegmentedButton<bool>(
                showSelectedIcon: !isHandheld,
                style: const ButtonStyle(
                  visualDensity: VisualDensity.compact,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                segments: const [
                  ButtonSegment(
                    value: false,
                    label: Text('Cobro Completo'),
                    icon: Icon(Icons.payment, size: 16),
                  ),
                  ButtonSegment(
                    value: true,
                    label: Text('Pago Dividido'),
                    icon: Icon(Icons.call_split, size: 16),
                  ),
                ],
                selected: {_isSplitMode},
                onSelectionChanged: (set) {
                  setState(() {
                    _isSplitMode = set.first;
                  });
                },
              ),
              const SizedBox(height: 12),

              // Content Body
              Expanded(
                child: SingleChildScrollView(
                  child: _isSplitMode
                      ? _buildSplitCheckoutBody(context, viewModel, totalNio, totalUsd)
                      : _buildSingleCheckoutBody(context, viewModel, totalNio, totalUsd),
                ),
              ),

              const SizedBox(height: 12),

              // Inline failure surface (go-live fix): visible at the point
              // of action while the dialog remains open.
              _buildInlineErrorSection(),

              // Footer Submit
              if (_isSplitMode)
                FilledButton.icon(
                  onPressed: (_splitCalculator.isFullyPaid && !_isProcessing)
                      ? () => _submitSplitSale(viewModel)
                      : null,
                  icon: _isProcessing
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.check_circle),
                  label: const Text('FINALIZAR VENTA'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    backgroundColor: NhilosColors.success,
                  ),
                )
              else
                Builder(builder: (context) {
                  final tenderAmount = double.tryParse(_tenderAmountController.text.trim()) ?? 0.0;
                  final breakdown = _singleCalculator.calculateTender(
                    totalNio: totalNio,
                    tenderAmount: tenderAmount,
                    tenderCurrency: _tenderCurrency,
                    changeCurrencyPreference: _changeCurrencyPreference,
                  );
                  final isCashValid = _selectedMethod != PaymentMethod.cash || breakdown.isSufficient;
                  return FilledButton(
                    onPressed: (isCashValid && !_isProcessing)
                        ? () => _submitSingleSale(viewModel)
                        : null,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _isProcessing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('COBRAR'),
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }


  Widget _buildSingleCheckoutBody(
    BuildContext context,
    SaleViewModel viewModel,
    double totalNio,
    double totalUsd,
  ) {
    final tenderAmount =
        double.tryParse(_tenderAmountController.text.trim()) ?? 0.0;

    final breakdown = _singleCalculator.calculateTender(
      totalNio: totalNio,
      tenderAmount: tenderAmount,
      tenderCurrency: _tenderCurrency,
      changeCurrencyPreference: _changeCurrencyPreference,
    );

    final suggestions = _singleCalculator.getSuggestedDenominations(
      totalNio: totalNio,
      currency: _tenderCurrency,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Amounts Card
        _buildTotalHeaderCard(totalNio, totalUsd, viewModel),
        const SizedBox(height: 12),

        // Buzzer & Customer Section (Food Park QSR / Hybrid)
        _buildBuzzerPagerSection(viewModel),

        // Method Selector
        _buildMethodSelector(
          selected: _selectedMethod,
          onSelected: (m) => setState(() => _selectedMethod = m),
        ),
        const SizedBox(height: 12),

        if (_selectedMethod == PaymentMethod.cash) ...[
          // Cash Flow (NIO / USD)
          _buildCurrencySelectors(),
          const SizedBox(height: 12),
          _buildTenderInputField(
            controller: _tenderAmountController,
            currency: _tenderCurrency,
          ),
          const SizedBox(height: 8),
          _buildQuickSuggestionChips(suggestions),
          const SizedBox(height: 12),
          _buildCashBreakdownCard(breakdown),
        ] else if (_selectedMethod == PaymentMethod.card) ...[
          // Two-Layer Card Datáfono Flow
          _buildTwoLayerCardDatafonoPanel(),
        ] else ...[
          // QR / Transfer Flow
          _buildQrPanel(),
        ],
      ],
    );
  }

  Widget _buildSplitCheckoutBody(
    BuildContext context,
    SaleViewModel viewModel,
    double totalNio,
    double totalUsd,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Buzzer & Customer Section (Food Park QSR / Hybrid)
        _buildBuzzerPagerSection(viewModel),

        // Split Summary Balance Card
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: NhilosColors.neutralGray,
            borderRadius: NhilosRadii.buttonRadius,
            border: Border.all(color: NhilosColors.border),
          ),
          child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Text(
                        'Total Ticket:',
                        style: Theme.of(context).textTheme.bodyMedium,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text('C\$ ${totalNio.toStringAsFixed(2)}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontFeatures: [FontFeature.tabularFigures()])),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Text(
                        'Total Pagado:',
                        style: Theme.of(context).textTheme.bodyMedium,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text('C\$ ${_splitCalculator.totalPaidNio.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: NhilosColors.success,
                          fontFeatures: [FontFeature.tabularFigures()],
                        )),
                  ],
                ),
                const Divider(),
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    Text(
                      'Resta: C\$ ${_splitCalculator.remainingNio.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: _splitCalculator.isFullyPaid
                            ? NhilosColors.success
                            : NhilosColors.danger,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    Text(
                      '(\$ ${_splitCalculator.remainingUsd.toStringAsFixed(2)} USD)',
                      style: const TextStyle(
                        color: NhilosColors.textSecondary,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ],
            ),
        ),
        const SizedBox(height: 12),

        // Add Partial Payment Form
        if (!_splitCalculator.isFullyPaid) ...[
          Text('Agregar Pago Parcial:',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  )),
          const SizedBox(height: 8),
          _buildMethodSelector(
            selected: _splitSelectedMethod,
            onSelected: (m) => setState(() => _splitSelectedMethod = m),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              ChoiceChip(
                label: const Text('NIO (C\$)'),
                selected: _splitCurrency == 'NIO',
                onSelected: (selected) {
                  if (selected) _onSplitCurrencyChanged('NIO');
                },
              ),
              const SizedBox(width: 8),
              ChoiceChip(
                label: const Text('USD (\$)'),
                selected: _splitCurrency == 'USD',
                onSelected: (selected) {
                  if (selected) _onSplitCurrencyChanged('USD');
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            key: const Key('split_tender_amount_field'),
            controller: _splitAmountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Monto a Pagar (${_splitCurrency})',
              prefixText: _splitCurrency == 'USD' ? '\$ ' : 'C\$ ',
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),

          if (_splitSelectedMethod == PaymentMethod.card) ...[
            _buildTwoLayerCardDatafonoPanel(isSplit: true),
            const SizedBox(height: 8),
          ],

          FilledButton.tonalIcon(
            onPressed: _addSplitPayment,
            icon: const Icon(Icons.add),
            label: const Text('Agregar Pago'),
          ),
          const SizedBox(height: 12),
        ],

        // Applied Payments List
        if (_splitCalculator.payments.isNotEmpty) ...[
          Text('Pagos Aplicados (${_splitCalculator.payments.length}):',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  )),
          const SizedBox(height: 6),
          ..._splitCalculator.payments.map((p) {
            final isCard = p.method == PaymentMethod.card;
            final isFast = p.voucherCode == 'PENDIENTE';
            return Card(
              margin: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                dense: true,
                leading: Icon(
                  p.method == PaymentMethod.cash
                      ? Icons.money
                      : (isCard ? Icons.credit_card : Icons.qr_code),
                  color: NhilosColors.textSecondary,
                ),
                title: Text(
                  p.currency.toUpperCase() == 'NIO'
                      ? 'C\$ ${p.amount.toStringAsFixed(2)}'
                      : '\$ ${p.amount.toStringAsFixed(2)} (C\$ ${p.amountNio.toStringAsFixed(2)})',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: isCard
                    ? Text('${p.bankPos ?? 'BAC'} - ${p.cardBrand ?? 'VISA'} ${isFast ? '[Voucher: PENDIENTE]' : '[Aut: ${p.voucherCode}]'}')
                    : (p.changeGiven > 0
                        ? Text('Vuelto: ${p.changeCurrency.toUpperCase() == 'NIO' ? 'C\$' : '\$'} ${p.changeGiven.toStringAsFixed(2)}')
                        : null),
                trailing: IconButton(
                  icon: const Icon(Icons.delete, color: NhilosColors.danger),
                  onPressed: () => _removeSplitPayment(p.id),
                ),
              ),
            );
          }),
        ],
      ],
    );
  }

  Widget _buildTotalHeaderCard(
    double totalNio,
    double totalUsd,
    SaleViewModel viewModel,
  ) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: NhilosColors.neutralGray,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: NhilosColors.border),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Flexible(
                child: Text(
                  'Total a Cobrar:',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'C\$ ${totalNio.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: NhilosColors.brandPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  'Equivalente Comercial:',
                  style: const TextStyle(
                    fontSize: 13,
                    color: NhilosColors.textSecondary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '\$${totalUsd.toStringAsFixed(2)} USD',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: NhilosColors.success,
                ),
              ),
            ],
          ),
          const Divider(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              Chip(
                visualDensity: VisualDensity.compact,
                avatar: const Icon(Icons.currency_exchange, size: 14),
                label: Text(
                  viewModel.activeCheckoutRateLabel,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMethodSelector({
    required PaymentMethod selected,
    required ValueChanged<PaymentMethod> onSelected,
  }) {
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        ChoiceChip(
          label: const Text('Efectivo'),
          avatar: const Icon(Icons.money, size: 16),
          selected: selected == PaymentMethod.cash,
          onSelected: (val) {
            if (val) onSelected(PaymentMethod.cash);
          },
        ),
        ChoiceChip(
          label: const Text('Tarjeta'),
          avatar: const Icon(Icons.credit_card, size: 16),
          selected: selected == PaymentMethod.card,
          onSelected: (val) {
            if (val) onSelected(PaymentMethod.card);
          },
        ),
        ChoiceChip(
          label: const Text('QR / Transfer'),
          avatar: const Icon(Icons.qr_code, size: 16),
          selected: selected == PaymentMethod.qr,
          onSelected: (val) {
            if (val) onSelected(PaymentMethod.qr);
          },
        ),
      ],
    );
  }

  Widget _buildCurrencySelectors() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 4,
          children: [
            const Text('Paga con: ', style: TextStyle(fontWeight: FontWeight.w600)),
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
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 4,
          children: [
            const Text('Vuelto en: ', style: TextStyle(fontWeight: FontWeight.w600)),
            ChoiceChip(
              label: const Text('Vuelto en NIO (C\$)'),
              selected: _changeCurrencyPreference == 'NIO',
              onSelected: (selected) {
                if (selected) setState(() => _changeCurrencyPreference = 'NIO');
              },
            ),
            ChoiceChip(
              label: const Text('Vuelto en USD (\$)'),
              selected: _changeCurrencyPreference == 'USD',
              onSelected: (selected) {
                if (selected) setState(() => _changeCurrencyPreference = 'USD');
              },
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTenderInputField({
    required TextEditingController controller,
    required String currency,
  }) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: (_) => setState(() {}),
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        fontFeatures: [FontFeature.tabularFigures()],
      ),
      decoration: InputDecoration(
        labelText: 'Monto Recibido',
        prefixText: currency == 'USD' ? '\$ ' : 'C\$ ',
        border: const OutlineInputBorder(),
        suffixIcon: IconButton(
          icon: const Icon(Icons.clear),
          onPressed: () {
            controller.clear();
            setState(() {});
          },
        ),
      ),
    );
  }

  Widget _buildQuickSuggestionChips(List<double> suggestions) {
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: suggestions.map((denom) {
        final label = _tenderCurrency == 'USD'
            ? '\$ ${denom.toStringAsFixed(0)}'
            : 'C\$ ${denom.toStringAsFixed(0)}';
        return ActionChip(
          visualDensity: VisualDensity.compact,
          label: Text(
            label,
            style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
          ),
          onPressed: () {
            _tenderAmountController.text = denom.toStringAsFixed(2);
            setState(() {});
          },
        );
      }).toList(),
    );
  }

  Widget _buildCashBreakdownCard(TenderBreakdown breakdown) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: breakdown.isSufficient
            ? NhilosColors.successLight
            : NhilosColors.warningLight,
        borderRadius: NhilosRadii.buttonRadius,
        border: Border.all(
          color: breakdown.isSufficient
              ? NhilosColors.successBorder
              : NhilosColors.warningBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  breakdown.isSufficient
                      ? (breakdown.changeCurrency == 'USD'
                          ? 'Vuelto: \$${breakdown.effectiveChange.toStringAsFixed(2)} USD'
                          : 'Vuelto: C\$ ${breakdown.effectiveChange.toStringAsFixed(2)}')
                      : 'Faltan C\$ ${breakdown.remainingNio.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: breakdown.isSufficient
                        ? NhilosColors.success
                        : NhilosColors.danger,
                  ),
                ),
              ),
            ],
          ),
          if (breakdown.isSufficient && breakdown.changeCurrency == 'USD')
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Equivalente en NIO: C\$ ${breakdown.changeNio.toStringAsFixed(2)}',
                style: const TextStyle(
                    fontSize: 12, color: NhilosColors.textSecondary),
              ),
            ),
          if (breakdown.isSufficient && breakdown.changeCurrency == 'NIO')
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Equivalente en USD: \$${breakdown.changeUsd.toStringAsFixed(2)} USD',
                style: const TextStyle(
                    fontSize: 12, color: NhilosColors.textSecondary),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTwoLayerCardDatafonoPanel({bool isSplit = false}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: NhilosColors.neutralGray,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: NhilosColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.contactless, color: NhilosColors.brandPrimary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Procese el cobro en el datáfono físico (BAC / BANPRO / LAFISE)',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: NhilosColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Bank POS Selector
          const Text('Banco Adquirente / Datáfono:',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            children: ['BAC', 'BANPRO', 'LAFISE'].map((bank) {
              return ChoiceChip(
                visualDensity: VisualDensity.compact,
                label: Text(bank),
                selected: _selectedBankPos == bank,
                onSelected: (val) {
                  if (val) setState(() => _selectedBankPos = bank);
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 8),

          // Card Brand Selector
          const Text('Franquicia:',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            children: ['VISA', 'MASTERCARD', 'AMEX'].map((brand) {
              return ChoiceChip(
                visualDensity: VisualDensity.compact,
                label: Text(brand),
                selected: _selectedCardBrand == brand,
                onSelected: (val) {
                  if (val) setState(() => _selectedCardBrand = brand);
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 8),

          // Fast Checkout Mode (Hora Pico)
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: NhilosColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Flexible(
                      child: Text(
                        '⚡ Cobro Rápido (Hora Pico)',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Switch(
                      value: _isFastCheckout,
                      onChanged: (val) {
                        setState(() {
                          _isFastCheckout = val;
                          _showManualVoucher = !val;
                        });
                      },
                    ),
                  ],
                ),
                Text(
                  _isFastCheckout
                      ? 'El voucher se guardará como PENDIENTE para conciliar al cierre de turno.'
                      : 'Ingrese los datos del voucher físico emitido por el datáfono.',
                  style: const TextStyle(
                    fontSize: 11,
                    color: NhilosColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),

          if (!_isFastCheckout || _showManualVoucher) ...[
            const SizedBox(height: 8),
            TextField(
              key: const Key('voucher_auth_code_field'),
              controller: _authCodeController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Código de Autorización (6 dígitos)',
                hintText: 'Ej: 123456',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _last4Controller,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    decoration: const InputDecoration(
                      labelText: 'Últimos 4 Dígitos',
                      hintText: '1234',
                      border: OutlineInputBorder(),
                      isDense: true,
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _batchController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Lote / Batch',
                      hintText: '001',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildQrPanel() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: NhilosColors.neutralGray,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: NhilosColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.qr_code_scanner, color: NhilosColors.brandPrimary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Pago por Transferencia / QR Bancario',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: NhilosColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _authCodeController,
            decoration: const InputDecoration(
              labelText: 'Referencia de Transferencia (Opcional)',
              hintText: 'Ej: REF-987654',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
        ],
      ),
    );
  }
}
