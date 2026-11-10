using Apex.Station.Hardware;
using Apex.Station.Models;
using Apex.Station.Rules;
using Microsoft.Extensions.Configuration;

namespace Apex.Station.Services;

public record ClockCycleResult(
    ClockResult Result,
    string EmployeeName,
    ClockDirection Direction,
    string? DeniedReason,
    int MatchScore
);

public sealed class ClockingService
{
    private readonly IFingerprintReader _reader;
    private readonly ITurnstileRelay    _relay;
    private readonly LocalDatabase      _db;
    private readonly IConfiguration     _config;

    private static readonly TimeZoneInfo _saZone = GetSaZone();

    private static TimeZoneInfo GetSaZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Africa/Johannesburg"); }
        catch
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("South Africa Standard Time"); }
            catch { return TimeZoneInfo.CreateCustomTimeZone("SA", TimeSpan.FromHours(2), "SA", "SA"); }
        }
    }

    public ClockingService(
        IFingerprintReader reader,
        ITurnstileRelay relay,
        LocalDatabase db,
        IConfiguration config)
    {
        _reader = reader;
        _relay  = relay;
        _db     = db;
        _config = config;
    }

    public async Task<ClockCycleResult> ProcessScanAsync(CancellationToken ct = default)
    {
        var stationId   = _config["Station:StationId"]   ?? "unknown";
        var stationName = _config["Station:StationName"] ?? "Unknown Station";
        var siteId      = _config["Station:SiteId"]      ?? "unknown";
        int pulseDur    = int.TryParse(_config["Hardware:RelayPulseDurationMs"], out var pd) ? pd : 500;

        // 1. Identify fingerprint
        IdentifyResult identify;
        try { identify = await _reader.IdentifyAsync(ct); }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            Console.WriteLine($"[CLOCK] Reader error: {ex.Message}");
            return await RecordAndReturn(
                new ClockCycleResult(ClockResult.Denied, "Unknown", ClockDirection.In, "Fingerprint not recognised", 0),
                stationId, stationName, siteId, pulseDur, null, ct);
        }

        if (!identify.Matched || identify.EmployeeId is null)
        {
            return await RecordAndReturn(
                new ClockCycleResult(ClockResult.Denied, "Unknown", ClockDirection.In, "Fingerprint not recognised", identify.Score),
                stationId, stationName, siteId, pulseDur, null, ct);
        }

        // 2. Load employee
        var employee = await _db.GetEmployeeByIdAsync(identify.EmployeeId);
        if (employee is null)
        {
            return await RecordAndReturn(
                new ClockCycleResult(ClockResult.Denied, "Unknown", ClockDirection.In, "Fingerprint not recognised", identify.Score),
                stationId, stationName, siteId, pulseDur, null, ct);
        }

        // 3. Load access group IDs for employee
        var empGroupIds = await _db.GetAccessGroupIdsForEmployeeAsync(employee.Id);

        // 4. Get last accepted clock event to determine direction
        var lastEvent = await _db.GetLastClockEventForEmployeeAsync(employee.Id);
        ClockDirection? lastDir = lastEvent?.Direction;

        // 5. Build station info (use configured access groups if set, else empty — station config from Firestore in M5)
        var stationInfo = new StationInfo(siteId, new List<string>());

        // 6. Check access
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, _saZone));
        var input = new AccessCheckInput(employee, stationInfo, empGroupIds, today);
        var accessResult = AccessRules.CheckAccess(input);

        if (!accessResult.Allowed)
        {
            return await RecordAndReturn(
                new ClockCycleResult(ClockResult.Denied, employee.FullName, ClockDirection.In, accessResult.DeniedReason, identify.Score),
                stationId, stationName, siteId, pulseDur, employee, ct);
        }

        // 7. Determine direction
        var direction = AccessRules.GetClockDirection(StationDirection.Both, lastDir);

        // 8. Pulse relay
        try { await _relay.PulseAsync(pulseDur, ct); }
        catch (Exception ex) { Console.WriteLine($"[CLOCK] Relay error: {ex.Message}"); }

        return await RecordAndReturn(
            new ClockCycleResult(ClockResult.Accepted, employee.FullName, direction, null, identify.Score),
            stationId, stationName, siteId, pulseDur, employee, ct);
    }

    private async Task<ClockCycleResult> RecordAndReturn(
        ClockCycleResult result,
        string stationId, string stationName, string siteId,
        int _pulseDur,
        Employee? employee,
        CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var ev = new ClockEvent(
            Id:                 Guid.NewGuid().ToString(),
            EmployeeId:         employee?.Id         ?? "",
            EmployeeNumber:     employee?.EmployeeNumber ?? "",
            EmployeeName:       result.EmployeeName,
            StationId:          stationId,
            StationName:        stationName,
            SiteId:             siteId,
            Direction:          result.Direction,
            Result:             result.Result,
            DeniedReason:       result.DeniedReason,
            Timestamp:          now,
            TemplateMatchScore: result.MatchScore > 0 ? result.MatchScore : null,
            IsCorrection:       false,
            Synced:             false,
            CreatedAt:          now
        );

        try { await _db.SaveClockEventAsync(ev); }
        catch (Exception ex) { Console.WriteLine($"[CLOCK] DB save error: {ex.Message}"); }

        Console.WriteLine($"[CLOCK] {result.Result} — {result.EmployeeName} {(result.Result == ClockResult.Accepted ? result.Direction : result.DeniedReason)}");
        return result;
    }

    public async Task ProcessEnrolmentRequestsAsync(CancellationToken ct = default)
    {
        // Poll for pending enrolment requests for this station (SyncService handles Firestore polling in M5)
        // Placeholder — hardware integration in M5 wires this fully
        await Task.CompletedTask;
    }
}
