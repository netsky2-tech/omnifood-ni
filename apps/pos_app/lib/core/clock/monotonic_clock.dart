abstract interface class MonotonicClock {
  Duration elapsed();
}

class StopwatchMonotonicClock implements MonotonicClock {
  StopwatchMonotonicClock() : _stopwatch = Stopwatch()..start();

  final Stopwatch _stopwatch;

  @override
  Duration elapsed() => _stopwatch.elapsed;
}
