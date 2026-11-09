using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Apex.Station.ViewModels;
using Apex.Station.Views;
using Microsoft.Extensions.DependencyInjection;

namespace Apex.Station;

public partial class App : Application
{
    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var vm = Program.Services?.GetRequiredService<MainViewModel>();
            desktop.MainWindow = vm is not null
                ? new MainWindow(vm)
                : new MainWindow();
        }
        base.OnFrameworkInitializationCompleted();
    }
}
