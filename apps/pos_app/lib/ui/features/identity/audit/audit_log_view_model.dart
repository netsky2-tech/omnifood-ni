import 'package:flutter/foundation.dart';
import '../../../../../domain/models/audit_log.dart';
import '../../../../../domain/repositories/audit_repository.dart';

class AuditLogViewModel extends ChangeNotifier {
  final AuditRepository _auditRepository;

  AuditLogViewModel(this._auditRepository);

  List<AuditLog> _logs = [];
  List<AuditLog> get logs => _logs;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  DateTime? _startDate;
  DateTime? get startDate => _startDate;

  DateTime? _endDate;
  DateTime? get endDate => _endDate;

  String? _selectedUserId;
  String? get selectedUserId => _selectedUserId;

  String _searchQuery = '';
  String get searchQuery => _searchQuery;

  String? _actionCategory;
  String? get actionCategory => _actionCategory;

  List<AuditLog> get filteredLogs {
    return _logs.where((log) {
      if (_actionCategory != null) {
        if (!log.action.toUpperCase().contains(_actionCategory!.toUpperCase())) {
          return false;
        }
      }
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matchAction = log.action.toLowerCase().contains(q);
        final matchUser = log.userId.toLowerCase().contains(q);
        final matchDevice = log.deviceId.toLowerCase().contains(q);
        final matchMeta = log.metadata?.toLowerCase().contains(q) ?? false;
        if (!matchAction && !matchUser && !matchDevice && !matchMeta) {
          return false;
        }
      }
      return true;
    }).toList();
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  void setActionCategory(String? category) {
    _actionCategory = category;
    notifyListeners();
  }

  Future<void> loadLogs() async {
    _isLoading = true;
    notifyListeners();

    try {
      _logs = await _auditRepository.getLocalLogs(
        start: _startDate,
        end: _endDate,
        userId: _selectedUserId,
      );
    } catch (e) {
      debugPrint('Error loading audit logs: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setDateRange(DateTime start, DateTime end) {
    _startDate = start;
    _endDate = end;
    loadLogs();
  }

  void setUserFilter(String? userId) {
    _selectedUserId = userId;
    loadLogs();
  }

  void clearFilters() {
    _startDate = null;
    _endDate = null;
    _selectedUserId = null;
    _searchQuery = '';
    _actionCategory = null;
    loadLogs();
  }
}
