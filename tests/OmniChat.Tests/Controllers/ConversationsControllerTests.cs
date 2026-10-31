using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Api.Infrastructure;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Entities;
using OmniChat.Domain.Models;

namespace OmniChat.Tests.Controllers;

/// <summary>
/// Unit tests for the history read side. The admin/guest split is the security boundary here, so
/// every action is pinned twice: once for an admin caller and once for a guest, and the guest cases
/// assert the repository is never reached.
/// </summary>
public class ConversationsControllerTests
{
    private readonly Mock<IChatHistoryRepository> _repository = new();
    private readonly Mock<IChatAccessPolicy> _accessPolicy = new();

    private ConversationsController CreateController(ChatAccess access)
    {
        _accessPolicy.Setup(policy => policy.Resolve(It.IsAny<HttpContext>())).Returns(access);

        return new ConversationsController(_repository.Object, _accessPolicy.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { Request = { Path = "/api/conversations" } },
            },
        };
    }

    private static Conversation Conversation(string title = "Percakapan baru", params Message[] messages)
    {
        var conversation = new Conversation
        {
            Id = Guid.CreateVersion7(),
            Title = title,
            Mode = "agent",
            Model = "hermes-default",
            UserId = ChatIdentity.AdminUserId,
        };

        conversation.Messages.AddRange(messages);
        return conversation;
    }

    private static Message Turn(string role, string content, int minuteOffset = 0) => new()
    {
        Role = role,
        Content = content,
        CreatedAt = new DateTimeOffset(2026, 1, 1, 10, minuteOffset, 0, TimeSpan.Zero),
    };

    [Fact]
    public async Task List_ReturnsSummaries_ForAnAdminCaller()
    {
        var controller = CreateController(ChatAccess.Admin);
        var rows = new List<Conversation> { Conversation("first"), Conversation("second") };

        _repository
            .Setup(r => r.ListConversationsAsync(ChatIdentity.AdminUserId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(rows);

        var result = await controller.List(50, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var summaries = Assert.IsAssignableFrom<IEnumerable<ConversationSummary>>(ok.Value).ToList();
        Assert.Equal(2, summaries.Count);
        Assert.Equal("first", summaries[0].Title);
    }

    [Fact]
    public async Task List_ReturnsAnEmptyArray_ForAGuest_WithoutTouchingTheRepository()
    {
        var controller = CreateController(ChatAccess.Guest);

        var result = await controller.List(50, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Empty(Assert.IsAssignableFrom<IEnumerable<ConversationSummary>>(ok.Value));
        _repository.Verify(
            r => r.ListConversationsAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task List_ForwardsTheRequestedLimit()
    {
        var controller = CreateController(ChatAccess.Admin);

        _repository
            .Setup(r => r.ListConversationsAsync(ChatIdentity.AdminUserId, 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);

        await controller.List(7, CancellationToken.None);

        _repository.Verify(
            r => r.ListConversationsAsync(ChatIdentity.AdminUserId, 7, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Get_ReturnsTheTranscriptOldestFirst_ForAnAdminCaller()
    {
        var controller = CreateController(ChatAccess.Admin);
        var conversation = Conversation(
            "greeting",
            Turn("assistant", "hello", minuteOffset: 5),
            Turn("user", "hi", minuteOffset: 1));

        _repository
            .Setup(r => r.GetConversationAsync(conversation.Id, ChatIdentity.AdminUserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(conversation);

        var result = await controller.Get(conversation.Id, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var detail = Assert.IsType<ConversationDetail>(ok.Value);
        Assert.Equal(["hi", "hello"], detail.Messages.Select(message => message.Content));
    }

    [Fact]
    public async Task Get_Returns404AsProblemJson_WhenTheIdIsUnknown()
    {
        var controller = CreateController(ChatAccess.Admin);

        var result = await controller.Get(Guid.CreateVersion7(), CancellationToken.None);

        var notFound = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
        Assert.Contains(ProblemDetailsResponse.ContentType, notFound.ContentTypes);
        Assert.IsType<ProblemDetails>(notFound.Value);
    }

    [Fact]
    public async Task Get_Returns404_ForAGuest_WithoutTouchingTheRepository()
    {
        var controller = CreateController(ChatAccess.Guest);

        var result = await controller.Get(Guid.CreateVersion7(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result.Result).StatusCode);
        _repository.Verify(
            r => r.GetConversationAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Rename_TrimsTheTitleAndReturns204()
    {
        var controller = CreateController(ChatAccess.Admin);
        var id = Guid.CreateVersion7();

        _repository
            .Setup(r => r.RenameConversationAsync(id, ChatIdentity.AdminUserId, "renamed", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await controller.Rename(
            id,
            new RenameConversationRequest { Title = "  renamed  " },
            CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.Verify(
            r => r.RenameConversationAsync(id, ChatIdentity.AdminUserId, "renamed", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Rename_Returns400_WhenTheBodyFailedValidation()
    {
        var controller = CreateController(ChatAccess.Admin);
        controller.ModelState.AddModelError(nameof(RenameConversationRequest.Title), "The Title field is required.");

        var result = await controller.Rename(
            Guid.CreateVersion7(),
            new RenameConversationRequest(),
            CancellationToken.None);

        var badRequest = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
        Assert.Contains(ProblemDetailsResponse.ContentType, badRequest.ContentTypes);
        Assert.IsType<ValidationProblemDetails>(badRequest.Value);
        _repository.Verify(
            r => r.RenameConversationAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Rename_Returns404_WhenTheConversationIsNotOwned()
    {
        var controller = CreateController(ChatAccess.Admin);
        var id = Guid.CreateVersion7();

        _repository
            .Setup(r => r.RenameConversationAsync(id, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await controller.Rename(id, new RenameConversationRequest { Title = "x" }, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Rename_Returns404_ForAGuest_WithoutTouchingTheRepository()
    {
        var controller = CreateController(ChatAccess.Guest);

        var result = await controller.Rename(
            Guid.CreateVersion7(),
            new RenameConversationRequest { Title = "x" },
            CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
        _repository.Verify(
            r => r.RenameConversationAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Delete_Returns204_WhenTheConversationWasRemoved()
    {
        var controller = CreateController(ChatAccess.Admin);
        var id = Guid.CreateVersion7();

        _repository
            .Setup(r => r.DeleteConversationAsync(id, ChatIdentity.AdminUserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        Assert.IsType<NoContentResult>(await controller.Delete(id, CancellationToken.None));
    }

    [Fact]
    public async Task Delete_Returns404_WhenTheConversationIsNotOwned()
    {
        var controller = CreateController(ChatAccess.Admin);

        _repository
            .Setup(r => r.DeleteConversationAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await controller.Delete(Guid.CreateVersion7(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Delete_Returns404_ForAGuest_WithoutTouchingTheRepository()
    {
        var controller = CreateController(ChatAccess.Guest);

        var result = await controller.Delete(Guid.CreateVersion7(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
        _repository.Verify(
            r => r.DeleteConversationAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task SetPinned_Returns204_WhenThePinStateWasApplied()
    {
        var controller = CreateController(ChatAccess.Admin);
        var id = Guid.CreateVersion7();

        _repository
            .Setup(r => r.PinConversationAsync(id, ChatIdentity.AdminUserId, true, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await controller.SetPinned(id, new PinConversationRequest { IsPinned = true }, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repository.Verify(
            r => r.PinConversationAsync(id, ChatIdentity.AdminUserId, true, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task SetPinned_Returns404_WhenTheConversationIsNotOwned()
    {
        var controller = CreateController(ChatAccess.Admin);

        _repository
            .Setup(r => r.PinConversationAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await controller.SetPinned(Guid.CreateVersion7(), new PinConversationRequest { IsPinned = true }, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task SetPinned_Returns404_ForAGuest_WithoutTouchingTheRepository()
    {
        var controller = CreateController(ChatAccess.Guest);

        var result = await controller.SetPinned(Guid.CreateVersion7(), new PinConversationRequest { IsPinned = true }, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
        _repository.Verify(
            r => r.PinConversationAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
