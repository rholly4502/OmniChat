using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ChatController : ControllerBase
{
    [HttpPost("send")]
    public IActionResult SendMessage([FromBody] ChatRequest request)
    {
        return Ok(new { message = "Received prompt in mode: " + request.Mode, prompt = request.Prompt });
    }
}

public record ChatRequest(string Prompt, string Mode);
