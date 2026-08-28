import 'package:freezed_annotation/freezed_annotation.dart';
import '../../ports/card_terminal_port.dart';

part 'datafono_equipo.freezed.dart';
part 'datafono_equipo.g.dart';

@freezed
class DatafonoEquipo with _$DatafonoEquipo {
  const factory DatafonoEquipo({
    required String id,
    required String nombre,
    required String bancoAdquirente, // 'BAC', 'BANPRO', 'LAFISE', 'MIPOS', etc.
    required String numeroAfiliacion,
    required String terminalIdBanco,
    @Default('AISLADO') String tipoConexion, // 'AISLADO', 'LOCAL_NETWORK_TCP', 'SMART_POS_AIDL', 'MOCK'
    String? ipAddress,
    int? port,
    @Default(true) bool activo,
    DateTime? createdAt,
  }) = _DatafonoEquipo;

  factory DatafonoEquipo.fromJson(Map<String, dynamic> json) => _$DatafonoEquipoFromJson(json);
}

extension DatafonoEquipoX on DatafonoEquipo {
  AcquirerBank get parsedBank => AcquirerBank.fromString(bancoAdquirente);
  TerminalConnectionMode get parsedMode => TerminalConnectionMode.fromString(tipoConexion);
}
