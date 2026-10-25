using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;

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
}
