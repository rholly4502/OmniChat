using System.Text;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Minimal, dependency-free PDF writer for the curated promo/event list. Emits
/// one or more A4 portrait pages using the base-14 Helvetica font (no embedding),
/// deterministically and unit-testably — same approach as <see cref="JobsPdfReport"/>.
/// A promo is labelled by its end date relative to the WIB "today" passed in:
/// no end date → "Tanpa batas", dated in the past → "Kedaluwarsa", else active.
/// </summary>
public static class EventsPdfReport
{
    private const int PageWidth = 595;   // A4 portrait, points
    private const int PageHeight = 842;
    private const int Margin = 40;
    private const int FontSize = 9;
    private const int LineHeight = 14;
    private const int RowsPerPage = 46;

    private static string StatusLabel(PromoEvent e, DateOnly today)
    {
        if (e.BerlakuSampai is string s && DateOnly.TryParseExact(s.Trim(), "yyyy-MM-dd", out var end))
        {
            return end < today ? "Kedaluwarsa" : "Berlaku";
        }
        return "Tanpa batas";
    }

    /// <summary>Builds a multi-page PDF listing the event rows.</summary>
    public static byte[] Build(IReadOnlyList<PromoEvent> rows, DateOnly today)
    {
        var pages = BuildPages(rows, today);
        return Assemble(pages);
    }

    private static List<string> BuildPages(IReadOnlyList<PromoEvent> rows, DateOnly today)
    {
        var pages = new List<string>();
        var sb = new StringBuilder();
        var y = PageHeight - 42;

        sb.Append(Text(50, y, 13, "Ringkasan Event & Promo"));
        y -= 22;

        void AddHeader()
        {
            sb.Append(Text(50, y, FontSize, "Judul"));
            sb.Append(Text(180, y, FontSize, "Aplikasi"));
            sb.Append(Text(265, y, FontSize, "Benefit"));
            sb.Append(Text(375, y, FontSize, "Berlaku s/d"));
            sb.Append(Text(450, y, FontSize, "Status"));
            sb.Append(Text(520, y, FontSize, "Dipakai"));
            y -= LineHeight + 6;
        }

        AddHeader();

        foreach (var e in rows)
        {
            if (y < Margin + 20)
            {
                pages.Add(sb.ToString());
                sb.Clear();
                y = PageHeight - 42;
                AddHeader();
            }

            sb.Append(Text(50, y, FontSize, Truncate(e.Judul, 22)));
            sb.Append(Text(180, y, FontSize, Truncate(e.Aplikasi, 12)));
            sb.Append(Text(265, y, FontSize, Truncate(e.Benefit ?? string.Empty, 15)));
            sb.Append(Text(375, y, FontSize, Truncate(e.BerlakuSampai ?? string.Empty, 9)));
            sb.Append(Text(450, y, FontSize, StatusLabel(e, today)));
            sb.Append(Text(520, y, FontSize, e.Dipakai ? "Ya" : string.Empty));
            y -= LineHeight;
        }

        pages.Add(sb.ToString());
        return pages;
    }

    private static byte[] Assemble(List<string> pageContents)
    {
        var objects = new List<string>
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
        };

        var kids = new StringBuilder();
        for (var p = 0; p < pageContents.Count; p++)
        {
            if (p > 0) kids.Append(' ');
            kids.Append($"{3 + p * 2} 0 R");
        }
        objects.Add($"<< /Type /Pages /Kids [{kids}] /Count {pageContents.Count} >>");

        for (var p = 0; p < pageContents.Count; p++)
        {
            var contentObj = 3 + p * 2 + 1;
            objects.Add($"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                + "/Resources << /Font << /F1 5 0 R >> >> /Contents " + contentObj + " 0 R >>");
            var cb = Encoding.ASCII.GetBytes(pageContents[p]);
            objects.Add($"<< /Length {cb.Length} >>\nstream\n{pageContents[p]}endstream");
        }

        objects.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

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
        sb.Append($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n");
        foreach (var off in offsets)
        {
            sb.Append($"{off:D10} 00000 n \n");
        }

        sb.Append($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefStart}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(sb.ToString());
    }

    private static string Text(float x, int y, int size, string s) =>
        $"BT /F1 {size} Tf 1 0 0 1 {x:0.0} {y} Tm ({Escape(s)}) Tj ET\n";

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
