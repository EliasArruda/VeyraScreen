using VeyraScreen.Components;
using VeyraScreen.Features.Room.Hubs;
using VeyraScreen.Features.Room.Endpoints;
using VeyraScreen.Features.Room.Services;
using VeyraScreen.Shared.Extensions;
using VeyraScreen.Shared.Interface;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();
builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSingleton<IceServerProvider>();
builder.Services.AddSignalR(options => options.MaximumReceiveMessageSize = 96 * 1024);
builder.Services.AddScoped<IRoomService, RoomService>();

var app = builder.Build();
if (app.Environment.IsDevelopment())
{
    app.UseWebAssemblyDebugging();
}
else
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();
app.UseAntiforgery();
app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(VeyraScreen.Client._Imports).Assembly);
app.MapRoomEndpoints();
app.MapHub<RoomHub>("/hubs/rooms");

app.Run();
