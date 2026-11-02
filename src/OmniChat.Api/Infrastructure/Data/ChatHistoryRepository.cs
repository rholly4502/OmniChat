using Microsoft.EntityFrameworkCore;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

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

    public async Task<IReadOnlyList<Conversation>> ListConversationsAsync(
        string userId,
        int limit = 50,
        string? search = null,
        string? model = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);
        var take = Math.Clamp(limit, 1, MaxListLimit);

        // No Include: the sidebar shows titles only. Messages stay on the server, which
        // is what keeps a long history cheap to list. A search term is the one exception
        // to that: matching it requires looking inside message bodies, but only as a
        // filter — the returned rows still carry no bodies.
        var query = db.Conversations
            .AsNoTracking()
            .Where(c => c.UserId == userId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c =>
                c.Title.Contains(term) ||
                c.Messages.Any(m => m.Content.Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(model))
        {
            // Model ids are canonical labels, so an exact match is correct and keeps a
            // potential index on the column useful.
            var modelId = model.Trim();
            query = query.Where(c => c.Model == modelId);
        }

        if (from.HasValue)
        {
            var fromUtc = from.Value.ToUniversalTime();
            query = query.Where(c => c.UpdatedAt >= fromUtc);
        }

        if (to.HasValue)
        {
            // `to` is an inclusive calendar day: everything strictly before the next day is
            // returned, so a client sending "2026-11-01" includes all of November 1st.
            var toExclusive = to.Value.ToUniversalTime().AddDays(1);
            query = query.Where(c => c.UpdatedAt < toExclusive);
        }

        return await query
            .OrderByDescending(c => c.IsPinned)
            .ThenByDescending(c => c.UpdatedAt)
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
    public async Task<bool> PinConversationAsync(Guid id, string userId, bool isPinned, CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);

        var conversation = await db.Conversations
            .SingleOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken);
        if (conversation is null)
        {
            return false;
        }

        conversation.IsPinned = isPinned;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> SetConversationModelAsync(
        Guid id,
        string userId,
        string model,
        CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);
        ArgumentException.ThrowIfNullOrWhiteSpace(model);

        var conversation = await db.Conversations
            .SingleOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken);
        if (conversation is null)
        {
            return false;
        }

        if (conversation.Model != model)
        {
            conversation.Model = model;
            conversation.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<bool> AddConversationUsageAsync(
        Guid conversationId,
        string userId,
        int promptTokens,
        int completionTokens,
        CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);

        var conversation = await db.Conversations
            .SingleOrDefaultAsync(c => c.Id == conversationId && c.UserId == userId, cancellationToken);
        if (conversation is null)
        {
            return false;
        }

        // A report of 0 tokens (or a malformed/absent usage frame) is a no-op.
        if (promptTokens < 0) promptTokens = 0;
        if (completionTokens < 0) completionTokens = 0;

        conversation.PromptTokens += promptTokens;
        conversation.CompletionTokens += completionTokens;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<ConversationUsageSummary> GetUsageSummaryAsync(string userId, CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);

        // Only the stored columns are pulled (no message bodies), so the aggregate stays
        // cheap even for a long history.
        var rows = await db.Conversations
            .AsNoTracking()
            .Where(c => c.UserId == userId)
            .Select(c => new { c.Model, c.PromptTokens, c.CompletionTokens })
            .ToListAsync(cancellationToken);

        var totalPrompt = rows.Sum(r => r.PromptTokens);
        var totalCompletion = rows.Sum(r => r.CompletionTokens);

        var byModel = rows
            .GroupBy(r => r.Model?.Trim() ?? string.Empty)
            .ToDictionary(
                g => g.Key,
                g => new ConversationModelUsage(
                    g.Sum(r => r.PromptTokens),
                    g.Sum(r => r.CompletionTokens)));

        return new ConversationUsageSummary(
            totalPrompt,
            totalCompletion,
            totalPrompt + totalCompletion,
            rows.Count,
            byModel);
    }

    public async Task<bool> SetMessageFeedbackAsync(
        Guid conversationId,
        Guid messageId,
        string userId,
        MessageFeedback? feedback,
        CancellationToken cancellationToken = default)
    {
        RequireOwner(userId);

        // One query scopes by both the message id and the owning conversation, so an
        // unowned message id reads as "not found" — the same 404-shaped answer the rest
        // of this repository returns for someone else's rows.
        var message = await db.Messages
            .Include(m => m.Conversation)
            .SingleOrDefaultAsync(
                m => m.Id == messageId && m.ConversationId == conversationId && m.Conversation!.UserId == userId,
                cancellationToken);
        if (message is null)
        {
            return false;
        }

        message.Feedback = feedback;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static void RequireOwner(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new ArgumentException("A non-empty owner id is required.", nameof(userId));
        }
    }
}
