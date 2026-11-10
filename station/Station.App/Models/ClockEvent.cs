namespace Apex.Station.Models;

public enum ClockDirection { In, Out }
public enum ClockResult    { Accepted, Denied }

public record ClockEvent(
    string Id,
    string EmployeeId,
    string EmployeeNumber,
    string EmployeeName,
    string StationId,
    string StationName,
    string SiteId,
    ClockDirection Direction,
    ClockResult Result,
    string? DeniedReason,
    DateTimeOffset Timestamp,
    int? TemplateMatchScore,
    bool IsCorrection,
    bool Synced,
    DateTimeOffset CreatedAt
);
