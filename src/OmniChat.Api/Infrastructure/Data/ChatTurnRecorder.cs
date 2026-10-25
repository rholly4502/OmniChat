using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;

namespace OmniChat.Infrastructure.Data;

/// <summary>
/// Writes both halves of a streamed turn to the conversation store.
/// </summary>
/// <remarks>
/// The user's message is written before the upstream call so an aborted or failed generation
/// still leaves a record of what was asked, and the assistant's message is written afterwards
/// even when the reply was cut short. That asymmetry is deliberate: a partial answer is more
/// useful for audit than a gap.
/// </remarks>
public sealed class ChatTurnRecorder(
    IChatHistoryRepository repository,
    ILogger<ChatTurnRecorder> logger) : IChatTurnRecorder
{
    /// <summary>Longest title derived from a first prompt, in characters.</summary>
    public const int TitleMaxLength = 60;

    public async Task<Guid?> StartTurnAsync(ChatTurn turn, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(turn);

        try
        {
            if (turn.ConversationId is Guid existing)
            {
                await repository.AppendMessageAsync(
                    existing, turn.UserId, NewMessage("user", turn.UserContent), cancellationToken);
                return existing;
            }

            var conversation = await repository.CreateConversationAsync(
                new Conversation
                {
                    Title = BuildTitle(turn.UserContent),
                    Mode = turn.Mode,
                    Model = turn.Model,
                    UserId = turn.UserId,
                },
                cancellationToken);

            await repository.AppendMessageAsync(
                conversation.Id, turn.UserId, NewMessage("user", turn.UserContent), cancellationToken);

            return conversation.Id;
        }
        catch (OperationCanceledException)
        {
            // The client went away before the turn was filed. Expected on a closed tab.
            return null;
        }
        catch (Exception ex)
        {
            // Includes the "conversation not owned by this user" case from AppendMessageAsync:
            // a client asking to append to someone else's conversation must not be able to, and
            // must not be able to tell the ids apart from one it owns either.
            logger.LogWarning(ex, "Chat turn could not be recorded; streaming continues without history.");
            return null;
        }
    }

    public async Task CompleteTurnAsync(Guid conversationId, string userId, string assistantContent, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(assistantContent))
        {
            return;
        }

        try
        {
            await repository.AppendMessageAsync(
                conversationId, userId, NewMessage("assistant", assistantContent.Trim()), cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Aborted stream; the partial reply is dropped rather than written on a dead token.
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Assistant reply could not be recorded for conversation {ConversationId}.", conversationId);
        }
    }

    private static Message NewMessage(string role, string content) => new()
    {
        Role = role,
        Content = content,
    };

    /// <summary>
    /// Derives a sidebar-sized title from the opening prompt: whitespace collapsed, cut on a
    /// word boundary where possible, and never blank (the sidebar would render a gap).
    /// </summary>
    public static string BuildTitle(string prompt)
    {
        var clean = string.Join(' ', (prompt ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

        if (clean.Length == 0)
        {
            return "Percakapan baru";
        }

        if (clean.Length <= TitleMaxLength)
        {
            return clean;
        }

        var cut = clean.LastIndexOf(' ', TitleMaxLength);
        var end = cut > TitleMaxLength / 2 ? cut : TitleMaxLength;
        return string.Concat(clean.AsSpan(0, end).TrimEnd(), "…");
    }
}
