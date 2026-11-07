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
        // A partial-month target can declare its active day count (Hari); otherwise the
        // calendar month length is used. Prorating over the wrong (full) count would make
        // each day's allowance too small and falsely flag a realistic spend as over budget.
        var effectiveDays = target?.Hari is > 0 ? target.Hari.Value : daysInMonth;
        var dailyBudget = anggaran > 0 ? Math.Max(1, (long)Math.Round(anggaran / (double)effectiveDays)) : 0;

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
            .Where(kv => kv.Key != "Nabung")
            .OrderByDescending(kv => kv.Value)
            .Select(kv => new CategoryTrendItem(kv.Key, kv.Value))
            .ToList();

        var daysElapsed = date.Day;
        // Committed recurring bills (Tagihan, e.g. kos rent) are paid as one lump;
        // feeding them through the daily run-rate would project a lumpy month far
        // above its real total. So project the remainder from the discretionary
        // daily rate on top of what is already committed/spent. For months with no
        // Tagihan rows this reduces exactly to the old run-rate extrapolation.
        var fixedCommitted = rows.Where(r => r.Kategori == "Tagihan").Sum(r => r.Nominal);
        var discretionary = total - fixedCommitted;
        var projectedTotal = daysElapsed > 0
            ? fixedCommitted + (long)Math.Round(discretionary / (double)daysElapsed * daysInMonth)
            : 0;
        var projectedOver = anggaran > 0 ? Math.Max(0, projectedTotal - anggaran) : 0;

        // Spend-pace baseline: cumulative non-Nabung spend through the same day-of-month
        // this month vs last month. Filtered by month prefix so the comparison stays
        // correct even if a repository returns rows outside the requested month.
        var prevMonth = date.AddMonths(-1).ToString("yyyy-MM");
        var prevRows = await repository.ListAllForMonthAsync(prevMonth, ct);
        var currentThroughDay = rows
            .Where(r => r.Tanggal.ToString("yyyy-MM") == month && r.Tanggal.Day <= date.Day && r.Kategori != "Nabung")
            .Sum(r => r.Nominal);
        var previousThroughDay = prevRows
            .Where(r => r.Tanggal.ToString("yyyy-MM") == prevMonth && r.Tanggal.Day <= date.Day && r.Kategori != "Nabung")
            .Sum(r => r.Nominal);
        var delta = currentThroughDay - previousThroughDay;
        double? percentChange = previousThroughDay > 0
            ? Math.Round((double)delta / previousThroughDay * 100, 1)
            : null;
        var pace = new Pace(month, date.Day, currentThroughDay, prevMonth, previousThroughDay, delta, percentChange);

        var p = options.Value;
        var totalNeeded = p.PcVga + p.PcCpu + p.PcMotherboard + p.PcSsd;
        // Cumulative savings pot toward the PC goal: sum every Nabung deposit up to
        // this month. The per-category map above is month-scoped, so using it here
        // would under-report total savings whenever a previous month held deposits.
        var nabungSoFar = await repository.GetCumulativeNabungAsync(month, ct);
        var remaining = Math.Max(0, totalNeeded - nabungSoFar);
        var percentCollected = totalNeeded > 0
            ? Math.Min(100, Math.Round(nabungSoFar / (double)totalNeeded * 100, 1))
            : 0;
        var potentialSavingPerMonth = Math.Max(0, anggaran - projectedTotal);
        // Months-to-goal must be computed from what is still missing (remaining),
        // not the full total — a goal that is partially collected takes fewer
        // months, and showing the from-scratch horizon would overstate the time
        // left and undercut the savings motivation the panel is there to give.
        int? monthsToReach = potentialSavingPerMonth > 0
            ? (int)Math.Ceiling(remaining / (double)potentialSavingPerMonth)
            : null;

        // Today's actual food spend (kategori "Makan") — the ground truth the daily
        // frugal-menu plan is measured against, so the panel can flag when a day's
        // eating has already run past the planned frugal range.
        var foodSpend = rows.Where(r => r.Tanggal == date && r.Kategori == "Makan").Sum(r => r.Nominal);

        // Remaining-day envelope: the static DailyBudget assumes a uniform spend from day
        // 1, which is rarely true (a lumpy sewa-kos bill early on makes it meaningless).
        // What actually matters is how much is left vs how many days remain — the per-day
        // allowance the user can afford from tomorrow to the end of the month.
        var remainingBudget = Math.Max(0, anggaran - currentThroughDay);
        var daysLeft = Math.Max(1, effectiveDays - date.Day);
        var perDayAllowance = anggaran > 0 ? (long)Math.Floor(remainingBudget / (double)daysLeft) : 0;

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
            pace,
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
            Daily(date, foodSpend),
            new RemainingAllowance(anggaran, currentThroughDay, remainingBudget, daysLeft, perDayAllowance));
    }

    /// <summary>
    /// Rotating daily suggestions (P1-6): a frugal/healthy menu set, an activity, a fun
    /// fact, and a kos-saving tip. Selection is deterministic from the date (DateOnly.DayNumber
    /// modulo each list's length), so a given day always shows the same content — stable across
    /// retries and testable without randomness. The selected menu's numeric cost range
    /// (Min/Max) rides along with the display estimate so the UI can compare a day's actual
    /// food spend ({paramref name="foodSpend"/}) against the plan.
    /// </summary>
    private static DailySuggestions Daily(DateOnly date, long foodSpend)
    {
        var day = date.DayNumber;
        // Decoupled rotations: each pool advances at its own stride and period, so a
        // given calendar day stays deterministic while the full card repeats only after
        // the least common multiple of all pool lengths (~months), not every week.
        var (sarapan, siang, malam, biaya, min, max) = Menus[day % Menus.Length];
        return new DailySuggestions(
            sarapan,
            siang,
            malam,
            biaya,
            Aktivitas[(day * 2 + 1) % Aktivitas.Length],
            FunFacts[(day * 3 + 2) % FunFacts.Length],
            TipsAnakKos[(day * 5 + 3) % TipsAnakKos.Length],
            foodSpend,
            min,
            max);
    }

    /// <summary>Complete frugal, weight-loss-aligned kos menu sets, rotated by day.</summary>
    /// <summary>Complete frugal, weight-loss-aligned kos menu sets, rotated by day. Each
    /// set carries a frugal daily-cost range (min/max) matching its display estimate, so the
    /// UI can compare a day's actual food spend against its plan.</summary>
    private static readonly (string Sarapan, string MakanSiang, string MakanMalam, string Biaya, int Min, int Max)[] Menus =
    [
        ("Oatmeal + pisang + teh tawar",
         "Nasi, ayam bakar, tumis kangkung, air putih",
         "Nasi, telur dadar, sayur bening bayam",
         "±Rp25–30k", 25000, 30000),
        ("Bubur ayam (minta tanpa minyak berlebih)",
         "Nasi, tempe orek, sop sayuran",
         "Nasi, ikan kembung pepes, lalapan",
         "±Rp28–35k", 28000, 35000),
        ("Telur rebus + roti gandum",
         "Nasi, tahu bacem, capcay",
         "Nasi, ayam suwir, sayur asem",
         "±Rp27–33k", 27000, 33000),
        ("Pisang + susu/teh tawar",
         "Nasi, sayur lodeh, telur balado rencah",
         "Nasi, lele goreng, sambal + timun",
         "±Rp30–38k", 30000, 38000),
        ("Bubur kacang hijau (tanpa gula berlebih)",
         "Nasi, ayam geprek (skip tepung berlebih), wortel rebus",
         "Nasi, oncom goreng, sup ayam",
         "±Rp30–37k", 30000, 37000),
        ("Roti gandum + selai kacang (tanpa gula tambahan)",
         "Nasi, ikan tongkol suwir, tumis brokoli wortel",
         "Nasi, tahu kukus + sambal terasi, sayur bayam",
         "±Rp29–36k", 29000, 36000),
        ("Bubur putih + telur rebus",
         "Nasi, hati ayam tumis (sedikit minyak), mentimun",
         "Nasi, tempe penyet + lalapan, sayur lodeh",
         "±Rp26–32k", 26000, 32000),
        ("Telur mata sapi + nasi merah (porsi kecil)",
         "Nasi, ayam pop, sayur katuk",
         "Nasi, rolade tahu, kuah sayur oyong",
         "±Rp28–35k", 28000, 35000),
        ("Roti tawar gandum + telur orak-arik",
         "Nasi, udang tumis (sedikit), tumis tauge",
         "Nasi, pindang tongkol, sambal + lalapan",
         "±Rp32–40k", 32000, 40000),
        ("Singkong/ubi rebus + teh tawar",
         "Nasi, telur kecap, sop jagung wortel",
         "Nasi, ayam ungkep tanpa kulit, tumis kacang panjang",
         "±Rp25–31k", 25000, 31000),
        ("Apel + yoghurt polos tanpa gula",
         "Nasi, tempe mendoan (tanpa tepung berlebih), sayur bening",
         "Nasi, bandeng presto, lalapan + sambal",
         "±Rp30–38k", 30000, 38000),
        ("Kentang rebus + telur rebus",
         "Nasi, ayam rica-rica (minyak sedikit), mentimun",
         "Nasi, tahu tektek, sayur asem",
         "±Rp28–35k", 28000, 35000),
        ("Bubur putih + abon ayam",
         "Nasi, sawi cah telur, perkedel tahu",
         "Nasi, ikan cakalang suwir, tumis labu siam",
         "±Rp29–36k", 29000, 36000),
        ("Omelet sayur + roti gandum",
         "Nasi, sop ayam bening, tempe goreng tepung tipis",
         "Nasi, semur daging (porsi kecil), tumis buncis",
         "±Rp33–42k", 33000, 42000),
    ];
