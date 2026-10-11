using System.ComponentModel.DataAnnotations;
using OmniChat.Domain.Models;

namespace OmniChat.Tests.Validation;

/// <summary>
/// Unit tests for ChatRequest and ChatMessage input validation attributes.
/// Guards against oversized payloads, invalid roles, and empty fields.
/// </summary>
public class ChatRequestValidationTests
{
    private static IList<ValidationResult> Validate(object model)
    {
        var context = new ValidationContext(model);
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(model, context, results, validateAllProperties: true);
        return results;
    }

    [Fact]
    public void ValidRequest_PassesValidation()
    {
        var request = new ChatRequest
        {
            Model = "test-model",
            Messages = [new ChatMessage("user", "Hello!")],
            UseHermesBridge = true
        };

        var results = Validate(request);
        Assert.Empty(results);
    }

    [Fact]
    public void Model_EmptyString_FailsRequired()
    {
        var request = new ChatRequest
        {
            Model = "",
            Messages = [new ChatMessage("user", "Hello!")],
        };

        var results = Validate(request);
        Assert.Contains(results, r => r.ErrorMessage == "Model is required.");
    }

    [Fact]
    public void Model_ExceedingMaxLength_Fails()
    {
        var request = new ChatRequest
        {
            Model = new string('a', 101),
            Messages = [new ChatMessage("user", "Hello!")],
        };

        var results = Validate(request);
        Assert.Contains(results, r => r.ErrorMessage == "Model name cannot exceed 100 characters.");
    }

    [Fact]
    public void Messages_EmptyList_FailsMinLength()
    {
        var request = new ChatRequest
        {
            Model = "test",
            Messages = [],
        };

        var results = Validate(request);
        Assert.Contains(results, r => r.ErrorMessage == "At least one message is required.");
    }

    [Fact]
    public void Messages_ExceedingMaxCount_Fails()
    {
        var messages = Enumerable.Range(0, 51)
            .Select(_ => new ChatMessage("user", "hi"))
            .ToList();

        var request = new ChatRequest
        {
            Model = "test",
            Messages = messages,
        };

        var results = Validate(request);
        Assert.Contains(results, r => r.ErrorMessage == "Cannot exceed 50 messages per request.");
    }

    [Fact]
    public void ChatMessage_InvalidRole_Fails()
    {
        var msg = new ChatMessage("admin", "hello");
        var results = Validate(msg);
        Assert.Contains(results, r => r.ErrorMessage == "Role must be 'user', 'assistant', or 'system'.");
    }

    [Theory]
    [InlineData("user")]
    [InlineData("assistant")]
    [InlineData("system")]
    public void ChatMessage_ValidRoles_Pass(string role)
    {
        var msg = new ChatMessage(role, "hello");
        var results = Validate(msg);
        Assert.Empty(results);
    }

    [Fact]
    public void ChatMessage_ContentExceedingMaxLength_Fails()
    {
        var msg = new ChatMessage("user", new string('x', 8001));
        var results = Validate(msg);
        Assert.Contains(results, r => r.ErrorMessage == "Content cannot exceed 8000 characters.");
    }

    [Fact]
    public void ChatMessage_EmptyContent_FailsRequired()
    {
        var msg = new ChatMessage("user", "");
        var results = Validate(msg);
        Assert.Contains(results, r => r.ErrorMessage == "Content is required.");
    }

    [Fact]
    public void ChatMessage_EmptyRole_FailsRequired()
    {
        var msg = new ChatMessage("", "hello");
        var results = Validate(msg);
        Assert.Contains(results, r => r.ErrorMessage == "Role is required.");
    }
}
