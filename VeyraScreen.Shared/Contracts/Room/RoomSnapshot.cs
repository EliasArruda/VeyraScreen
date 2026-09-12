using VeyraScreen.Shared.Models.Room;

namespace VeyraScreen.Shared.Contracts.Room;

public sealed record RoomSnapshot(
    RoomModel Room,
    bool Live,
    int Viewers,
    bool AudioMuted,
    bool HasAudio,
    string? HostId,
    long Revision,
    string[] Participants,
    string[] SharingParticipants);
