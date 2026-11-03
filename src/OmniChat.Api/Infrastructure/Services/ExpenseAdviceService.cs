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
            .Where(kv => kv.Key != "Nabung")
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
        // Cumulative savings pot toward the PC goal: sum every Nabung deposit up to
        // this month. The per-category map above is month-scoped, so using it here
        // would under-report total savings whenever a previous month held deposits.
        var nabungSoFar = await repository.GetCumulativeNabungAsync(month, ct);
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
        var day = date.DayNumber;
        // Decoupled rotations: each pool advances at its own stride and period, so a
        // given calendar day stays deterministic while the full card repeats only after
        // the least common multiple of all pool lengths (~months), not every week.
        var (sarapan, siang, malam) = Menus[day % Menus.Length];
        return new DailySuggestions(
            sarapan,
            siang,
            malam,
            Aktivitas[(day * 2 + 1) % Aktivitas.Length],
            FunFacts[(day * 3 + 2) % FunFacts.Length],
            TipsAnakKos[(day * 5 + 3) % TipsAnakKos.Length]);
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
        ("Roti gandum + selai kacang (tanpa gula tambahan)",
         "Nasi, ikan tongkol suwir, tumis brokoli wortel",
         "Nasi, tahu kukus + sambal terasi, sayur bayam"),
        ("Bubur putih + telur rebus",
         "Nasi, hati ayam tumis (sedikit minyak), mentimun",
         "Nasi, tempe penyet + lalapan, sayur lodeh"),
        ("Telur mata sapi + nasi merah (porsi kecil)",
         "Nasi, ayam pop, sayur katuk",
         "Nasi, rolade tahu, kuah sayur oyong"),
        ("Roti tawar gandum + telur orak-arik",
         "Nasi, udang tumis (sedikit), tumis tauge",
         "Nasi, pindang tongkol, sambal + lalapan"),
        ("Singkong/ubi rebus + teh tawar",
         "Nasi, telur kecap, sop jagung wortel",
         "Nasi, ayam ungkep tanpa kulit, tumis kacang panjang"),
        ("Apel + yoghurt polos tanpa gula",
         "Nasi, tempe mendoan (tanpa tepung berlebih), sayur bening",
         "Nasi, bandeng presto, lalapan + sambal"),
        ("Kentang rebus + telur rebus",
         "Nasi, ayam rica-rica (minyak sedikit), mentimun",
         "Nasi, tahu tektek, sayur asem"),
        ("Bubur putih + abon ayam",
         "Nasi, sawi cah telur, perkedel tahu",
         "Nasi, ikan cakalang suwir, tumis labu siam"),
        ("Omelet sayur + roti gandum",
         "Nasi, sop ayam bening, tempe goreng tepung tipis",
         "Nasi, semur daging (porsi kecil), tumis buncis"),
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
