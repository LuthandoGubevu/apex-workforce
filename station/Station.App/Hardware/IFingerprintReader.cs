namespace Apex.Station.Hardware;

public record IdentifyResult(bool Matched, string? EmployeeId, int Score);
public record EnrolmentCapture(bool Success, string? TemplateBase64, string? ErrorMessage);

public interface IFingerprintReader : IAsyncDisposable
{
    Task InitialiseAsync(CancellationToken ct = default);
    /// <summary>Blocks until a finger is placed and identified. Returns immediately in simulate mode.</summary>
    Task<IdentifyResult> IdentifyAsync(CancellationToken ct = default);
    /// <summary>Three-capture enrolment workflow. Returns merged template as base64.</summary>
    Task<EnrolmentCapture> EnrolAsync(CancellationToken ct = default);
    bool IsReady { get; }
}
