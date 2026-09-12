using System.Security.Cryptography;
using System.Text;

namespace VeyraScreen.Features.Room.Services;

public sealed class IceServerProvider(IConfiguration configuration)
{
    public object GetConfiguration()
    {
        var servers = new List<object>();
        var stun = configuration.GetSection("WebRtc:StunUrls").Get<string[]>() ?? ["stun:stun.l.google.com:19302"];
        if (stun.Length > 0) servers.Add(new { urls = stun });
        var turn = configuration.GetSection("WebRtc:TurnUrls").Get<string[]>() ?? [];
        var secret = configuration["WebRtc:TurnSharedSecret"];
        if (turn.Length > 0 && !string.IsNullOrWhiteSpace(secret))
        {
            var username = $"{DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds()}:{Guid.NewGuid():N}";
            var credential = Convert.ToBase64String(HMACSHA1.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(username)));
            servers.Add(new { urls = turn, username, credential });
        }
        return new { iceServers = servers };
    }
}