/// <summary>Free daily activities doable in/around a kos, rotated by day.</summary>
        private static readonly string[] Aktivitas =
    [
        "Jalan kaki 10.000 langkah — bagi pagi & sore biar tidak terasa berat.",
        "Stretching 10 menit + push-up 3 set ×10 di kamar kos.",
        "Lompat tali 15 menit — murah dan cepat membakar kalori.",
        "Bodyweight: squat + plank + mountain climber 3 ronde.",
        "Jalan cepat 30 menit keliling komplek sambil dengar podcast.",
        "Naik-turun tangga ±10 menit — kalau kos bertingkat, gratis & bakar kalori.",
        "Yoga sederhana 15 menit di kamar (child pose, downward dog, cat-cow).",
        "Bersepeda santai 30 menit keliling sekitar kos — sekalian eksplorasi warung hemat.",
        "Senam ringan 15 menit (jumping jack + high knees) di kamar kos.",
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
        "Protein (tempe/tahu/ayam) bantu rasa kenyang lebih lama — sertakan di tiap makan.",
        "Kunyah perlahan: otak butuh ±20 menit menerima sinyal kenyang — makan lebih pelan berarti lebih sedikit kalori.",
        "Cahaya biru gadget di malam hari mengganggu hormon tidur (melatonin) — matikan layar ±30 menit sebelum tidur.",
        "Sayur warna-warni punya antioksidan berbeda — makin beragam warna piring, makin beragam nutrisi.",
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
        "Masak dalam porsi besar lalu simpan dingin — hangatkan ulang untuk 2–3 kali makan.",
        "Buat daftar belanja di HP sebelum berangkat — cegah barang impulsif masuk keranjang.",
        "Bandingkan harga antar-warung/minimarket untuk kebutuhan rutin (telur, galon, sabun).",
        "Diskusi & bagi tagihan listrik/air dengan teman sekos kalau memungkinkan — transparan sejak awal.",
        "Manfaatkan cashback/point saat top-up atau belanja online — tapi jangan tergoda belanja ekstra demi reward.",
        "Catat pengeluaran harian tiap malam — sadar pos mana yang bocor sebelum bulan berakhir.",
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
