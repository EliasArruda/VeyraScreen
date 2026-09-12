using VeyraScreen.Shared.Contracts.Room;
using VeyraScreen.Shared.Interface;
using VeyraScreen.Shared.Models.Room;

namespace VeyraScreen.Features.Room.Services;

public class RoomService(RoomManager _roomManager) : IRoomService
{
    public Task<CreatedRoom> CreateRoomAsync(CreateRoomRequest request)
    {
        if (!request.IsValid())
        {
            throw new ArgumentException("Choose a supported resolution and frame rate.", nameof(request));
        }

        var room = _roomManager.CreateRoom(
            request.Width,
            request.Height,
            request.FrameRate,
            request.Audio
        );
        return Task.FromResult(room);
    }

    public Task<RoomModel?> GetRoomAsync(string id)
    {
        return Task.FromResult(
            _roomManager.GetRoom(id)
        );
    }
}
