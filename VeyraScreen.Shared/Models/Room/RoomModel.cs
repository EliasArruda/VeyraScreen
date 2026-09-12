namespace VeyraScreen.Shared.Models.Room;

public record RoomModel
{
    public string Id { get; init; } = string.Empty;

    public int Width { get; init; } = default;
    public int Height { get; init; } = default;
    public int FrameRate { get; init; } = default;
    public bool Audio { get; init; } = default;
}
