using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// EF Core implementation of <see cref="IChatHistoryRepository"/>.
/// </summary>
public sealed class ChatHistoryRepository(ChatDbContext db) : IChatHistoryRepository
{
    /// <summary>Upper bound on a single listing page, so a caller cannot ask for an unbounded result.</summary>
    public const int MaxListLimit = 200;

    public async Task<Conversation> CreateConversationAsync(Conversation conversation, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(conversation);
        RequireOwner(conversation.UserId);

        var now = DateTimeOffset.UtcNow;
        conversation.CreatedAt = now;
        conversation.UpdatedAt = now;

        db.Conversations.Add(conversation);
        await db.SaveChangesAsync(cancellationToken);
        return conversation;
    }

    public async Task<Conversation?> GetConversationAsync(Guid id, string userId, CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);

        return await db.Conversations
            .AsNoTracking()
            .Include(c => c.Messages.OrderBy(m => m.CreatedAt))
            .SingleOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken);
    }

    public async Task<IReadOnlyList<Conversation>> ListConversationsAsync(string userId, int limit = 50, CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);
        var take = Math.Clamp(limit, 1, MaxListLimit);

        // No Include: the sidebar shows titles only. Messages stay on the server, which
        // is what keeps a long history cheap to list.
        return await db.Conversations
            .AsNoTracking()
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.UpdatedAt)
            .Take(take)
            .ToListAsync(cancellationToken);
    }

    public async Task<Message> AppendMessageAsync(Guid conversationId, string userId, Message message, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        RequireOwner(userId);

        var conversation = await db.Conversations
            .SingleOrDefaultAsync(c => c.Id == conversationId && c.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Conversation not found for this user.");

        var now = DateTimeOffset.UtcNow;
        message.Id = message.Id == Guid.Empty ? Guid.CreateVersion7() : message.Id;
        message.ConversationId = conversation.Id;
        message.CreatedAt = now;

        db.Messages.Add(message);
        conversation.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return message;
    }

    public async Task<bool> RenameConversationAsync(Guid id, string userId, string title, CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);
        ArgumentException.ThrowIfNullOrWhiteSpace(title);

        var conversation = await db.Conversations
            .SingleOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken);
        if (conversation is null)
        {
            return false;
        }

        conversation.Title = title.Length > 200 ? title[..200] : title;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteConversationAsync(Guid id, string userId, CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);

        var conversation = await db.Conversations
            .SingleOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken);
        if (conversation is null)
        {
            return false;
        }

        // Messages are removed by the cascade delete configured in ChatDbContext.
        db.Conversations.Remove(conversation);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Rejects a blank owner tag. An empty <c>userId</c> would match every row whose
    /// column happened to be empty, which is exactly the cross-user leak this
    /// repository exists to prevent.
    /// </summary>
    private static void RequireOwner(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new ArgumentException("A non-empty owner id is required.", nameof(userId));
        }
    }
}
