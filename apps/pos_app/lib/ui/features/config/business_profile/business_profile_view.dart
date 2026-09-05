import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../domain/models/config/tax_regime.dart';
import '../../../../domain/models/config/tenant_operation_mode.dart';
import 'business_profile_view_model.dart';

class BusinessProfileView extends StatefulWidget {
  const BusinessProfileView({super.key});

  @override
  State<BusinessProfileView> createState() => _BusinessProfileViewState();
}

class _BusinessProfileViewState extends State<BusinessProfileView> {
  final _formKey = GlobalKey<FormState>();
  final Map<String, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    final viewModel = context.read<BusinessProfileViewModel>();
    for (final key in viewModel.config.keys) {
      _controllers[key] = TextEditingController();
    }
    
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await viewModel.loadConfig();
      for (final entry in viewModel.config.entries) {
        _controllers[entry.key]?.text = entry.value;
      }
    });
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<BusinessProfileViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

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
                        // Basic Nicaraguan RUC validation (natural or legal)
                        if (!RegExp(r'^[A-Z][0-9]{13}$').hasMatch(v)) {
                          return 'Formato de RUC inválido (Letra + 13 dígitos)';
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
                      decoration: const InputDecoration(
                        labelText: 'Tasa a Utilizar en Pantalla de Cobro (POS)',
                        prefixIcon: Icon(Icons.price_change),
                        helperText: 'Seleccione cuál de las dos tasas se aplicará para convertir cobros en USD y dar vuelto.',
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
                      onChanged: (mode) {
                        if (mode != null) {
                          viewModel.setCheckoutFxMode(mode);
                          _controllers['checkout_fx_mode']?.text = mode;
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _controllers['commercial_exchange_rate'],
                      decoration: const InputDecoration(
                        labelText: 'Tipo de Cambio Comercial (POS / Atención al Cliente)',
                        hintText: '36.50',
                        prefixIcon: Icon(Icons.currency_exchange),
                        helperText: 'Tasa utilizada para precios al público, cobro en USD y cálculo de vuelto en córdobas.',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Requerido';
                        final val = double.tryParse(v);
                        if (val == null || val <= 0) return 'Ingrese una tasa válida mayor a 0';
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
                              prefixIcon: const Icon(Icons.account_balance),
                              helperText: 'Tasa oficial del Banco Central de Nicaragua utilizada para base fiscal DGI.',
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
                                      onPressed: () async {
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
                      decoration: const InputDecoration(
                        labelText: 'Modo de Operación POS',
                        prefixIcon: Icon(Icons.storefront),
                        helperText: 'Determina el flujo de atención: Cobro directo en barra (Food Park), Servicio de Mesas (Restaurante), o Híbrido.',
                      ),
                      items: TenantOperationMode.values.map((mode) {
                        return DropdownMenuItem(
                          value: mode,
                          child: Text(mode.displayName, overflow: TextOverflow.ellipsis),
                        );
                      }).toList(),
                      onChanged: (newMode) {
                        if (newMode != null) {
                          viewModel.setOperationMode(newMode);
                          _controllers['operation_mode']?.text = newMode.code;
                        }
                      },
                    ),

                    const SizedBox(height: 32),
                    Text('AUTORIZACIÓN Y RANGO FISCAL DGI (Disposición 09-2007)', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Text(
                      'Configure el prefijo, rango autorizado y el número exacto con el que continuará la facturación de su negocio.',
                      style: TextStyle(fontSize: 12, color: colorScheme.outline),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextFormField(
                            key: const Key('dgi_prefix_input'),
                            controller: _controllers['dgi_prefix'],
                            decoration: const InputDecoration(
                              labelText: 'Prefijo Fiscal DGI',
                              hintText: '001-001-01-',
                              prefixIcon: Icon(Icons.receipt_long),
                              helperText: 'Prefijo oficial asignado por la DGI',
                            ),
                            validator: (v) => v == null || v.isEmpty ? 'Requerido' : null,
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
                              labelText: 'Siguiente Factura a Emitir',
                              hintText: '1',
                              prefixIcon: Icon(Icons.pin),
                              helperText: 'Número inicial o de continuidad de facturación',
                            ),
                            validator: (v) {
                              if (v == null || v.isEmpty) return 'Requerido';
                              final val = int.tryParse(v);
                              if (val == null || val <= 0) return 'Número inválido';
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            key: const Key('dgi_range_start_input'),
                            controller: _controllers['dgi_range_start'],
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Rango Inicial DGI',
                              hintText: '1',
                            ),
                            validator: (v) => v == null || v.isEmpty ? 'Requerido' : null,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextFormField(
                            key: const Key('dgi_range_end_input'),
                            controller: _controllers['dgi_range_end'],
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Rango Final DGI',
                              hintText: '10000',
                            ),
                            validator: (v) => v == null || v.isEmpty ? 'Requerido' : null,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('dgi_authorization_code_input'),
                      controller: _controllers['dgi_authorization_code'],
                      decoration: const InputDecoration(
                        labelText: 'Código / Resolución de Autorización DGI (CAFD)',
                        hintText: 'Ej: AUT-DGI-2026-9876',
                        prefixIcon: Icon(Icons.verified),
                        helperText: 'Número de resolución o autorización fiscal emitido por la DGI',
                      ),
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
                                newConfig['tax_regime'] = viewModel.taxRegime.code;
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
