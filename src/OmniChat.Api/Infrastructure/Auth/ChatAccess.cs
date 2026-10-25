namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// How much of the stored chat history a caller may read.
/// </summary>
/// <remarks>
/// This governs reading only. Every caller's turns are written to the database either way, because
/// the guest's history exists for the audit trail rather than for the guest's sidebar.
/// </remarks>
public enum ChatAccess
{
    /// <summary>Turns are filed for the audit trail, but no history is listed back.</summary>
    Guest = 0,

    /// <summary>Full history access: list, reopen, rename and delete.</summary>
    Admin = 1,
}
