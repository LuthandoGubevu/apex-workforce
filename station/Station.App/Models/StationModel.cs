namespace Apex.Station.Models;

public enum StationDirection { In, Out, Both }

public record StationModel(
    string Id,
    string SiteId,
    string Name,
    StationDirection Direction,
    IReadOnlyList<string> AccessGroupIds,
    string? DeviceId,
    string? LastHeartbeat
);
