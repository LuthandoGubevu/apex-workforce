using Microsoft.Extensions.Configuration;

namespace Apex.Station.Hardware.ZkFingerprint;

public sealed class ZkFingerprintReader : IFingerprintReader
{
    private readonly IConfiguration _config;
    private IntPtr _hDevice  = IntPtr.Zero;
    private IntPtr _hDBCache = IntPtr.Zero;
    private readonly Dictionary<int, string> _fpIdToEmployeeId = new();
    private int _nextFpId       = 1;
    private int _matchThreshold = 70;
    private bool _disposed;

    public bool IsReady => _hDevice != IntPtr.Zero && _hDBCache != IntPtr.Zero;

    public ZkFingerprintReader(IConfiguration config) { _config = config; }

    public Task InitialiseAsync(CancellationToken ct = default)
    {
        _matchThreshold = int.TryParse(_config["Hardware:FingerprintMatchThreshold"], out var t) ? t : 70;

        int rc = ZkApi.ZKFP_Init();
        if (rc != ZkApi.ZKFP_ERR_OK)
            throw new InvalidOperationException($"ZKFP_Init failed: {rc}. Ensure libzkfp.dll (64-bit) is in the application directory.");

        int count = ZkApi.ZKFP_GetDeviceCount();
        if (count == 0)
            throw new InvalidOperationException("No ZKTeco fingerprint readers detected. Check USB connection and driver installation.");

        _hDevice = ZkApi.ZKFP_OpenDevice(0);
        if (_hDevice == IntPtr.Zero)
            throw new InvalidOperationException("ZKFP_OpenDevice failed. Verify libzkfp.dll is present and the reader is not in use by another process.");

        _hDBCache = ZkApi.ZKFP_DBInit(50_000);
        if (_hDBCache == IntPtr.Zero)
            throw new InvalidOperationException("ZKFP_DBInit failed — insufficient memory.");

        Console.WriteLine($"[ZK] ZKTeco reader opened. {count} device(s) detected.");
        return Task.CompletedTask;
    }

    /// <summary>Loads a decrypted template into the in-memory 1:N match cache. Called by SyncService at startup.</summary>
    public void LoadTemplate(string employeeId, int fpId, byte[] template)
    {
        if (!IsReady) return;
        int rc = ZkApi.ZKFP_DBAdd(_hDBCache, fpId, template, template.Length);
        if (rc == ZkApi.ZKFP_ERR_OK)
        {
            _fpIdToEmployeeId[fpId] = employeeId;
            if (fpId >= _nextFpId) _nextFpId = fpId + 1;
        }
        else
        {
            Console.WriteLine($"[ZK] DBAdd failed for employee {employeeId}: rc={rc}");
        }
    }

    /// <summary>Removes a specific employee from the 1:N cache (e.g. after termination).</summary>
    public void RemoveTemplate(string employeeId)
    {
        var key = _fpIdToEmployeeId.FirstOrDefault(kv => kv.Value == employeeId).Key;
        if (key == 0 && !_fpIdToEmployeeId.ContainsKey(0)) return;
        _fpIdToEmployeeId.Remove(key);
        // DBClear + re-add remaining is the only way to remove one entry from ZK cache
        if (!IsReady) return;
        ZkApi.ZKFP_DBClear(_hDBCache);
        // remaining entries must be re-added by caller (SyncService.ReloadTemplatesAsync)
    }

    /// <summary>Clears the entire in-memory template cache.</summary>
    public void ClearTemplates()
    {
        if (!IsReady) return;
        ZkApi.ZKFP_DBClear(_hDBCache);
        _fpIdToEmployeeId.Clear();
        _nextFpId = 1;
    }

    /// <summary>Allocates the next available integer template ID.</summary>
    public int AllocateFpId() => _nextFpId++;

