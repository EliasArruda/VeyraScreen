using VeyraScreen.Shared.Contracts.Room;
using VeyraScreen.Shared.Interface;

namespace VeyraScreen.Features.Room.Endpoints;

public static class RoomEndpoints
{
    public static void MapRoomEndpoints(this WebApplication app)
    {
        app.MapPost(
            "/api/rooms",
            async (CreateRoomRequest request, IRoomService rooms, HttpContext context) =>
            {
                if (!request.IsValid())
                {
                    return Results.BadRequest("Choose a supported resolution and frame rate.");
                }

                context.Response.Headers.CacheControl = "no-store";
                var room = await rooms.CreateRoomAsync(request);
                return Results.Created($"/api/rooms/{room.Room.Id}", room);
            }
        );

        app.MapGet(
            "/api/rooms/{id}",
            async (string id, IRoomService rooms) =>
            {
                var room = await rooms.GetRoomAsync(id);
                return room is null ? Results.NotFound() : Results.Ok(room);
            }
        );
    }
}
