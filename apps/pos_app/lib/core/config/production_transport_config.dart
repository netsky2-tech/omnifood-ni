import 'package:dio/dio.dart';

/// Bounds background synchronization so offline POS work is never held forever.
const posSyncTransportTimeout = Duration(seconds: 15);

BaseOptions productionTransportOptions(String baseUrl) => BaseOptions(
  baseUrl: baseUrl,
  connectTimeout: posSyncTransportTimeout,
  sendTimeout: posSyncTransportTimeout,
  receiveTimeout: posSyncTransportTimeout,
);
