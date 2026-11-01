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
public sealed class ExpensesController(IExpenseRepository repository, IExpenseAdviceService advice) : ControllerBase
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

    /// <summary>Daily Analisa &amp; Saran for a date: day spend vs daily budget, tips when
    /// over budget, category trend, end-of-month projection, and the PC-goal estimate.</summary>
    /// <param name="date">Date <c>YYYY-MM-DD</c> (WIB). Defaults to today.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">The advice report.</response>
    /// <response code="400">Invalid date.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpGet("advice")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Advice(
        [FromQuery] string? date, CancellationToken cancellationToken = default)
    {
        var day = string.IsNullOrWhiteSpace(date)
            ? DateOnly.FromDateTime(DateTime.UtcNow)
            : (DateOnly.TryParseExact(date, "yyyy-MM-dd", out var parsed) ? parsed : (DateOnly?)null);

        if (day is null)
        {
            return InvalidDate(date);
        }

        var result = await advice.BuildAsync(day.Value, cancellationToken);
        return Ok(result);
    }

    private ObjectResult InvalidDate(string? date) => new(new ProblemDetails
    {
        Title = "Validation Failed",
        Status = StatusCodes.Status400BadRequest,
        Detail = $"'{date ?? ""}' is not a valid YYYY-MM-DD date.",
        Instance = HttpContext.Request.Path,
    })
    {
        StatusCode = StatusCodes.Status400BadRequest,
        ContentTypes = { ProblemDetailsResponse.ContentType },
    };

    /// <summary>The standard ledger categories (source of truth for category validation).</summary>
    private static readonly string[] StandardCategories =
    [
        "Makan", "Transport", "Belanja", "Tagihan", "Kesehatan", "Hiburan", "Nabung", "Lain",
    ];

    /// <summary>Creates a new expense row from the web UI (operator only, key required).</summary>
    /// <param name="request">The new expense fields.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="201">The created expense row.</response>
    /// <response code="400">Validation failed.</response>
    /// <response code="401">Missing or invalid API key.</response>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Create([FromBody] ExpenseWriteRequest request, CancellationToken cancellationToken)
    {
        var problem = Validate(request);
        if (problem is not null)
        {
            return problem;
        }

        var expense = new Expense
        {
            Tanggal = DateOnly.ParseExact(request.Tanggal, "yyyy-MM-dd"),
            Waktu = string.IsNullOrWhiteSpace(request.Waktu) ? string.Empty : request.Waktu.Trim(),
            Kategori = request.Kategori.Trim(),
            Keterangan = request.Keterangan.Trim(),
            Nominal = request.Nominal,
            // Web-added rows get a distinct SourceId prefix so the ledger importer's
            // self-healing dedup can never mistake them for a ledger or income row.
            SourceId = "web-" + Guid.NewGuid().ToString("N")[..8],
        };

        var created = await repository.AddAsync(expense, cancellationToken);
        return CreatedAtAction(nameof(List), new { month = expense.Tanggal.ToString("yyyy-MM") }, ExpenseDto.From(created));
    }

    /// <summary>Updates an existing expense row from the web UI (operator only, key required).</summary>
    /// <param name="id">The row id to update.</param>
    /// <param name="request">The replacement expense fields.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="200">The updated expense row.</response>
    /// <response code="400">Validation failed.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No such expense row.</response>
    [HttpPut("{id:long}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(long id, [FromBody] ExpenseWriteRequest request, CancellationToken cancellationToken)
    {
        var problem = Validate(request);
        if (problem is not null)
        {
            return problem;
        }

        var expense = new Expense
        {
            Id = id,
            Tanggal = DateOnly.ParseExact(request.Tanggal, "yyyy-MM-dd"),
            Waktu = string.IsNullOrWhiteSpace(request.Waktu) ? string.Empty : request.Waktu.Trim(),
            Kategori = request.Kategori.Trim(),
            Keterangan = request.Keterangan.Trim(),
            Nominal = request.Nominal,
        };

        var ok = await repository.UpdateAsync(expense, cancellationToken);
        if (!ok)
        {
            return NotFound(new ProblemDetails
            {
                Title = "Not Found",
                Status = StatusCodes.Status404NotFound,
                Detail = $"No expense row with id {id} exists.",
                Instance = HttpContext.Request.Path,
            });
        }

        var updated = await repository.GetByIdAsync(id, cancellationToken);
        return Ok(ExpenseDto.From(updated!));
    }

    /// <summary>Deletes an expense row from the web UI (operator only, key required).</summary>
    /// <param name="id">The row id to delete.</param>
    /// <param name="cancellationToken">Cancellation token for client disconnect.</param>
    /// <response code="204">Deleted.</response>
    /// <response code="401">Missing or invalid API key.</response>
    /// <response code="404">No such expense row.</response>
    [HttpDelete("{id:long}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(long id, CancellationToken cancellationToken)
    {
        var ok = await repository.DeleteAsync(id, cancellationToken);
        if (!ok)
        {
            return NotFound(new ProblemDetails
            {
                Title = "Not Found",
                Status = StatusCodes.Status404NotFound,
                Detail = $"No expense row with id {id} exists.",
                Instance = HttpContext.Request.Path,
            });
        }

        return NoContent();
    }

    /// <summary>Validates a write request, returning a 400 ProblemDetails or null when valid.</summary>
    private ObjectResult? Validate(ExpenseWriteRequest request)
    {
        if (!DateOnly.TryParseExact(request.Tanggal, "yyyy-MM-dd", out _))
        {
            return new ObjectResult(new ProblemDetails
            {
                Title = "Validation Failed",
                Status = StatusCodes.Status400BadRequest,
                Detail = "'tanggal' must be a valid YYYY-MM-DD date.",
                Instance = HttpContext.Request.Path,
            })
            {
                StatusCode = StatusCodes.Status400BadRequest,
                ContentTypes = { ProblemDetailsResponse.ContentType },
            };
        }

        if (!StandardCategories.Contains(request.Kategori.Trim()))
        {
            return new ObjectResult(new ProblemDetails
            {
                Title = "Validation Failed",
                Status = StatusCodes.Status400BadRequest,
                Detail = $"'kategori' must be one of: {string.Join(", ", StandardCategories)}.",
                Instance = HttpContext.Request.Path,
            })
            {
                StatusCode = StatusCodes.Status400BadRequest,
                ContentTypes = { ProblemDetailsResponse.ContentType },
            };
        }

        if (request.Nominal <= 0)
        {
            return new ObjectResult(new ProblemDetails
            {
                Title = "Validation Failed",
                Status = StatusCodes.Status400BadRequest,
                Detail = "'nominal' must be a positive amount.",
                Instance = HttpContext.Request.Path,
            })
            {
                StatusCode = StatusCodes.Status400BadRequest,
                ContentTypes = { ProblemDetailsResponse.ContentType },
            };
        }

        if (request.Keterangan.Length > 500)
        {
            return new ObjectResult(new ProblemDetails
            {
                Title = "Validation Failed",
                Status = StatusCodes.Status400BadRequest,
                Detail = "'keterangan' must be 500 characters or fewer.",
                Instance = HttpContext.Request.Path,
            })
            {
                StatusCode = StatusCodes.Status400BadRequest,
                ContentTypes = { ProblemDetailsResponse.ContentType },
            };
        }

        return null;
    }

    /// <summary>Request shape for creating or updating one expense row.</summary>
    public sealed record ExpenseWriteRequest(string Tanggal, string? Waktu, string Kategori, string Keterangan, long Nominal);

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
