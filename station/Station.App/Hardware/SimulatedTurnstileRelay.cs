namespace Apex.Station.Hardware;

/// <summary>Simulation implementation of ITurnstileRelay — logs instead of pulsing a physical relay.</summary>
public sealed class SimulatedTurnstileRelay : ITurnstileRelay
{
    private bool _disposed;

    public bool IsReady { get; private set; }

    public Task InitialiseAsync(CancellationToken ct = default)
    {
        Console.WriteLine("[SIM RELAY] Turnstile relay initialised (simulation mode)");
        IsReady = true;
        return Task.CompletedTask;
    }

    public async Task PulseAsync(int durationMs, CancellationToken ct = default)
    {
        Console.WriteLine($"[SIM RELAY] ON  — gate open ({durationMs} ms pulse)");
        await Task.Delay(durationMs, ct);
        Console.WriteLine("[SIM RELAY] OFF — gate closed");
    }

    public ValueTask DisposeAsync()
    {
        if (!_disposed)
        {
            _disposed = true;
            IsReady = false;
            Console.WriteLine("[SIM RELAY] Disposed");
        }
        return ValueTask.CompletedTask;
    }
}
