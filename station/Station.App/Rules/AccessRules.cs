using Apex.Station.Models;
using System.Globalization;

namespace Apex.Station.Rules;

public static class AccessRules
{
    public static AccessCheckResult CheckAccess(AccessCheckInput input)
    {
        var emp = input.Employee;

        if (emp.Status == EmployeeStatus.Suspended)
            return new(false, "Employee suspended");

        if (emp.Status == EmployeeStatus.Terminated)
            return new(false, "Employee no longer active");

        if (emp.EndDate.HasValue && emp.EndDate.Value < input.Today)
            return new(false, $"Access ended {FormatDate(emp.EndDate.Value)}");

        if (emp.StartDate > input.Today)
            return new(false, $"Access starts {FormatDate(emp.StartDate)}");

        bool inGroup = input.EmployeeAccessGroupIds
            .Intersect(input.StationInfo.AccessGroupIds)
            .Any();

        if (!inGroup)
        {
            return emp.SiteId != input.StationInfo.SiteId
                ? new(false, "Not registered at this site")
                : new(false, "No access to this entry");
        }

        return new(true, null);
    }

    public static ClockDirection GetClockDirection(
        StationDirection stationDirection,
        ClockDirection? lastEventDirection)
    {
        return stationDirection switch
        {
            StationDirection.In  => ClockDirection.In,
            StationDirection.Out => ClockDirection.Out,
            // BOTH: no prior event or last was OUT → IN; last was IN → OUT
            _ => lastEventDirection == ClockDirection.In
                     ? ClockDirection.Out
                     : ClockDirection.In,
        };
    }

    private static string FormatDate(DateOnly d) =>
        d.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);
}
