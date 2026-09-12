using System.Net;
using System.Net.Http.Json;
using VeyraScreen.Shared.Contracts.Room;
using VeyraScreen.Shared.Interface;
using VeyraScreen.Shared.Models.Room;

namespace VeyraScreen.Client.Features.Room.Services;

public sealed class RoomApiService(HttpClient http) : IRoomService
{
    public async Task<CreatedRoom> CreateRoomAsync(CreateRoomRequest request)
    {
        using var response = await http.PostAsJsonAsync("api/rooms", request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<CreatedRoom>()
            ?? throw new HttpRequestException("The server returned an empty room.");
    }

    public async Task<RoomModel?> GetRoomAsync(string id)
    {
        if (!Guid.TryParseExact(id, "N", out _)) return null;

        using var response = await http.GetAsync($"api/rooms/{Uri.EscapeDataString(id)}");
        if (response.StatusCode == HttpStatusCode.NotFound) return null;

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<RoomModel>()
            ?? throw new HttpRequestException("The server returned an empty room.");
    }
}