    public async Task<IdentifyResult> IdentifyAsync(CancellationToken ct = default)
    {
        if (!IsReady) return new IdentifyResult(false, null, 0);

        var tpl     = new byte[ZkApi.TEMPLATE_SIZE];
        int tplLen  = ZkApi.TEMPLATE_SIZE;
        int imgLen  = 0;
        int quality = 0;
        int rc;
        int attempts = 0;

        // Retry until acceptable quality or max attempts
        do
        {
            ct.ThrowIfCancellationRequested();
            tplLen  = ZkApi.TEMPLATE_SIZE;
            imgLen  = 0;
            quality = 0;
            rc = ZkApi.ZKFP_AcquireFingerprint(_hDevice, tpl, ref tplLen, null!, ref imgLen, ref quality);
            attempts++;
            if (rc != ZkApi.ZKFP_ERR_OK || quality < 30)
                await Task.Delay(100, ct);
        }
        while ((rc != ZkApi.ZKFP_ERR_OK || quality < 30) && attempts < 10);

        if (rc != ZkApi.ZKFP_ERR_OK || tplLen == 0)
            return new IdentifyResult(false, null, 0);

        if (_fpIdToEmployeeId.Count == 0)
            return new IdentifyResult(false, null, 0);

        int fpId  = 0;
        int score = 0;
        rc = ZkApi.ZKFP_DBIdentify(_hDBCache, tpl, tplLen, ref fpId, ref score);

        if (rc == ZkApi.ZKFP_ERR_OK && score >= _matchThreshold &&
            _fpIdToEmployeeId.TryGetValue(fpId, out var empId))
        {
            return new IdentifyResult(true, empId, score);
        }

        return new IdentifyResult(false, null, score);
    }

    public async Task<EnrolmentCapture> EnrolAsync(CancellationToken ct = default)
    {
        if (!IsReady)
            return new EnrolmentCapture(false, null, "Reader not ready");

        var captures    = new byte[3][];
        var captureLens = new int[3];

        for (int i = 0; i < 3; i++)
        {
            ct.ThrowIfCancellationRequested();
            Console.WriteLine($"[ZK] Enrolment scan {i + 1}/3 — place finger on reader…");

            var tpl     = new byte[ZkApi.TEMPLATE_SIZE];
            int tplLen  = ZkApi.TEMPLATE_SIZE;
            int imgLen  = 0;
            int quality = 0;
            int rc;
            int attempts = 0;

            do
            {
                ct.ThrowIfCancellationRequested();
                tplLen  = ZkApi.TEMPLATE_SIZE;
                imgLen  = 0;
                quality = 0;
                rc = ZkApi.ZKFP_AcquireFingerprint(_hDevice, tpl, ref tplLen, null!, ref imgLen, ref quality);
                attempts++;
                if (rc != ZkApi.ZKFP_ERR_OK || quality < 50)
                    await Task.Delay(200, ct);
            }
            while ((rc != ZkApi.ZKFP_ERR_OK || quality < 50) && attempts < 20);

            if (rc != ZkApi.ZKFP_ERR_OK || tplLen == 0)
                return new EnrolmentCapture(false, null, $"Scan {i + 1}/3 failed (rc={rc}, quality={quality}). Try again.");

            captures[i]    = tpl;
            captureLens[i] = tplLen;

            if (i < 2)
            {
                Console.WriteLine($"[ZK] Scan {i + 1} OK — lift finger.");
                await Task.Delay(800, ct);
            }
        }

        // Merge 3 captures into one final template
        var merged    = new byte[ZkApi.TEMPLATE_SIZE];
        int mergedLen = ZkApi.TEMPLATE_SIZE;
        int mergeRc = ZkApi.ZKFP_DBMerge(
            _hDBCache,
            captures[0], captures[1], captures[2],
            merged, ref mergedLen);

        // POPIA: zero the per-capture buffers immediately after merge
        foreach (var cap in captures) Array.Clear(cap, 0, cap.Length);

        if (mergeRc != ZkApi.ZKFP_ERR_OK)
        {
            Array.Clear(merged, 0, merged.Length);
            return new EnrolmentCapture(false, null, $"Template merge failed (rc={mergeRc}). Ensure all 3 scans are of the same finger.");
        }

        var trimmed = new byte[mergedLen];
        Array.Copy(merged, trimmed, mergedLen);
        Array.Clear(merged, 0, merged.Length); // zero the full-size buffer too

        return new EnrolmentCapture(true, Convert.ToBase64String(trimmed), null);
    }

    public ValueTask DisposeAsync()
    {
        if (_disposed) return ValueTask.CompletedTask;
        _disposed = true;
        if (_hDBCache != IntPtr.Zero) { ZkApi.ZKFP_DBFree(_hDBCache);    _hDBCache = IntPtr.Zero; }
        if (_hDevice  != IntPtr.Zero) { ZkApi.ZKFP_CloseDevice(_hDevice); _hDevice  = IntPtr.Zero; }
        ZkApi.ZKFP_Terminate();
        return ValueTask.CompletedTask;
    }
}
