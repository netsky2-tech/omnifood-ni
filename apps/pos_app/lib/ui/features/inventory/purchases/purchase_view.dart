import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'purchase_view_model.dart';

class PurchaseView extends StatefulWidget {
  const PurchaseView({super.key});

  @override
  State<PurchaseView> createState() => _PurchaseViewState();
}

class _PurchaseViewState extends State<PurchaseView> {
  final _formKey = GlobalKey<FormState>();
  final _qtyController = TextEditingController();
  final _costController = TextEditingController();
  final _bcnRateController = TextEditingController(text: '36.5');
  final _lotCodeController = TextEditingController();
  String? _selectedInsumoId;
  String? _selectedSupplierId;
  String? _selectedUomId;
  String _currency = 'NIO';
  DateTime _invoiceDate = DateTime.now();
  DateTime? _receivedDate;
  DateTime? _expirationDate;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PurchaseViewModel>().loadInitialData();
    });
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _costController.dispose();
    _bcnRateController.dispose();
    _lotCodeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Registro de Compras')),
      body: Consumer<PurchaseViewModel>(
        builder: (context, vm, child) {
          if (vm.isLoading) return const Center(child: CircularProgressIndicator());
          
          final review = _canBuildReview(vm)
              ? vm.buildPurchaseReview(
                  insumoId: _selectedInsumoId!,
                  uomConversionId: _selectedUomId!,
                  quantity: double.tryParse(_qtyController.text) ?? 0,
                  unitCost: double.tryParse(_costController.text) ?? 0,
                  currency: _currency,
                  bcnRate: double.tryParse(_bcnRateController.text),
                )
              : null;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionCard(
                    title: 'Documento de recepción',
                    child: Column(
                      children: [
                        DropdownButtonFormField<String>(
                          initialValue: _selectedInsumoId,
                          decoration: const InputDecoration(labelText: 'Insumo'),
                          items: vm.insumos
                              .map((i) => DropdownMenuItem(value: i.id, child: Text(i.name)))
                              .toList(growable: false),
                          onChanged: (value) async {
                            setState(() {
                              _selectedInsumoId = value;
                              _selectedUomId = null;
                            });
                            if (value != null) {
                              await vm.loadInitialData(insumoId: value);
                            }
                          },
                          validator: (value) => value == null ? 'Seleccioná un insumo' : null,
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          initialValue: _selectedUomId,
                          decoration: const InputDecoration(labelText: 'Presentación'),
                          items: vm.conversions
                              .map((c) => DropdownMenuItem(value: c.id, child: Text(c.unitName)))
                              .toList(growable: false),
                          onChanged: (value) => setState(() => _selectedUomId = value),
                          validator: (value) => value == null ? 'Seleccioná una presentación' : null,
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          initialValue: _selectedSupplierId,
                          decoration: const InputDecoration(labelText: 'Proveedor'),
                          items: vm.suppliers
                              .map((s) => DropdownMenuItem(value: s.id, child: Text(s.name)))
                              .toList(growable: false),
                          onChanged: (value) => setState(() => _selectedSupplierId = value),
                          validator: (value) => value == null ? 'Seleccioná un proveedor' : null,
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          initialValue: _currency,
                          decoration: const InputDecoration(labelText: 'Moneda'),
                          items: purchaseCurrencies
                              .map((currency) => DropdownMenuItem(value: currency, child: Text(currency)))
                              .toList(growable: false),
                          onChanged: (value) => setState(() => _currency = value ?? 'NIO'),
                        ),
                        const SizedBox(height: 12),
                        _dateField(
                          label: 'Fecha de factura',
                          value: _invoiceDate,
                          onTap: () async {
                            final picked = await _pickDate(context, _invoiceDate);
                            if (picked != null) {
                              setState(() => _invoiceDate = picked);
                            }
                          },
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _qtyController,
                          decoration: const InputDecoration(labelText: 'Cantidad'),
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          onChanged: (_) => setState(() {}),
                          validator: (value) => (double.tryParse(value ?? '') ?? 0) > 0
                              ? null
                              : 'Ingresá una cantidad válida',
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _costController,
                          decoration: const InputDecoration(labelText: 'Costo unitario'),
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          onChanged: (_) => setState(() {}),
                          validator: (value) => (double.tryParse(value ?? '') ?? 0) > 0
                              ? null
                              : 'Ingresá un costo unitario válido',
                        ),
                        if (_currency == 'USD') ...[
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _bcnRateController,
                            decoration: const InputDecoration(labelText: 'Tasa de cambio BCN'),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            onChanged: (_) => setState(() {}),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (review != null) ...[
                    const SizedBox(height: 24),
                    _sectionCard(
                      title: 'Revisión',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _reviewRow('Fecha de factura', _formatDate(_invoiceDate)),
                          _reviewRow('Origen tasa BCN', _currency == 'USD' ? 'Tasa oficial BCN' : 'Tasa del documento NIO'),
                          _reviewRow('Tasa BCN', review.bcnRate.toStringAsFixed(4)),
                          _reviewRow('Costo unitario NIO', review.unitCostNio.toStringAsFixed(4)),
                          _reviewRow('CPP actual', review.previousCppNio.toStringAsFixed(4)),
                          _reviewRow('CPP proyectado', review.projectedCppNio.toStringAsFixed(4)),
                          if (review.requiresBatchTracking) ...[
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _lotCodeController,
                              decoration: const InputDecoration(labelText: 'Código de lote'),
                              validator: (value) {
                                if (!review.requiresBatchTracking) return null;
                                return (value == null || value.isEmpty)
                                    ? 'El código de lote es obligatorio'
                                    : null;
                              },
                            ),
                            const SizedBox(height: 12),
                            _dateField(
                              label: 'Fecha de recepción',
                              value: _receivedDate,
                              onTap: () async {
                                final picked = await _pickDate(context, _receivedDate ?? _invoiceDate);
                                if (picked != null) {
                                  setState(() => _receivedDate = picked);
                                }
                              },
                            ),
                            const SizedBox(height: 12),
                            _dateField(
                              label: 'Fecha de vencimiento',
                              value: _expirationDate,
                              onTap: () async {
                                final picked = await _pickDate(context, _expirationDate ?? _invoiceDate);
                                if (picked != null) {
                                  setState(() => _expirationDate = picked);
                                }
                              },
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                  if (vm.fifoRows.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    _sectionCard(
                      title: 'Lotes FIFO',
                      child: Column(
                        children: vm.fifoRows
                            .map((row) => Container(
                                  height: 56,
                                  decoration: const BoxDecoration(
                                    border: Border(bottom: BorderSide(color: Color(0xFF767777))),
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(child: Text(row.batchNumber)),
                                      Expanded(child: Text(
                                        row.remainingStock.toStringAsFixed(2),
                                        textAlign: TextAlign.end,
                                        style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                                      )),
                                      const SizedBox(width: 12),
                                      Expanded(child: Text(_formatDate(row.expirationDate), textAlign: TextAlign.end)),
                                      const SizedBox(width: 12),
                                      _statusChip(row.isExpired ? 'Vencido' : row.isNearExpiry ? 'Por vencer' : 'FIFO'),
                                    ],
                                  ),
                                ))
                            .toList(growable: false),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: review == null ? null : () => _confirmAndSave(context, vm, review),
                      child: const Text('REGISTRAR COMPRA'),
                    ),
                  ),
                  if (vm.errorMessage != null) ...[
                    const SizedBox(height: 12),
                    Text(vm.errorMessage!, style: const TextStyle(color: Colors.red)),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  bool _canBuildReview(PurchaseViewModel vm) {
    return _selectedInsumoId != null &&
        _selectedUomId != null &&
        (double.tryParse(_qtyController.text) ?? 0) > 0 &&
        (double.tryParse(_costController.text) ?? 0) > 0 &&
        vm.insumos.isNotEmpty;
  }

  Future<void> _confirmAndSave(
    BuildContext context,
    PurchaseViewModel vm,
    PurchaseReviewData review,
  ) async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => Dialog(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Confirmar registro', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  Text('Se registrará la compra revisada con CPP ${review.projectedCppNio.toStringAsFixed(4)}.'),
                  const SizedBox(height: 16),
                  OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    child: const Text('CANCELAR'),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: const Text('CONFIRMAR REGISTRO'),
                  ),
                ],
              ),
            ),
          ),
        ) ??
        false;

    if (!confirmed) return;

    await vm.recordPurchase(
      insumoId: _selectedInsumoId!,
      supplierId: _selectedSupplierId!,
      uomConversionId: _selectedUomId!,
      quantity: double.parse(_qtyController.text),
      unitCost: double.parse(_costController.text),
      invoiceDate: _invoiceDate,
      currency: _currency,
      bcnRate: double.tryParse(_bcnRateController.text),
      lotCode: _lotCodeController.text.isEmpty ? null : _lotCodeController.text,
      receivedDate: _receivedDate,
      expirationDate: _expirationDate,
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF767777)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _dateField({
    required String label,
    required DateTime? value,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(labelText: label),
        child: Text(value == null ? 'Seleccioná una fecha' : _formatDate(value)),
      ),
    );
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))),
          Text(
            value,
            style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
          ),
        ],
      ),
    );
  }

  Widget _statusChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFE0E7E7),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label),
    );
  }

  String _formatDate(DateTime value) {
    final month = value.month.toString().padLeft(2, '0');
    final day = value.day.toString().padLeft(2, '0');
    return '${value.year}-$month-$day';
  }

  Future<DateTime?> _pickDate(BuildContext context, DateTime initialDate) {
    return showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
  }
}
