using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using OmniChat.Api.Controllers;
using OmniChat.Api.Infrastructure.Auth;
using OmniChat.Application.Interfaces;
using OmniChat.Domain.Models;

namespace OmniChat.Tests.Controllers;

/// <summary>
/// Guards the controller error paths against a null HttpContext. Unit tests invoke
/// controller actions directly (no WebApplicationFactory), so HttpContext is null
/// unless a ControllerContext is set. The ProblemDetails helpers must tolerate that
/// (HttpContext?.Request.Path) instead of NRE-ing on HttpContext.Request.Path.
/// </summary>
public class ControllerNullHttpContextTests
{
    [Fact]
    public async Task Expenses_InvalidMonth_ReturnsBadRequestWithoutNullHttpContext()
    {
        var controller = new ExpensesController(
            new Mock<IExpenseRepository>().Object,
            new Mock<IExpenseAdviceService>().Object,
            new Mock<IExpensePdfReport>().Object);

        // Deliberately no ControllerContext -> HttpContext is null.
        var result = await controller.List("bukan-bulan", cancellationToken: CancellationToken.None);

        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task Expenses_InvalidMonth_Target_ReturnsBadRequestWithoutNullHttpContext()
    {
        var controller = new ExpensesController(
            new Mock<IExpenseRepository>().Object,
            new Mock<IExpenseAdviceService>().Object,
            new Mock<IExpensePdfReport>().Object);

        var result = await controller.Target("bukan-bulan", CancellationToken.None);

        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task Conversations_InvalidFeedback_ReturnsBadRequestWithoutNullHttpContext()
    {
        var repository = new Mock<IChatHistoryRepository>();
        var accessPolicy = new Mock<IChatAccessPolicy>();
        accessPolicy.Setup(p => p.Resolve(It.IsAny<Microsoft.AspNetCore.Http.HttpContext>()))
            .Returns(ChatAccess.Admin);
        var identity = new Mock<IChatIdentity>();
        identity.Setup(i => i.ResolveUserId(It.IsAny<Microsoft.AspNetCore.Http.HttpContext>())).Returns("admin");
        var controller = new ConversationsController(repository.Object, accessPolicy.Object, identity.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext(),
            },
        };

        // Invalid feedback short-circuits to the 400 ProblemDetails path (which
        // reads HttpContext?.Request.Path) before touching the repository.
        var result = await controller.SetFeedback(
            Guid.NewGuid(),
            Guid.NewGuid(),
            new MessageFeedbackRequest { Feedback = "aneh" },
            CancellationToken.None);

        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, bad.StatusCode);
        repository.Verify(r => r.SetMessageFeedbackAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<MessageFeedback?>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
