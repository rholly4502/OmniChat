namespace OmniChat.Api.Infrastructure.Auth;

/// <summary>
/// Decides whether the current request may read stored chat history.
/// </summary>
public interface IChatAccessPolicy
{
    /// <summary>Resolves the access level for <paramref name="context"/>.</summary>
    ChatAccess Resolve(HttpContext context);
}

/// <summary>
/// Configuration-backed <see cref="IChatAccessPolicy"/>.
/// </summary>
/// <remarks>
/// <c>Security:AdminSubjects</c> is read once, at construction: the list changes with a redeploy,
/// not between requests, so resolving it per call would re-parse config on every sidebar load.
/// </remarks>
public sealed class ChatAccessPolicy : IChatAccessPolicy
{
    /// <summary>Configuration key listing the JWT subjects allowed to read history.</summary>
    public const string AdminSubjectsKey = "Security:AdminSubjects";

    private readonly string[] _adminSubjects;

    public ChatAccessPolicy(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        _adminSubjects = ReadAdminSubjects(configuration);
    }

    public ChatAccess Resolve(HttpContext context) => ChatIdentity.ResolveAccess(context, _adminSubjects);

    /// <summary>
    /// Reads the admin-subject list, accepting both an indexed array
    /// (<c>Security__AdminSubjects__0</c>) and a single comma- or semicolon-separated value —
    /// .env-based deployments can only express the latter.
    /// </summary>
    /// <returns>The distinct, non-blank subjects, compared case-insensitively later on.</returns>
    public static string[] ReadAdminSubjects(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var section = configuration.GetSection(AdminSubjectsKey);

        // A scalar value ("alice,bob") has no child keys, so Get<string[]>() returns null for it.
        // Read the raw value first, otherwise the comma form documented above silently grants
        // nobody admin — a failure that looks exactly like an empty list at runtime.
        var raw = section.Value is { Length: > 0 } scalar
            ? [scalar]
            : section.Get<string[]>() ?? [];

        return raw
            .SelectMany(value => (value ?? string.Empty).Split(
                [',', ';'],
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Where(value => value.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
