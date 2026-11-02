using Microsoft.Extensions.Options;
using OmniChat.Api.Infrastructure.Options;
using OmniChat.Application.Interfaces;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Deterministic implementation of <see cref="IExpenseAdviceService"/>. No external LLM
/// call: every value is computed from the ledger and fixed rules, so the endpoint is fast,
/// cheap, and unit-testable.
/// </summary>
public sealed class ExpenseAdviceService(
    IExpenseRepository repository,
    IOptions<ExpenseAdviceOptions> options) : IExpenseAdviceService
{
    public async Task<ExpenseAdvice> BuildAsync(DateOnly date, CancellationToken ct)
    {
        var month = date.ToString("yyyy-MM");
        var daysInMonth = DateTime.DaysInMonth(date.Year, date.Month);

        var target = await repository.GetTargetAsync(month, ct);
        var rows = await repository.ListAllForMonthAsync(month, ct);

        // Savings deposits (kategori "Nabung") are not spending: they must not push a
        // day over budget nor inflate the month projection / saving-potential math.
        var dayTotal = rows.Where(r => r.Tanggal == date && r.Kategori != "Nabung").Sum(r => r.Nominal);
        var total = rows.Where(r => r.Kategori != "Nabung").Sum(r => r.Nominal);

        var anggaran = target?.Anggaran ?? 0;
        var dailyBudget = anggaran > 0 ? Math.Max(1, (long)Math.Round(anggaran / (double)daysInMonth)) : 0;

        string status;
        long overBy = 0;
        List<string> suggestions = [];

        if (target is null)
        {
            status = "no_target";
        }
        else if (dayTotal <= dailyBudget)
        {
            status = "oke";
        }
        else
        {
            status = "over_budget";
            overBy = dayTotal - dailyBudget;
            suggestions = Tips();
        }

        var perKategori = rows
            .GroupBy(r => r.Kategori)
            .ToDictionary(g => g.Key, g => g.Sum(r => r.Nominal));
        var categoryTrend = perKategori
            .OrderByDescending(kv => kv.Value)
            .Select(kv => new CategoryTrendItem(kv.Key, kv.Value))
            .ToList();

        var daysElapsed = date.Day;
        var projectedTotal = daysElapsed > 0
            ? (long)Math.Round(total / (double)daysElapsed * daysInMonth)
            : 0;
        var projectedOver = anggaran > 0 ? Math.Max(0, projectedTotal - anggaran) : 0;

        var p = options.Value;
        var totalNeeded = p.PcVga + p.PcCpu + p.PcMotherboard + p.PcSsd;
        var nabungSoFar = perKategori.GetValueOrDefault("Nabung");
        var remaining = Math.Max(0, totalNeeded - nabungSoFar);
        var percentCollected = totalNeeded > 0
            ? Math.Min(100, Math.Round(nabungSoFar / (double)totalNeeded * 100, 1))
            : 0;
        var potentialSavingPerMonth = Math.Max(0, anggaran - projectedTotal);
        int? monthsToReach = potentialSavingPerMonth > 0
            ? (int)Math.Ceiling(totalNeeded / (double)potentialSavingPerMonth)
            : null;

        return new ExpenseAdvice(
            date.ToString("yyyy-MM-dd"),
            month,
            dayTotal,
            dailyBudget,
            status,
            overBy,
            suggestions,
            categoryTrend,
            new Projection(total, daysElapsed, daysInMonth, projectedTotal, anggaran, projectedOver),
            new PcGoal(
                [
                    new PartItem("VGA", p.PcVga),
                    new PartItem("CPU", p.PcCpu),
                    new PartItem("Motherboard", p.PcMotherboard),
                    new PartItem("SSD", p.PcSsd),
                ],
                totalNeeded,
                nabungSoFar,
                percentCollected,
                remaining,
                potentialSavingPerMonth,
                monthsToReach),
            Daily(date));
    }

    /// <summary>
    /// Rotating daily suggestions (P1-6): a frugal/healthy menu set, an activity, a fun
    /// fact, and a kos-saving tip. Selection is deterministic from the date (DateOnly.DayNumber
    /// modulo each list's length), so a given day always shows the same content — stable across
    /// retries and testable without randomness.
    /// </summary>
    private static DailySuggestions Daily(DateOnly date)
    {
        var idx = date.DayNumber;
        var (sarapan, siang, malam) = Menus[idx % Menus.Length];
        return new DailySuggestions(
            sarapan,
            siang,
            malam,
            Aktivitas[idx % Aktivitas.Length],
            FunFacts[idx % FunFacts.Length],
            TipsAnakKos[idx % TipsAnakKos.Length]);
    }

    /// <summary>Complete frugal, weight-loss-aligned kos menu sets, rotated by day.</summary>
    private static readonly (string Sarapan, string MakanSiang, string MakanMalam)[] Menus =
    [
        ("Oatmeal + pisang + teh tawar",
         "Nasi, ayam bakar, tumis kangkung, air putih",
         "Nasi, telur dadar, sayur bening bayam"),
        ("Bubur ayam (minta tanpa minyak berlebih)",
         "Nasi, tempe orek, sop sayuran",
         "Nasi, ikan kembung pepes, lalapan"),
        ("Telur rebus + roti gandum",
         "Nasi, tahu bacem, capcay",
         "Nasi, ayam suwir, sayur asem"),
        ("Pisang + susu/teh tawar",
         "Nasi, sayur lodeh, telur balado rencah",
         "Nasi, lele goreng, sambal + timun"),
        ("Bubur kacang hijau (tanpa gula berlebih)",
         "Nasi, ayam geprek (skip tepung berlebih), wortel rebus",
         "Nasi, oncom goreng, sup ayam"),
    ];

    /// <summary>Free daily activities doable in/around a kos, rotated by day.</summary>
    private static readonly string[] Aktivitas =
    [
        "Jalan kaki 10.000 langkah — bagi pagi & sore biar tidak terasa berat.",
        "Stretching 10 menit + push-up 3 set ×10 di kamar kos.",
        "Lompat tali 15 menit — murah dan cepat membakar kalori.",
        "Bodyweight: squat + plank + mountain climber 3 ronde.",
        "Jalan cepat 30 menit keliling komplek sambil dengar podcast.",
    ];

    /// <summary>Short interesting facts (health/frugality/brain), rotated by day.</summary>
    private static readonly string[] FunFacts =
    [
        "Otak butuh ±20% energi tubuh — sarapan sehat bantu fokus seharian.",
        "Minum segelas air putih sebelum makan bisa bantu mengontrol porsi.",
        "Jalan 10.000 langkah membakar ±300–400 kalori — setara satu porsi nasi.",
        "Tidur 7–8 jam membantu proses pembakaran lemak dan menjaga mood.",
        "Masak sendiri hemat ±40% dibanding jajan, sekaligus lebih sehat.",
        "Reward manis cuma memberi dopamin singkat — pilih hadiah non-makanan.",
    ];

    /// <summary>Practical frugal tips for boarding-house life, rotated by day.</summary>
    private static readonly string[] TipsAnakKos =
    [
        "Masak sendiri: belanja bahan seminggu sekali biar hemat & tidak impulsif.",
        "Stok frozen food (sayur beku, tempe, nugget) — masak cepat pas malas.",
        "Matikan lampu/kipas/charger yang tidak dipakai — tagihan listrik turun.",
        "Bawa botol minum isi ulang — hemat & kurangi jajan minuman manis.",
        "Belanja ke pasar/toko dekat kos — hindari biaya antar online yang mahal.",
        "Bikin bekal dari makanan kos yang agak lebih — kurangi jajan di luar.",
    ];

    /// <summary>Fixed, health-and-money aligned tips shown when the day is over budget.</summary>
    private static List<string> Tips() =>
    [
        "Ganti minuman manis dengan air putih — hemat ±Rp15–20k/hari dan mendukung target turun berat badan.",
        "Pilih menu warteg/masak sendiri: sayur + protein (tempe/tahu/ayam) + nasi ±Rp12–15k, bukan jajan siap saji.",
        "Aktivitas gratis: jalan kaki 10 ribu langkah/hari sebagai pengganti hiburan berbayar.",
        "Terapkan aturan tunggu 24 jam sebelum belanja non-kebutuhan; jika masih perlu besok, baru beli.",
        "Sisihkan dulu sebagian ke tabungan (kategori Nabung) sebelum jajan — target part PC tercapai lebih cepat.",
    ];
}
