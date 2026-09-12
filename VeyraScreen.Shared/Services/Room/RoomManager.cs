using System.Collections.Concurrent;
using VeyraScreen.Shared.Models.Room;

namespace VeyraScreen.Shared.Services.Room;

public class RoomManager
{
    private readonly ConcurrentDictionary<string, RoomModel> _rooms = new();

    public RoomModel CreateRoom(
        string resolution,
        int framerate,
        bool audio
    )
    {
        RoomModel room = new()
        {
            Id = Guid.NewGuid().ToString("N"),
            Resolution = resolution,
            FrameRate = framerate,
            Audio = audio
        };

        _rooms[room.Id] = room;
        return room;
    }

    public RoomModel? GetRoom(string roomId)
    {
        return _rooms.GetValueOrDefault(roomId);
    }
}
