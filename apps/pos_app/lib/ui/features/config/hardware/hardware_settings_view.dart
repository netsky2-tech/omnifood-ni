import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../../../domain/models/config/printer_config.dart';
import '../../../../domain/models/config/tax_regime.dart';
import '../../../../domain/ports/printer_port.dart';
import '../../../widgets/receipt_preview_dialog.dart';
import 'hardware_settings_view_model.dart';

class HardwareSettingsView extends StatelessWidget {
  const HardwareSettingsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ajustes de Hardware e Impresora'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<HardwareSettingsViewModel>().loadConfig(),
            tooltip: 'Refrescar Estado',
          ),
        ],
      ),
      body: Consumer<HardwareSettingsViewModel>(
        builder: (context, viewModel, child) {
          if (viewModel.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          final config = viewModel.config;
          final status = viewModel.printerStatus;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Hardware Status Badge Card
                _buildStatusCard(context, status, viewModel),
                const SizedBox(height: 16),

                // Driver Selection Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Controlador de Impresión (Driver)',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Seleccione el tipo de impresora conectada al terminal.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        SegmentedButton<PrinterDriverType>(
                          segments: const [
                            ButtonSegment(
                              value: PrinterDriverType.sunmiV2s,
                              label: Text('Sunmi V2s'),
                              icon: Icon(Icons.phone_android),
                            ),
                            ButtonSegment(
                              value: PrinterDriverType.mock,
                              label: Text('Simulador'),
                              icon: Icon(Icons.computer),
                            ),
                            ButtonSegment(
                              value: PrinterDriverType.escPosNetwork,
                              label: Text('Red TCP/IP'),
                              icon: Icon(Icons.network_ping),
                            ),
                            ButtonSegment(
                              value: PrinterDriverType.iPosQ80,
                              label: Text('Q80 / iPos'),
                              icon: Icon(Icons.point_of_sale),
                            ),
                          ],
                          selected: {config.driverType},
                          onSelectionChanged: (set) {
                            if (set.isNotEmpty) {
                              viewModel.setDriverType(set.first);
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Automation & Printing Rules Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Reglas de Impresión Automática',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        const SizedBox(height: 8),
                        SwitchListTile(
                          title: const Text('Impresión automática de Factura'),
                          subtitle: const Text('Emite el ticket fiscal DGI al finalizar el cobro.'),
                          value: config.autoPrintInvoice,
                          onChanged: (val) => viewModel.toggleAutoPrintInvoice(val),
                        ),
                        const Divider(),
                        SwitchListTile(
                          title: const Text('Impresión automática a Cocina'),
                          subtitle: const Text('Emite la comanda física al registrar la orden.'),
                          value: config.autoPrintKitchen,
                          onChanged: (val) => viewModel.toggleAutoPrintKitchen(val),
                        ),
                        const Divider(),
                        SwitchListTile(
                          title: const Text('Apertura de gaveta en pagos en efectivo'),
                          subtitle: const Text('Envía pulso a la gaveta de dinero al cobrar.'),
                          value: config.openDrawerOnCash,
                          onChanged: (val) => viewModel.toggleOpenDrawerOnCash(val),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Company Logo Configuration Card
                _buildLogoCard(context, config, viewModel),
                const SizedBox(height: 16),

                // Paper Width Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Ancho de Papel Térmico',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        const SizedBox(height: 8),
                        SegmentedButton<int>(
                          segments: const [
                            ButtonSegment(
                              value: 58,
                              label: Text('58 mm (32 columnas)'),
                            ),
                            ButtonSegment(
                              value: 80,
                              label: Text('80 mm (48 columnas)'),
                            ),
                          ],
                          selected: {config.paperWidthMm},
                          onSelectionChanged: (set) {
                            if (set.isNotEmpty) {
                              viewModel.setPaperWidth(set.first);
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Hardware Test Actions
                Text(
                  'Pruebas y Diagnóstico de Hardware',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        key: const Key('test_print_button'),
                        icon: const Icon(Icons.print),
                        label: const Text('PROBAR IMPRESIÓN'),
                        onPressed: viewModel.isTesting
                            ? null
                            : () async {
                                final ok = await viewModel.testPrintReceipt();
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(viewModel.statusMessage ?? (ok ? 'Impresión enviada' : 'Error')),
                                      backgroundColor: ok ? Colors.green : Colors.red,
                                    ),
                                  );
                                }
                              },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        key: const Key('test_drawer_button'),
                        icon: const Icon(Icons.point_of_sale),
                        label: const Text('PROBAR GAVETA'),
                        onPressed: viewModel.isTesting
                            ? null
                            : () async {
                                final ok = await viewModel.testOpenDrawer();
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(viewModel.statusMessage ?? (ok ? 'Gaveta abierta' : 'Error')),
                                      backgroundColor: ok ? Colors.green : Colors.red,
                                    ),
                                  );
                                }
                              },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: const Key('preview_receipt_button'),
                  icon: const Icon(Icons.preview),
                  label: const Text('PREVIEW Y DIAGNÓSTICO DE TICKET'),
                  onPressed: () {
                    ReceiptPreviewDialog.show(
                      context,
                      initialPaperWidthMm: config.paperWidthMm,
                      initialTaxRegime: TaxRegime.fromString(config.taxRegime),
                      printerPort: viewModel.printerPort,
                    );
                  },
                ),
                if (viewModel.statusMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    viewModel.statusMessage!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade700,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatusCard(
    BuildContext context,
    PrinterStatus status,
    HardwareSettingsViewModel viewModel,
  ) {
    Color statusColor;
    String statusTitle;
    String statusDescription;
    IconData statusIcon;

    switch (status) {
      case PrinterStatus.ready:
        statusColor = Colors.green;
        statusTitle = 'Impresora Conectada y Lista';
        statusDescription = 'El cabezal térmico está disponible y cuenta con papel.';
        statusIcon = Icons.check_circle;
        break;
      case PrinterStatus.outOfPaper:
        statusColor = Colors.red;
        statusTitle = 'Sin Papel';
        statusDescription = 'La impresora no detecta papel. Inserte un rollo de 58mm.';
        statusIcon = Icons.warning;
        break;
      case PrinterStatus.overheating:
        statusColor = Colors.orange;
        statusTitle = 'Cabezal Sobrecalentado';
        statusDescription = 'Temperatura alta en cabezal térmico. Espere unos segundos.';
        statusIcon = Icons.thermostat;
        break;
      case PrinterStatus.busy:
        statusColor = Colors.amber;
        statusTitle = 'Impresora Ocupada';
        statusDescription = 'Procesando trabajos en cola.';
        statusIcon = Icons.hourglass_top;
        break;
      case PrinterStatus.offline:
      case PrinterStatus.error:
        statusColor = Colors.blueGrey;
        statusTitle = 'Impresora No Detectada (Modo Simulado Activo)';
        statusDescription = 'El terminal operará en modo simulado para no interrumpir ventas.';
        statusIcon = Icons.info;
        break;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: statusColor.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Icon(statusIcon, color: statusColor, size: 36),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  statusTitle,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: statusColor.shade900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  statusDescription,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogoCard(
    BuildContext context,
    PrinterConfig config,
    HardwareSettingsViewModel viewModel,
  ) {
    final hasLogo = config.logoBase64 != null && config.logoBase64!.isNotEmpty;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Logo de la Empresa (Factura Térmica)',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                if (hasLogo)
                  Chip(
                    avatar: const Icon(Icons.check, size: 14, color: Colors.green),
                    label: Text(
                      '${config.logoWidth ?? 384}x${config.logoHeight ?? 0} px (1-bit)',
                      style: const TextStyle(fontSize: 11),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Requisitos estrictos para impresión térmica:\n'
              '• Ancho máximo: 384 px (ancho exacto del cabezal de 58 mm)\n'
              '• Formato: PNG monocromático (1-bit / Black & White)\n'
              '• Fondo: Blanco o transparente (con dithering Floyd-Steinberg)',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey.shade700),
            ),
            const SizedBox(height: 12),
            if (hasLogo) ...[
              SwitchListTile(
                title: const Text('Imprimir Logo en Cabecera'),
                subtitle: const Text('Inserta el gráfico en el encabezado de las facturas DGI.'),
                value: config.isLogoEnabled,
                onChanged: (val) => viewModel.toggleLogoEnabled(val),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  OutlinedButton.icon(
                    icon: const Icon(Icons.upload_file),
                    label: const Text('Reemplazar Logo'),
                    onPressed: () => _showUploadLogoDialog(context, viewModel),
                  ),
                  const SizedBox(width: 12),
                  TextButton.icon(
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    label: const Text('Eliminar Logo', style: TextStyle(color: Colors.red)),
                    onPressed: () => viewModel.removeLogo(),
                  ),
                ],
              ),
            ] else ...[
              const SizedBox(height: 8),
              ElevatedButton.icon(
                icon: const Icon(Icons.add_photo_alternate),
                label: const Text('Subir Logo PNG (Máx 384 px)'),
                onPressed: () => _showUploadLogoDialog(context, viewModel),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _pickImageFromDevice(BuildContext context, HardwareSettingsViewModel viewModel, ImageSource source) async {
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(
        source: source,
        maxWidth: 384,
        imageQuality: 100,
      );

      if (pickedFile == null) return;

      final bytes = await pickedFile.readAsBytes();
      final error = await viewModel.uploadAndProcessLogo(bytes);

      if (context.mounted) {
        if (error != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error), backgroundColor: Colors.red),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Logo cargado y optimizado correctamente.'), backgroundColor: Colors.green),
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al seleccionar imagen: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showUploadLogoDialog(BuildContext context, HardwareSettingsViewModel viewModel) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Seleccionar Logo para Facturas',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 24.0),
                child: Text(
                  'El logo se optimizará automáticamente a formato monocromático de 1-bit para el cabezal térmico.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Colors.grey),
                ),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const CircleAvatar(
                  child: Icon(Icons.photo_library),
                ),
                title: const Text('Galería de Imágenes / Archivos'),
                subtitle: const Text('Seleccionar imagen PNG/JPEG desde el almacenamiento del dispositivo'),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _pickImageFromDevice(context, viewModel, ImageSource.gallery);
                },
              ),
              ListTile(
                leading: const CircleAvatar(
                  child: Icon(Icons.camera_alt),
                ),
                title: const Text('Tomar Foto con Cámara'),
                subtitle: const Text('Capturar imagen directamente con la cámara del POS'),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _pickImageFromDevice(context, viewModel, ImageSource.camera);
                },
              ),
              ListTile(
                leading: const CircleAvatar(
                  child: Icon(Icons.code),
                ),
                title: const Text('Pegar Texto Base64'),
                subtitle: const Text('Introducir código Base64 manualmente'),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _showBase64InputDialog(context, viewModel);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showBase64InputDialog(BuildContext context, HardwareSettingsViewModel viewModel) {
    final textController = TextEditingController();
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Pegar Logo en Base64'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Pegue los datos Base64 de la imagen PNG.',
                style: TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: textController,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Base64 PNG',
                  hintText: 'iVBORw0KGgoAAAANSUhEUgAAAYAAAA...',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () async {
              final text = textController.text.trim();
              if (text.isEmpty) return;
              try {
                final bytes = base64Decode(text);
                final error = await viewModel.uploadAndProcessLogo(Uint8List.fromList(bytes));
                if (dialogCtx.mounted) {
                  Navigator.of(dialogCtx).pop();
                }
                if (error != null && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(error), backgroundColor: Colors.red),
                  );
                } else if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Logo validado y guardado correctamente.'), backgroundColor: Colors.green),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error al decodificar Base64: $e'), backgroundColor: Colors.red),
                  );
                }
              }
            },
            child: const Text('Validar y Guardar'),
          ),
        ],
      ),
    );
  }
}
extension on Color {
  Color get shade900 => this is MaterialColor ? (this as MaterialColor).shade900 : this;
}
