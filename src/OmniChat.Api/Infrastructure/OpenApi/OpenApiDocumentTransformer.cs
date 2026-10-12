using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace OmniChat.Api.Infrastructure.OpenApi;

/// <summary>
/// Enriches the OpenAPI document with project-level metadata so that
/// <c>/openapi/v1.json</c> (served in Development) carries a meaningful
/// title, description, contact, and license instead of the bare defaults.
/// </summary>
public sealed class OpenApiDocumentTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        document.Info = new OpenApiInfo
        {
            Title = "OmniChat API",
            Description = "Hybrid AI Dashboard with SSE streaming. Supports Hermes Bridge mode (agent gateway) and Direct LLM mode (OpenRouter). Stateless .NET 10 backend with dual authentication (API key + JWT).",
            Version = "v1",
            Contact = new OpenApiContact
            {
                Name = "Rholly",
                Url = new Uri("https://github.com/rholly4502/OmniChat"),
            },
            License = new OpenApiLicense
            {
                Name = "MIT",
                Url = new Uri("https://opensource.org/licenses/MIT"),
            },
        };

        return Task.CompletedTask;
    }
}
