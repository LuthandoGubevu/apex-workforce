using System.Text.Json;
using System.Text.Json.Nodes;
using Apex.Station.Models;
using Apex.Station.Rules;
using Xunit;

namespace Apex.Station.Tests;

public class AccessRulesTests
{
    // Shared test vectors from the TypeScript shared package
    private static readonly string VectorsPath = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "../../../../shared/src/test-vectors/access.json"));

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
    public void CheckAccess_MatchesTestVector(string vectorJson, string description)
    {
        var v       = JsonNode.Parse(vectorJson)!;
        var input   = v["input"]!;
        var expected = v["expected"]!;

        var emp  = ParseEmployee(input["employee"]!);
        var sta  = input["station"]!;
        var now  = DateTimeOffset.Parse(input["now"]!.GetValue<string>());

        var stationInfo = new StationInfo(
            SiteId:         sta["siteId"]!.GetValue<string>(),
            AccessGroupIds: sta["accessGroupIds"]!.AsArray()
                               .Select(x => x!.GetValue<string>()).ToList()
        );

        var empGroupIds = input["employeeAccessGroupIds"]!.AsArray()
            .Select(x => x!.GetValue<string>()).ToList();

        var today = DateOnly.FromDateTime(now.DateTime);
        var checkInput = new AccessCheckInput(emp, stationInfo, empGroupIds, today);

        var result = AccessRules.CheckAccess(checkInput);

        bool expectedAllowed = expected["allowed"]!.GetValue<bool>();
        Assert.Equal(expectedAllowed, result.Allowed);

        if (!expectedAllowed)
        {
            var expectedReason = expected["reason"]?.GetValue<string>();
            Assert.Equal(expectedReason, result.DeniedReason);
        }
    }

    private static Employee ParseEmployee(JsonNode n)
    {
        var status = n["status"]!.GetValue<string>() switch
        {
            "active"     => EmployeeStatus.Active,
            "suspended"  => EmployeeStatus.Suspended,
            "terminated" => EmployeeStatus.Terminated,
            var s        => throw new ArgumentException($"Unknown status: {s}"),
        };

        DateOnly? endDate = null;
        var endDateNode = n["endDate"];
        if (endDateNode is not null && endDateNode.GetValueKind() != JsonValueKind.Null)
            endDate = DateOnly.Parse(endDateNode.GetValue<string>());

        return new Employee(
            Id:                 "test-emp",
            EmployeeNumber:     "EMP001",
            FullName:           "Test Employee",
            Department:         "Brewing",
            SiteId:             n["siteId"]!.GetValue<string>(),
            JobTitle:           null,
            EmploymentType:     EmploymentType.Permanent,
            Status:             status,
            StartDate:          DateOnly.Parse(n["startDate"]!.GetValue<string>()),
            EndDate:            endDate,
            FingerprintEnrolled: n["fingerprintEnrolled"]?.GetValue<bool>() ?? true,
            BiometricDeclined:   n["biometricDeclined"]?.GetValue<bool>() ?? false,
            Notes:              null,
            CreatedAt:          "2024-01-01T00:00:00Z",
            UpdatedAt:          "2024-01-01T00:00:00Z"
        );
    }
}
