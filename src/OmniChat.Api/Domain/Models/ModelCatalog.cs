namespace OmniChat.Domain.Models;

/// <summary>Available models grouped by chat mode (Hermes agent bridge vs direct LLM).</summary>
public record ModelCatalog(IReadOnlyList<ModelInfo> Agent, IReadOnlyList<ModelInfo> Direct);
