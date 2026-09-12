namespace VeyraScreen.Shared.Models.Room;

public record RoomModel
{
    public string Id { get; set; } = string.Empty;

    public string Resolution { get; set; } = string.Empty;
    public int FrameRate { get; set; } = default;
    public bool Audio { get; set; } = default;
}
