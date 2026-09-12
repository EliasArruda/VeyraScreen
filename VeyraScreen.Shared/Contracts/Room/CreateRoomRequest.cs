namespace VeyraScreen.Shared.Contracts.Room;

public record CreateRoomRequest(
    int Width,
    int Height,
    int FrameRate,
    bool Audio
)
{
    public bool IsValid() =>
        (Width, Height) is (1280, 720) or (1920, 1080) or (2560, 1440) or (3840, 2160)
        && FrameRate is 30 or 60 or 120 or 240;
}
