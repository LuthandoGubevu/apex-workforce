using Apex.Station.Models;
using Apex.Station.Services;
using ReactiveUI;
using System.Reactive;
using System.Reactive.Linq;
using System.Reactive.Concurrency;

namespace Apex.Station.ViewModels;

public enum ScanState { Idle, Scanning, Result }
public enum ResultStatus { None, Accepted, Denied }

public class MainViewModel : ReactiveObject
{
    private readonly ClockingService _clockingService;
    private readonly SyncService     _syncService;

    private string       _currentTime  = "";
    private string       _currentDate  = "";
    private string       _stationName  = "Station";
    private string       _siteName     = "";
    private ScanState    _scanState    = ScanState.Idle;
    private string       _resultText   = "";
    private ResultStatus _resultStatus = ResultStatus.None;
    private string?      _deniedReason;
    private bool         _isSimulateMode;
    private string       _syncStatus   = "Offline";
    private string       _lastSyncTime = "—";
    private string       _directionText = "";

    public string       CurrentTime  { get => _currentTime;  set => this.RaiseAndSetIfChanged(ref _currentTime,  value); }
    public string       CurrentDate  { get => _currentDate;  set => this.RaiseAndSetIfChanged(ref _currentDate,  value); }
    public string       StationName  { get => _stationName;  set => this.RaiseAndSetIfChanged(ref _stationName,  value); }
    public string       SiteName     { get => _siteName;     set => this.RaiseAndSetIfChanged(ref _siteName,     value); }
    public ScanState    ScanState    { get => _scanState;    set => this.RaiseAndSetIfChanged(ref _scanState,    value); }
    public string       ResultText   { get => _resultText;   set => this.RaiseAndSetIfChanged(ref _resultText,   value); }
    public ResultStatus ResultStatus { get => _resultStatus; set => this.RaiseAndSetIfChanged(ref _resultStatus, value); }
    public string?      DeniedReason { get => _deniedReason; set => this.RaiseAndSetIfChanged(ref _deniedReason, value); }
    public bool         IsSimulateMode { get => _isSimulateMode; set => this.RaiseAndSetIfChanged(ref _isSimulateMode, value); }
    public string       SyncStatus   { get => _syncStatus;   set => this.RaiseAndSetIfChanged(ref _syncStatus,   value); }
    public string       LastSyncTime { get => _lastSyncTime; set => this.RaiseAndSetIfChanged(ref _lastSyncTime, value); }
    public string       DirectionText { get => _directionText; set => this.RaiseAndSetIfChanged(ref _directionText, value); }

    public ReactiveCommand<Unit, Unit> ScanCommand { get; }

    private static readonly TimeZoneInfo _saZone = GetSaZone();
    private static TimeZoneInfo GetSaZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Africa/Johannesburg"); }
        catch
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("South Africa Standard Time"); }
            catch { return TimeZoneInfo.CreateCustomTimeZone("SA", TimeSpan.FromHours(2), "SA", "SA"); }
        }
    }

    public MainViewModel(ClockingService clockingService, SyncService syncService)
    {
        _clockingService = clockingService;
        _syncService     = syncService;

        // 1-second clock tick
        Observable.Interval(TimeSpan.FromSeconds(1), RxApp.MainThreadScheduler)
            .Subscribe(_ => UpdateClock());
        UpdateClock();

        // Sync status tick (every 5 seconds)
        Observable.Interval(TimeSpan.FromSeconds(5), RxApp.MainThreadScheduler)
            .Subscribe(_ => UpdateSyncStatus());

        ScanCommand = ReactiveCommand.CreateFromTask(ExecuteScanAsync);
    }

    private void UpdateClock()
    {
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, _saZone);
        CurrentTime = now.ToString("HH:mm:ss");
        CurrentDate = now.ToString("dddd d MMMM yyyy");
    }

    private void UpdateSyncStatus()
    {
        int pending = _syncService.PendingCount;
        SyncStatus = pending == 0 ? "Synced" : $"{pending} pending";
        var last = _syncService.LastSyncTime;
        LastSyncTime = last == DateTime.MinValue
            ? "—"
            : TimeZoneInfo.ConvertTimeFromUtc(last, _saZone).ToString("HH:mm:ss");
    }

    private async Task ExecuteScanAsync()
    {
        if (ScanState == ScanState.Scanning) return;

        ScanState    = ScanState.Scanning;
        ResultText   = "";
        ResultStatus = ResultStatus.None;
        DeniedReason = null;
        DirectionText = "";

        try
        {
            var result = await _clockingService.ProcessScanAsync();

            ResultText    = result.EmployeeName;
            ResultStatus  = result.Result == ClockResult.Accepted ? ResultStatus.Accepted : ResultStatus.Denied;
            DeniedReason  = result.DeniedReason;
            DirectionText = result.Result == ClockResult.Accepted
                ? (result.Direction == ClockDirection.In ? "— IN" : "— OUT")
                : "";
            ScanState = ScanState.Result;

            // Reset to Idle after 3 seconds
            await Task.Delay(3000);
        }
        catch (Exception ex)
        {
            ResultText   = "Error";
            ResultStatus = ResultStatus.Denied;
            DeniedReason = ex.Message;
            ScanState    = ScanState.Result;
            await Task.Delay(3000);
        }
        finally
        {
            ScanState    = ScanState.Idle;
            ResultText   = "";
            ResultStatus = ResultStatus.None;
            DeniedReason = null;
            DirectionText = "";
        }
    }
}
