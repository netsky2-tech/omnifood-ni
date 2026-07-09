const mermaReasons = <String, String>{
  'VENCIDO': 'VENCIDO',
  'DESECHO_COCINA': 'DESECHO_COCINA',
  'DETERIORO_BODEGA': 'DETERIORO_BODEGA',
  'CORTESIA_DEGUSTACION': 'CORTESIA_DEGUSTACION',
};

const mermaReasonAliases = <String, String>{
  'VENCIMIENTO': 'VENCIDO',
  'MALA_PREPARACION': 'DESECHO_COCINA',
  'ROTO': 'DETERIORO_BODEGA',
  'DETERIORADO': 'DETERIORO_BODEGA',
  'CORTESIA': 'CORTESIA_DEGUSTACION',
};

const shrinkageTypes = <String>[
  'VENCIDO',
  'DESECHO_COCINA',
  'DETERIORO_BODEGA',
  'CORTESIA_DEGUSTACION',
];

String? normalizeMermaReason(String value) {
  final normalized = value.trim().toUpperCase();
  if (mermaReasons.containsKey(normalized)) {
    return normalized;
  }

  return mermaReasonAliases[normalized];
}

String requireMermaObservation(String value) {
  final observation = value.trim();
  if (observation.isEmpty) {
    throw ArgumentError('Merma observation is required');
  }

  return observation;
}
