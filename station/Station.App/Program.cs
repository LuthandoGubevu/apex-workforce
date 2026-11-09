using Avalonia;
using Apex.Station.Hardware;
using Apex.Station.Services;
using Apex.Station.ViewModels;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Apex.Station;

internal static class Program
{
    internal static IServiceProvider? Services { get; private set; }

    [STAThread]
    public static async Task<int> Main(string[] args)
    {
        bool simulate     = args.Contains("--simulate");
        bool hardwareTest = args.Contains("--hardware-test");

        var config = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables("APEX_")
            .Build();

        // If appsettings has Simulate: true, honour it
        if (bool.TryParse(config["Hardware:Simulate"], out var cfgSim) && cfgSim)
            simulate = true;

        if (hardwareTest)
        {
            await RunHardwareTestAsync(simulate, config);
            return 0;
        }

        var host = Host.CreateDefaultBuilder(args)
            .ConfigureServices((ctx, services) =>
            {
                services.AddSingleton<IConfiguration>(config);

                // Hardware
                if (simulate)
                {
                    services.AddSingleton<IFingerprintReader, SimulatedFingerprintReader>();
                    services.AddSingleton<ITurnstileRelay,    SimulatedTurnstileRelay>();
                }
                else
                {
                    // M5 wires real hardware implementations
                    services.AddSingleton<IFingerprintReader, SimulatedFingerprintReader>();
                    services.AddSingleton<ITurnstileRelay,    SimulatedTurnstileRelay>();
                }

                // Core services
                services.AddSingleton<LocalDatabase>();
                services.AddHttpClient<FirestoreRestClient>((sp, client) =>
                {
                    client.Timeout = TimeSpan.FromSeconds(10);
                });
                services.AddSingleton<FirestoreRestClient>(sp =>
                {
                    var http      = sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(FirestoreRestClient));
                    var projectId = config["Firebase:ProjectId"] ?? "apex-workforce";
                    var apiKey    = config["Firebase:ApiKey"]    ?? "";
                    return new FirestoreRestClient(http, projectId, apiKey);
                });
                services.AddHostedService<SyncService>();
                services.AddSingleton<SyncService>(sp =>
                    (SyncService)sp.GetServices<IHostedService>()
                        .First(s => s is SyncService));
                services.AddSingleton<ClockingService>();
                services.AddSingleton<MainViewModel>(sp =>
                {
                    var vm = new MainViewModel(
                        sp.GetRequiredService<ClockingService>(),
                        sp.GetRequiredService<SyncService>());
                    vm.StationName    = config["Station:StationName"] ?? "Gate";
                    vm.SiteName       = config["Station:SiteName"]    ?? "";
                    vm.IsSimulateMode = simulate;
                    return vm;
                });
            })
            .Build();

        Services = host.Services;

        // Initialise DB and hardware
        var db     = host.Services.GetRequiredService<LocalDatabase>();
        var reader = host.Services.GetRequiredService<IFingerprintReader>();
        var relay  = host.Services.GetRequiredService<ITurnstileRelay>();

        await db.InitialiseAsync();
        await reader.InitialiseAsync();
        await relay.InitialiseAsync();

        // If simulate, seed the reader with any enrolled employees from local DB
        if (simulate && reader is SimulatedFingerprintReader sim)
        {
            var employees = await db.GetAllEmployeesAsync();
            foreach (var e in employees.Where(e => e.FingerprintEnrolled))
                sim.AddSimulatedEmployee(e.Id);

            if (!employees.Any(e => e.FingerprintEnrolled))
            {
                Console.WriteLine("[BOOT] No enrolled employees in local DB — simulator will return no-match until employees are synced.");
            }
        }

        // Start background services
        _ = host.StartAsync();

        // Start Avalonia
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);

        await host.StopAsync();
        return 0;
    }

    private static async Task RunHardwareTestAsync(bool simulate, IConfiguration config)
    {
        Console.WriteLine("=== Apex Workforce Hardware Test ===");

        IFingerprintReader reader = simulate
            ? new SimulatedFingerprintReader()
            : new SimulatedFingerprintReader(); // M5 replaces with real

        ITurnstileRelay relay = simulate
            ? new SimulatedTurnstileRelay()
            : new SimulatedTurnstileRelay(); // M5 replaces with real

        await reader.InitialiseAsync();
        Console.WriteLine($"Fingerprint reader: {(reader.IsReady ? "READY" : "NOT READY")}");

        await relay.InitialiseAsync();
        Console.WriteLine($"Turnstile relay:    {(relay.IsReady ? "READY" : "NOT READY")}");

        Console.WriteLine("Testing relay pulse (500 ms)…");
        await relay.PulseAsync(500);
        Console.WriteLine("Relay pulse OK");

        Console.WriteLine("Testing fingerprint identify (simulated)…");
        var result = await reader.IdentifyAsync();
        Console.WriteLine($"Identify result: Matched={result.Matched}, Score={result.Score}");

        await reader.DisposeAsync();
        await relay.DisposeAsync();
        Console.WriteLine("=== Hardware test complete ===");
    }

    private static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .UseReactiveUI()
            .LogToTrace();
}
