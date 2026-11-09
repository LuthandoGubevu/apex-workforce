namespace Apex.Station.Hardware;

/// <summary>
/// Simulation implementation of IFingerprintReader.
/// Call AddSimulatedEmployee() to register employees that will be "matched" on identify.
/// Rotates through registered employees in order on each IdentifyAsync call.
/// </summary>
public sealed class SimulatedFingerprintReader : IFingerprintReader
{
    private readonly List<string> _enrolledEmployeeIds = new();
    private int _rotateIndex;
    private bool _disposed;

    public bool IsReady { get; private set; }

    public Task InitialiseAsync(CancellationToken ct = default)
    {
        Console.WriteLine("[SIM FP] Fingerprint reader initialised (simulation mode)");
        IsReady = true;
        return Task.CompletedTask;
    }

    /// <summary>Register an employee ID so the simulator can "match" them.</summary>
    public void AddSimulatedEmployee(string employeeId)
    {
        if (!_enrolledEmployeeIds.Contains(employeeId))
            _enrolledEmployeeIds.Add(employeeId);
    }

    public async Task<IdentifyResult> IdentifyAsync(CancellationToken ct = default)
    {
        Console.WriteLine("[SIM FP] Waiting for finger placement (simulated 400 ms)…");
        await Task.Delay(400, ct);

        if (_enrolledEmployeeIds.Count == 0)
        {
            Console.WriteLine("[SIM FP] No enrolled employees → no match");
            return new IdentifyResult(false, null, 0);
        }

        var employeeId = _enrolledEmployeeIds[_rotateIndex % _enrolledEmployeeIds.Count];
        _rotateIndex++;
        int score = Random.Shared.Next(75, 100);
        Console.WriteLine($"[SIM FP] Matched employee {employeeId} (score {score})");
        return new IdentifyResult(true, employeeId, score);
    }

    public async Task<EnrolmentCapture> EnrolAsync(CancellationToken ct = default)
    {
        Console.WriteLine("[SIM FP] Enrolment started — 3 captures (simulated 1200 ms each)…");
        for (int i = 1; i <= 3; i++)
        {
            Console.WriteLine($"[SIM FP]   Capture {i}/3 — place finger");
            await Task.Delay(1200, ct);
            Console.WriteLine($"[SIM FP]   Capture {i}/3 — OK");
        }

        // Return a fake 512-byte template as base64
        var fakeTemplate = new byte[512];
        Random.Shared.NextBytes(fakeTemplate);
        var base64 = Convert.ToBase64String(fakeTemplate);
        Console.WriteLine("[SIM FP] Enrolment complete — template generated");
        return new EnrolmentCapture(true, base64, null);
    }

    public ValueTask DisposeAsync()
    {
        if (!_disposed)
        {
            _disposed = true;
            IsReady = false;
            Console.WriteLine("[SIM FP] Disposed");
        }
        return ValueTask.CompletedTask;
    }
}
