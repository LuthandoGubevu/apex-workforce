using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Apex.Station.Services;

public sealed class FirestoreRestClient
{
    private readonly HttpClient _http;
    private readonly string _projectId;
    private readonly string _apiKey;

    private string? _idToken;
    private DateTime _tokenExpiry = DateTime.MinValue;
    private string? _deviceEmail;
    private string? _devicePassword;

    private static readonly JsonSerializerOptions _jsonOpts = new() { PropertyNameCaseInsensitive = true };

    private string BaseUrl => $"https://firestore.googleapis.com/v1/projects/{_projectId}/databases/(default)/documents/";

    public FirestoreRestClient(HttpClient http, string projectId, string apiKey)
    {
        _http      = http;
        _projectId = projectId;
        _apiKey    = apiKey;
    }

    public async Task SignInAsync(string email, string password, CancellationToken ct = default)
    {
        _deviceEmail    = email;
        _devicePassword = password;
        await RefreshTokenAsync(ct);
    }

    private async Task RefreshTokenAsync(CancellationToken ct = default)
    {
        if (_deviceEmail is null || _devicePassword is null)
            throw new InvalidOperationException("Call SignInAsync first");

        var body = JsonSerializer.Serialize(new
        {
            email    = _deviceEmail,
            password = _devicePassword,
            returnSecureToken = true,
        });

        var resp = await _http.PostAsync(
            $"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={_apiKey}",
            new StringContent(body, Encoding.UTF8, "application/json"),
            ct);

        resp.EnsureSuccessStatusCode();
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync(ct))!;
        _idToken    = json["idToken"]!.GetValue<string>();
        int expires = int.Parse(json["expiresIn"]!.GetValue<string>());
        _tokenExpiry = DateTime.UtcNow.AddSeconds(expires - 60);
    }

    private async Task EnsureTokenAsync(CancellationToken ct = default)
    {
        if (_idToken is null || DateTime.UtcNow >= _tokenExpiry)
            await RefreshTokenAsync(ct);
    }

    // ── Collection GET ────────────────────────────────────────────────────────

    public async Task<List<JsonNode>> GetCollectionRawAsync(string collectionPath, CancellationToken ct = default)
    {
        await EnsureTokenAsync(ct);
        var req = new HttpRequestMessage(HttpMethod.Get, BaseUrl + collectionPath);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _idToken);

        var resp = await _http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode) return new();

        var body = JsonNode.Parse(await resp.Content.ReadAsStringAsync(ct));
        var docs = body?["documents"]?.AsArray() ?? new JsonArray();
        return docs.Where(d => d is not null).Select(d => d!).ToList();
    }

    // ── Single document GET ───────────────────────────────────────────────────

    public async Task<JsonNode?> GetDocumentRawAsync(string docPath, CancellationToken ct = default)
    {
        await EnsureTokenAsync(ct);
        var req = new HttpRequestMessage(HttpMethod.Get, BaseUrl + docPath);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _idToken);

        var resp = await _http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode) return null;
        return JsonNode.Parse(await resp.Content.ReadAsStringAsync(ct));
    }

    // ── Add document (auto-ID) ────────────────────────────────────────────────

    public async Task<bool> AddDocumentAsync(string collectionPath, Dictionary<string, object?> fields, CancellationToken ct = default)
    {
        await EnsureTokenAsync(ct);
        var body = JsonSerializer.Serialize(new { fields = ToFirestoreFields(fields) });
        var req = new HttpRequestMessage(HttpMethod.Post, BaseUrl + collectionPath)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _idToken);

        var resp = await _http.SendAsync(req, ct);
        return resp.IsSuccessStatusCode;
    }

    // ── Update document (PATCH with field mask) ───────────────────────────────

    public async Task<bool> UpdateDocumentAsync(string docPath, Dictionary<string, object?> fields, CancellationToken ct = default)
    {
        await EnsureTokenAsync(ct);
        var fieldNames = string.Join("&", fields.Keys.Select(k => $"updateMask.fieldPaths={Uri.EscapeDataString(k)}"));
        var url = $"{BaseUrl}{docPath}?{fieldNames}";

        var body = JsonSerializer.Serialize(new { fields = ToFirestoreFields(fields) });
        var req = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _idToken);

        var resp = await _http.SendAsync(req, ct);
        return resp.IsSuccessStatusCode;
    }

    // ── Firestore value encoding ──────────────────────────────────────────────

    private static Dictionary<string, object?> ToFirestoreFields(Dictionary<string, object?> src)
    {
        var out_ = new Dictionary<string, object?>();
        foreach (var (k, v) in src)
            out_[k] = ToFirestoreValue(v);
        return out_;
    }

    private static object? ToFirestoreValue(object? v) => v switch
    {
        null           => new { nullValue  = (object?)null },
        bool b         => new { booleanValue = b },
        int i          => new { integerValue = i.ToString() },
        long l         => new { integerValue = l.ToString() },
        double d       => new { doubleValue = d },
        string s       => new { stringValue = s },
        string[] arr   => new { arrayValue = new { values = arr.Select(a => new { stringValue = a }).ToArray() } },
        List<string> ls=> new { arrayValue = new { values = ls.Select(a => new { stringValue = a }).ToArray() } },
        _              => new { stringValue = v.ToString() },
    };

    // ── Firestore document → flat string fields (for simple string fields) ─────

    public static string? ExtractString(JsonNode? doc, string field) =>
        doc?["fields"]?[field]?["stringValue"]?.GetValue<string>();

    public static bool? ExtractBool(JsonNode? doc, string field) =>
        doc?["fields"]?[field]?["booleanValue"]?.GetValue<bool>();

    public static string ExtractDocId(JsonNode doc) =>
        doc["name"]!.GetValue<string>().Split('/').Last();
}
