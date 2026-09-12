using VeyraScreen.Shared.Contracts.Room;
using VeyraScreen.Shared.Models.Room;

namespace VeyraScreen.Shared.Interface;

public interface IRoomService
{
    Task<CreatedRoom> CreateRoomAsync(CreateRoomRequest request);
    Task<RoomModel?> GetRoomAsync(string id);
}
