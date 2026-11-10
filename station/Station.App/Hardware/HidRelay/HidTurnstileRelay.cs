using System.Runtime.InteropServices;
using Microsoft.Extensions.Configuration;

namespace Apex.Station.Hardware.HidRelay;

public sealed class HidTurnstileRelay : ITurnstileRelay
{
    private readonly IConfiguration _config;
    private IntPtr _hDevice = HidApi.INVALID_HANDLE_VALUE;
    private bool   _disposed;

    // 9-byte HID output report (report-id 0x00 + 8 data bytes)
    // Channel 1 ON:  0xFF 0x01 …
    // Channel 1 OFF: 0xFD 0x01 …
    private static readonly byte[] RelayOnCmd  = { 0x00, 0xFF, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
    private static readonly byte[] RelayOffCmd = { 0x00, 0xFD, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

    public bool IsReady => _hDevice != HidApi.INVALID_HANDLE_VALUE;

    public HidTurnstileRelay(IConfiguration config) { _config = config; }

    public Task InitialiseAsync(CancellationToken ct = default)
    {
        ushort vid = ParseHex(_config["Hardware:RelayVid"], 0x16C0);
        ushort pid = ParseHex(_config["Hardware:RelayPid"], 0x05DF);

        var guid    = HidApi.HidGuid;
        IntPtr devInfo = HidApi.SetupDiGetClassDevs(
            ref guid, IntPtr.Zero, IntPtr.Zero,
            HidApi.DIGCF_PRESENT | HidApi.DIGCF_DEVICEINTERFACE);

        if (devInfo == HidApi.INVALID_HANDLE_VALUE)
            throw new InvalidOperationException("SetupDiGetClassDevs failed — only supported on Windows.");

        try
        {
            uint idx = 0;
            while (true)
            {
                var ifaceData = new HidApi.SP_DEVICE_INTERFACE_DATA
                {
                    cbSize = Marshal.SizeOf<HidApi.SP_DEVICE_INTERFACE_DATA>()
                };

                if (!HidApi.SetupDiEnumDeviceInterfaces(
                        devInfo, IntPtr.Zero, ref guid, idx++, ref ifaceData))
                {
                    if (Marshal.GetLastWin32Error() == HidApi.ERROR_NO_MORE_ITEMS) break;
                    continue;
                }

                var detail = new HidApi.SP_DEVICE_INTERFACE_DETAIL_DATA
                {
                    cbSize    = IntPtr.Size == 8 ? 8 : 5,
                    DevicePath = string.Empty,
                };
                HidApi.SetupDiGetDeviceInterfaceDetail(
                    devInfo, ref ifaceData, ref detail, 256, out _, IntPtr.Zero);

                IntPtr h = HidApi.CreateFile(
                    detail.DevicePath,
                    HidApi.GENERIC_READ | HidApi.GENERIC_WRITE,
                    HidApi.FILE_SHARE_READ | HidApi.FILE_SHARE_WRITE,
                    IntPtr.Zero, HidApi.OPEN_EXISTING, 0, IntPtr.Zero);

                if (h == HidApi.INVALID_HANDLE_VALUE) continue;

                var attrs = new HidApi.HIDD_ATTRIBUTES
                {
                    Size = Marshal.SizeOf<HidApi.HIDD_ATTRIBUTES>()
                };
                if (HidApi.HidD_GetAttributes(h, ref attrs) &&
                    attrs.VendorID == vid && attrs.ProductID == pid)
                {
                    _hDevice = h;
                    Console.WriteLine($"[RELAY] HID relay found (VID={vid:X4} PID={pid:X4})");
                    return Task.CompletedTask;
                }

                HidApi.CloseHandle(h);
            }
        }
        finally
        {
            HidApi.SetupDiDestroyDeviceInfoList(devInfo);
        }

        throw new InvalidOperationException(
            $"HID relay board not found (VID=0x{vid:X4} PID=0x{pid:X4}). " +
            "Check USB connection. For serial relay boards use Hardware:RelayType=serial.");
    }

    public async Task PulseAsync(int durationMs, CancellationToken ct = default)
    {
        if (!IsReady) throw new InvalidOperationException("HID relay not initialised");
        SendCommand(RelayOnCmd);
        try    { await Task.Delay(durationMs, ct); }
        finally { SendCommand(RelayOffCmd); }
    }

    private void SendCommand(byte[] cmd)
    {
        if (!HidApi.WriteFile(_hDevice, cmd, (uint)cmd.Length, out _, IntPtr.Zero))
            Console.WriteLine($"[RELAY] WriteFile failed: win32={Marshal.GetLastWin32Error()}");
    }

    public ValueTask DisposeAsync()
    {
        if (!_disposed && _hDevice != HidApi.INVALID_HANDLE_VALUE)
        {
            _disposed = true;
            HidApi.CloseHandle(_hDevice);
            _hDevice = HidApi.INVALID_HANDLE_VALUE;
        }
        return ValueTask.CompletedTask;
    }

    private static ushort ParseHex(string? s, ushort fallback)
    {
        if (s is null) return fallback;
        s = s.TrimStart().TrimStart('0').TrimStart('x', 'X');
        return ushort.TryParse(s, System.Globalization.NumberStyles.HexNumber, null, out var v)
            ? v : fallback;
    }
}
