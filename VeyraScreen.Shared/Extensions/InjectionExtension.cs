using Microsoft.Extensions.DependencyInjection;
using VeyraScreen.Shared.Services.Room;

namespace VeyraScreen.Shared.Extensions;

public static class InjectionExtension
{
    public static IServiceCollection AddInjectionExtension(this IServiceCollection _service)
    {
        _service.AddSingleton<RoomManager>();
        return _service;
    }
}
