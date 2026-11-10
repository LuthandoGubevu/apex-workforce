using Avalonia.ReactiveUI;
using Apex.Station.ViewModels;

namespace Apex.Station.Views;

public partial class MainWindow : ReactiveWindow<MainViewModel>
{
    public MainWindow() { InitializeComponent(); }
    public MainWindow(MainViewModel vm) : this() { DataContext = vm; }
}
