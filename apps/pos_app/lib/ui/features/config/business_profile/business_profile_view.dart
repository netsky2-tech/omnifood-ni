import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/navigation/route_observer.dart';
import '../../../../core/utils/nicaragua_fiscal_validator.dart';
import '../../../../domain/models/config/tax_regime.dart';
import '../../../../domain/models/config/tenant_operation_mode.dart';
import '../../../../domain/repositories/auth_repository.dart';
import 'business_profile_view_model.dart';
import 'fiscal_authorization_expiry_notice_widget.dart';

/// T1 (#66): role-restricted FX controls must explain why they are inert
/// (POS standard AP-17, disabled dead end). Deliberately DISTINCT from the
/// cloud-managed copy — the two reasons must never be conflated.
const String _roleRestrictedFxHelperText =
    'Solo el propietario o un gerente puede modificar este valor.';

class BusinessProfileView extends StatefulWidget {
  /// D-21 (#554) U4: test-only clock override for the fiscal expiry notice.
  /// Null in production — the notice then uses the real current date.
  final DateTime? fiscalToday;

  const BusinessProfileView({super.key, this.fiscalToday});

  @override
  State<BusinessProfileView> createState() => _BusinessProfileViewState();
}

class _BusinessProfileViewState extends State<BusinessProfileView> with RouteAware {
  /// D-21 (#554): strict yyyy-MM-dd shape + a real calendar date.
  static bool _isValidIsoDate(String value) {
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) return false;
    return _tryParseIsoDate(value) != null;
  }

  static DateTime? _tryParseIsoDate(String value) {
    // DateTime.tryParse normalizes impossible calendar dates (2026-02-30 ->
    // 2026-03-02), so verify the parsed date round-trips to the exact
    // yyyy-MM-dd components — same rule as fiscal_authorization_expiry_notice.
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return null;
    final y = int.parse(value.substring(0, 4));
    final m = int.parse(value.substring(5, 7));
    final d = int.parse(value.substring(8, 10));
    if (parsed.year != y || parsed.month != m || parsed.day != d) return null;
    return parsed;
  }
  final _formKey = GlobalKey<FormState>();
  final Map<String, TextEditingController> _controllers = {};
  Map<String, String> _lastSyncedConfig = {};
  late BusinessProfileViewModel _viewModel;
  ModalRoute<void>? _modalRoute;

  @override
  void initState() {
    super.initState();
    _viewModel = context.read<BusinessProfileViewModel>();
    for (final key in _viewModel.config.keys) {
      _controllers[key] = TextEditingController();
    }

    // Listen to ViewModel changes to sync controllers (not in build!)
    _viewModel.addListener(_onViewModelChanged);

    // T1 (#66): resolve the signed-in role the same way app_drawer.dart does
    // (async getCurrentUser). Until it resolves, the view model stays unset
    // — which denies — so the guard fails closed.
    _loadCurrentUser();

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _viewModel.loadConfig();
      _syncControllersFromViewModel(_viewModel);
    });
  }

  Future<void> _loadCurrentUser() async {
    final authRepo = context.read<AuthRepository>();
    final user = await authRepo.getCurrentUser();
    if (mounted) {
      _viewModel.setCurrentUserRole(user?.role);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // T1 (#66): the profile route stays mounted while /lock is pushed on top
    // of it ("Cambiar operador"), so its initState-cached role goes stale when
    // a different operator unlocks. Subscribe like sale_view.dart so the role
    // is re-resolved when the route is re-exposed.
    final route = ModalRoute.of(context);
    if (route != null && route != _modalRoute) {
      appRouteObserver.unsubscribe(this);
      _modalRoute = route;
      appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    appRouteObserver.unsubscribe(this);
    _viewModel.removeListener(_onViewModelChanged);
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  void didPopNext() {
    if (!mounted) return;
    // T1 (#66): the covering route was popped — re-resolve the signed-in
    // operator so the FX guard reflects the CURRENT role, not the one cached
    // at initState. setCurrentUserRole notifies listeners, so no extra
    // refresh path is needed.
    _loadCurrentUser();
  }

  void _onViewModelChanged() {
    _syncControllersFromViewModel(_viewModel);
  }

  void _syncControllersFromViewModel(BusinessProfileViewModel viewModel) {
    if (mapEquals(_lastSyncedConfig, viewModel.config)) {
      debugPrint('CONTROLLER_UPDATED: false');
      return;
    }
    _lastSyncedConfig = Map.from(viewModel.config);
    var businessNameUpdated = false;
    for (final entry in viewModel.config.entries) {
      final controller = _controllers[entry.key];
      if (controller != null && controller.text != entry.value) {
        controller.text = entry.value;
        if (entry.key == 'business_name') {
          businessNameUpdated = true;
        }
      }
    }
    debugPrint('CONTROLLER_UPDATED: $businessNameUpdated');
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<BusinessProfileViewModel>();
    final colorScheme = Theme.of(context).colorScheme;
    final canEditExchangeRates = viewModel.canEditExchangeRates;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Configuración del Negocio'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      body: viewModel.isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('DATOS FISCALES Y DE CONTACTO', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 24),
                    
                    TextFormField(
                      controller: _controllers['business_name'],
                      decoration: const InputDecoration(labelText: 'Nombre Comercial / Razón Social'),
                      validator: (v) => v == null || v.isEmpty ? 'Requerido' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _controllers['ruc'],
                      decoration: const InputDecoration(labelText: 'RUC (Nicaragua)', hintText: 'J0310000000000'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Requerido';
                        // Nicaragua issues two RUC shapes: juridical
                        // (J + 13 digits) and natural person (13 digits +
                        // check letter, e.g. 0011112930059D). Delegate to the
                        // shared validator instead of duplicating the rule:
                        // a juridical-only inline regex silently blocked every
                        // cuota fija taxpayer from saving this form.
                        if (!NicaraguaFiscalValidator.isValidRuc(v)) {
                          return 'RUC inválido (J + 13 dígitos, o cédula 13 dígitos + letra)';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<TaxRegime>(
                      key: const Key('tax_regime_dropdown'),
                      isExpanded: true,
                      value: viewModel.taxRegime,
                      decoration: const InputDecoration(
                        labelText: 'Clasificación / Régimen DGI del Negocio',
                        prefixIcon: Icon(Icons.account_balance),
                        helperText: 'Define el tratamiento del IVA: Régimen General (recauda IVA 15%) o Cuota Fija (sin IVA).',
                      ),
                      items: TaxRegime.values.map((regime) {
                        return DropdownMenuItem(
                          value: regime,
                          child: Text(regime.displayName, overflow: TextOverflow.ellipsis),
                        );
                      }).toList(),
                      onChanged: (regime) {
                        if (regime != null) {
                          viewModel.setTaxRegime(regime);
                          _controllers['tax_regime']?.text = regime.code;
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _controllers['address'],
                      decoration: const InputDecoration(labelText: 'Dirección Física'),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _controllers['phone'],
                      decoration: const InputDecoration(labelText: 'Teléfono de Contacto'),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _controllers['legal_footer'],
                      decoration: const InputDecoration(
                        labelText: 'Leyenda Legal (Pie de Factura)',
                        hintText: 'Ej: Gracias por su compra. No se aceptan devoluciones sin factura.',
                      ),
                      maxLines: 3,
                    ),
                    const SizedBox(height: 32),
                    Text('TASAS DE CAMBIO Y MULTI-MONEDA', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      key: const Key('checkout_fx_mode_dropdown'),
                      isExpanded: true,
                      value: viewModel.checkoutFxMode,
                      decoration: InputDecoration(
                        labelText: 'Tasa a Utilizar en Pantalla de Cobro (POS)',
                        prefixIcon: Icon(viewModel.isCheckoutFxModeCloudManaged || !canEditExchangeRates
                            ? Icons.lock
                            : Icons.price_change),
                        // BXW-007 U3 (#734): honest classification — when the
                        // office asserts this field, the terminal says so
                        // instead of showing an editable control that never
                        // persists the operator's choice. T1 (#66): when the
                        // role is restricted, it says so instead — the two
                        // reasons are never conflated.
                        helperText: viewModel.isCheckoutFxModeCloudManaged
                            ? 'Definido por la oficina: este valor se administra desde la configuración central y este terminal no puede modificarlo.'
                            : !canEditExchangeRates
                                ? _roleRestrictedFxHelperText
                                : 'Seleccione cuál de las dos tasas se aplicará para convertir cobros en USD y dar vuelto.',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'COMMERCIAL',
                          child: Text('Tasa Comercial (Recomendada para caja)', overflow: TextOverflow.ellipsis),
                        ),
                        DropdownMenuItem(
                          value: 'BCN_OFFICIAL',
                          child: Text('Tasa Oficial BCN (Banco Central de Nicaragua)', overflow: TextOverflow.ellipsis),
                        ),
                      ],
                      onChanged: viewModel.isCheckoutFxModeCloudManaged || !canEditExchangeRates
                          ? null
                          : (mode) {
                              if (mode != null) {
                                viewModel.setCheckoutFxMode(mode);
                                _controllers['checkout_fx_mode']?.text = mode;
                              }
                            },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('commercial_exchange_rate_field'),
                      controller: _controllers['commercial_exchange_rate'],
                      // D-11: when the office asserts the rate via the fiscal
                      // snapshot, the field is read-only and honestly labelled
                      // (same pattern as the checkout-FX dropdown above,
                      // BXW-007 R-5/R-6) instead of silently reverting edits.
                      readOnly: viewModel.isCommercialRateCloudManaged || !canEditExchangeRates,
                      decoration: InputDecoration(
                        labelText: 'Tipo de Cambio Comercial (POS / Atención al Cliente)',
                        hintText: '36.50',
                        prefixIcon: Icon(viewModel.isCommercialRateCloudManaged || !canEditExchangeRates
                            ? Icons.lock
                            : Icons.currency_exchange),
                        helperText: viewModel.isCommercialRateCloudManaged
                            ? 'Definido por la oficina: este valor se administra desde la configuración central y este terminal no puede modificarlo.'
                            : !canEditExchangeRates
                                ? _roleRestrictedFxHelperText
                                : 'Tasa utilizada para precios al público, cobro en USD y cálculo de vuelto en córdobas.',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      // Issue #75: strict FX range — the commercial rate is a
                      // C$ per USD rate, so anything below 10 or above 100 is
                      // a data-entry error (or the old dangerous 0.5 default).
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Requerido';
                        final val = double.tryParse(v);
                        if (val == null || val < 10 || val > 100) {
                          return 'Ingrese una tasa válida entre 10 y 100';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _controllers['bcn_official_exchange_rate'],
                            decoration: InputDecoration(
                              labelText: 'Tipo de Cambio Oficial BCN (Base Fiscal DGI)',
                              hintText: '36.6241',
                              // T1 (#66): the BCN rate is the DGI fiscal base
                              // — restricted operators cannot edit it.
                              prefixIcon: Icon(!canEditExchangeRates
                                  ? Icons.lock
                                  : Icons.account_balance),
                              helperText: !canEditExchangeRates
                                  ? _roleRestrictedFxHelperText
                                  : 'Tasa oficial del Banco Central de Nicaragua utilizada para base fiscal DGI.',
                              suffixIcon: viewModel.isFetchingBcnRate
                                  ? const Padding(
                                      padding: EdgeInsets.all(12),
                                      child: SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      ),
                                    )
                                  : IconButton(
                                      icon: const Icon(Icons.sync),
                                      tooltip: 'Consultar Web Service BCN',
                                      // T1 (#66): this button is a direct write
                                      // path that bypasses saveConfig — a
                                      // restricted operator cannot trigger it.
                                      onPressed: !canEditExchangeRates
                                          ? null
                                          : () async {
                                        try {
                                          final rate = await viewModel.fetchOfficialBcnRate();
                                          _controllers['bcn_official_exchange_rate']?.text =
                                              rate.toStringAsFixed(4);
                                          if (mounted && context.mounted) {
                                            ScaffoldMessenger.of(context).showSnackBar(
                                              SnackBar(
                                                content: Text(
                                                  'Tasa BCN actualizada exitosamente: C\$ ${rate.toStringAsFixed(4)}',
                                                ),
                                                backgroundColor: Colors.green,
                                              ),
                                            );
                                          }
                                        } catch (e) {
                                          if (mounted && context.mounted) {
                                            ScaffoldMessenger.of(context).showSnackBar(
                                              SnackBar(
                                                content: Text('No se pudo consultar el BCN: $e'),
                                                backgroundColor: Colors.orange.shade800,
                                              ),
                                            );
                                          }
                                        }
                                      },
                                    ),
                            ),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            // T1 (#66): the BCN rate is the DGI fiscal base —
                            // restricted operators cannot edit it.
                            readOnly: !canEditExchangeRates,
                            validator: (v) {
                              if (v == null || v.isEmpty) return 'Requerido';
                              final val = double.tryParse(v);
                              if (val == null || val <= 0) return 'Ingrese una tasa válida mayor a 0';
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    
                    const SizedBox(height: 32),
                    Text('MODO OPERATIVO DEL NEGOCIO', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<TenantOperationMode>(
                      key: const Key('operation_mode_dropdown'),
                      isExpanded: true,
                      value: viewModel.operationMode,
                      decoration: InputDecoration(
                        labelText: 'Modo de Operación POS',
                        prefixIcon: Icon(viewModel.isOperationModeCloudManaged
                            ? Icons.lock
                            : Icons.storefront),
                        // BXW-007 U3 (#734): honest classification — see the
                        // checkout FX dropdown above.
                        helperText: viewModel.isOperationModeCloudManaged
                            ? 'Definido por la oficina: este valor se administra desde la configuración central y este terminal no puede modificarlo.'
                            : 'Determina el flujo de atención: Cobro directo en barra (Food Park), Servicio de Mesas (Restaurante), o Híbrido.',
                      ),
                      items: TenantOperationMode.values.map((mode) {
                        return DropdownMenuItem(
                          value: mode,
                          child: Text(mode.displayName, overflow: TextOverflow.ellipsis),
                        );
                      }).toList(),
                      onChanged: viewModel.isOperationModeCloudManaged
                          ? null
                          : (newMode) {
                              if (newMode != null) {
                                viewModel.setOperationMode(newMode);
                                _controllers['operation_mode']?.text = newMode.code;
                              }
                            },
                    ),

                    const SizedBox(height: 32),
                    Text('AUTORIZACIÓN FISCAL DGI (Disposición 09-2007)', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Text(
                      'Configure el código de autorización DGI, sus fechas y los consecutivos con los que continúa la facturación. D-21: para sistemas computarizados no existe rango autorizado, solo numeración consecutiva.',
                      style: TextStyle(fontSize: 12, color: colorScheme.outline),
                    ),
                    const SizedBox(height: 16),
                    // D-21 (#554) U4: expiry warning at the TOP of the fiscal
                    // section. Warning only — it never blocks the form or
                    // issuance.
                    FiscalAuthorizationExpiryNotice(
                      rawExpiresAt:
                          viewModel.config['dgi_authorization_expires_at'],
                      today: widget.fiscalToday,
                    ),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextFormField(
                            key: const Key('dgi_prefix_input'),
                            controller: _controllers['dgi_prefix'],
                            decoration: const InputDecoration(
                              labelText: 'Prefijo Fiscal DGI',
                              hintText: 'Sin configurar',
                              prefixIcon: Icon(Icons.receipt_long),
                              helperText: 'Opcional: vacío = consecutivo puramente numérico (sucursal única con 1 caja, D-21).',
                            ),
                            // D-16 (JD-A-001): optional — the prefix is real
                            // fiscal configuration, not a default. Blank =
                            // sequence stays unconfigured (fail-closed).
                            validator: null,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          flex: 3,
                          child: TextFormField(
                            key: const Key('dgi_current_number_input'),
                            controller: _controllers['dgi_current_number'],
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Consecutivo actual (auto-incremental)',
                              hintText: 'Sin configurar',
                              prefixIcon: Icon(Icons.pin),
                              helperText: 'El sistema avanza este consecutivo automáticamente en cada factura; edítelo solo para recuperar la secuencia tras una falla (D-6).',
                            ),
                            // D-16 (JD-A-001): optional — blank cursor means
                            // the sequence stays unconfigured (fail-closed).
                            validator: (v) {
                              if (v == null || v.isEmpty) return null;
                              final val = int.tryParse(v);
                              if (val == null || val <= 0) return 'Número inválido';
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('dgi_range_start_input'),
                      controller: _controllers['dgi_range_start'],
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Consecutivo inicial',
                        hintText: 'Sin configurar',
                        helperText: 'Primer número de factura autorizado: siembra el consecutivo actual en la primera configuración.',
                      ),
                      // D-16: optional — an unconfigured sequence is a
                      // legitimate state, not a form error. D-21: same key,
                      // same rule; it now means "Consecutivo inicial".
                      validator: (v) {
                        if (v == null || v.isEmpty) return null;
                        final parsed = int.tryParse(v);
                        if (parsed == null || parsed < 1) {
                          return 'Debe ser un entero mayor o igual a 1';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('dgi_authorization_code_input'),
                      controller: _controllers['dgi_authorization_code'],
                      decoration: const InputDecoration(
                        labelText: 'Código / Resolución de Autorización DGI (CAFD)',
                        hintText: 'DGI-SFC-2024-00123',
                        prefixIcon: Icon(Icons.verified),
                        helperText: 'El formato exacto es el que indique la carta de autorización; se validan solo longitud (máx. 50) y caracteres (letras, números, guiones y barras).',
                      ),
                      // D-21 (#554): NO structural mask — the code format is
                      // whatever the authorization letter states. Only a
                      // length ceiling (≤50) and a charset rule apply.
                      validator: (v) {
                        if (v == null || v.isEmpty) return null;
                        if (v.length > 50) return 'Máximo 50 caracteres';
                        if (!RegExp(r'^[A-Za-z0-9\-/]*$').hasMatch(v)) {
                          return 'Solo letras, números, guiones y barras';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            key: const Key('dgi_authorization_issued_at_input'),
                            controller: _controllers['dgi_authorization_issued_at'],
                            keyboardType: TextInputType.datetime,
                            decoration: const InputDecoration(
                              labelText: 'Fecha de Emisión de la Autorización',
                              hintText: 'Ej: 2026-01-15',
                              helperText: 'Fecha de emisión indicada en la carta/resolución DGI (formato ISO yyyy-MM-dd).',
                            ),
                            // D-21 (#554): both dates are optional, but they
                            // travel in pairs and expiry >= issued (mirrors
                            // the backend FiscalSetupDto rule).
                            validator: (v) {
                              final value = v ?? '';
                              if (value.isEmpty) {
                                final expiry =
                                    _controllers['dgi_authorization_expires_at']?.text ?? '';
                                if (expiry.isNotEmpty) {
                                  return 'Si se indica la fecha de vencimiento, indique también la de emisión';
                                }
                                return null;
                              }
                              if (!_isValidIsoDate(value)) {
                                return 'Use el formato ISO yyyy-MM-dd';
                              }
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextFormField(
                            key: const Key('dgi_authorization_expires_at_input'),
                            controller: _controllers['dgi_authorization_expires_at'],
                            keyboardType: TextInputType.datetime,
                            decoration: const InputDecoration(
                              labelText: 'Fecha de Vencimiento de la Autorización',
                              hintText: 'Ej: 2026-02-14',
                              helperText: 'Fecha de vencimiento de la autorización DGI (formato ISO yyyy-MM-dd).',
                            ),
                            validator: (v) {
                              final value = v ?? '';
                              if (value.isEmpty) {
                                final issued =
                                    _controllers['dgi_authorization_issued_at']?.text ?? '';
                                if (issued.isNotEmpty) {
                                  return 'Si se indica la fecha de emisión, indique también la de vencimiento';
                                }
                                return null;
                              }
                              if (!_isValidIsoDate(value)) {
                                return 'Use el formato ISO yyyy-MM-dd';
                              }
                              final issued =
                                  _controllers['dgi_authorization_issued_at']?.text ?? '';
                              final issuedDate = _tryParseIsoDate(issued);
                              final expiryDate = _tryParseIsoDate(value);
                              if (issuedDate != null &&
                                  expiryDate != null &&
                                  expiryDate.isBefore(issuedDate)) {
                                return 'Debe ser mayor o igual a la fecha de emisión';
                              }
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 48),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () async {
                              if (_formKey.currentState?.validate() ?? false) {
                                final Map<String, String> newConfig = {};
                                _controllers.forEach((key, controller) {
                                  newConfig[key] = controller.text;
                                });
                                newConfig['operation_mode'] = viewModel.operationMode.code;
                                newConfig['tax_regime'] = viewModel.taxRegime?.code ?? _controllers['tax_regime']?.text ?? '';
                                await viewModel.saveConfig(newConfig);
                                if (mounted && context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('Configuración Guardada Correctamente')),
                                  );
                                }
                              }
                            },
                            child: const Text('GUARDAR CONFIGURACIÓN'),
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
