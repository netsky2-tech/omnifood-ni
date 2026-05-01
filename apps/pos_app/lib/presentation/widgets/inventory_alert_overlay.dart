import 'package:flutter/material.dart';
import '../../domain/services/alerts/alert_service.dart';

class InventoryAlertOverlay extends StatefulWidget {
  final Widget child;
  final AlertService alertService;

  const InventoryAlertOverlay({
    super.key,
    required this.child,
    required this.alertService,
  });

  @override
  State<InventoryAlertOverlay> createState() => _InventoryAlertOverlayState();
}

class _InventoryAlertOverlayState extends State<InventoryAlertOverlay> {
  @override
  void initState() {
    super.initState();
    widget.alertService.alertStream.listen((alert) {
      if (mounted) {
        _showToast(alert.message);
      }
    });
  }

  void _showToast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.redAccent,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
