using Apex.Station.Hardware;
using Apex.Station.Hardware.ZkFingerprint;
using Apex.Station.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;

namespace Apex.Station.Services;

public sealed class SyncService : BackgroundService
{
    private readonly FirestoreRestClient _firestore;
    private readonly LocalDatabase _db;
    private readonly IConfiguration _config;

    private DateTime _lastDataSync     = DateTime.MinValue;
    private DateTime _lastHeartbeat    = DateTime.MinValue;
    private int _pendingCount;

    public int PendingCount => _pendingCount;
    public DateTime LastSyncTime { get; private set; } = DateTime.MinValue;

    private readonly IServiceProvider? _services;

    public SyncService(FirestoreRestClient firestore, LocalDatabase db, IConfiguration config,
        IServiceProvider? services = null)
    {
        _firestore = firestore;
        _db        = db;
        _config    = config;
        _services  = services;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Sign in device account
        var email    = _config["Firebase:DeviceEmail"]    ?? "";
        var password = _config["Firebase:DevicePassword"] ?? "";

        if (!string.IsNullOrEmpty(email) && !string.IsNullOrEmpty(password))
        {
            try { await _firestore.SignInAsync(email, password, stoppingToken); }
            catch (Exception ex) { Console.WriteLine($"[SYNC] Auth failed: {ex.Message}"); }
        }

        // Load cached fingerprint templates into ZK reader on startup
        await LoadFingerprintTemplatesAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            await SyncEventsAsync(stoppingToken);

            if (DateTime.UtcNow - _lastDataSync > TimeSpan.FromMinutes(2))
            {
                await SyncEmployeesAsync(stoppingToken);
                _lastDataSync = DateTime.UtcNow;
            }

            if (DateTime.UtcNow - _lastHeartbeat > TimeSpan.FromSeconds(60))
            {
                await SendHeartbeatAsync(stoppingToken);
                _lastHeartbeat = DateTime.UtcNow;
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken).ContinueWith(_ => { });
        }
    }

    private async Task SyncEventsAsync(CancellationToken ct)
    {
        try
        {
            var unsynced = await _db.GetUnsyncedAsync();
            _pendingCount = unsynced.Count;

            foreach (var ev in unsynced)
            {
                var fields = new Dictionary<string, object?>
                {
                    ["employeeId"]         = ev.EmployeeId,
                    ["employeeNumber"]     = ev.EmployeeNumber,
                    ["employeeName"]       = ev.EmployeeName,
                    ["stationId"]          = ev.StationId,
                    ["stationName"]        = ev.StationName,
                    ["siteId"]             = ev.SiteId,
                    ["direction"]          = ev.Direction == ClockDirection.In ? "IN" : "OUT",
                    ["result"]             = ev.Result == ClockResult.Accepted ? "accepted" : "denied",
                    ["deniedReason"]       = ev.DeniedReason,
                    ["timestamp"]          = ev.Timestamp.ToString("o"),
                    ["templateMatchScore"] = (object?)(ev.TemplateMatchScore.HasValue ? (int?)ev.TemplateMatchScore.Value : null),
                    ["isCorrection"]       = ev.IsCorrection,
                    ["createdAt"]          = ev.CreatedAt.ToString("o"),
                };

                bool ok = await _firestore.AddDocumentAsync("clockEvents", fields, ct);
                if (ok)
                {
                    await _db.MarkSyncedAsync(ev.Id);
                    _pendingCount--;
                }
            }

            if (unsynced.Count > 0)
                LastSyncTime = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SYNC] Event sync error: {ex.Message}");
        }
    }

    private async Task SyncEmployeesAsync(CancellationToken ct)
    {
        try
        {
            var docs = await _firestore.GetCollectionRawAsync("employees", ct);
            foreach (var doc in docs)
            {
                var id     = FirestoreRestClient.ExtractDocId(doc);
                var fields = doc["fields"];
                if (fields is null) continue;

                // Parse employee fields
                static string fs(System.Text.Json.Nodes.JsonNode? f, string k) =>
                    f?[k]?["stringValue"]?.GetValue<string>() ?? "";
                static bool fb(System.Text.Json.Nodes.JsonNode? f, string k) =>
                    f?[k]?["booleanValue"]?.GetValue<bool>() ?? false;

                var statusStr = fs(fields, "status");
                var empTypeStr = fs(fields, "employmentType");
                var startDateStr = fs(fields, "startDate");
                var endDateStr = fs(fields, "endDate");

                if (!Enum.TryParse<EmployeeStatus>(statusStr, ignoreCase: true, out var status))
                    continue;
                if (!Enum.TryParse<EmploymentType>(empTypeStr, ignoreCase: true, out var empType))
                    empType = EmploymentType.Permanent;
                if (!DateOnly.TryParse(startDateStr, out var startDate))
                    continue;
                DateOnly? endDate = DateOnly.TryParse(endDateStr, out var ed) ? ed : null;

                var emp = new Employee(
                    Id:               id,
                    EmployeeNumber:   fs(fields, "employeeNumber"),
                    FullName:         fs(fields, "fullName"),
                    Department:       fs(fields, "department"),
                    SiteId:           fs(fields, "siteId"),
                    JobTitle:         fs(fields, "jobTitle"),
                    EmploymentType:   empType,
                    Status:           status,
                    StartDate:        startDate,
                    EndDate:          endDate,
                    FingerprintEnrolled: fb(fields, "fingerprintEnrolled"),
                    BiometricDeclined:   fb(fields, "biometricDeclined"),
                    Notes:            null,
                    CreatedAt:        fs(fields, "createdAt"),
                    UpdatedAt:        fs(fields, "updatedAt")
                );
                await _db.UpsertEmployeeAsync(emp);
            }

            // Sync employee access groups
            var eagDocs = await _firestore.GetCollectionRawAsync("employeeAccessGroups", ct);
            foreach (var doc in eagDocs)
            {
                var id      = FirestoreRestClient.ExtractDocId(doc);
                var fields  = doc["fields"];
                if (fields is null) continue;
                static string fs(System.Text.Json.Nodes.JsonNode? f, string k) =>
                    f?[k]?["stringValue"]?.GetValue<string>() ?? "";
                await _db.UpsertEmployeeAccessGroupAsync(
                    id,
                    fs(fields, "employeeId"),
                    fs(fields, "accessGroupId"),
                    fs(fields, "grantedAt"));
            }

            Console.WriteLine($"[SYNC] Employee cache refreshed ({docs.Count} employees)");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SYNC] Employee sync error: {ex.Message}");
        }
    }

    private async Task LoadFingerprintTemplatesAsync(CancellationToken ct)
    {
        try
        {
            var reader = _services?.GetService<IFingerprintReader>();
            if (reader is not ZkFingerprintReader zkReader) return;

            var templates = await _db.GetAllFingerprintTemplatesAsync();
            foreach (var (empId, fpId, tpl) in templates)
                zkReader.LoadTemplate(empId, fpId, tpl);

            Console.WriteLine($"[SYNC] Loaded {templates.Count} fingerprint template(s) into ZK reader.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SYNC] Template load error: {ex.Message}");
        }
    }

    private async Task SendHeartbeatAsync(CancellationToken ct)
    {
        try
        {
            var stationId = _config["Station:StationId"] ?? "";
            if (string.IsNullOrEmpty(stationId)) return;

            await _firestore.UpdateDocumentAsync(
                $"stations/{stationId}",
                new() { ["lastHeartbeat"] = DateTimeOffset.UtcNow.ToString("o") },
                ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SYNC] Heartbeat error: {ex.Message}");
        }
    }
}
