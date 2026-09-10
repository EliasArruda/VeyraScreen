using Microsoft.AspNetCore.Components;

namespace VeyraScreen.Components.UI.Button;

public partial class Button
{
    [Parameter]
    public RenderFragment? ChildContent { get; set; }


    [Parameter]
    public ButtonVariant? Variants { get; set; } = default;

    [Parameter]
    public string Class { get; set; } = string.Empty;

    [Parameter]
    public string? Href { get; set; } = string.Empty;


    [Parameter(CaptureUnmatchedValues = true)]
    public Dictionary<string, object> AdditionalAttributes { get; set; } = new();


    private string VariantsClass => Variants switch
    {
        ButtonVariant.Primary => "bg-primary text-background/70 hover:bg-primary-hover",
        ButtonVariant.Secondary => "bg-secondary text-foreground border border-border hover:bg-secondary-hover",
        ButtonVariant.Ghost => "text-muted-foreground hover:bg-surface-hover hover:text-primary/55",
        ButtonVariant.Outline => "border border-border text-foreground",
        _ => string.Empty
    };

    private string Css => $"{BaseClass} {VariantsClass} {Class}";
    private const string BaseClass = "font-mono p-2 font-semibold hover:cursor-pointer";
    private string SelectedClass => "border-b border-primary text-primary";

}

public enum ButtonVariant
{
    Primary,
    Secondary,
    Ghost,
    Outline,
}

public enum ButtonSize
{
    Small,
    Medium,
    Large
}
