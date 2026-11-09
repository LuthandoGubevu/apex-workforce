using System.Text.Json;
using System.Text.Json.Nodes;
using Apex.Station.Models;
using Apex.Station.Rules;
using Xunit;

namespace Apex.Station.Tests;

public class AttendanceRulesTests
{
    private static readonly string VectorsPath = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "../../../../shared/src/test-vectors/attendance.json"));

    [Fact]
    public void AllVectorsMustExist()
    {
        Assert.True(File.Exists(VectorsPath), $"Test vectors not found at: {VectorsPath}");
    }

    public static IEnumerable<object[]> GetVectors()
    {
        if (!File.Exists(VectorsPath)) yield break;
        var json = JsonNode.Parse(File.ReadAllText(VectorsPath))!.AsArray();
        foreach (var item in json)
            yield return new object[] { item!.ToJsonString(), item!["description"]!.GetValue<string>() };
    }

    [Theory]
    [MemberData(nameof(GetVectors))]
    public void ComputeDailyAttendance_MatchesTestVector(string vectorJson, string description)
    {
        var v        = JsonNode.Parse(vectorJson)!;
        var input    = v["input"]!;
        var expected = v["expected"]!;

        var partial = input["partial"]!;
        var date    = DateOnly.Parse(input["date"]!.GetValue<string>());
        var events  = ParseEvents(input["events"]!.AsArray());

        var result = AttendanceRules.ComputeDailyAttendance(
            (
                partial["employeeId"]!.GetValue<string>(),
                partial["employeeName"]!.GetValue<string>(),
                partial["employeeNumber"]!.GetValue<string>(),
                partial["department"]!.GetValue<string>(),
                partial["siteId"]!.GetValue<string>()
            ),
            date,
            events);

        Assert.Equal(expected["minutesOnSite"]!.GetValue<int>(),   result.MinutesOnSite);
        Assert.Equal(expected["missingClockOut"]!.GetValue<bool>(), result.MissingClockOut);
        Assert.Equal(expected["missingClockIn"]!.GetValue<bool>(),  result.MissingClockIn);
        Assert.Equal(expected["eventCount"]!.GetValue<int>(),       result.EventCount);
    }

    private static List<AttendanceRules.AttendanceEvent> ParseEvents(JsonArray arr)
    {
        return arr.Select(e =>
        {
            var direction = e!["direction"]!.GetValue<string>() == "IN"
                ? ClockDirection.In
                : ClockDirection.Out;
            return new AttendanceRules.AttendanceEvent(
                Id:           e["id"]!.GetValue<string>(),
                Direction:    direction,
                Timestamp:    DateTimeOffset.Parse(e["timestamp"]!.GetValue<string>()),
                IsCorrection: e["isCorrection"]?.GetValue<bool>() ?? false
            );
        }).ToList();
    }
}
