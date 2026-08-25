class TenderBreakdown {
  final double totalNio;
  final double totalUsd;
  final double tenderAmount;
  final String tenderCurrency;
  final double tenderAmountNio;
  final double tenderAmountUsd;
  final double changeNio;
  final double changeUsd;
  final double effectiveChange;
  final String changeCurrency;
  final double remainingNio;
  final double remainingUsd;
  final bool isSufficient;

  const TenderBreakdown({
    required this.totalNio,
    required this.totalUsd,
    required this.tenderAmount,
    required this.tenderCurrency,
    required this.tenderAmountNio,
    required this.tenderAmountUsd,
    required this.changeNio,
    required this.changeUsd,
    required this.effectiveChange,
    required this.changeCurrency,
    required this.remainingNio,
    required this.remainingUsd,
    required this.isSufficient,
  });
}

class CurrencyCheckoutCalculator {
  final double commercialRate;
  final double bcnOfficialRate;

  const CurrencyCheckoutCalculator({
    required this.commercialRate,
    required this.bcnOfficialRate,
  });

  /// Rounds double to 2 decimals using standard round half up.
  static double round2(double val) {
    return (val * 100).round() / 100;
  }

  /// Converts Total NIO to USD using the merchant's commercial exchange rate.
  double calculateTotalUsd(double totalNio) {
    if (commercialRate <= 0) return 0.0;
    return round2(totalNio / commercialRate);
  }

  /// Calculates tender breakdown, converting currency and computing change/remaining.
  TenderBreakdown calculateTender({
    required double totalNio,
    required double tenderAmount,
    String tenderCurrency = 'NIO',
    String changeCurrencyPreference = 'NIO',
  }) {
    final totalUsd = calculateTotalUsd(totalNio);

    double tenderNio;
    double tenderUsd;

    if (tenderCurrency == 'USD') {
      tenderUsd = tenderAmount;
      tenderNio = round2(tenderAmount * commercialRate);
    } else {
      tenderNio = tenderAmount;
      tenderUsd = commercialRate > 0 ? round2(tenderAmount / commercialRate) : 0.0;
    }

    final diffNio = tenderNio - totalNio;
    final isSufficient = diffNio >= -0.0001;

    double changeNio = 0.0;
    double changeUsd = 0.0;
    double remainingNio = 0.0;
    double remainingUsd = 0.0;

    if (isSufficient) {
      changeNio = round2(diffNio > 0 ? diffNio : 0.0);
      changeUsd = commercialRate > 0 ? round2(changeNio / commercialRate) : 0.0;
    } else {
      remainingNio = round2(-diffNio);
      remainingUsd = commercialRate > 0 ? round2(remainingNio / commercialRate) : 0.0;
    }

    final effectiveChange =
        changeCurrencyPreference == 'USD' ? changeUsd : changeNio;

    return TenderBreakdown(
      totalNio: totalNio,
      totalUsd: totalUsd,
      tenderAmount: tenderAmount,
      tenderCurrency: tenderCurrency,
      tenderAmountNio: tenderNio,
      tenderAmountUsd: tenderUsd,
      changeNio: changeNio,
      changeUsd: changeUsd,
      effectiveChange: effectiveChange,
      changeCurrency: changeCurrencyPreference,
      remainingNio: remainingNio,
      remainingUsd: remainingUsd,
      isSufficient: isSufficient,
    );
  }

  /// Suggests fast payment denominations based on target currency and ticket total.
  List<double> getSuggestedDenominations({
    required double totalNio,
    required String currency,
  }) {
    final suggestions = <double>{};

    if (currency == 'NIO') {
      suggestions.add(round2(totalNio));

      // Next nearest multiple of C$100
      final next100 = (totalNio / 100).ceil() * 100.0;
      if (next100 > totalNio) suggestions.add(next100);

      // Standard Nicaraguan bill denominations
      final bills = [100.0, 200.0, 500.0, 1000.0];
      for (final bill in bills) {
        if (bill >= totalNio) {
          suggestions.add(bill);
        } else {
          final nextMultiple = (totalNio / bill).ceil() * bill;
          suggestions.add(nextMultiple);
        }
      }
    } else {
      final totalUsd = calculateTotalUsd(totalNio);
      suggestions.add(totalUsd);

      // Next multiples of $5, $10, $20, $50, $100
      final next5 = (totalUsd / 5).ceil() * 5.0;
      if (next5 > totalUsd) suggestions.add(next5);

      final usdBills = [5.0, 10.0, 15.0, 20.0, 50.0, 100.0];
      for (final bill in usdBills) {
        if (bill >= totalUsd) {
          suggestions.add(bill);
        }
      }
    }

    final sorted = suggestions.toList()..sort();
    return sorted;
  }
}
