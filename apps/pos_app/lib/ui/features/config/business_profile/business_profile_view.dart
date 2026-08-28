import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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
                    TextFormField(
                      controller: _controllers['bcn_official_exchange_rate'],
                      decoration: const InputDecoration(
                        labelText: 'Tipo de Cambio Oficial BCN (Base Fiscal DGI)',
                        hintText: '36.6241',
                        prefixIcon: Icon(Icons.account_balance),
                        helperText: 'Tasa oficial del Banco Central de Nicaragua utilizada exclusivamente para IVA y reportes DGI.',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Requerido';
                        final val = double.tryParse(v);
                        if (val == null || val <= 0) return 'Ingrese una tasa válida mayor a 0';
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 32),
                    Text('MODO OPERATIVO DEL NEGOCIO', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<TenantOperationMode>(
                      key: const Key('operation_mode_dropdown'),
                      value: viewModel.operationMode,
                      decoration: const InputDecoration(
                        labelText: 'Modo de Operación POS',
                        prefixIcon: Icon(Icons.storefront),
                        helperText: 'Determina el flujo de atención: Cobro directo en barra (Food Park), Servicio de Mesas (Restaurante), o Híbrido.',
                      ),
                      items: TenantOperationMode.values.map((mode) {
                        return DropdownMenuItem(
                          value: mode,
                          child: Text(mode.displayName),
                        );
                      }).toList(),
                      onChanged: (newMode) {
                        if (newMode != null) {
                          viewModel.setOperationMode(newMode);
                          _controllers['operation_mode']?.text = newMode.code;
                        }
                      },
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
