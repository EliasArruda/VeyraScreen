using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using VeyraScreen.Shared.Extensions;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.Services.AddInjectionExtension();

await builder.Build().RunAsync();
