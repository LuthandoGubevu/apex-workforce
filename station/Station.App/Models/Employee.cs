namespace Apex.Station.Models;

public enum EmploymentType { Permanent, Contractor, Temporary }
public enum EmployeeStatus { Active, Suspended, Terminated }

public record Employee(
    string Id,
    string EmployeeNumber,
    string FullName,
    string Department,
    string SiteId,
    string? JobTitle,
    EmploymentType EmploymentType,
    EmployeeStatus Status,
    DateOnly StartDate,
    DateOnly? EndDate,
    bool FingerprintEnrolled,
    bool BiometricDeclined,
    string? Notes,
    string CreatedAt,
    string UpdatedAt
);
