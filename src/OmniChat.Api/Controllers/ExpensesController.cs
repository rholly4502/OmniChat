using Microsoft.AspNetCore.Mvc;
using System.Text;
using OmniChat.Api.Infrastructure;
using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Data;
using OmniChat.Infrastructure.Services;
using OmniChat.Domain.Entities;

namespace OmniChat.Api.Controllers;

/// <summary>
/// Read-only view over the Pengeluaran ledger. The ledger (repo private) is the source of
/// truth; this API serves what the importer stored. These routes are NOT guest-exempt, so
/// an anonymous caller gets 401 — expenses are private to the operator.
/// </summary>
[ApiController]
[Route("api/expenses")]
[Tags("Expenses")]
public sealed class ExpensesController(IExpenseRepository repository) : ControllerBase
{
    /// <summary>Paged transaction list for a month, newest first.</summary>
    /// <param name="month">Month key <c>YYYY-MM</c>, e.g. <c>2026-10</c>.</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Rows per page (1–200).</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Paged transactions.</response>
    /// <response code="400">Invalid month key.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> List(
        [FromQuery] string month,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = ExpenseRepository.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        if (!TryMonth(month, out _))
        {
            return InvalidMonth(month);
        }

        var items = await repository.ListAsync(month, page, pageSize, cancellationToken);
        var total = await repository.CountAsync(month, cancellationToken);

        return Ok(new
        {
            month,
            page,
            pageSize,
            total,
            items = items.Select(ExpenseDto.From).ToList(),
        });
    }

    /// <summary>Monthly totals plus the month's budget/saving target.</summary>
    /// <param name="month">Month key <c>YYYY-MM</c>.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Totals (total, per-category, target, budget).</response>
    /// <response code="400">Invalid month key.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("summary")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Summary(
        [FromQuery] string month, CancellationToken cancellationToken = default)
    {
        if (!TryMonth(month, out _))
        {
            return InvalidMonth(month);
        }

        var (total, perKategori) = await repository.GetTotalsAsync(month, cancellationToken);
        var target = await repository.GetTargetAsync(month, cancellationToken);

        return Ok(new
        {
            month,
            total,
            perKategori,
            targetNabung = target?.TargetNabung,
            anggaran = target?.Anggaran,
            sisaAnggaran = target is null ? (long?)null : target.Anggaran - total,
            catatan = target?.Catatan,
        });
    }

    /// <summary>Raw budget/saving target for a month.</summary>
    /// <param name="month">Month key <c>YYYY-MM</c>.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">The month's target.</response>
    /// <response code="400">Invalid month key.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No target set for this month.</response>
    [HttpGet("target")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Target(
        [FromQuery] string month, CancellationToken cancellationToken = default)
    {
        if (!TryMonth(month, out _))
        {
            return InvalidMonth(month);
        }

        var target = await repository.GetTargetAsync(month, cancellationToken);
        if (target is null)
        {
            return NotFound(new ProblemDetails
            {
                Title = "Not Found",
                Status = StatusCodes.Status404NotFound,
                Detail = $"No expense target is set for {month}.",
                Instance = HttpContext.Request.Path,
            });
        }

        return Ok(new { month, targetNabung = target.TargetNabung, anggaran = target.Anggaran, catatan = target.Catatan });
    }

    private static bool TryMonth(string month, out DateOnly parsed) =>
        DateOnly.TryParseExact(month, "yyyy-MM", out parsed);

    private ObjectResult InvalidMonth(string month) => new(new ProblemDetails
    {
        Title = "Validation Failed",
        Status = StatusCodes.Status400BadRequest,
        Detail = $"'{month}' is not a valid YYYY-MM month key.",
        Instance = HttpContext.Request.Path,
    })
    {
        StatusCode = StatusCodes.Status400BadRequest,
        ContentTypes = { ProblemDetailsResponse.ContentType },
    };

    /// <summary>Monthly report as CSV (RFC 4180) for spreadsheet/archival use.</summary>
    /// <param name="month">Month key <c>YYYY-MM</c>.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">CSV file download.</response>
    /// <response code="400">Invalid month key.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Export(
        [FromQuery] string month, CancellationToken cancellationToken = default)
    {
        if (!TryMonth(month, out _))
        {
            return InvalidMonth(month);
        }

        var rows = await repository.ListAllForMonthAsync(month, cancellationToken);

        var sb = new StringBuilder();
        sb.AppendLine("tanggal,waktu,kategori,keterangan,nominal");
        foreach (var e in rows)
        {
            sb.Append(e.Tanggal.ToString("yyyy-MM-dd")).Append(',');
            sb.Append(Csv(e.Waktu)).Append(',');
            sb.Append(Csv(e.Kategori)).Append(',');
            sb.Append(Csv(e.Keterangan)).Append(',');
            sb.Append(e.Nominal).Append('\n');
        }

        // UTF-8 BOM so Excel renders the CSV as UTF-8 rather than ANSI.
        var bytes = Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(sb.ToString()))
            .ToArray();

        return File(bytes, "text/csv; charset=utf-8", $"expenses-{month}.csv");
    }

    /// <summary>Monthly report as PDF (single-page A4) for archival/print use.</summary>
    /// <param name="month">Month key <c>YYYY-MM</c>.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">PDF file download.</response>
    /// <response code="400">Invalid month key.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("export/pdf")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ExportPdf(
        [FromQuery] string month, CancellationToken cancellationToken = default)
    {
        if (!TryMonth(month, out _))
        {
            return InvalidMonth(month);
        }

        var rows = await repository.ListAllForMonthAsync(month, cancellationToken);
        var bytes = ExpensePdfReport.Build(month, rows);
        return File(bytes, "application/pdf", $"expenses-{month}.pdf");
    }

    /// <summary>Monthly spend totals over the last N months (for the trend chart).</summary>
    /// <param name="months">Number of trailing months to return (1–24, default 6).</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">Chronological trend points (zero-filled).</response>
    /// <response code="400">Invalid months count.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("trend")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Trend(
        [FromQuery] int months = 6, CancellationToken cancellationToken = default)
    {
        if (months is < 1 or > 24)
        {
            return new ObjectResult(new ProblemDetails
            {
                Title = "Validation Failed",
                Status = StatusCodes.Status400BadRequest,
                Detail = "'months' must be between 1 and 24.",
                Instance = HttpContext.Request.Path,
            })
            {
                StatusCode = StatusCodes.Status400BadRequest,
                ContentTypes = { ProblemDetailsResponse.ContentType },
            };
        }

        var endMonth = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM");
        var points = await repository.GetMonthlyTrendAsync(endMonth, months, cancellationToken);

        return Ok(new
        {
            months,
            points = points.Select(p => new { p.Month, p.Total }).ToList(),
        });
    }

    /// <summary>Quotes a CSV field per RFC 4180 when it contains a delimiter, quote, or newline.</summary>
        private static string Csv(string value)
    {
        if (value.Contains('"') || value.Contains(',') || value.Contains('\n') || value.Contains('\r'))
        {
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    /// <summary>API shape for one expense row.</summary>
    private sealed class ExpenseDto
    {
        public required long Id { get; init; }
        public required DateOnly Tanggal { get; init; }
        public required string Waktu { get; init; }
        public required string Kategori { get; init; }
        public required string Keterangan { get; init; }
        public required long Nominal { get; init; }

        public static ExpenseDto From(Expense e) => new()
        {
            Id = e.Id,
            Tanggal = e.Tanggal,
            Waktu = e.Waktu,
            Kategori = e.Kategori,
            Keterangan = e.Keterangan,
            Nominal = e.Nominal,
        };
    }
}
