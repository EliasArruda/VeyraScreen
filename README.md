# VeyraScreen

VeyraScreen é uma aplicação web para transmitir a tela em tempo real pelo navegador. Uma pessoa cria uma sala, escolhe a origem da captura e compartilha o link. As outras pessoas entram como espectadoras e recebem vídeo e áudio por WebRTC.

O projeto combina **Blazor Web App**, **Blazor WebAssembly**, **InteractiveAuto**, **SignalR** e as APIs WebRTC do navegador. O SignalR coordena a sala e negocia as conexões; o conteúdo da transmissão não passa pelo servidor de aplicação.

## O que a aplicação faz

- Cria uma sala com resolução, FPS e preferência de áudio.
- Captura uma aba, janela ou tela usando `getDisplayMedia`.
- Transmite vídeo e áudio diretamente do navegador do apresentador para cada espectador.
- Permite ajustar resolução de 720p a 4K e 30 a 240 FPS durante a transmissão.
- Permite adicionar o áudio depois da captura, caso o navegador não tenha retornado uma faixa de áudio inicialmente.
- Permite silenciar o áudio enviado, ativar o som local do espectador e usar tela cheia.
- Mantém o vídeo enquanto o SignalR reconecta e tenta recuperar conexões WebRTC congeladas.
- Usa STUN por padrão e aceita TURN para redes que não conseguem estabelecer conexão direta.

O áudio depende do navegador e da escolha feita no seletor nativo. Para áudio de um vídeo, normalmente é necessário selecionar uma **aba do navegador** e marcar **Share tab audio**. Janelas e a tela inteira podem não fornecer áudio em alguns sistemas operacionais e navegadores.

## Como funciona

```text
Apresentador                         Servidor                         Espectador
     │                                  │                                  │
     │ POST /api/rooms                  │                                  │
     │─────────────────────────────────>│                                  │
     │ roomId + hostToken               │                                  │
     │                                  │                                  │
     │ SignalR JoinRoom(hostToken)      │ SignalR JoinRoom                 │
     │─────────────────────────────────>│<─────────────────────────────────│
     │                                  │                                  │
     │      SDP offer / answer / ICE via /hubs/rooms                       │
     │<─────────────────────────────────────────────────────────────────────│
     │             conexão RTCPeerConnection por espectador                 │
     │════════════════════ vídeo e áudio diretamente por WebRTC ════════════>│
```

1. `RoomService` cria uma sala e `RoomManager` guarda seus dados em memória.
2. A API devolve o identificador da sala e um `hostToken` exclusivo. O token não vai para o link; somente seu hash é mantido no servidor.
3. O apresentador e os espectadores entram no hub `/hubs/rooms`.
4. `RoomHub` valida a participação e encaminha apenas sinais permitidos entre o apresentador e os espectadores da mesma sala.
5. O JavaScript cria uma `RTCPeerConnection` independente para cada espectador. O servidor não recebe nem retransmite os frames.
6. O navegador negocia a melhor rota usando STUN. Se a conexão direta falhar, as credenciais temporárias de TURN são usadas quando configuradas.

## Arquitetura do código

```text
VeyraScreen/                         Host Blazor e backend .NET
├── Components/                      App, rotas e layout
├── Features/Home/                   Página inicial
├── Features/Sessions/               Entrada em uma sala existente
└── Features/Room/
    ├── Endpoints/RoomEndpoints.cs  POST/GET /api/rooms
    ├── Hubs/RoomHub.cs              Sinalização SignalR e autorização
    └── Services/
        ├── RoomManager.cs           Estado das salas e participantes
        ├── RoomService.cs           Caso de uso de criação/consulta
        └── IceServerProvider.cs     STUN/TURN e credenciais HMAC

VeyraScreen.Client/                  Componentes executados no navegador
├── Features/Broadcast/              Seleção de captura e configurações
├── Features/Room/Pages/Room.razor   Player, controles e estado da sala
└── wwwroot/
    ├── js/screenShare.js            getDisplayMedia e ciclo da captura
    ├── js/roomStream.js             WebRTC, SignalR, áudio e reconexão
    └── lib/signalr/                 Cliente SignalR distribuído localmente

VeyraScreen.Shared/                  Contratos e componentes compartilhados
├── Contracts/Room/                  Requests, responses e snapshots
├── Models/Room/                     RoomModel
├── Interface/IRoomService.cs        Abstração do serviço de salas
└── Components/UI/                   Botões, cards e divisores reutilizáveis
```

### Modos de renderização

As páginas de transmissão e sala usam `@rendermode InteractiveAuto`. Elas são renderizadas no servidor inicialmente e podem continuar interativas no servidor ou migrar para WebAssembly quando o cliente estiver disponível. As chamadas que precisam ocorrer diretamente no navegador, como `getDisplayMedia`, `RTCPeerConnection`, fullscreen e reprodução de áudio, ficam em JavaScript e são acionadas pelos componentes Blazor.

O backend registra os dois modos em `Program.cs`:

```csharp
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();
```

## Stack e bibliotecas

| Tecnologia | Uso |
| --- | --- |
| .NET 10 / ASP.NET Core | Host HTTP, configuração, injeção de dependência e publicação |
| Blazor Web App | UI e componentes Razor |
| Blazor Server + WebAssembly | Modos de interatividade usados pelo `InteractiveAuto` |
| Microsoft.AspNetCore.SignalR 10.0.11 | Hub de sala, presença e sinalização WebRTC |
| `@microsoft/signalr` 10.0.11 | Cliente SignalR no navegador |
| WebRTC (`RTCPeerConnection`) | Transporte ponto a ponto de vídeo e áudio |
| `getDisplayMedia` | Captura da tela, janela ou aba |
| Tailwind CSS 4.3.3 | Tokens e utilitários de estilo |
| Blazicons.Lucide 3.0.8 | Ícones da interface |
| Node.js 22 + npm | Compilação dos assets frontend |
| Docker | Imagem reprodutível para produção |
| STUN/TURN (coturn ou provedor compatível) | Conectividade entre redes diferentes |

## Executar localmente

Requisitos: .NET SDK 10, Node.js 22 ou superior e um navegador desktop com suporte a captura de tela.

```bash
npm install
npm run tw
dotnet run --project VeyraScreen --launch-profile https
```

Abra o endereço HTTPS exibido no terminal e permita a captura quando o navegador solicitar. Para compartilhar com outro dispositivo, use um hostname HTTPS acessível pelos dois dispositivos; `localhost` e `127.0.0.1` funcionam somente no computador local.

O cliente SignalR já fica versionado em `VeyraScreen.Client/wwwroot/lib/signalr`. O comando `npm run tw` recompila `VeyraScreen/wwwroot/css/app.css` a partir de `VeyraScreen/Styles/tailwind.css`.

## API e SignalR

### HTTP

| Método | Rota | Função |
| --- | --- | --- |
| `POST` | `/api/rooms` | Cria uma sala e retorna `room` + `hostToken` |
| `GET` | `/api/rooms/{id}` | Consulta os metadados públicos da sala |
| `GET` | `/hubs/rooms` | Endpoint do hub SignalR |

O `hostToken` dá permissão de apresentador e deve permanecer apenas na aba que criou a sala. A URL de convite contém somente o `roomId`.

O hub expõe operações para entrar na sala, obter servidores ICE, solicitar uma transmissão, encaminhar SDP/ICE, atualizar configurações e sair. O servidor rejeita sinais para outra sala, alterações feitas por espectadores e payloads de sinalização acima de 64 KB.
