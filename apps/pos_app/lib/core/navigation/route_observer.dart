import 'package:flutter/material.dart';

/// Global [NavigatorObserver] used by [RouteAware] subscribers to detect
/// route pop/return events (e.g. returning from Configuration to Sales).
///
/// Register this as an argument on the top-level [MaterialApp] so it
/// participates in the navigation stack.
final RouteObserver<ModalRoute<void>> appRouteObserver =
    RouteObserver<ModalRoute<void>>();
