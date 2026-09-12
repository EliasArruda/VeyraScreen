using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using VeyraScreen.Shared.Extensions;
using VeyraScreen.Shared.Interface;
using VeyraScreen.Client.Features.Room.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.Services.AddInjectionExtension();
builder.Services.AddScoped(_ => new HttpClient
{
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress)
});
builder.Services.AddScoped<IRoomService, RoomApiService>();

await builder.Build().RunAsync();
