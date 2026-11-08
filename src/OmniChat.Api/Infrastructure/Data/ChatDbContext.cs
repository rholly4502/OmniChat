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

    /// <summary>Ledger SourceIds deleted via the web UI, so the importer never re-inserts them.</summary>
    public DbSet<ExpenseDeletion> ExpenseDeletions => Set<ExpenseDeletion>();

    /// <summary>Income/pemasukan ledger rows (separate from expenses, never counted as spend).</summary>
    public DbSet<Income> Incomes => Set<Income>();

    /// <summary>Curated job opportunities (read-only list from the agent scan).</summary>
    public DbSet<Opportunity> Opportunities => Set<Opportunity>();

    /// <summary>Curated promo/event entries (read-only list from the agent scan).</summary>
    public DbSet<PromoEvent> PromoEvents => Set<PromoEvent>();

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
        conversation.Property(c => c.PromptTokens).HasDefaultValue(0);
        conversation.Property(c => c.CompletionTokens).HasDefaultValue(0);
        // Sidebar listing is "this user's conversations, newest first" — that exact
        // shape, so the index covers the filter and the sort together.
        conversation.HasIndex(c => new { c.UserId, c.UpdatedAt });

        var message = modelBuilder.Entity<Message>();
        message.ToTable("Messages");
        message.HasKey(m => m.Id);
        message.Property(m => m.Role).IsRequired().HasMaxLength(16);
        message.Property(m => m.Content).IsRequired().HasMaxLength(32_000);
        // Nullable enum stored as TEXT ("Up"/"Down"/NULL) for readability; a plain
        // integer would be opaque in a SQLite dump. Null = unrated.
        message.Property(m => m.Feedback).HasConversion<string>();
        message.Property(m => m.PromptTokens).HasDefaultValue(0);
        message.Property(m => m.CompletionTokens).HasDefaultValue(0);
        message.Property(m => m.Model).HasMaxLength(100);
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

        var expenseDeletion = modelBuilder.Entity<ExpenseDeletion>();
        expenseDeletion.ToTable("ExpenseDeletions");
        expenseDeletion.HasKey(d => d.Id);
        expenseDeletion.Property(d => d.SourceId).IsRequired().HasMaxLength(64);
        // One tombstone per ledger row; same key as the importer's dedup index.
        expenseDeletion.HasIndex(d => d.SourceId).IsUnique();

        var income = modelBuilder.Entity<Income>();
        income.ToTable("Incomes");
        income.HasKey(i => i.Id);
        income.Property(i => i.Tanggal);
        income.Property(i => i.Keterangan).IsRequired().HasMaxLength(500);
        income.Property(i => i.Nominal);
        income.HasIndex(i => i.SourceId);

        var opp = modelBuilder.Entity<Opportunity>();
        opp.ToTable("Opportunities");
        opp.HasKey(o => o.Id);
        opp.Property(o => o.Judul).IsRequired().HasMaxLength(200);
        opp.Property(o => o.Perusahaan).IsRequired().HasMaxLength(200);
        opp.Property(o => o.Lokasi).IsRequired().HasMaxLength(100);
        opp.Property(o => o.Tipe).IsRequired().HasMaxLength(32);
        opp.Property(o => o.Gaji).HasMaxLength(100);
        opp.Property(o => o.Link).HasMaxLength(1000);
        opp.Property(o => o.Catatan).HasMaxLength(1000);
        opp.Property(o => o.Status).IsRequired().HasMaxLength(20);
        opp.Property(o => o.Ditemukan);
        opp.HasIndex(o => o.SourceId);
        opp.HasIndex(o => o.Status);

        var ev = modelBuilder.Entity<PromoEvent>();
        ev.ToTable("PromoEvents");
        ev.HasKey(e => e.Id);
        ev.Property(e => e.Aplikasi).IsRequired().HasMaxLength(64);
        ev.Property(e => e.Judul).IsRequired().HasMaxLength(500);
        ev.Property(e => e.Benefit).HasMaxLength(500);
        ev.Property(e => e.Syarat).HasMaxLength(2000);
        ev.Property(e => e.Link).HasMaxLength(1000);
        ev.Property(e => e.BerlakuSampai).HasMaxLength(64);
        ev.Property(e => e.Ditemukan);
        ev.HasIndex(e => e.SourceId);
        ev.HasIndex(e => e.Aplikasi);
    }
}
