namespace OmniChat.Domain.Models;

/// <summary>A selectable model: stable <paramref name="Id"/> plus display <paramref name="Label"/>.</summary>
public record ModelInfo(string Id, string Label);
