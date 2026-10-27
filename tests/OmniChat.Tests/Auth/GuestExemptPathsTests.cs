using OmniChat.Api.Infrastructure.Auth;

namespace OmniChat.Tests.Auth;

/// <summary>
/// The guest-exempt set is a security boundary: only the chat stream is anonymous.
/// Expense data is private to the operator, so every expense route must stay protected
/// by the API key. This test nails that contract so a future "let guests see expenses"
/// change cannot slip through without an explicit decision.
/// </summary>
public sealed class GuestExemptPathsTests
{
    [Theory]
    [InlineData("/api/chat/stream")]
    public void Guest_IsAllowed_OnlyForTheChatStream(string path)
    {
        Assert.True(GuestExemptPaths.IsGuestAllowed(path));
    }

    [Theory]
    [InlineData("/api/expenses")]
    [InlineData("/api/expenses/summary")]
    [InlineData("/api/expenses/target")]
    [InlineData("/api/conversations")]
    [InlineData("/api/models")]
    public void Guest_IsNotAllowed_ForExpensesOrOtherAdminRoutes(string path)
    {
        Assert.False(GuestExemptPaths.IsGuestAllowed(path));
    }
}
