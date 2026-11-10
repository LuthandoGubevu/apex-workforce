namespace Apex.Station.Hardware;

public interface ITurnstileRelay : IAsyncDisposable
{
    Task InitialiseAsync(CancellationToken ct = default);
    /// <summary>Closes the relay for durationMs, then opens it. Non-blocking after the pulse completes.</summary>
    Task PulseAsync(int durationMs, CancellationToken ct = default);
    bool IsReady { get; }
}
