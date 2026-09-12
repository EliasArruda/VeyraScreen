using System.Security.Cryptography;
using System.Text;
using VeyraScreen.Shared.Contracts.Room;
using VeyraScreen.Shared.Models.Room;

namespace VeyraScreen.Features.Room.Services;

public sealed class RoomManager
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Session> _rooms = new();
    private readonly Dictionary<string, string> _connections = new();

    private sealed class Session(RoomModel room, byte[] tokenHash)
    {
        public RoomModel Room { get; set; } = room;
        public byte[] TokenHash { get; } = tokenHash;
        public string? Host { get; set; }
        public HashSet<string> Viewers { get; } = new();
        public bool AudioMuted { get; set; }
        public bool HasAudio { get; set; }
        public long Revision { get; set; }
        public HashSet<string> Sharing { get; } = new();
        public RoomSnapshot Snapshot(IReadOnlyDictionary<string, string> connections) => new(Room, Host is not null || Sharing.Any(connections.ContainsKey), Viewers.Count, AudioMuted, HasAudio, Host, Revision,
            connections.Where(pair => pair.Value == Room.Id).Select(pair => pair.Key).ToArray(), Sharing.Where(connections.ContainsKey).ToArray());
    }

    public CreatedRoom CreateRoom(int width, int height, int framerate, bool audio)
    {
        var room = new RoomModel { Id = Guid.NewGuid().ToString("N"), Width = width, Height = height, FrameRate = framerate, Audio = audio };
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        lock (_gate) _rooms.Add(room.Id, new(room, Hash(token)));
        return new(room, token);
    }

    public RoomModel? GetRoom(string id)
    {
        lock (_gate) return _rooms.GetValueOrDefault(id)?.Room;
    }

    public sealed record Joined(RoomSnapshot Snapshot, string? Host, string[] Viewers, string? ReplacedHost, bool IsHost);

    public Joined Join(string id, string connectionId, string? token)
    {
        lock (_gate)
        {
            if (!_rooms.TryGetValue(id, out var session)) throw new InvalidOperationException("Room not found.");
            var isHost = token is not null;
            if (_connections.TryGetValue(connectionId, out var existingRoom))
            {
                var validHost = isHost && session.Host == connectionId && token!.Length <= 128
                    && CryptographicOperations.FixedTimeEquals(session.TokenHash, Hash(token));
                var validViewer = !isHost && session.Viewers.Contains(connectionId);
                if (existingRoom != id || !(validHost || validViewer))
                    throw new InvalidOperationException("Already joined in a different room or role.");
                return new(session.Snapshot(_connections), session.Host, session.Viewers.ToArray(), null, isHost);
            }
            string? replaced = null;
            if (isHost)
            {
                if (token!.Length > 128 || !CryptographicOperations.FixedTimeEquals(session.TokenHash, Hash(token)))
                    throw new InvalidOperationException("Invalid broadcaster credential.");
                replaced = session.Host;
                if (replaced is not null)
                {
                    _connections.Remove(replaced);
                    session.Sharing.Remove(replaced);
                }
                session.Host = connectionId;
                session.Sharing.Add(connectionId);
            }
            else session.Viewers.Add(connectionId);
            _connections.Add(connectionId, id);
            session.Revision++;
            return new(session.Snapshot(_connections), session.Host, session.Viewers.ToArray(), replaced, isHost);
        }
    }

    public string ValidateSignal(string sender, string target, string kind)
    {
        lock (_gate)
        {
            if (!_connections.TryGetValue(sender, out var roomId) || !_connections.TryGetValue(target, out var targetRoom) || roomId != targetRoom)
                throw new InvalidOperationException("Peer is not in this room.");
            if (kind is not ("offer" or "answer" or "ice" or "restart"))
                throw new InvalidOperationException("Signal is not allowed.");
            return roomId;
        }
    }

    public RoomSnapshot SetSharing(string connectionId, bool sharing)
    {
        lock (_gate)
        {
            if (!_connections.TryGetValue(connectionId, out var id))
                throw new InvalidOperationException("Join the room first.");
            var session = _rooms[id];
            if (sharing) session.Sharing.Add(connectionId);
            else session.Sharing.Remove(connectionId);
            session.Revision++;
            return session.Snapshot(_connections);
        }
    }

    public string? HostForViewer(string connectionId)
    {
        lock (_gate)
        {
            if (!_connections.TryGetValue(connectionId, out var id) || !_rooms[id].Viewers.Contains(connectionId))
                throw new InvalidOperationException("Join as a viewer first.");
            return _rooms[id].Host;
        }
    }

    public string[] SharingFor(string connectionId)
    {
        lock (_gate)
        {
            if (!_connections.TryGetValue(connectionId, out var id) || !_rooms.TryGetValue(id, out var session))
                throw new InvalidOperationException("Join the room first.");
            return session.Sharing.Where(_connections.ContainsKey).ToArray();
        }
    }

    public bool IsHost(string connectionId)
    {
        lock (_gate)
            return _connections.TryGetValue(connectionId, out var id) && _rooms.TryGetValue(id, out var session) && session.Host == connectionId;
    }

    public (string Id, RoomSnapshot Snapshot) Update(string connectionId, CreateRoomRequest request, bool muted, bool hasAudio)
    {
        lock (_gate)
        {
            if (!_connections.TryGetValue(connectionId, out var id) || _rooms[id].Host != connectionId)
                throw new InvalidOperationException("Only the broadcaster can change stream settings.");
            if (!request.IsValid()) throw new InvalidOperationException("Unsupported capture settings.");
            var session = _rooms[id];
            session.Room = session.Room with { Width = request.Width, Height = request.Height, FrameRate = request.FrameRate, Audio = hasAudio };
            session.AudioMuted = muted;
            session.HasAudio = hasAudio;
            session.Revision++;
            return (id, session.Snapshot(_connections));
        }
    }

    public sealed record Left(string Id, RoomSnapshot Snapshot, string? Host, bool WasHost);
    public Left? Leave(string connectionId)
    {
        lock (_gate)
        {
            if (!_connections.Remove(connectionId, out var id)) return null;
            var session = _rooms[id];
            var wasHost = session.Host == connectionId;
            if (wasHost) session.Host = null;
            else session.Viewers.Remove(connectionId);
            session.Sharing.Remove(connectionId);
            session.Revision++;
            return new(id, session.Snapshot(_connections), session.Host, wasHost);
        }
    }

    private static byte[] Hash(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));
}
