using Apex.Station.Models;
using Microsoft.Data.Sqlite;
using System.Text.Json;

namespace Apex.Station.Services;

public sealed class LocalDatabase : IAsyncDisposable
{
    private readonly string _dbPath;
    private SqliteConnection? _conn;

    private static readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public LocalDatabase(string dbPath = "apex_station.db")
    {
        _dbPath = dbPath;
    }

    public async Task InitialiseAsync()
    {
        _conn = new SqliteConnection($"Data Source={_dbPath}");
        await _conn.OpenAsync();

        await Exec(@"
            CREATE TABLE IF NOT EXISTS clock_events (
                id                   TEXT PRIMARY KEY,
                employee_id          TEXT NOT NULL,
                employee_number      TEXT NOT NULL,
                employee_name        TEXT NOT NULL,
                station_id           TEXT NOT NULL,
                station_name         TEXT NOT NULL,
                site_id              TEXT NOT NULL,
                direction            TEXT NOT NULL,
                result               TEXT NOT NULL,
                denied_reason        TEXT,
                timestamp            TEXT NOT NULL,
                template_match_score INTEGER,
                is_correction        INTEGER NOT NULL DEFAULT 0,
                synced               INTEGER NOT NULL DEFAULT 0,
                created_at           TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS employees (
                id         TEXT PRIMARY KEY,
                data       TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS access_groups (
                id         TEXT PRIMARY KEY,
                data       TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS employee_access_groups (
                id               TEXT PRIMARY KEY,
                employee_id      TEXT NOT NULL,
                access_group_id  TEXT NOT NULL,
                granted_at       TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        ");
    }

    // ── Clock events ──────────────────────────────────────────────────────────

    public async Task SaveClockEventAsync(ClockEvent ev)
    {
        await Exec(
            @"INSERT OR IGNORE INTO clock_events
              (id, employee_id, employee_number, employee_name, station_id, station_name,
               site_id, direction, result, denied_reason, timestamp, template_match_score,
               is_correction, synced, created_at)
              VALUES
              ($id, $eid, $enum, $ename, $sid, $sname,
               $siteid, $dir, $res, $dr, $ts, $score, $ic, 0, $ca)",
            p =>
            {
                p.AddWithValue("$id",    ev.Id);
                p.AddWithValue("$eid",   ev.EmployeeId);
                p.AddWithValue("$enum",  ev.EmployeeNumber);
                p.AddWithValue("$ename", ev.EmployeeName);
                p.AddWithValue("$sid",   ev.StationId);
                p.AddWithValue("$sname", ev.StationName);
                p.AddWithValue("$siteid",ev.SiteId);
                p.AddWithValue("$dir",   ev.Direction.ToString().ToUpperInvariant());
                p.AddWithValue("$res",   ev.Result.ToString().ToLowerInvariant());
                p.AddWithValue("$dr",    (object?)ev.DeniedReason ?? DBNull.Value);
                p.AddWithValue("$ts",    ev.Timestamp.ToString("o"));
                p.AddWithValue("$score", (object?)ev.TemplateMatchScore ?? DBNull.Value);
                p.AddWithValue("$ic",    ev.IsCorrection ? 1 : 0);
                p.AddWithValue("$ca",    ev.CreatedAt.ToString("o"));
            });
    }

    public async Task<List<ClockEvent>> GetUnsyncedAsync()
    {
        var rows = await Query(
            "SELECT * FROM clock_events WHERE synced = 0 ORDER BY created_at",
            ReadClockEvent);
        return rows;
    }

    public async Task MarkSyncedAsync(string id)
    {
        await Exec("UPDATE clock_events SET synced = 1 WHERE id = $id",
            p => p.AddWithValue("$id", id));
    }

    public async Task<ClockEvent?> GetLastClockEventForEmployeeAsync(string employeeId)
    {
        var rows = await Query(
            "SELECT * FROM clock_events WHERE employee_id = $eid AND result = 'accepted' ORDER BY timestamp DESC LIMIT 1",
            ReadClockEvent,
            p => p.AddWithValue("$eid", employeeId));
        return rows.FirstOrDefault();
    }

    // ── Employees ─────────────────────────────────────────────────────────────

    public async Task UpsertEmployeeAsync(Employee emp)
    {
        var json = JsonSerializer.Serialize(emp, _json);
        await Exec(
            "INSERT OR REPLACE INTO employees (id, data, updated_at) VALUES ($id, $data, $ua)",
            p =>
            {
                p.AddWithValue("$id",   emp.Id);
                p.AddWithValue("$data", json);
                p.AddWithValue("$ua",   emp.UpdatedAt);
            });
    }

    public async Task<Employee?> GetEmployeeByIdAsync(string id)
    {
        var rows = await Query(
            "SELECT data FROM employees WHERE id = $id",
            r => JsonSerializer.Deserialize<Employee>(r.GetString(0), _json),
            p => p.AddWithValue("$id", id));
        return rows.FirstOrDefault();
    }

    public async Task<List<Employee>> GetAllEmployeesAsync()
    {
        var rows = await Query(
            "SELECT data FROM employees",
            r => JsonSerializer.Deserialize<Employee>(r.GetString(0), _json));
        return rows.Where(e => e is not null).Select(e => e!).ToList();
    }

    // ── Access groups ─────────────────────────────────────────────────────────

    public async Task UpsertAccessGroupAsync(AccessGroup ag)
    {
        var json = JsonSerializer.Serialize(ag, _json);
        await Exec(
            "INSERT OR REPLACE INTO access_groups (id, data, updated_at) VALUES ($id, $data, $ua)",
            p =>
            {
                p.AddWithValue("$id",   ag.Id);
                p.AddWithValue("$data", json);
                p.AddWithValue("$ua",   DateTime.UtcNow.ToString("o"));
            });
    }

    public async Task UpsertEmployeeAccessGroupAsync(string id, string employeeId, string accessGroupId, string grantedAt)
    {
        await Exec(
            "INSERT OR REPLACE INTO employee_access_groups (id, employee_id, access_group_id, granted_at) VALUES ($id, $eid, $agid, $ga)",
            p =>
            {
                p.AddWithValue("$id",   id);
                p.AddWithValue("$eid",  employeeId);
                p.AddWithValue("$agid", accessGroupId);
                p.AddWithValue("$ga",   grantedAt);
            });
    }

    public async Task<List<string>> GetAccessGroupIdsForEmployeeAsync(string employeeId)
    {
        return await Query(
            "SELECT access_group_id FROM employee_access_groups WHERE employee_id = $eid",
            r => r.GetString(0),
            p => p.AddWithValue("$eid", employeeId));
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    public async Task<string> GetOrSetSettingAsync(string key, string defaultValue)
    {
        var rows = await Query(
            "SELECT value FROM settings WHERE key = $k",
            r => r.GetString(0),
            p => p.AddWithValue("$k", key));

        if (rows.Count > 0) return rows[0];

        await Exec(
            "INSERT INTO settings (key, value) VALUES ($k, $v)",
            p => { p.AddWithValue("$k", key); p.AddWithValue("$v", defaultValue); });
        return defaultValue;
    }

    public async Task SetSettingAsync(string key, string value)
    {
        await Exec(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ($k, $v)",
            p => { p.AddWithValue("$k", key); p.AddWithValue("$v", value); });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task Exec(string sql, Action<SqliteParameterCollection>? bind = null)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = sql;
        bind?.Invoke(cmd.Parameters);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<List<T>> Query<T>(
        string sql,
        Func<SqliteDataReader, T> map,
        Action<SqliteParameterCollection>? bind = null)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = sql;
        bind?.Invoke(cmd.Parameters);
        using var reader = await cmd.ExecuteReaderAsync();
        var results = new List<T>();
        while (await reader.ReadAsync())
            results.Add(map(reader));
        return results;
    }

    private static ClockEvent ReadClockEvent(SqliteDataReader r) => new(
        Id:                 r.GetString(r.GetOrdinal("id")),
        EmployeeId:         r.GetString(r.GetOrdinal("employee_id")),
        EmployeeNumber:     r.GetString(r.GetOrdinal("employee_number")),
        EmployeeName:       r.GetString(r.GetOrdinal("employee_name")),
        StationId:          r.GetString(r.GetOrdinal("station_id")),
        StationName:        r.GetString(r.GetOrdinal("station_name")),
        SiteId:             r.GetString(r.GetOrdinal("site_id")),
        Direction:          Enum.Parse<ClockDirection>(r.GetString(r.GetOrdinal("direction")), ignoreCase: true),
        Result:             Enum.Parse<ClockResult>(r.GetString(r.GetOrdinal("result")), ignoreCase: true),
        DeniedReason:       r.IsDBNull(r.GetOrdinal("denied_reason")) ? null : r.GetString(r.GetOrdinal("denied_reason")),
        Timestamp:          DateTimeOffset.Parse(r.GetString(r.GetOrdinal("timestamp"))),
        TemplateMatchScore: r.IsDBNull(r.GetOrdinal("template_match_score")) ? null : r.GetInt32(r.GetOrdinal("template_match_score")),
        IsCorrection:       r.GetInt32(r.GetOrdinal("is_correction")) == 1,
        Synced:             r.GetInt32(r.GetOrdinal("synced")) == 1,
        CreatedAt:          DateTimeOffset.Parse(r.GetString(r.GetOrdinal("created_at")))
    );

    public async ValueTask DisposeAsync()
    {
        if (_conn is not null)
        {
            await _conn.CloseAsync();
            await _conn.DisposeAsync();
        }
    }
}
