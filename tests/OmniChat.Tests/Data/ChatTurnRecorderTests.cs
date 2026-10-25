using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Infrastructure.Data;

namespace OmniChat.Tests.Data;

/// <summary>
/// Tests for the streaming path's write seam, run against a real SQLite database in memory.
/// The point of these tests is the two-phase contract: the question is filed before the answer
/// exists, and the answer is filed whatever happened upstream in between.
/// </summary>
public sealed class ChatTurnRecorderTests : IDisposable
{
    private const string Admin = "admin";

    private readonly SqliteConnection _connection;
    private readonly ChatDbContext _db;
    private readonly ChatHistoryRepository _repository;
    private readonly ChatTurnRecorder _recorder;

    public ChatTurnRecorderTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ChatDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ChatDbContext(options);
        _db.Database.EnsureCreated();
        _repository = new ChatHistoryRepository(_db);
        _recorder = new ChatTurnRecorder(_repository, NullLogger<ChatTurnRecorder>.Instance);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static ChatTurn NewTurn(string prompt, Guid? conversationId = null, string userId = Admin) =>
        new(conversationId, userId, "agent", "hermes-default", prompt);

    [Fact]
    public async Task StartTurn_CreatesAConversationTitledFromThePrompt()
    {
        var id = await _recorder.StartTurnAsync(NewTurn("Ringkas arsitektur OmniChat"));

        Assert.NotNull(id);

        var stored = await _repository.GetConversationAsync(id!.Value, Admin);
        Assert.NotNull(stored);
        Assert.Equal("Ringkas arsitektur OmniChat", stored!.Title);
        Assert.Equal("agent", stored.Mode);
        Assert.Equal("hermes-default", stored.Model);
        Assert.Equal(Admin, stored.UserId);
        Assert.Single(stored.Messages);
        Assert.Equal("user", stored.Messages[0].Role);
        Assert.Equal("Ringkas arsitektur OmniChat", stored.Messages[0].Content);
    }

    [Fact]
    public async Task StartTurn_AppendsToAnExistingConversation_WithoutCreatingAnother()
    {
        var id = await _recorder.StartTurnAsync(NewTurn("pertama"));
        var again = await _recorder.StartTurnAsync(NewTurn("kedua", id));

        Assert.Equal(id, again);
        Assert.Equal(1, await _db.Conversations.CountAsync());

        var stored = await _repository.GetConversationAsync(id!.Value, Admin);
        Assert.Equal(["pertama", "kedua"], stored!.Messages.Select(m => m.Content).ToArray());
    }

    [Fact]
    public async Task CompleteTurn_AppendsTheAssistantReply_AndBumpsUpdatedAt()
    {
        var id = (await _recorder.StartTurnAsync(NewTurn("halo")))!.Value;
        var before = (await _repository.GetConversationAsync(id, Admin))!.UpdatedAt;

        await _recorder.CompleteTurnAsync(id, Admin, "Halo juga!");

        var stored = await _repository.GetConversationAsync(id, Admin);
        Assert.Equal(["user", "assistant"], stored!.Messages.Select(m => m.Role).ToArray());
        Assert.Equal("Halo juga!", stored.Messages[1].Content);
        Assert.True(stored.UpdatedAt > before);
    }

    [Fact]
    public async Task CompleteTurn_TrimsSurroundingWhitespace()
    {
        var id = (await _recorder.StartTurnAsync(NewTurn("halo")))!.Value;

        await _recorder.CompleteTurnAsync(id, Admin, "\n  jawaban  \n");

        var stored = await _repository.GetConversationAsync(id, Admin);
        Assert.Equal("jawaban", stored!.Messages[1].Content);
    }

    [Fact]
    public async Task CompleteTurn_SkipsABlankReply()
    {
        // An aborted stream can leave nothing behind. Writing an empty assistant bubble would
        // show up in the transcript as a ghost turn.
        var id = (await _recorder.StartTurnAsync(NewTurn("halo")))!.Value;

        await _recorder.CompleteTurnAsync(id, Admin, "   ");

        var stored = await _repository.GetConversationAsync(id, Admin);
        Assert.Single(stored!.Messages);
    }

    [Fact]
    public async Task StartTurn_RefusesAnotherUsersConversation_AndReportsNothingRecorded()
    {
        // The dangerous case: a client sends an id it does not own, hoping the turn lands in
        // someone else's thread. The recorder must report "not recorded" instead of throwing.
        var foreign = (await _recorder.StartTurnAsync(NewTurn("rahasia", userId: "guest-1")))!.Value;

        var result = await _recorder.StartTurnAsync(NewTurn("serangan", foreign, Admin));

        Assert.Null(result);
        var stored = await _repository.GetConversationAsync(foreign, "guest-1");
        Assert.Equal(["rahasia"], stored!.Messages.Select(m => m.Content).ToArray());
    }

    [Fact]
    public async Task StartTurn_ReportsNothingRecorded_WhenTheConversationIsUnknown()
    {
        var result = await _recorder.StartTurnAsync(NewTurn("halo", Guid.CreateVersion7()));

        Assert.Null(result);
        Assert.Equal(0, await _db.Conversations.CountAsync());
    }

    [Fact]
    public async Task NoOpRecorder_ReportsNothingRecorded()
    {
        IChatTurnRecorder recorder = new NoOpChatTurnRecorder();

        Assert.Null(await recorder.StartTurnAsync(NewTurn("halo")));
        await recorder.CompleteTurnAsync(Guid.CreateVersion7(), Admin, "jawaban");
        Assert.Equal(0, await _db.Conversations.CountAsync());
    }

    [Theory]
    [InlineData("", "Percakapan baru")]
    [InlineData("   \n  ", "Percakapan baru")]
    [InlineData("  halo   dunia  ", "halo dunia")]
    public void BuildTitle_CollapsesWhitespaceAndNeverReturnsBlank(string prompt, string expected)
    {
        Assert.Equal(expected, ChatTurnRecorder.BuildTitle(prompt));
    }

    [Fact]
    public void BuildTitle_TruncatesALongPrompt_OnAWordBoundary()
    {
        var prompt = string.Join(' ', Enumerable.Repeat("kata", 40));

        var title = ChatTurnRecorder.BuildTitle(prompt);

        Assert.True(title.Length <= ChatTurnRecorder.TitleMaxLength + 1, $"title was {title.Length} chars");
        Assert.EndsWith("…", title);
        Assert.DoesNotContain("  ", title);
    }

    [Fact]
    public void BuildTitle_KeepsAPromptOfExactlyTheLimit()
    {
        var prompt = new string('a', ChatTurnRecorder.TitleMaxLength);

        Assert.Equal(prompt, ChatTurnRecorder.BuildTitle(prompt));
    }
}
