using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;
using OmniChat.Domain.Models;

namespace OmniChat.Tests.Data;

/// <summary>
/// Tests for the EF Core chat-history repository, run against a real SQLite database held
/// in memory. A mocking-of-DbContext approach would assert that LINQ was written, not that
/// the query returns what the sidebar needs — and ownership scoping is exactly the kind of
/// thing that looks right in a mock and leaks in production.
/// </summary>
public sealed class ChatHistoryRepositoryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ChatDbContext _db;
    private readonly ChatHistoryRepository _repository;

    public ChatHistoryRepositoryTests()
    {
        // A named in-memory database would be destroyed when the context closes, so the
        // connection stays open for the lifetime of the test.
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ChatDbContext(options);
        _db.Database.EnsureCreated();
        _repository = new ChatHistoryRepository(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static Conversation NewConversation(string userId = "admin") => new()
    {
        Title = "Percakapan baru",
        Mode = "agent",
        Model = "hermes-default",
        UserId = userId,
    };

    [Fact]
    public async Task CreateConversation_stamps_timestamps_and_returns_generated_id()
    {
        var created = await _repository.CreateConversationAsync(NewConversation());

        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.Equal(created.CreatedAt, created.UpdatedAt);
        Assert.True(created.CreatedAt > DateTimeOffset.UtcNow.AddMinutes(-1));
    }

    [Fact]
    public async Task GetConversation_returns_null_when_owned_by_another_user()
    {
        var created = await _repository.CreateConversationAsync(NewConversation("admin"));

        // Scoping happens inside the repository: an id that exists but belongs to someone
        // else must read as "not found", never as a row the caller can inspect.
        var fetched = await _repository.GetConversationAsync(created.Id, "guest");

        Assert.Null(fetched);
    }

    [Fact]
    public async Task GetConversation_returns_messages_in_chronological_order()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(conversation.Id, "admin", new Message { Role = "user", Content = "pertama" });
        await _repository.AppendMessageAsync(conversation.Id, "admin", new Message { Role = "assistant", Content = "kedua" });

        var fetched = await _repository.GetConversationAsync(conversation.Id, "admin");

        Assert.NotNull(fetched);
        Assert.Equal(["pertama", "kedua"], fetched!.Messages.Select(m => m.Content));
    }

    [Fact]
    public async Task ListConversations_returns_newest_first_and_excludes_other_users()
    {
        var older = await _repository.CreateConversationAsync(NewConversation("admin"));
        var newer = await _repository.CreateConversationAsync(NewConversation("admin"));
        await _repository.CreateConversationAsync(NewConversation("guest"));

        // UpdatedAt, not CreatedAt, drives the order: a conversation replied to an hour ago
        // belongs at the top even if it was started last week.
        newer.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(5);
        await _db.SaveChangesAsync();

        var listed = await _repository.ListConversationsAsync("admin");

        Assert.Equal(2, listed.Count);
        Assert.Equal(newer.Id, listed[0].Id);
        Assert.Equal(older.Id, listed[1].Id);
    }

    [Fact]
    public async Task ListConversations_clamps_limit_into_the_allowed_range()
    {
        for (var i = 0; i < 3; i++)
        {
            await _repository.CreateConversationAsync(NewConversation());
        }

        var none = await _repository.ListConversationsAsync("admin", limit: 0);
        var huge = await _repository.ListConversationsAsync("admin", limit: int.MaxValue);

        Assert.Single(none);
        Assert.Equal(3, huge.Count);
    }

    [Fact]
    public async Task ListConversations_offset_paginates_newest_first()
    {
        for (var i = 0; i < 5; i++)
        {
            await _repository.CreateConversationAsync(NewConversation());
        }

        var page1 = await _repository.ListConversationsAsync("admin", limit: 2, offset: 0);
        var page2 = await _repository.ListConversationsAsync("admin", limit: 2, offset: 2);
        var page3 = await _repository.ListConversationsAsync("admin", limit: 2, offset: 4);

        Assert.Equal(2, page1.Count);
        Assert.Equal(2, page2.Count);
        Assert.Single(page3);

        // Pages are disjoint and, together, cover exactly the full set.
        var allIds = page1.Concat(page2).Concat(page3).Select(c => c.Id).ToHashSet();
        Assert.Equal(5, allIds.Count);
    }

    [Fact]
    public async Task ListConversations_negative_offset_behaves_as_zero()
    {
        for (var i = 0; i < 3; i++)
        {
            await _repository.CreateConversationAsync(NewConversation());
        }

        var negative = await _repository.ListConversationsAsync("admin", limit: 2, offset: -5);
        var zero = await _repository.ListConversationsAsync("admin", limit: 2, offset: 0);

        Assert.Equal(negative.Select(c => c.Id), zero.Select(c => c.Id));
    }

    [Fact]
    public async Task GetLatestMessagePreviews_returns_the_newest_message_per_conversation()
    {
        var first = await _repository.CreateConversationAsync(NewConversation());
        var second = await _repository.CreateConversationAsync(NewConversation());

        await _repository.AppendMessageAsync(first.Id, "admin", new Message { Role = "user", Content = "halo" });
        await _repository.AppendMessageAsync(first.Id, "admin", new Message { Role = "assistant", Content = "jawaban terbaru" });
        await _repository.AppendMessageAsync(second.Id, "admin", new Message { Role = "user", Content = "pertanyaan kedua" });

        var previews = await _repository.GetLatestMessagePreviewsAsync("admin", new[] { first.Id, second.Id });

        Assert.Equal("jawaban terbaru", previews[first.Id]);
        Assert.Equal("pertanyaan kedua", previews[second.Id]);
    }

    [Fact]
    public async Task GetLatestMessagePreviews_ignores_other_users_and_empty_input()
    {
        var mine = await _repository.CreateConversationAsync(NewConversation("admin"));
        var theirs = await _repository.CreateConversationAsync(NewConversation("guest"));
        await _repository.AppendMessageAsync(mine.Id, "admin", new Message { Role = "user", Content = "punya admin" });
        await _repository.AppendMessageAsync(theirs.Id, "guest", new Message { Role = "user", Content = "punya tamu" });

        var empty = await _repository.GetLatestMessagePreviewsAsync("admin", Array.Empty<Guid>());
        Assert.Empty(empty);

        // The guest conversation is outside the caller's ownership scope, so its id is
        // simply absent from the result rather than leaking another user's text.
        var previews = await _repository.GetLatestMessagePreviewsAsync("admin", new[] { mine.Id, theirs.Id });
        Assert.Single(previews);
        Assert.Equal("punya admin", previews[mine.Id]);
        Assert.False(previews.ContainsKey(theirs.Id));
    }

    [Fact]
    public async Task AppendMessage_advances_the_conversation_timestamp()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation());
        var before = conversation.UpdatedAt;

        await Task.Delay(10);
        await _repository.AppendMessageAsync(conversation.Id, "admin", new Message { Role = "user", Content = "halo" });

        var reloaded = await _repository.GetConversationAsync(conversation.Id, "admin");
        Assert.True(reloaded!.UpdatedAt > before);
    }

    [Fact]
    public async Task AppendMessage_rejects_a_conversation_owned_by_another_user()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation("admin"));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _repository.AppendMessageAsync(conversation.Id, "guest", new Message { Role = "user", Content = "halo" }));
    }

    [Fact]
    public async Task Rename_returns_false_for_an_unowned_conversation()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation("admin"));

        Assert.False(await _repository.RenameConversationAsync(conversation.Id, "guest", "dibajak"));
        Assert.True(await _repository.RenameConversationAsync(conversation.Id, "admin", "judul baru"));

        var reloaded = await _repository.GetConversationAsync(conversation.Id, "admin");
        Assert.Equal("judul baru", reloaded!.Title);
    }

    [Fact]
    public async Task Delete_removes_the_conversation_and_its_messages()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(conversation.Id, "admin", new Message { Role = "user", Content = "halo" });

        Assert.True(await _repository.DeleteConversationAsync(conversation.Id, "admin"));

        Assert.Null(await _repository.GetConversationAsync(conversation.Id, "admin"));
        // The cascade must be enforced by the database, not left orphaned in Messages.
        Assert.Equal(0, await _db.Messages.CountAsync());
    }

    [Fact]
    public async Task Delete_returns_false_for_an_unowned_conversation()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation("admin"));

        Assert.False(await _repository.DeleteConversationAsync(conversation.Id, "guest"));
        Assert.NotNull(await _repository.GetConversationAsync(conversation.Id, "admin"));
    }

    [Fact]
    public async Task SetMessageFeedback_records_up_down_and_clear_for_the_owner()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation());
        var message = await _repository.AppendMessageAsync(conversation.Id, "admin", new Message { Role = "assistant", Content = "jawaban" });

        Assert.True(await _repository.SetMessageFeedbackAsync(conversation.Id, message.Id, "admin", MessageFeedback.Up));
        var stored = await _repository.GetConversationAsync(conversation.Id, "admin");
        Assert.Equal(MessageFeedback.Up, stored!.Messages[0].Feedback);

        Assert.True(await _repository.SetMessageFeedbackAsync(conversation.Id, message.Id, "admin", MessageFeedback.Down));
        stored = await _repository.GetConversationAsync(conversation.Id, "admin");
        Assert.Equal(MessageFeedback.Down, stored!.Messages[0].Feedback);

        Assert.True(await _repository.SetMessageFeedbackAsync(conversation.Id, message.Id, "admin", null));
        stored = await _repository.GetConversationAsync(conversation.Id, "admin");
        Assert.Null(stored!.Messages[0].Feedback);
    }

    [Fact]
    public async Task SetMessageFeedback_returns_false_when_unowned_or_unknown()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation(userId: "guest-1"));
        var message = await _repository.AppendMessageAsync(conversation.Id, "guest-1", new Message { Role = "assistant", Content = "jawaban" });

        Assert.False(await _repository.SetMessageFeedbackAsync(conversation.Id, message.Id, "admin", MessageFeedback.Up));
        Assert.False(await _repository.SetMessageFeedbackAsync(conversation.Id, Guid.CreateVersion7(), "guest-1", MessageFeedback.Up));
    }

    [Fact]
    public async Task PinConversation_marks_and_unmarks_a_conversation()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation());

        Assert.True(await _repository.PinConversationAsync(conversation.Id, "admin", true));
        Assert.True((await _repository.GetConversationAsync(conversation.Id, "admin"))!.IsPinned);

        Assert.True(await _repository.PinConversationAsync(conversation.Id, "admin", false));
        Assert.False((await _repository.GetConversationAsync(conversation.Id, "admin"))!.IsPinned);
    }

    [Fact]
    public async Task PinConversation_returns_false_for_an_unowned_conversation()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation("admin"));

        Assert.False(await _repository.PinConversationAsync(conversation.Id, "guest", true));
        Assert.False((await _repository.GetConversationAsync(conversation.Id, "admin"))!.IsPinned);
    }

    [Fact]
    public async Task SetArchived_marks_and_unmarks_a_conversation()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation());

        Assert.True(await _repository.SetArchivedAsync(conversation.Id, "admin", true));
        Assert.True((await _repository.GetConversationAsync(conversation.Id, "admin"))!.IsArchived);

        Assert.True(await _repository.SetArchivedAsync(conversation.Id, "admin", false));
        Assert.False((await _repository.GetConversationAsync(conversation.Id, "admin"))!.IsArchived);
    }

    [Fact]
    public async Task SetArchived_returns_false_for_an_unowned_conversation()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation("admin"));

        Assert.False(await _repository.SetArchivedAsync(conversation.Id, "guest", true));
        Assert.False((await _repository.GetConversationAsync(conversation.Id, "admin"))!.IsArchived);
    }

    [Fact]
    public async Task ListConversations_sorts_pinned_first_then_by_recency()
    {
        var olderPinned = await _repository.CreateConversationAsync(NewConversation());
        var newerUnpinned = await _repository.CreateConversationAsync(NewConversation());

        // Pin the older one; it must float above a more recent unpinned row.
        await _repository.PinConversationAsync(olderPinned.Id, "admin", true);

        newerUnpinned.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(5);
        await _db.SaveChangesAsync();

        var listed = await _repository.ListConversationsAsync("admin");

        Assert.Equal(2, listed.Count);
        Assert.Equal(olderPinned.Id, listed[0].Id);
        Assert.Equal(newerUnpinned.Id, listed[1].Id);
        Assert.True(listed[0].IsPinned);
        Assert.False(listed[1].IsPinned);
    }

    [Fact]
    public async Task ListConversations_filters_by_title_when_search_is_given()
    {
        var matching = await _repository.CreateConversationAsync(NewConversation());
        matching.Title = "Top up OVO";
        await _db.SaveChangesAsync();
        await _repository.CreateConversationAsync(NewConversation());

        var listed = await _repository.ListConversationsAsync("admin", search: "OVO");

        var only = Assert.Single(listed);
        Assert.Equal("Top up OVO", only.Title);
    }

    [Fact]
    public async Task ListConversations_filters_by_message_content_when_search_is_given()
    {
        var conversation = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(conversation.Id, "admin", new Message { Role = "user", Content = "berapa budget spotify bulan ini?" });
        var other = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(other.Id, "admin", new Message { Role = "user", Content = "halo" });

        var listed = await _repository.ListConversationsAsync("admin", search: "spotify");

        var only = Assert.Single(listed);
        Assert.Equal(conversation.Id, only.Id);
    }

    [Fact]
    public async Task ListConversations_blank_search_returns_everything()
    {
        await _repository.CreateConversationAsync(NewConversation());
        await _repository.CreateConversationAsync(NewConversation());

        var listed = await _repository.ListConversationsAsync("admin", search: "   ");

        Assert.Equal(2, listed.Count);
    }

    [Fact]
    public async Task ListConversations_filters_by_model_when_model_is_given()
    {
        var sonnet = await _repository.CreateConversationAsync(NewConversation());
        sonnet.Model = "claude-sonnet";
        await _db.SaveChangesAsync();
        await _repository.CreateConversationAsync(NewConversation()); // hermes-default

        var listed = await _repository.ListConversationsAsync("admin", model: "claude-sonnet");

        var only = Assert.Single(listed);
        Assert.Equal(sonnet.Id, only.Id);
        Assert.Equal("claude-sonnet", only.Model);
    }

    [Fact]
    public async Task ListConversations_model_mismatch_returns_empty()
    {
        await _repository.CreateConversationAsync(NewConversation());

        var listed = await _repository.ListConversationsAsync("admin", model: "gpt-4o");

        Assert.Empty(listed);
    }

    [Fact]
    public async Task ListConversations_filters_by_mode_when_mode_is_given()
    {
        var direct = await _repository.CreateConversationAsync(NewConversation());
        direct.Mode = "direct";
        await _db.SaveChangesAsync();
        await _repository.CreateConversationAsync(NewConversation()); // agent

        var listed = await _repository.ListConversationsAsync("admin", mode: "direct");

        var only = Assert.Single(listed);
        Assert.Equal(direct.Id, only.Id);
        Assert.Equal("direct", only.Mode);
    }

    [Fact]
    public async Task ListConversations_mode_mismatch_returns_empty()
    {
        await _repository.CreateConversationAsync(NewConversation()); // agent

        var listed = await _repository.ListConversationsAsync("admin", mode: "direct");

        Assert.Empty(listed);
    }

    [Fact]
    public async Task ListConversations_filters_by_updated_at_window()
    {
        var old = await _repository.CreateConversationAsync(NewConversation());
        old.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-20);
        var fresh = await _repository.CreateConversationAsync(NewConversation());
        fresh.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-2);
        await _db.SaveChangesAsync();

        var from = DateTimeOffset.UtcNow.AddDays(-7);
        var listed = await _repository.ListConversationsAsync("admin", from: from);

        var only = Assert.Single(listed);
        Assert.Equal(fresh.Id, only.Id);
    }

    [Fact]
    public async Task ListConversations_to_filter_is_inclusive_of_its_day()
    {
        var within = await _repository.CreateConversationAsync(NewConversation());
        within.UpdatedAt = new DateTimeOffset(2026, 11, 1, 15, 0, 0, TimeSpan.Zero);
        await _db.SaveChangesAsync();

        var nextDay = await _repository.CreateConversationAsync(NewConversation());
        nextDay.UpdatedAt = new DateTimeOffset(2026, 11, 2, 12, 0, 0, TimeSpan.Zero);
        await _db.SaveChangesAsync();

        var to = new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero);
        var listed = await _repository.ListConversationsAsync("admin", to: to);

        var only = Assert.Single(listed);
        Assert.Equal(within.Id, only.Id);
    }

    [Fact]
    public async Task ListConversations_combines_search_model_and_date()
    {
        var match = await _repository.CreateConversationAsync(NewConversation());
        match.Model = "claude-sonnet";
        await _db.SaveChangesAsync();
        await _repository.AppendMessageAsync(match.Id, "admin", new Message { Role = "user", Content = "berapa budget?" });
        match.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-3);
        await _db.SaveChangesAsync();

        var wrongModel = await _repository.CreateConversationAsync(NewConversation());
        await _db.SaveChangesAsync();
        await _repository.AppendMessageAsync(wrongModel.Id, "admin", new Message { Role = "user", Content = "berapa budget?" });
        wrongModel.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-3);
        await _db.SaveChangesAsync();

        var wrongDate = await _repository.CreateConversationAsync(NewConversation());
        wrongDate.Model = "claude-sonnet";
        await _db.SaveChangesAsync();
        await _repository.AppendMessageAsync(wrongDate.Id, "admin", new Message { Role = "user", Content = "berapa budget?" });
        wrongDate.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-30);
        await _db.SaveChangesAsync();

        var from = DateTimeOffset.UtcNow.AddDays(-7);
        var listed = await _repository.ListConversationsAsync(
            "admin", search: "budget", model: "claude-sonnet", from: from);

        var only = Assert.Single(listed);
        Assert.Equal(match.Id, only.Id);
    }

    [Fact]
    public async Task SetConversationModel_updates_model_for_the_owner()
    {
        var created = await _repository.CreateConversationAsync(NewConversation());

        var updated = await _repository.SetConversationModelAsync(created.Id, "admin", "claude-sonnet");

        Assert.True(updated);
        var stored = await _repository.GetConversationAsync(created.Id, "admin");
        Assert.Equal("claude-sonnet", stored!.Model);
    }

    [Fact]
    public async Task SetConversationModel_does_not_bump_updated_at_when_unchanged()
    {
        var created = await _repository.CreateConversationAsync(NewConversation());
        var before = (await _repository.GetConversationAsync(created.Id, "admin"))!.UpdatedAt;

        await _repository.SetConversationModelAsync(created.Id, "admin", "hermes-default");

        var after = (await _repository.GetConversationAsync(created.Id, "admin"))!.UpdatedAt;
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task SetConversationModel_returns_false_when_unowned()
    {
        var created = await _repository.CreateConversationAsync(NewConversation("admin"));

        var updated = await _repository.SetConversationModelAsync(created.Id, "guest", "claude-sonnet");

        Assert.False(updated);
        var stored = await _repository.GetConversationAsync(created.Id, "admin");
        Assert.Equal("hermes-default", stored!.Model);
    }

    [Fact]
    public async Task SetConversationSettings_updates_model_and_mode_for_the_owner()
    {
        var created = await _repository.CreateConversationAsync(NewConversation());

        var updated = await _repository.SetConversationSettingsAsync(created.Id, "admin", "claude-sonnet", "direct");

        Assert.True(updated);
        var stored = await _repository.GetConversationAsync(created.Id, "admin");
        Assert.Equal("claude-sonnet", stored!.Model);
        Assert.Equal("direct", stored.Mode);
    }

    [Fact]
    public async Task SetConversationSettings_partial_update_leaves_null_field_unchanged()
    {
        var created = await _repository.CreateConversationAsync(NewConversation());

        await _repository.SetConversationSettingsAsync(created.Id, "admin", model: "claude-sonnet");

        var stored = await _repository.GetConversationAsync(created.Id, "admin");
        Assert.Equal("claude-sonnet", stored!.Model);
        Assert.Equal("agent", stored.Mode);
    }

    [Fact]
    public async Task SetConversationSettings_returns_false_when_unowned()
    {
        var created = await _repository.CreateConversationAsync(NewConversation("admin"));

        var updated = await _repository.SetConversationSettingsAsync(created.Id, "guest", "claude-sonnet", "direct");

        Assert.False(updated);
        var stored = await _repository.GetConversationAsync(created.Id, "admin");
        Assert.Equal("hermes-default", stored!.Model);
        Assert.Equal("agent", stored.Mode);
    }

    [Fact]
    public async Task GetUsageSummary_aggregates_tokens_and_groups_by_model()
    {
        var a = await _repository.CreateConversationAsync(NewConversation());
        var b = await _repository.CreateConversationAsync(NewConversation());
        b.Model = "claude-sonnet";
        await _db.SaveChangesAsync();

        await _repository.AddConversationUsageAsync(a.Id, "admin", 100, 50);
        await _repository.AddConversationUsageAsync(a.Id, "admin", 30, 20);
        await _repository.AddConversationUsageAsync(b.Id, "admin", 1000, 500);

        var summary = await _repository.GetUsageSummaryAsync("admin");

        Assert.Equal(2, summary.ConversationCount);
        Assert.Equal(1130, summary.TotalPromptTokens);
        Assert.Equal(570, summary.TotalCompletionTokens);
        Assert.Equal(1700, summary.TotalTokens);
        Assert.Equal(2, summary.ByModel.Count);
        Assert.Equal(1500, summary.ByModel["claude-sonnet"].TotalTokens);
        Assert.Equal(1000, summary.ByModel["claude-sonnet"].PromptTokens);
        Assert.Equal(500, summary.ByModel["claude-sonnet"].CompletionTokens);
        Assert.Equal(200, summary.ByModel["hermes-default"].TotalTokens);
    }

    [Fact]
    public async Task GetUsageSummary_returns_an_empty_all_zero_summary_when_no_history()
    {
        var summary = await _repository.GetUsageSummaryAsync("admin");

        Assert.Equal(0, summary.ConversationCount);
        Assert.Equal(0, summary.TotalTokens);
        Assert.Empty(summary.ByModel);
    }

    [Fact]
    public async Task GetUsageSummary_excludes_other_users_and_blank_models()
    {
        var owned = await _repository.CreateConversationAsync(NewConversation("admin"));
        owned.Model = "   ";
        await _db.SaveChangesAsync();
        await _repository.AddConversationUsageAsync(owned.Id, "admin", 10, 5);

        var other = await _repository.CreateConversationAsync(NewConversation("guest"));
        await _repository.AddConversationUsageAsync(other.Id, "guest", 999, 999);

        var summary = await _repository.GetUsageSummaryAsync("admin");

        Assert.Equal(1, summary.ConversationCount);
        Assert.Equal(15, summary.TotalTokens);
        Assert.Single(summary.ByModel);
        Assert.True(summary.ByModel.ContainsKey(""));
    }

    [Fact]
    public async Task GetUsageSummary_aggregates_message_feedback_across_conversations()
    {
        var convA = await _repository.CreateConversationAsync(NewConversation());
        var convB = await _repository.CreateConversationAsync(NewConversation("admin"));

        var a1 = await _repository.AppendMessageAsync(convA.Id, "admin", new Message { Role = "assistant", Content = "satu" });
        var a2 = await _repository.AppendMessageAsync(convA.Id, "admin", new Message { Role = "assistant", Content = "dua" });
        var b1 = await _repository.AppendMessageAsync(convB.Id, "admin", new Message { Role = "assistant", Content = "tiga" });

        await _repository.SetMessageFeedbackAsync(convA.Id, a1.Id, "admin", MessageFeedback.Up);
        await _repository.SetMessageFeedbackAsync(convA.Id, a2.Id, "admin", MessageFeedback.Down);
        await _repository.SetMessageFeedbackAsync(convB.Id, b1.Id, "admin", MessageFeedback.Up);

        var summary = await _repository.GetUsageSummaryAsync("admin");

        Assert.Equal(2, summary.TotalUpFeedback);
        Assert.Equal(1, summary.TotalDownFeedback);
    }

    [Fact]
    public async Task GetUsageSummary_feedback_excludes_other_users_messages()
    {
        var guestConv = await _repository.CreateConversationAsync(NewConversation("guest"));
        var gm = await _repository.AppendMessageAsync(guestConv.Id, "guest", new Message { Role = "assistant", Content = "milik tamu" });
        await _repository.SetMessageFeedbackAsync(guestConv.Id, gm.Id, "guest", MessageFeedback.Up);

        var summary = await _repository.GetUsageSummaryAsync("admin");

        Assert.Equal(0, summary.TotalUpFeedback);
        Assert.Equal(0, summary.TotalDownFeedback);
    }

    private async Task<(Guid conv, Message firstUser)> SeedTwoTurnsAsync()
    {
        var conv = await _repository.CreateConversationAsync(NewConversation());
        var firstUser = await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "pertama" });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "assistant", Content = "jawaban satu" });
        var secondUser = await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "kedua" });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "assistant", Content = "jawaban dua" });
        return (conv.Id, firstUser);
    }

    [Fact]
    public async Task DeleteTrailingAssistant_removes_only_the_last_assistant_reply()
    {
        var (conv, _) = await SeedTwoTurnsAsync();

        var ok = await _repository.DeleteTrailingAssistantAsync(conv, "admin");

        Assert.True(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(["pertama", "jawaban satu", "kedua"], stored!.Messages.Select(m => m.Content).ToArray());
    }

    [Fact]
    public async Task DeleteTrailingAssistant_leaves_a_user_terminated_transcript_untouched()
    {
        var conv = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "pertama" });

        var ok = await _repository.DeleteTrailingAssistantAsync(conv.Id, "admin");

        Assert.True(ok);
        var stored = await _repository.GetConversationAsync(conv.Id, "admin");
        Assert.Equal(["pertama"], stored!.Messages.Select(m => m.Content).ToArray());
    }

    [Fact]
    public async Task DeleteTrailingAssistant_refuses_a_conversation_owned_by_another_user()
    {
        var (conv, _) = await SeedTwoTurnsAsync();

        var ok = await _repository.DeleteTrailingAssistantAsync(conv, "guest");

        Assert.False(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(4, stored!.Messages.Count);
    }

    [Fact]
    public async Task RewriteMessage_updates_the_target_and_drops_everything_newer()
    {
        var (conv, firstUser) = await SeedTwoTurnsAsync();
        var target = (await _repository.GetConversationAsync(conv, "admin"))!.Messages.First(m => m.Content == "kedua");

        var ok = await _repository.RewriteMessageAsync(conv, "admin", target.Id, "kedua suntingan");

        Assert.True(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(["pertama", "jawaban satu", "kedua suntingan"], stored!.Messages.Select(m => m.Content).ToArray());
    }

    [Fact]
    public async Task RewriteMessage_mid_conversation_removes_all_following_turns()
    {
        var (conv, firstUser) = await SeedTwoTurnsAsync();

        var ok = await _repository.RewriteMessageAsync(conv, "admin", firstUser.Id, "pertama suntingan");

        Assert.True(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(["pertama suntingan"], stored!.Messages.Select(m => m.Content).ToArray());
    }

    [Fact]
    public async Task RewriteMessage_refuses_a_conversation_owned_by_another_user()
    {
        var (conv, firstUser) = await SeedTwoTurnsAsync();

        var ok = await _repository.RewriteMessageAsync(conv, "guest", firstUser.Id, "disuntik");

        Assert.False(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(4, stored!.Messages.Count);
    }

    [Fact]
    public async Task RewriteMessage_returns_false_for_an_unknown_message_id()
    {
        var (conv, _) = await SeedTwoTurnsAsync();

        var ok = await _repository.RewriteMessageAsync(conv, "admin", Guid.CreateVersion7(), "apa pun");

        Assert.False(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(4, stored!.Messages.Count);
    }

    [Fact]
    public async Task DeleteTrailingAssistant_reduces_the_conversation_usage_by_the_removed_reply()
    {
        var conv = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "q" });
        var reply = await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "assistant", Content = "a", PromptTokens = 40, CompletionTokens = 10 });
        await _repository.AddConversationUsageAsync(conv.Id, "admin", 40, 10);

        await _repository.DeleteTrailingAssistantAsync(conv.Id, "admin");

        var stored = await _repository.GetConversationAsync(conv.Id, "admin");
        Assert.Equal(0, stored!.PromptTokens);
        Assert.Equal(0, stored.CompletionTokens);
    }

    [Fact]
    public async Task RewriteMessage_reduces_the_conversation_usage_by_the_discarded_turns()
    {
        var conv = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "A" });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "assistant", Content = "a1", PromptTokens = 40, CompletionTokens = 10 });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "B" });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "assistant", Content = "b1", PromptTokens = 50, CompletionTokens = 20 });
        await _repository.AddConversationUsageAsync(conv.Id, "admin", 90, 30);

        var target = (await _repository.GetConversationAsync(conv.Id, "admin"))!.Messages.First(m => m.Content == "B");

        await _repository.RewriteMessageAsync(conv.Id, "admin", target.Id, "B-edited");

        var stored = await _repository.GetConversationAsync(conv.Id, "admin");
        Assert.Equal(40, stored!.PromptTokens);
        Assert.Equal(10, stored.CompletionTokens);
    }

    [Fact]
    public async Task DeleteMessage_removes_the_target_and_everything_newer()
    {
        var (conv, firstUser) = await SeedTwoTurnsAsync();

        var ok = await _repository.DeleteMessageAsync(conv, "admin", firstUser.Id);

        Assert.True(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Empty(stored!.Messages);
    }

    [Fact]
    public async Task DeleteMessage_mid_conversation_removes_only_the_target_and_successors()
    {
        var (conv, _) = await SeedTwoTurnsAsync();
        var secondUser = (await _repository.GetConversationAsync(conv, "admin"))!.Messages.First(m => m.Content == "kedua");

        var ok = await _repository.DeleteMessageAsync(conv, "admin", secondUser.Id);

        Assert.True(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(["pertama", "jawaban satu"], stored!.Messages.Select(m => m.Content).ToArray());
    }

    [Fact]
    public async Task DeleteMessage_refuses_a_conversation_owned_by_another_user()
    {
        var (conv, firstUser) = await SeedTwoTurnsAsync();

        var ok = await _repository.DeleteMessageAsync(conv, "guest", firstUser.Id);

        Assert.False(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(4, stored!.Messages.Count);
    }

    [Fact]
    public async Task DeleteMessage_returns_false_for_an_unknown_message_id()
    {
        var (conv, _) = await SeedTwoTurnsAsync();

        var ok = await _repository.DeleteMessageAsync(conv, "admin", Guid.CreateVersion7());

        Assert.False(ok);
        var stored = await _repository.GetConversationAsync(conv, "admin");
        Assert.Equal(4, stored!.Messages.Count);
    }

    [Fact]
    public async Task DeleteMessage_reduces_the_conversation_usage_by_the_removed_turns()
    {
        var conv = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "A" });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "assistant", Content = "a1", PromptTokens = 40, CompletionTokens = 10 });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "user", Content = "B" });
        await _repository.AppendMessageAsync(conv.Id, "admin", new Message { Role = "assistant", Content = "b1", PromptTokens = 50, CompletionTokens = 20 });
        await _repository.AddConversationUsageAsync(conv.Id, "admin", 90, 30);

        var target = (await _repository.GetConversationAsync(conv.Id, "admin"))!.Messages.First(m => m.Content == "B");

        await _repository.DeleteMessageAsync(conv.Id, "admin", target.Id);

        var stored = await _repository.GetConversationAsync(conv.Id, "admin");
        Assert.Equal(40, stored!.PromptTokens);
        Assert.Equal(10, stored.CompletionTokens);
    }

    [Fact]
    public async Task GetUsageSummary_respects_a_from_window_on_updatedAt()
    {
        var old = await _repository.CreateConversationAsync(NewConversation());
        var recent = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AddConversationUsageAsync(old.Id, "admin", 1000, 500);
        await _repository.AddConversationUsageAsync(recent.Id, "admin", 10, 5);

        // Back-date the old conversation to before the window start.
        var oldEntity = await _db.Conversations.SingleAsync(c => c.Id == old.Id);
        oldEntity.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-30);
        await _db.SaveChangesAsync();

        var from = DateTimeOffset.UtcNow.AddDays(-7);
        var summary = await _repository.GetUsageSummaryAsync("admin", from);

        Assert.Equal(1, summary.ConversationCount);
        Assert.Equal(15, summary.TotalTokens);
        Assert.Equal(15, summary.ByModel["hermes-default"].TotalTokens);
    }

    [Fact]
    public async Task GetUsageSummary_respects_a_to_window_on_updatedAt()
    {
        var old = await _repository.CreateConversationAsync(NewConversation());
        var recent = await _repository.CreateConversationAsync(NewConversation());
        await _repository.AddConversationUsageAsync(old.Id, "admin", 1000, 500);
        await _repository.AddConversationUsageAsync(recent.Id, "admin", 10, 5);

        var oldEntity = await _db.Conversations.SingleAsync(c => c.Id == old.Id);
        oldEntity.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-30);
        await _db.SaveChangesAsync();

        var to = DateTimeOffset.UtcNow.AddDays(-10);
        var summary = await _repository.GetUsageSummaryAsync("admin", null, to);

        Assert.Equal(1, summary.ConversationCount);
        Assert.Equal(1500, summary.TotalTokens);
    }

    [Fact]
    public async Task GetUsageSummary_window_scopes_feedback_counts()
    {
        var old = await _repository.CreateConversationAsync(NewConversation());
        var recent = await _repository.CreateConversationAsync(NewConversation());

        var oldMsg = await _repository.AppendMessageAsync(old.Id, "admin", new Message { Role = "assistant", Content = "lama" });
        var recentMsg = await _repository.AppendMessageAsync(recent.Id, "admin", new Message { Role = "assistant", Content = "baru" });
        await _repository.SetMessageFeedbackAsync(old.Id, oldMsg.Id, "admin", MessageFeedback.Up);
        await _repository.SetMessageFeedbackAsync(recent.Id, recentMsg.Id, "admin", MessageFeedback.Down);

        var oldEntity = await _db.Conversations.SingleAsync(c => c.Id == old.Id);
        oldEntity.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-30);
        await _db.SaveChangesAsync();

        var summary = await _repository.GetUsageSummaryAsync("admin", DateTimeOffset.UtcNow.AddDays(-7));

        Assert.Equal(0, summary.TotalUpFeedback);
        Assert.Equal(1, summary.TotalDownFeedback);
    }
}
