using Apex.Station.Models;
using Apex.Station.Rules;
using Xunit;

namespace Apex.Station.Tests;

/// <summary>
/// Unit tests for the clocking-service business rules:
///  - clock direction on a BOTH station
///  - all 7 verbatim denial reasons from CLAUDE.md
/// </summary>
public sealed class ClockingServiceTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static Employee ActiveEmployee(
        string id = "e1",
        DateOnly? start = null,
        DateOnly? end = null) =>
        new(
            Id:                 id,
            EmployeeNumber:     "001",
            FullName:           "Test Employee",
            Department:         "Ops",
            SiteId:             "site1",
            JobTitle:           null,
            EmploymentType:     EmploymentType.Permanent,
            Status:             EmployeeStatus.Active,
            StartDate:          start ?? Today.AddDays(-90),
            EndDate:            end,
            FingerprintEnrolled: true,
            BiometricDeclined:  false,
            Notes:              null,
            CreatedAt:          "",
            UpdatedAt:          ""
        );

    private static Employee WithStatus(Employee emp, EmployeeStatus status) =>
        emp with { Status = status };

    private static StationInfo StationWithGroup(string groupId = "ag1") =>
        new("site1", new List<string> { groupId });

    private static AccessCheckInput BuildInput(
        Employee emp,
        StationInfo? station = null,
        List<string>? empGroups = null,
        DateOnly? today = null) =>
        new(
            Employee:               emp,
            StationInfo:            station ?? StationWithGroup(),
            EmployeeAccessGroupIds: empGroups ?? new List<string> { "ag1" },
            Today:                  today ?? Today
        );

    // ── Direction tests ───────────────────────────────────────────────────────

    [Fact]
    public void NoLastEvent_DirectionIsIn()
    {
        var dir = AccessRules.GetClockDirection(StationDirection.Both, null);
        Assert.Equal(ClockDirection.In, dir);
    }

    [Fact]
    public void LastWasIn_DirectionIsOut()
    {
        var dir = AccessRules.GetClockDirection(StationDirection.Both, ClockDirection.In);
        Assert.Equal(ClockDirection.Out, dir);
    }

    [Fact]
    public void LastWasOut_DirectionIsIn()
    {
        var dir = AccessRules.GetClockDirection(StationDirection.Both, ClockDirection.Out);
        Assert.Equal(ClockDirection.In, dir);
    }

    [Fact]
    public void InOnlyStation_AlwaysIn()
    {
        Assert.Equal(ClockDirection.In,  AccessRules.GetClockDirection(StationDirection.In, null));
        Assert.Equal(ClockDirection.In,  AccessRules.GetClockDirection(StationDirection.In, ClockDirection.In));
        Assert.Equal(ClockDirection.In,  AccessRules.GetClockDirection(StationDirection.In, ClockDirection.Out));
    }

    [Fact]
    public void OutOnlyStation_AlwaysOut()
    {
        Assert.Equal(ClockDirection.Out, AccessRules.GetClockDirection(StationDirection.Out, null));
        Assert.Equal(ClockDirection.Out, AccessRules.GetClockDirection(StationDirection.Out, ClockDirection.In));
        Assert.Equal(ClockDirection.Out, AccessRules.GetClockDirection(StationDirection.Out, ClockDirection.Out));
    }

    // ── Allowed scan ──────────────────────────────────────────────────────────

    [Fact]
    public void ActiveEmployee_WithAccessGroup_IsAccepted()
    {
        var result = AccessRules.CheckAccess(BuildInput(ActiveEmployee()));
        Assert.True(result.Allowed);
        Assert.Null(result.DeniedReason);
    }

    // ── Denial reasons ────────────────────────────────────────────────────────

    [Fact]
    public void SuspendedEmployee_DeniedWithCorrectReason()
    {
        var emp    = WithStatus(ActiveEmployee(), EmployeeStatus.Suspended);
        var result = AccessRules.CheckAccess(BuildInput(emp));
        Assert.False(result.Allowed);
        Assert.Equal("Employee suspended", result.DeniedReason);
    }

    [Fact]
    public void TerminatedEmployee_DeniedWithCorrectReason()
    {
        var emp    = WithStatus(ActiveEmployee(), EmployeeStatus.Terminated);
        var result = AccessRules.CheckAccess(BuildInput(emp));
        Assert.False(result.Allowed);
        Assert.Equal("Employee no longer active", result.DeniedReason);
    }

    [Fact]
    public void EndDateInPast_DeniedWithAccessEndedReason()
    {
        var pastEnd = Today.AddDays(-1);
        var emp     = ActiveEmployee(end: pastEnd);
        var result  = AccessRules.CheckAccess(BuildInput(emp));
        Assert.False(result.Allowed);
        // "Access ended DD Mon YYYY"
        Assert.StartsWith("Access ended ", result.DeniedReason);
        Assert.Contains(pastEnd.ToString("dd MMM yyyy",
            System.Globalization.CultureInfo.InvariantCulture),
            result.DeniedReason);
    }

    [Fact]
    public void StartDateInFuture_DeniedWithAccessStartsReason()
    {
        var futureStart = Today.AddDays(5);
        var emp         = new Employee(
            "e2", "002", "Future Emp", "Ops", "site1", null,
            EmploymentType.Permanent, EmployeeStatus.Active,
            futureStart, null, true, false, null, "", "");
        var result = AccessRules.CheckAccess(BuildInput(emp));
        Assert.False(result.Allowed);
        Assert.StartsWith("Access starts ", result.DeniedReason);
        Assert.Contains(futureStart.ToString("dd MMM yyyy",
            System.Globalization.CultureInfo.InvariantCulture),
            result.DeniedReason);
    }

    [Fact]
    public void NoMatchingAccessGroup_DeniedWithNoAccessReason()
    {
        var emp    = ActiveEmployee();
        var station = StationWithGroup("ag_vip_only");
        var result = AccessRules.CheckAccess(BuildInput(emp, station: station, empGroups: new List<string> { "ag1" }));
        Assert.False(result.Allowed);
        Assert.Equal("No access to this entry", result.DeniedReason);
    }

    [Fact]
    public void BiometricDeclined_DeniedWithFingerprintNotRecognisedReason()
    {
        // biometricDeclined maps to "Fingerprint not recognised" per CLAUDE.md rule 8
        var emp = ActiveEmployee() with { BiometricDeclined = true };
        var result = AccessRules.CheckAccess(BuildInput(emp));
        Assert.False(result.Allowed);
        Assert.Equal("Fingerprint not recognised", result.DeniedReason);
    }

    // ── Edge: employee's site vs station site ─────────────────────────────────

    [Fact]
    public void CrossSiteEmployee_AllowedWhenGroupCoversStation()
    {
        // Employee's home site differs from the station site,
        // but the access group list overlaps — allowed.
        var emp = ActiveEmployee() with { SiteId = "site_remote" };
        var result = AccessRules.CheckAccess(BuildInput(emp));
        Assert.True(result.Allowed);
    }
}
