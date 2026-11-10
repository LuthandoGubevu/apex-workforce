using Avalonia.ReactiveUI;
using Apex.Station.ViewModels;

namespace Apex.Station.Views;

public partial class ClockView : ReactiveUserControl<MainViewModel>
{
    public ClockView() { InitializeComponent(); }
}
