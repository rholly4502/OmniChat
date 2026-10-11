# Milestone 15: RFC 7807 ProblemDetails Standardization

## Goal
Standardize all API error responses to RFC 7807 ProblemDetails format with
`application/problem+json` content type. Currently errors use ad-hoc JSON
(`{ "error": "..." }`). ProblemDetails gives clients a consistent, typed
error schema with `title`, `status`, `detail`, `instance`, and `traceId`.

## Tasks

### T1: Program.cs — register ProblemDetails + custom validation factory
- Add `builder.Services.AddProblemDetails()`
- Configure `ApiBehaviorOptions.InvalidModelStateResponseFactory` to return
  `ValidationProblemDetails` with `traceId` extension and `application/problem+json`
- Test: integration test verifying validation 400 returns problem+json with traceId

### T2: ChatController — remove custom ModelState handling
- Remove the `if (!ModelState.IsValid)` block (framework handles it via [ApiController])
- Framework now returns ValidationProblemDetails automatically
- Test: existing 400 integration tests still pass; add body format assertion

### T3: ExceptionHandlingMiddleware — ProblemDetails for 500
- Change ContentType to `application/problem+json`
- Write `ProblemDetails { Title="Internal Server Error", Status=500, Detail, Instance, traceId }`
- Test: update content-type + body assertions

### T4: ApiKeyMiddleware — ProblemDetails for 401
- Write `ProblemDetails { Title="Unauthorized", Status=401, Detail, Instance, traceId }`
- Test: update body assertion

### T5: JwtAuthenticationMiddleware — ProblemDetails for 401
- Update `RejectAsync` to write ProblemDetails
- Test: update body assertion

### T6: Rate Limiter — ProblemDetails for 429
- Update `OnRejected` callback to write ProblemDetails
- Test: update content-type assertion

### T7: README — document error format + fix M14 test count
- Add ProblemDetails error response section with examples
- Fix M14 test count: 133 → 137

### T8: Build + test + commit + push + check CI
