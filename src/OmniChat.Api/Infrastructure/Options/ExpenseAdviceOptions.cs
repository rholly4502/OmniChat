namespace OmniChat.Api.Infrastructure.Options;

/// <summary>
/// Bound from the <c>ExpenseAdvice</c> configuration section. Holds the user's PC-goal
/// part prices (VGA, CPU, motherboard, SSD) so the Analisa &amp; Saran feature can estimate
/// how long saving takes. Values are rupiah; override any via environment/config (e.g.
/// <c>ExpenseAdvice__PcVga=3800000</c>).
/// </summary>
public sealed class ExpenseAdviceOptions
{
    /// <summary>Configuration section name (<c>ExpenseAdvice</c>).</summary>
    public const string SectionName = "ExpenseAdvice";

    /// <summary>Default VGA price (NVIDIA RTX 4060-class, market ballpark).</summary>
    public long PcVga { get; set; } = 3_500_000;

    /// <summary>Default CPU price (mid-range Ryzen/Core, market ballpark).</summary>
    public long PcCpu { get; set; } = 2_800_000;

    /// <summary>Default motherboard price (B650/B760-class).</summary>
    public long PcMotherboard { get; set; } = 1_500_000;

    /// <summary>Default SSD price (1 TB NVMe).</summary>
    public long PcSsd { get; set; } = 900_000;
}
