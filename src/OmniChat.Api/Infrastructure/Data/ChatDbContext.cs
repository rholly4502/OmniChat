using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// EF Core context for chat history. Kept deliberately provider-agnostic: no SQLite
/// specific API is used here, so switching to PostgreSQL is a one-line registration
/// change (<c>UseNpgsql</c>) plus a fresh migration set.
/// </summary>
public class ChatDbContext(DbContextOptions<ChatDbContext> options) : DbContext(options)
{
    public DbSet<Conversation> Conversations => Set<Conversation>();

    public DbSet<Message> Messages => Set<Message>();

    /// <summary>Import ledger rows for the Pengeluaran tab (read-only today).</summary>
    public DbSet<Expense> Expenses => Set<Expense>();

    /// <summary>Monthly budget/saving targets for the Pengeluaran tab.</summary>
    public DbSet<ExpenseTarget> ExpenseTargets => Set<ExpenseTarget>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // SQLite has no native DateTimeOffset type and rejects it in ORDER BY, which is
        // exactly what the sidebar does (newest first) and what message replay does
        // (chronological). Storing UTC ticks as INTEGER makes both sortable and keeps the
        // (UserId, UpdatedAt) index usable. Swap this converter for native timestamptz
        // when the provider becomes PostgreSQL.
        var timestamp = new ValueConverter<DateTimeOffset, long>(
            value => value.UtcTicks,
            ticks => new DateTimeOffset(ticks, TimeSpan.Zero));

        var conversation = modelBuilder.Entity<Conversation>();
        conversation.ToTable("Conversations");
        conversation.HasKey(c => c.Id);
        conversation.Property(c => c.Title).IsRequired().HasMaxLength(200);
        conversation.Property(c => c.Mode).IsRequired().HasMaxLength(16);
        conversation.Property(c => c.Model).IsRequired().HasMaxLength(100);
        conversation.Property(c => c.UserId).IsRequired().HasMaxLength(128);
        conversation.Property(c => c.CreatedAt).HasConversion(timestamp);
        conversation.Property(c => c.UpdatedAt).HasConversion(timestamp);
        conversation.Property(c => c.IsPinned);
        // Sidebar listing is "this user's conversations, newest first" — that exact
        // shape, so the index covers the filter and the sort together.
        conversation.HasIndex(c => new { c.UserId, c.UpdatedAt });

        var message = modelBuilder.Entity<Message>();
        message.ToTable("Messages");
        message.HasKey(m => m.Id);
        message.Property(m => m.Role).IsRequired().HasMaxLength(16);
        message.Property(m => m.Content).IsRequired().HasMaxLength(32_000);
        message.Property(m => m.CreatedAt).HasConversion(timestamp);
        message.HasIndex(m => new { m.ConversationId, m.CreatedAt });
        message
            .HasOne(m => m.Conversation)
            .WithMany(c => c.Messages)
            .HasForeignKey(m => m.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);

        // Pengeluaran: ordered list for a month (newest first) plus a dedup index on the
        // ledger's SourceId so re-running the importer skips rows it already inserted.
        var expense = modelBuilder.Entity<Expense>();
        expense.ToTable("Expenses");
        expense.HasKey(e => e.Id);
        expense.Property(e => e.Tanggal);
        expense.Property(e => e.Waktu).IsRequired().HasMaxLength(8);
        expense.Property(e => e.Kategori).IsRequired().HasMaxLength(32);
        expense.Property(e => e.Keterangan).IsRequired().HasMaxLength(500);
        expense.Property(e => e.Nominal);
        expense.HasIndex(e => e.SourceId);
        expense.HasIndex(e => new { e.Tanggal, e.Id });

        var expenseTarget = modelBuilder.Entity<ExpenseTarget>();
        expenseTarget.ToTable("ExpenseTargets");
        expenseTarget.HasKey(et => et.Id);
        expenseTarget.Property(et => et.Month).IsRequired().HasMaxLength(7);
        expenseTarget.Property(et => et.TargetNabung);
        expenseTarget.Property(et => et.Anggaran);
        expenseTarget.Property(et => et.Catatan).HasMaxLength(500);
        expenseTarget.HasIndex(et => et.Month).IsUnique();
    }
}
