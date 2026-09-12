using Blazicons;
using Microsoft.AspNetCore.Components;

namespace VeyraScreen.Shared.Components.UI.Card;

public partial class Card
{
    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    [Parameter]
    public CardVariant Variant { get; set; } = CardVariant.Primary;

    [Parameter]
    public SvgIcon? Icon { get; set; }

    [Parameter]
    public string Class { get; set; } = string.Empty;

    [Parameter(CaptureUnmatchedValues = true)]
    public Dictionary<string, object> AdditionalAttributes { get; set; } = new();

    private string VariantClass => Variant switch
    {
        CardVariant.Primary =>
            "bg-primary text-primary-foreground border border-primary",

        CardVariant.Secondary =>
            "bg-secondary text-secondary-foreground border border-border",

        CardVariant.Outline =>
            "bg-transparent text-foreground border border-border",

        CardVariant.Ghost =>
            "bg-transparent text-foreground border border-transparent",

        _ => string.Empty
    };

    private string Css =>
        $"{BaseClass} {VariantClass} {Class}";

    private const string BaseClass =
        "rounded-lg p-4";
}

public enum CardVariant
{
    Primary,
    Secondary,
    Outline,
    Ghost
}
