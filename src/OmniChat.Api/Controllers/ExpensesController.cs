using Microsoft.AspNetCore.Mvc;
using OmniChat.Api.Infrastructure;
using OmniChat.Application.Interfaces;
using OmniChat.Infrastructure.Data;
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
