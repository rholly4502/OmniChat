using System.Globalization;
using System.Text;
using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Minimal, dependency-free PDF writer for the monthly expense report. Emits a
/// single-page A4 PDF using the base-14 Helvetica font (no embedding), so the
/// bytes are fully deterministic and trivially unit-testable without any image
/// or font assets.
/// </summary>
public static class ExpensePdfReport
{
    private const int PageWidth = 595;   // A4 portrait, points
    private const int PageHeight = 842;
    private const int Margin = 40;
    private const int FontSize = 9;
    private const int LineHeight = 14;

    public static byte[] Build(string month, IReadOnlyList<Expense> rows, ExpenseBudgetSummary? budget = null)
    {
        var content = BuildContent(month, rows, budget);
        var contentBytes = Encoding.ASCII.GetBytes(content);

        var objects = new List<string>
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                + "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            $"<< /Length {contentBytes.Length} >>\nstream\n{content}endstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        };

        var sb = new StringBuilder();
        sb.Append("%PDF-1.4\n");

        var offsets = new long[objects.Count];
        long offset = Encoding.ASCII.GetByteCount("%PDF-1.4\n");
        for (var i = 0; i < objects.Count; i++)
        {
            offsets[i] = offset;
            var obj = $"{i + 1} 0 obj\n{objects[i]}\nendobj\n";
            sb.Append(obj);
            offset += Encoding.ASCII.GetByteCount(obj);
        }

        var xrefStart = offset;
        sb.Append(FormattableString.Invariant($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n"));
        foreach (var off in offsets)
        {
            sb.Append(FormattableString.Invariant($"{off:D10} 00000 n \n"));
        }
        sb.Append(FormattableString.Invariant($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefStart}\n%%EOF\n"));

        return Encoding.ASCII.GetBytes(sb.ToString());
    }

    private static string BuildContent(string month, IReadOnlyList<Expense> rows, ExpenseBudgetSummary? budget)
    {
        var sb = new StringBuilder();
        var y = PageHeight - 42;

        // Title.
        sb.Append(Text(50, y, 13, $"Laporan Pengeluaran {month}"));
        y -= 22;

        // Budget/savings digest (optional). Printed before the table so a printed
        // report ties the transactions to the month's budget and the PC-goal fund.
        if (budget is not null)
        {
            sb.Append(Text(50, y, 10, "Ringkasan bulan"));
            y -= 16;

            if (budget.Anggaran is not null)
            {
                sb.Append(Text(50, y, FontSize, $"Anggaran: {budget.Anggaran:N0}"));
                sb.Append(Text(300, y, FontSize, $"Sisa anggaran: {budget.SisaAnggaran:N0}"));
                y -= LineHeight;
            }

            if (budget.TargetNabung is not null)
            {
                sb.Append(Text(50, y, FontSize, $"Target nabung: {budget.TargetNabung:N0}"));
                sb.Append(Text(300, y, FontSize, $"Ditabung bulan ini: {budget.Ditabung:N0}"));
                y -= LineHeight;
            }

            sb.Append(Text(50, y, FontSize, $"Dana PC terkumpul: {budget.DanaNabungKumulatif:N0}"));
            y -= 20;
        }

        // Column headers (bold via larger size is skipped; base font only).
        sb.Append(Text(50, y, FontSize, "Tanggal"));
        sb.Append(Text(Margin + 95, y, FontSize, "Waktu"));
        sb.Append(Text(Margin + 155, y, FontSize, "Kategori"));
        sb.Append(Text(Margin + 250, y, FontSize, "Keterangan"));
        sb.Append(Text(490, y, FontSize, "Nominal"));
        y -= LineHeight + 6;

        long total = 0;
        foreach (var e in rows)
        {
            sb.Append(Text(50, y, FontSize, e.Tanggal.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));
            sb.Append(Text(Margin + 95, y, FontSize, Escape(e.Waktu)));
            sb.Append(Text(Margin + 155, y, FontSize, Escape(e.Kategori)));
            sb.Append(Text(Margin + 250, y, FontSize, Escape(Truncate(e.Keterangan, 38))));
            sb.Append(Text(490, y, FontSize, e.Nominal.ToString("N0", CultureInfo.InvariantCulture)));
            total += e.Nominal;
            y -= LineHeight;

            if (y < Margin + 40)
            {
                break; // keep single page; remaining rows truncated (rare for a month)
            }
        }

        y -= 10;
        sb.Append(Text(50, y, 11, FormattableString.Invariant($"Total : {total.ToString("N0", CultureInfo.InvariantCulture)}")));

        return sb.ToString();
    }

    private static string Text(float x, int y, int size, string s) =>
        $"BT /F1 {size} Tf 1 0 0 1 {x:0.0} {y} Tm ({s}) Tj ET\n";

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..max] + "…";

    /// <summary>Escapes PDF string literals and drops bytes outside printable ASCII.</summary>
    private static string Escape(string value)
    {
        var sb = new StringBuilder(value.Length);
        foreach (var c in value)
        {
            if (c == '\\') sb.Append("\\\\");
            else if (c == '(') sb.Append("\\(");
            else if (c == ')') sb.Append("\\)");
            else if (c is >= ' ' and <= '~') sb.Append(c);
            else if (c is '\r' or '\n') sb.Append(' ');
            else sb.Append('?');
        }
        return sb.ToString();
    }
}
