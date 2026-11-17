using System.Text;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Services;

/// <summary>
/// Minimal, dependency-free PDF writer for the curated job pipeline. Emits one
/// or more A4 portrait pages using the base-14 Helvetica font (no embedding), so
/// the bytes are deterministic and trivially unit-testable. Paginates when the
/// list exceeds a single page instead of silently truncating the tail.
/// </summary>
public static class JobsPdfReport
{
    private const int PageWidth = 595;   // A4 portrait, points
    private const int PageHeight = 842;
    private const int Margin = 40;
    private const int FontSize = 9;
    private const int LineHeight = 14;
    private const int RowsPerPage = 46;

    private static readonly Dictionary<string, string> StatusLabels = new()
    {
        ["new"] = "Baru",
        ["applied"] = "Dilamar",
        ["interview"] = "Interview",
        ["offer"] = "Tawaran",
        ["closed"] = "Tutup",
    };

    /// <summary>Builds a multi-page PDF listing the pipeline rows.</summary>
    public static byte[] Build(IReadOnlyList<Opportunity> rows)
    {
        var pages = BuildPages(rows);
        return Assemble(pages);
    }

    private static List<string> BuildPages(IReadOnlyList<Opportunity> rows)
    {
        var pages = new List<string>();
        var sb = new StringBuilder();
        var y = PageHeight - 42;

        sb.Append(Text(50, y, 13, "Ringkasan Pipeline Lowongan"));
        y -= 22;

        void AddHeader()
        {
            sb.Append(Text(50, y, FontSize, "Judul"));
            sb.Append(Text(160, y, FontSize, "Perusahaan"));
            sb.Append(Text(275, y, FontSize, "Lokasi"));
            sb.Append(Text(365, y, FontSize, "Tipe"));
            sb.Append(Text(435, y, FontSize, "Skor"));
            sb.Append(Text(470, y, FontSize, "Status"));
            sb.Append(Text(525, y, FontSize, "FollowUp"));
            y -= LineHeight + 6;
        }

        AddHeader();

        foreach (var o in rows)
        {
            if (y < Margin + 20)
            {
                pages.Add(sb.ToString());
                sb.Clear();
                y = PageHeight - 42;
                AddHeader();
            }

            sb.Append(Text(50, y, FontSize, Truncate(o.Judul, 18)));
            sb.Append(Text(160, y, FontSize, Truncate(o.Perusahaan, 20)));
            sb.Append(Text(275, y, FontSize, Truncate(o.Lokasi, 14)));
            sb.Append(Text(365, y, FontSize, Truncate(o.Tipe, 10)));
            sb.Append(Text(435, y, FontSize, o.Skor?.ToString() ?? ""));
            sb.Append(Text(470, y, FontSize, Label(o.Status)));
            sb.Append(Text(525, y, FontSize, o.FollowUpTanggal?.ToString("yyyy-MM-dd") ?? ""));
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

    private static string Label(string status) =>
        StatusLabels.TryGetValue(status, out var l) ? l : status;

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
