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

        var dayTotal = rows.Where(r => r.Tanggal == date).Sum(r => r.Nominal);
        var total = rows.Sum(r => r.Nominal);

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
                monthsToReach));
    }

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
