using VeyraScreen.Shared.Models.Room;

namespace VeyraScreen.Shared.Contracts.Room;

// Only returned on creation. HostToken must never appear in public room metadata.
public sealed record CreatedRoom(RoomModel Room, string HostToken);
