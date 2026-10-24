namespace MoneyVisualizer.Api.Infrastructure;

/// <summary>Base for expected, user-facing failures that map to a specific HTTP status.</summary>
public abstract class AppException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class NotFoundException(string entity) : AppException($"{entity} was not found.", StatusCodes.Status404NotFound);

public sealed class BusinessRuleException(string message) : AppException(message, StatusCodes.Status400BadRequest);

public sealed class ConflictException(string message) : AppException(message, StatusCodes.Status409Conflict);

public sealed class ExternalServiceException(string message) : AppException(message, StatusCodes.Status502BadGateway);

public sealed class NotConfiguredException(string message) : AppException(message, StatusCodes.Status503ServiceUnavailable);
