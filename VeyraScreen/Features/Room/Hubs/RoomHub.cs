using Microsoft.AspNetCore.SignalR;
using VeyraScreen.Features.Room.Services;
using VeyraScreen.Shared.Contracts.Room;

namespace VeyraScreen.Features.Room.Hubs;

public sealed class RoomHub(RoomManager rooms, IceServerProvider iceServers) : Hub
{
    public async Task<RoomSnapshot> JoinRoom(string roomId, string? hostToken)
    {
        RoomManager.Joined joined;
        try { joined = rooms.Join(roomId, Context.ConnectionId, hostToken); }
        catch (InvalidOperationException error) { throw new HubException(error.Message); }
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
        await Clients.Group(roomId).SendAsync("ParticipantJoined", Context.ConnectionId);
        if (joined.ReplacedHost is not null)
        {
            await Groups.RemoveFromGroupAsync(joined.ReplacedHost, roomId);
            await Clients.Client(joined.ReplacedHost).SendAsync("Replaced");
        }
        await Clients.Group(roomId).SendAsync("RoomState", joined.Snapshot);
        if (joined.IsHost)
        {
            foreach (var viewer in joined.Viewers)
                await Clients.Caller.SendAsync("ViewerJoined", viewer);
        }
        else if (joined.Host is not null)
            await Clients.Client(joined.Host).SendAsync("ViewerJoined", Context.ConnectionId);
        return joined.Snapshot;
    }

    public object GetIceServers() => iceServers.GetConfiguration();

    public bool IsHost() => rooms.IsHost(Context.ConnectionId);

    public async Task RequestStream()
    {
        string[] sharing;
        try { sharing = rooms.SharingFor(Context.ConnectionId); }
        catch (InvalidOperationException error) { throw new HubException(error.Message); }
        foreach (var publisher in sharing)
            await Clients.Client(publisher).SendAsync("ParticipantJoined", Context.ConnectionId);
        string? host;
        try { host = rooms.HostForViewer(Context.ConnectionId); }
        catch (InvalidOperationException error) { throw new HubException(error.Message); }
        if (host is not null)
            await Clients.Client(host).SendAsync("ViewerJoined", Context.ConnectionId);
        foreach (var publisher in sharing)
            await Clients.Caller.SendAsync("ParticipantState", publisher, true);
    }

    public async Task<RoomSnapshot> SetSharing(bool sharing)
    {
        RoomSnapshot snapshot;
        try { snapshot = rooms.SetSharing(Context.ConnectionId, sharing); }
        catch (InvalidOperationException error) { throw new HubException(error.Message); }
        await Clients.Group(snapshot.Room.Id).SendAsync("RoomState", snapshot);
        await Clients.Group(snapshot.Room.Id).SendAsync("ParticipantState", Context.ConnectionId, sharing);
        return snapshot;
    }

    public async Task Signal(string target, string kind, string payload)
    {
        if (payload.Length > 64_000) throw new HubException("Signal too large.");
        try { rooms.ValidateSignal(Context.ConnectionId, target, kind); }
        catch (InvalidOperationException error) { throw new HubException(error.Message); }
        await Clients.Client(target).SendAsync("Signal", Context.ConnectionId, kind, payload);
    }

    public async Task UpdateSettings(CreateRoomRequest request, bool muted, bool hasAudio)
    {
        (string Id, RoomSnapshot Snapshot) update;
        try { update = rooms.Update(Context.ConnectionId, request, muted, hasAudio); }
        catch (InvalidOperationException error) { throw new HubException(error.Message); }
        await Clients.Group(update.Id).SendAsync("RoomState", update.Snapshot);
    }

    public async Task LeaveRoom()
    {
        var left = rooms.Leave(Context.ConnectionId);
        if (left is null) return;
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, left.Id);
        await Clients.Group(left.Id).SendAsync("RoomState", left.Snapshot);
        await Clients.Group(left.Id).SendAsync("ParticipantLeft", Context.ConnectionId);
        if (!left.WasHost && left.Host is not null)
            await Clients.Client(left.Host).SendAsync("ViewerLeft", Context.ConnectionId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await LeaveRoom();
        await base.OnDisconnectedAsync(exception);
    }
}
