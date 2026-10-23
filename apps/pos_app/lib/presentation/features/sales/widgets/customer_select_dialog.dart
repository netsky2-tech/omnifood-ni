import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../../../core/utils/nicaragua_fiscal_validator.dart';
import '../../../../domain/models/customer/customer.dart';
import '../view_models/sale_view_model.dart';

class CustomerSelectDialog extends StatefulWidget {
  final SaleViewModel viewModel;

  /// Test seam for the camera layer: builds the scanner view that reports a
  /// raw detected value via [CustomerScannerViewBuilder]'s callback.
  /// Production default hosts the mobile_scanner camera preview.
  final CustomerScannerViewBuilder? scannerBuilder;

  const CustomerSelectDialog({
    Key? key,
    required this.viewModel,
    this.scannerBuilder,
  }) : super(key: key);

  static Future<Customer?> show(
    BuildContext context,
    SaleViewModel viewModel, {
    CustomerScannerViewBuilder? scannerBuilder,
  }) {
    return showDialog<Customer?>(
      context: context,
      barrierDismissible: true,
      builder: (_) => CustomerSelectDialog(
        viewModel: viewModel,
        scannerBuilder: scannerBuilder,
      ),
    );
  }

  @override
  State<CustomerSelectDialog> createState() => _CustomerSelectDialogState();
}

class _CustomerSelectDialogState extends State<CustomerSelectDialog> {
  static const int _pageSize = SaleViewModel.customerListPageSize;
  static const Duration _searchDebounceDuration = Duration(milliseconds: 250);

  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  Timer? _searchDebounce;
  List<Customer> _searchResults = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = false;
  bool _isCreatingNew = false;
  String _activeQuery = '';
  String? _identificationError;
  // Governed value (NHILOS §17.5). Explicit default so the operator always
  // knows what is stored; EMPRESA is the only type that skips loyalty.
  String _customerType = 'PERSONA';

  // New Customer Form Controllers
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _taxIdController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();

