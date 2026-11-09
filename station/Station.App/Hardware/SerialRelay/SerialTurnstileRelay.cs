using System.IO.Ports;
using Microsoft.Extensions.Configuration;

namespace Apex.Station.Hardware.SerialRelay;

public sealed class SerialTurnstileRelay : ITurnstileRelay
{
    private readonly IConfiguration _config;
    private SerialPort? _port;
    private bool _disposed;

    // CH340 relay protocol (4-byte commands)
    // Relay 1 ON:  [0xA0, 0x01, 0x01, 0xA2]
    // Relay 1 OFF: [0xA0, 0x01, 0x00, 0xA1]
    private static readonly byte[] RelayOnCmd  = { 0xA0, 0x01, 0x01, 0xA2 };
    private static readonly byte[] RelayOffCmd = { 0xA0, 0x01, 0x00, 0xA1 };

    public bool IsReady => _port?.IsOpen ?? false;

    public SerialTurnstileRelay(IConfiguration config) { _config = config; }

    public Task InitialiseAsync(CancellationToken ct = default)
    {
        var portName = _config["Hardware:RelaySerialPort"] ?? "COM3";
        var baud     = int.TryParse(_config["Hardware:RelaySerialBaud"], out var b) ? b : 9600;

        _port = new SerialPort(portName, baud, Parity.None, 8, StopBits.One)
        {
            ReadTimeout  = 1000,
            WriteTimeout = 1000,
        };
        _port.Open();
        Console.WriteLine($"[RELAY] Serial relay opened on {portName} @ {baud} baud");
        return Task.CompletedTask;
    }

    public async Task PulseAsync(int durationMs, CancellationToken ct = default)
    {
        if (_port is null || !_port.IsOpen)
            throw new InvalidOperationException("Serial relay not open");

        _port.Write(RelayOnCmd, 0, RelayOnCmd.Length);
        try    { await Task.Delay(durationMs, ct); }
        finally { _port.Write(RelayOffCmd, 0, RelayOffCmd.Length); }
    }

    public ValueTask DisposeAsync()
    {
        if (!_disposed)
        {
            _disposed = true;
            _port?.Close();
            _port?.Dispose();
        }
        return ValueTask.CompletedTask;
    }
}
