using Apex.Station.Models;

namespace Apex.Station.Rules;

public static class AttendanceRules
{
    public record AttendanceEvent(string Id, ClockDirection Direction, DateTimeOffset Timestamp, bool IsCorrection);

    public static DailyAttendance ComputeDailyAttendance(
        (string EmployeeId, string EmployeeName, string EmployeeNumber, string Department, string SiteId) partial,
        DateOnly date,
        IReadOnlyList<AttendanceEvent> events)
    {
        var ins  = events.Where(e => e.Direction == ClockDirection.In).ToList();
        var outs = events.Where(e => e.Direction == ClockDirection.Out).ToList();

        bool hasIn  = ins.Count > 0;
        bool hasOut = outs.Count > 0;

        DateTimeOffset? firstIn  = hasIn  ? ins.MinBy(e => e.Timestamp)!.Timestamp  : null;
        DateTimeOffset? lastOut  = hasOut ? outs.MaxBy(e => e.Timestamp)!.Timestamp : null;

        bool missingClockOut = hasIn && !hasOut;
        bool missingClockIn  = !hasIn && hasOut;

        int minutesOnSite = (hasIn && hasOut)
            ? (int)(lastOut!.Value - firstIn!.Value).TotalMinutes
            : 0;

        return new DailyAttendance(
            EmployeeId:    partial.EmployeeId,
            EmployeeName:  partial.EmployeeName,
            EmployeeNumber: partial.EmployeeNumber,
            Department:    partial.Department,
            SiteId:        partial.SiteId,
            Date:          date,
            FirstIn:       firstIn,
            LastOut:       lastOut,
            MinutesOnSite: minutesOnSite,
            MissingClockOut: missingClockOut,
            MissingClockIn:  missingClockIn,
            EventCount:    events.Count
        );
    }

    public static string FormatDuration(int minutes)
    {
        if (minutes <= 0) return "0h 0m";
        int h = minutes / 60;
        int m = minutes % 60;
        return h > 0 ? $"{h}h {m}m" : $"{m}m";
    }
}
