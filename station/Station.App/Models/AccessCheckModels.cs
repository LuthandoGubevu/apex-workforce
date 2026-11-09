namespace Apex.Station.Models;

public record StationInfo(
    string SiteId,
    IReadOnlyList<string> AccessGroupIds
);

public record AccessCheckInput(
    Employee Employee,
    StationInfo StationInfo,
    IReadOnlyList<string> EmployeeAccessGroupIds,
    DateOnly Today
);

public record AccessCheckResult(bool Allowed, string? DeniedReason);

public record DailyAttendance(
    string EmployeeId,
    string EmployeeName,
    string EmployeeNumber,
    string Department,
    string SiteId,
    DateOnly Date,
    DateTimeOffset? FirstIn,
    DateTimeOffset? LastOut,
    int MinutesOnSite,
    bool MissingClockOut,
    bool MissingClockIn,
    int EventCount
);