  String? _taxIdError;
  String? _nameError;
  String? _formError;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onListScroll);
    _loadInitialCustomers();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _scrollController.dispose();
    _searchController.dispose();
    _nameController.dispose();
    _taxIdController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _loadInitialCustomers() async {
    try {
      final results = await widget.viewModel.searchCustomers('');
      // A fast operator may already be typing; never let the empty-query
      // page overwrite a live search.
      if (mounted && _activeQuery.isEmpty) {
        setState(() {
          _searchResults = results;
          _isLoading = false;
          // A full page means the table may hold more; the scroll listener
          // fetches the next one instead of materializing everything now.
          _hasMore = results.length >= _pageSize;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  /// Debounces the live search so a fast typist does not fire one SQLite
  /// query per keystroke (NHILOS §13 feedback stays immediate via the field,
  /// results settle 250 ms after the last key).
  void _onSearchChanged(String query) {
    // Rebuild immediately so the clear/identify affordances track the text.
    setState(() {});
    _activeQuery = query;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(_searchDebounceDuration, () => _runSearch(query));
  }

  Future<void> _runSearch(String query) async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _identificationError = null;
    });
    try {
      final results = await widget.viewModel.searchCustomers(query);
      if (!mounted || _activeQuery != query) return;
      setState(() {
        _searchResults = results;
        _isLoading = false;
        _hasMore = query.trim().isEmpty && results.length >= _pageSize;
      });
    } catch (_) {
      if (mounted && _activeQuery == query) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _onListScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore || !_hasMore || _activeQuery.trim().isNotEmpty) return;
    setState(() => _isLoadingMore = true);
    try {
      final next = await widget.viewModel.loadMoreCustomers(
        offset: _searchResults.length,
      );
      if (!mounted) return;
      setState(() {
        _searchResults = [..._searchResults, ...next];
        _hasMore = next.length >= _pageSize;
        _isLoadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoadingMore = false);
    }
  }

  void _clearSearch() {
    _searchDebounce?.cancel();
    _searchController.clear();
    _activeQuery = '';
    setState(() => _identificationError = null);
    _runSearch('');
  }

  /// Exact identification from the single unified input (NHILOS §13: the
  /// operator searches by the field they know — name, phone, cédula or code).
  /// Typing already filters the list; submitting/scanning additionally asks
  /// the identification adapters for an exact customer code / QR match.
  Future<void> _onIdentifySubmitted() async {
    final input = _searchController.text.trim();
    if (input.isEmpty) return;

    // A pending debounce must not overwrite the identification outcome.
    _searchDebounce?.cancel();
    _activeQuery = input;

    setState(() {
      _isLoading = true;
      _identificationError = null;
    });

    try {
      final customer = await widget.viewModel.identifyCustomer(input);
      if (mounted) {
        if (customer != null) {
          // identifyCustomer already selects the customer internally
          // (SaleViewModel.identifyCustomer -> selectCustomer); a second
          // selectCustomer call here would re-run loyalty evaluation twice.
          Navigator.of(context).pop(customer);
        } else {
          // The identification adapters only know exact codes/phones; fall
          // back to the text search so the list can still show candidates.
          final fallback = await widget.viewModel.searchCustomers(input);
          if (!mounted) return;
          setState(() {
            _isLoading = false;
            _searchResults = fallback;
            _hasMore = false;
            // If the live search shows candidates, the list is the feedback;
            // only surface an error when there is nothing to tap.
            _identificationError = fallback.isEmpty
                ? 'No se encontró un cliente que coincida con «$input»'
                : null;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _identificationError = 'Error al identificar cliente';
          _isLoading = false;
        });
      }
    }
  }

  /// Opens the customer QR scan overlay. On detection, the RAW scanned value
  /// (with or without the `NHL1:` prefix) is handed to identifyCustomer —
  /// the adapter chain in CustomerIdentificationService handles both
  /// formats, so no parsing is re-implemented here.
  Future<void> _onQrScanRequested() async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black87,
      builder: (_) => CustomerQrScanOverlay(
        onCodeDetected: _handleScannedRawValue,
        onClose: () => Navigator.of(context).pop(),
        scannerBuilder: widget.scannerBuilder,
      ),
    );
  }

  Future<void> _handleScannedRawValue(String rawValue) async {
    if (!mounted) return;
    // Debug-only evidence for on-device QR verification (no PII: the payload
    // is the opaque tenant-scoped customer code).
    assert(() {
      debugPrint('CUSTOMER_QR_DETECTED raw=$rawValue');
      return true;
    }());
    // Close the camera overlay first, then identify in the dialog context.
    Navigator.of(context).pop();

    setState(() {
      _isLoading = true;
      _identificationError = null;
    });

    try {
      final customer = await widget.viewModel.identifyCustomer(rawValue);
      assert(() {
        debugPrint('CUSTOMER_QR_RESULT id=${customer?.id}');
        return true;
      }());
      if (!mounted) return;
      if (customer != null) {
        // identifyCustomer already selects the customer internally
        // (SaleViewModel.identifyCustomer -> selectCustomer); a second
        // selectCustomer call here would re-run loyalty evaluation twice.
        Navigator.of(context).pop(customer);
      } else {
        setState(() {
          // Per NHILOS §30: state what happened and what the user can do.
          _identificationError =
              'Código no reconocido. Verifique el código o escanee nuevamente.';
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _identificationError = 'Error al identificar cliente';
          _isLoading = false;
        });
      }
    }
  }

  void _validateTaxId(String value) {
    if (value.trim().isEmpty) {
      setState(() => _taxIdError = null);
      return;
    }

    final isValid = NicaraguaFiscalValidator.isValidRuc(value.trim());
    setState(() {
      _taxIdError = isValid ? null : 'Cédula o RUC inválido (ej: 001-120590-0001A o J0310000000001)';
    });
  }

  Future<void> _submitNewCustomer() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() {
        _nameError = 'El nombre del cliente es obligatorio';
        _formError = null;
      });
      return;
    }

    final taxId = _taxIdController.text.trim();
    if (taxId.isNotEmpty && !NicaraguaFiscalValidator.isValidRuc(taxId)) {
      setState(() {
        _taxIdError = 'Formato fiscal inválido';
        _formError = 'Por favor corrija los campos con error';
      });
      return;
    }

    setState(() {
      _formError = null;
      _nameError = null;
      _isLoading = true;
    });

    try {
      final created = await widget.viewModel.createExpressCustomer(
        name: name,
        taxId: taxId.isNotEmpty ? NicaraguaFiscalValidator.clean(taxId) : null,
        phone: _phoneController.text.trim().isNotEmpty ? _phoneController.text.trim() : null,
        email: _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null,
        address: _addressController.text.trim().isNotEmpty ? _addressController.text.trim() : null,
        customerType: _customerType,
      );

      if (mounted) {
        Navigator.of(context).pop(created);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _formError = 'Error al registrar cliente: $e';
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    // Shrink with the soft keyboard. A fixed `size.height * 0.7` plus the
    // keyboard overflows the dialog on phones (NHILOS §17.1 / §46).
    final availableHeight = media.size.height - media.viewInsets.bottom;
    final contentHeight =
        (availableHeight - 180).clamp(120.0, 720.0).toDouble();

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      title: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Row(
              children: [
                Icon(
                  _isCreatingNew ? Icons.person_add_alt_1 : Icons.people_alt_outlined,
                  color: Theme.of(context).primaryColor,
                  size: 24,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _isCreatingNew ? 'Nuevo Cliente' : 'Seleccionar Cliente',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
      content: SizedBox(
        width: 480,
        height: contentHeight,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!_isCreatingNew) ...[
              // Unified identification field (NHILOS §13/§17.5): ONE input for
              // name, phone, cédula or exact customer code. Typing filters live;
              // submitting (Enter or →) asks the adapters for an exact match.
              LayoutBuilder(
                builder: (context, constraints) {
                  final searchField = TextField(
                    key: const Key('customer_search_input'),
                    controller: _searchController,
                    onChanged: _onSearchChanged,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _onIdentifySubmitted(),
                    decoration: InputDecoration(
                      labelText: 'Buscar cliente',
                      hintText: 'Nombre, teléfono, cédula o código',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_searchController.text.isNotEmpty)
                            IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              tooltip: 'Limpiar búsqueda',
                              onPressed: _clearSearch,
                            ),
                          IconButton(
                            key: const Key('customer_identify_button'),
                            icon: const Icon(Icons.arrow_forward, size: 20),
                            tooltip: 'Identificar con el texto exacto',
                            onPressed: _searchController.text.trim().isEmpty
                                ? null
                                : _onIdentifySubmitted,
                          ),
                        ],
                      ),
                      suffixIconConstraints:
                          const BoxConstraints(minWidth: 88, minHeight: 48),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                    ),
                  );
                  final qrButton = IconButton(
                    key: const Key('qr_scan_button'),
                    icon: const Icon(Icons.qr_code_scanner),
                    tooltip: 'Escanear código QR del cliente',
                    onPressed: _onQrScanRequested,
                  );
                  final newButton = ElevatedButton.icon(
                    onPressed: () => setState(() => _isCreatingNew = true),
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Nuevo'),
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(0, 48),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  );

                  // Phones keep the primary action on its own full-width row
                  // so the field never collapses below its icon affordances.
                  if (constraints.maxWidth < 400) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            qrButton,
                            Expanded(child: searchField),
                          ],
                        ),
                        const SizedBox(height: 8),
                        newButton,
                      ],
                    );
                  }

                  return Row(
                    children: [
                      qrButton,
                      Expanded(child: searchField),
                      const SizedBox(width: 8),
                      newButton,
                    ],
                  );
                },
              ),
              if (_identificationError != null)
                Semantics(
                  liveRegion: true,
                  container: true,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      children: [
                        Icon(
                          Icons.error_outline,
                          color: Colors.red.shade700,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            _identificationError!,
                            style: TextStyle(
                              color: Colors.red.shade700,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(top: 6, left: 4, right: 4),
                child: Text(
                  'La lista se filtra al escribir. Pulsa → para un código exacto.',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () {
                  widget.viewModel.clearCustomer();
                  Navigator.of(context).pop(null);
                },
                icon: const Icon(Icons.person_off_outlined, color: Colors.grey),
                label: const Text('Consumidor Final (Sin Cliente Asignado)'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 48),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : _searchResults.isEmpty
                        ? Center(
                            child: SingleChildScrollView(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(
                                    Icons.search_off,
                                    size: 48,
                                    color: Colors.grey,
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    _searchController.text.trim().isEmpty
                                        ? 'Aún no hay clientes registrados.'
                                        : 'Sin resultados para «${_searchController.text.trim()}».',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Colors.grey,
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _searchController.text.trim().isEmpty
                                        ? 'Registra el primer cliente para empezar.'
                                        : 'Revisa el término o limpia la búsqueda.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Colors.grey.shade600,
                                      fontSize: 12,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  if (_searchController.text.trim().isNotEmpty)
                                    TextButton.icon(
                                      onPressed: _clearSearch,
                                      icon: const Icon(Icons.clear, size: 18),
                                      label: const Text('Limpiar búsqueda'),
                                    ),
                                  ElevatedButton.icon(
                                    onPressed: () {
                                      _nameController.text =
                                          _searchController.text.trim();
                                      setState(() => _isCreatingNew = true);
                                    },
                                    icon: const Icon(Icons.person_add_alt_1, size: 18),
                                    label: const Text('Registrar como nuevo'),
                                    style: ElevatedButton.styleFrom(
                                      minimumSize: const Size(0, 48),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : ListView.separated(
                            controller: _scrollController,
                            // One extra synthetic row communicates that more
                            // data exists and hosts the next-page loader
                            // (NHILOS §15: never make the operator guess).
                            itemCount: _searchResults.length +
                                ((_hasMore || _isLoadingMore) ? 1 : 0),
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (context, index) {
                              if (index >= _searchResults.length) {
                                return Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 16,
                                  ),
                                  child: Center(
                                    child: _isLoadingMore
                                        ? const SizedBox(
                                            height: 20,
                                            width: 20,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : Text(
                                            'Desliza para cargar más clientes…',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                  ),
                                );
                              }
                              final customer = _searchResults[index];
                              final isSelected = widget.viewModel.selectedCustomer?.id == customer.id;
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: isSelected
                                      ? Theme.of(context).primaryColor
                                      : Colors.grey.shade200,
                                  foregroundColor: isSelected ? Colors.white : Colors.black87,
                                  child: Text(
                                    customer.name.isNotEmpty ? customer.name[0].toUpperCase() : '?',
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                ),
                                title: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        customer.name,
                                        style: TextStyle(
                                          fontWeight: isSelected ? FontWeight.bold : FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    if (customer.pointsBalance > 0)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: Colors.amber.shade100,
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(Icons.star, size: 14, color: Colors.amber),
                                            const SizedBox(width: 2),
                                            Text(
                                              '${customer.pointsBalance.toStringAsFixed(0)} pts',
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.bold,
                                                color: Colors.amber.shade900,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                                subtitle: Text(
                                  [
                                    if (customer.taxId != null && customer.taxId!.isNotEmpty)
                                      'Cédula/RUC: ${customer.taxId}',
                                    if (customer.phone != null && customer.phone!.isNotEmpty)
                                      'Tel: ${customer.phone}',
                                  ].join(' • '),
                                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                                ),
                                trailing: isSelected
                                    ? const Icon(Icons.check_circle, color: Colors.green)
                                    : const Icon(Icons.chevron_right, color: Colors.grey),
                                onTap: () {
                                  widget.viewModel.selectCustomer(customer);
                                  Navigator.of(context).pop(customer);
                                },
                              );
                            },
                          ),
              ),
            ] else ...[
              // Create New Customer Form
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      if (_formError != null)
                        Semantics(
                          liveRegion: true,
                          container: true,
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: Colors.red.shade50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.red.shade200),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  Icons.error_outline,
                                  color: Colors.red.shade700,
                                  size: 18,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _formError!,
                                    style: TextStyle(
                                      color: Colors.red.shade900,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      TextField(
                        controller: _nameController,
                        onChanged: (_) {
                          if (_nameError != null) {
                            setState(() => _nameError = null);
                          }
                        },
                        decoration: InputDecoration(
                          labelText: 'Nombre Completo / Razón Social *',
                          prefixIcon: const Icon(Icons.person_outline),
                          border: const OutlineInputBorder(),
                          errorText: _nameError,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _taxIdController,
                        onChanged: _validateTaxId,
                        decoration: InputDecoration(
                          labelText: 'Cédula / RUC (Opcional)',
                          prefixIcon: const Icon(Icons.badge_outlined),
                          border: const OutlineInputBorder(),
                          errorText: _taxIdError,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Teléfono (Opcional)',
                          prefixIcon: Icon(Icons.phone_outlined),
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Correo Electrónico (Opcional)',
                          prefixIcon: Icon(Icons.email_outlined),
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _addressController,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Dirección (Opcional)',
                          prefixIcon: Icon(Icons.location_on_outlined),
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Governed selector (NHILOS §17.5): the operator picks a
                      // known value, not free text. EMPRESA skips loyalty, so
                      // the consequence is stated inline (§17.4) to prevent the
                      // probable error of classifying a company as a person.
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Tipo de cliente *',
                          style: TextStyle(
                            fontWeight: FontWeight.w500,
                            fontSize: 13,
                            color: Colors.grey.shade800,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: RadioListTile<String>(
                              key: const Key('customer_type_persona'),
                              contentPadding: EdgeInsets.zero,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.padded,
                              title: const Text('Persona'),
                              value: 'PERSONA',
                              groupValue: _customerType,
                              onChanged: (String? value) {
                                if (value == null) return;
                                setState(() => _customerType = value);
                              },
                            ),
                          ),
                          Expanded(
                            child: RadioListTile<String>(
                              key: const Key('customer_type_empresa'),
                              contentPadding: EdgeInsets.zero,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.padded,
                              title: const Text('Empresa'),
                              value: 'EMPRESA',
                              groupValue: _customerType,
                              onChanged: (String? value) {
                                if (value == null) return;
                                setState(() => _customerType = value);
                              },
                            ),
                          ),
                        ],
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Empresa: no acumula puntos de lealtad.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _isCreatingNew = false),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Volver a Búsqueda'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _submitNewCustomer,
                      style: ElevatedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Guardar y Seleccionar'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Reports a raw scanned value (QR or barcode) once it has been detected.
typedef CustomerScannerViewBuilder = Widget Function(
  BuildContext context,
  ValueChanged<String> onCodeDetected,
  VoidCallback onManualEntryFallback,
);

/// Production scanner builder: hosts the mobile_scanner camera preview.
///
/// The controller auto-starts and requests camera permission; a denied
/// permission surfaces through [MobileScanner.errorBuilder], which renders
/// a friendly message plus a manual-entry fallback (never a dead end).
Widget _defaultCustomerScannerBuilder(
  BuildContext context,
  ValueChanged<String> onCodeDetected,
  VoidCallback onManualEntryFallback,
) {
  return MobileScanner(
    onDetect: (capture) {
      for (final barcode in capture.barcodes) {
        final rawValue = barcode.rawValue;
        if (rawValue != null && rawValue.isNotEmpty) {
          // Report the FIRST readable code; the overlay de-duplicates
          // repeated detections from the same frame burst.
          onCodeDetected(rawValue);
          return;
        }
      }
    },
    errorBuilder: (context, error) {
      final permissionDenied =
          error.errorCode == MobileScannerErrorCode.permissionDenied;
      return _ScannerMessageView(
        icon: permissionDenied ? Icons.no_photography_outlined : Icons.error_outline,
        message: permissionDenied
            ? 'No se puede acceder a la cámara. Escriba el código del cliente manualmente.'
            : 'No se pudo iniciar la cámara. Intente de nuevo o escriba el código manualmente.',
        actionLabel: 'Escribir código manualmente',
        onAction: onManualEntryFallback,
      );
    },
  );
}

/// Full-screen camera overlay for scanning customer QR/barcode codes.
///
/// Escape closes the overlay (NHILOS §46); the close control has an explicit
/// accessible label. Detection is de-duplicated: the first readable code wins.
class CustomerQrScanOverlay extends StatefulWidget {
  /// Called once with the RAW scanned value (may include the `NHL1:` prefix).
  final ValueChanged<String> onCodeDetected;

  /// Closes the overlay without scanning.
  final VoidCallback onClose;

  /// Camera layer seam. Defaults to the production mobile_scanner host.
  final CustomerScannerViewBuilder? scannerBuilder;

  const CustomerQrScanOverlay({
    Key? key,
    required this.onCodeDetected,
    required this.onClose,
    this.scannerBuilder,
  }) : super(key: key);

  @override
  State<CustomerQrScanOverlay> createState() => _CustomerQrScanOverlayState();
}

class _CustomerQrScanOverlayState extends State<CustomerQrScanOverlay> {
  bool _codeHandled = false;

  void _handleCodeDetected(String rawValue) {
    if (_codeHandled || rawValue.isEmpty) return;
    _codeHandled = true;
    widget.onCodeDetected(rawValue);
  }

  @override
  Widget build(BuildContext context) {
    final scannerBuilder = widget.scannerBuilder ?? _defaultCustomerScannerBuilder;

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.escape): widget.onClose,
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            title: const Text('Escanear código del cliente'),
            // Explicit accessible label for the icon-only close control (§46).
            leading: IconButton(
              key: const Key('qr_scan_close_button'),
              icon: const Icon(Icons.close),
              tooltip: 'Cerrar escáner',
              onPressed: widget.onClose,
            ),
          ),
          body: Column(
            children: [
              Expanded(
                child: scannerBuilder(
                  context,
                  _handleCodeDetected,
                  widget.onClose,
                ),
              ),
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'Apunte la cámara al código QR del cliente',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Camera error / permission-denied state with a manual-entry fallback.
class _ScannerMessageView extends StatelessWidget {
  final IconData icon;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  const _ScannerMessageView({
    required this.icon,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white70, size: 48),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.keyboard),
              label: Text(actionLabel),
            ),
          ],
        ),
      ),
    );
  }
}
