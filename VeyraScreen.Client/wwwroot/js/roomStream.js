(() => {
    let active = null;
    const widths = { 720: 1280, 1080: 1920, 1440: 2560, 2160: 3840 };

    function notify(s) {
        if (active !== s || s.closed) return;
        const track = s.local?.getVideoTracks()[0];
        const actual = track?.getSettings() ?? {};
        const state = {
            isHost: s.isHost, ready: s.ready, connected: s.hub.state === "Connected",
            playing: !s.video.paused && !!s.video.srcObject, live: s.snapshot.live,
            viewers: s.snapshot.viewers, hasAudio: s.isHost ? !!s.local?.getAudioTracks().length : s.snapshot.hasAudio,
            audioMuted: s.isHost ? s.audioMuted : s.snapshot.audioMuted,
            viewerMuted: s.video.muted, fullscreen: document.fullscreenElement === s.stage,
            width: s.settings.width, height: s.settings.height, frameRate: s.settings.frameRate,
            actualWidth: s.isHost ? actual.width ?? 0 : s.video.videoWidth,
            actualHeight: s.isHost ? actual.height ?? 0 : s.video.videoHeight,
            status: s.status, error: s.error
        };
        s.receiver.invokeMethodAsync("OnClientState", state).catch(() => {});
    }

    function fail(s, message) { s.error = message; notify(s); }
    function closePeer(s, id) {
        const peer = s.peers.get(id);
        if (!peer) return;
        clearTimeout(peer.timer);
        peer.pc.onconnectionstatechange = null;
        peer.pc.onicecandidate = null;
        peer.pc.ontrack = null;
        peer.pc.close();
        s.peers.delete(id);
    }
    function closePeers(s) {
        for (const id of [...s.peers.keys()]) closePeer(s, id);
        if (!s.isHost) { s.video.srcObject = null; s.remoteHost = null; }
    }
    async function switchSource(s) {
        if (s.closed || !s.isHost || !s.ready || s.ending || s.switching) return;
        s.switching = true;
        s.status = "Choose a new source…";
        s.error = null;
        notify(s);
        try {
            const track = await window.veyraScreen.switchVideo(s.id, s.settings);
            const updates = [];
            for (const [id, peer] of s.peers) {
                const sender = peer.pc.getSenders().find(item => item.track?.kind === "video");
                if (sender) {
                    updates.push(sender.replaceTrack(track).then(() => limitSender(sender, s.settings)));
                } else {
                    peer.pc.addTrack(track, s.local);
                    updates.push(offer(s, id, true));
                }
            }
            const results = await Promise.allSettled(updates);
            if (results.some(result => result.status === "rejected"))
                throw new Error("The new source could not be sent to every viewer.");
            s.status = "Broadcasting live";
        } catch (error) {
            s.status = "Broadcasting live";
            fail(s, error?.message ?? "The shared source could not be changed.");
        } finally {
            s.switching = false;
            notify(s);
        }
    }
    async function signal(s, id, kind, value) {
        if (s.closed || s.hub.state !== "Connected") return;
        await s.hub.invoke("Signal", id, kind, JSON.stringify(value));
    }
    async function limitSender(sender, settings) {
        if (sender.track?.kind !== "video") return;
        const params = sender.getParameters();
        if (!params.encodings?.length) return;
        const actual = sender.track.getSettings();
        // Screen sharing is replicated once per viewer. Keep enough headroom for
        // several viewers instead of saturating the broadcaster's upload link.
        const bitrate = { 720: 1200000, 1080: 2500000, 1440: 4500000, 2160: 8000000 }[settings.height];
        for (const encoding of params.encodings) {
            encoding.maxFramerate = settings.frameRate;
            encoding.maxBitrate = bitrate * Math.min(4, settings.frameRate / 30);
            encoding.scaleResolutionDownBy = Math.max(1, (actual.width || settings.width) / settings.width, (actual.height || settings.height) / settings.height);
        }
        // Screen content benefits from keeping the requested frame cadence while
        // the encoder reduces detail when bandwidth is briefly constrained.
        params.degradationPreference = "maintain-framerate";
        await sender.setParameters(params);
    }
    function makePeer(s, id) {
        const pc = new RTCPeerConnection(s.ice);
        const peer = { pc, candidates: [], queue: Promise.resolve(), timer: null, restarts: 0, lastBytes: -1, lastFrames: -1, stalledSince: 0, recovering: false };
        s.peers.set(id, peer);
        pc.onicecandidate = event => {
            if (event.candidate) signal(s, id, "ice", event.candidate).catch(() => {});
        };
        pc.onconnectionstatechange = () => {
            if (s.closed || s.peers.get(id) !== peer) return;
            if (pc.connectionState === "connected") {
                clearTimeout(peer.timer);
                peer.restarts = 0;
                if (!s.isHost) { s.status = "Watching live"; s.error = null; }
            } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                if (!s.isHost) s.status = "Reconnecting video…";
                clearTimeout(peer.timer);
                peer.timer = setTimeout(() => {
                    if (s.closed || s.peers.get(id) !== peer) return;
                    if (peer.restarts++ < 2) {
                        if (s.isHost) offer(s, id, true).catch(() => {});
                        else signal(s, id, "restart", {}).catch(() => {});
                    } else fail(s, s.isHost ? "A viewer couldn’t connect. They can retry from their room." : "This network couldn’t establish a video connection. Reconnect or try another network.");
                }, pc.connectionState === "failed" ? 1000 : 6000);
            }
            notify(s);
        };
        if (s.isHost) {
            for (const track of s.local.getTracks()) pc.addTrack(track, s.local);
        } else {
            pc.ontrack = async event => {
                if (s.closed || s.peers.get(id) !== peer) return;
                const remote = event.streams[0] ?? s.video.srcObject ?? new MediaStream();
                if (!event.streams.length && !remote.getTracks().includes(event.track)) remote.addTrack(event.track);
                s.video.srcObject = remote;
                const receiver = pc.getReceivers().find(item => item.track === event.track);
                if (receiver && "jitterBufferTarget" in receiver) {
                    // A small target absorbs Wi-Fi bursts without making controls feel laggy.
                    try { receiver.jitterBufferTarget = event.track.kind === "audio" ? 120 : 90; } catch { }
                }
                event.track.contentHint = event.track.kind === "audio" ? "music" : "detail";
                try { await s.video.play(); }
                catch { s.status = "Press play to watch"; }
                notify(s);
            };
        }
        return peer;
    }
    async function recoverStalledPeer(s, id, peer) {
        if (s.closed || s.isHost || peer.recovering || s.hub.state !== "Connected") return;
        peer.recovering = true;
        try {
            // Keep the signaling connection and request a fresh ICE/SDP offer.
            closePeer(s, id);
            s.remoteHost = id;
            await signal(s, id, "restart", {});
            s.status = "Recovering video…";
            notify(s);
        } catch { fail(s, "The video stopped responding. Use Reconnect to try again."); }
        finally { peer.recovering = false; }
    }
    async function inspectInbound(s) {
        if (s.closed || s.isHost || !s.remoteHost) return;
        const peer = s.peers.get(s.remoteHost);
        if (!peer || peer.pc.connectionState !== "connected") return;
        try {
            const stats = await peer.pc.getStats();
            const inbound = [...stats.values()].find(item => item.type === "inbound-rtp" && item.kind === "video");
            if (!inbound) return;
            const bytes = inbound.bytesReceived ?? 0;
            const frames = inbound.framesDecoded ?? 0;
            if (bytes === peer.lastBytes && frames === peer.lastFrames) {
                peer.stalledSince ||= Date.now();
                if (Date.now() - peer.stalledSince > 4500) await recoverStalledPeer(s, s.remoteHost, peer);
            } else {
                peer.lastBytes = bytes;
                peer.lastFrames = frames;
                peer.stalledSince = 0;
            }
        } catch { }
    }
    async function offer(s, id, restart = false) {
        if (s.closed || !s.isHost || !s.local?.getVideoTracks().some(t => t.readyState === "live")) return;
        const peer = s.peers.get(id) ?? makePeer(s, id);
        peer.queue = peer.queue.catch(() => {}).then(async () => {
            if (s.closed || peer.pc.signalingState === "closed") return;
            await peer.pc.setLocalDescription(await peer.pc.createOffer({ iceRestart: restart }));
            await signal(s, id, "offer", peer.pc.localDescription);
        });
        return peer.queue;
    }
    async function receiveSignal(s, id, kind, payload) {
        if (s.closed) return;
        const value = JSON.parse(payload);
        if (kind === "restart") { if (s.isHost) await offer(s, id, true); return; }
        let peer = s.peers.get(id);
        if (!s.isHost) {
            if (s.remoteHost && s.remoteHost !== id) closePeers(s);
            s.remoteHost = id;
        }
        if (!peer) {
            if (s.isHost) return;
            peer = makePeer(s, id);
        }
        // Process SDP and ICE in order, including candidates arriving before SDP.
        peer.queue = peer.queue.catch(() => {}).then(async () => {
            if (s.closed || peer.pc.signalingState === "closed") return;
            if (kind === "ice") {
                if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(value);
                else peer.candidates.push(value);
                return;
            }
            await peer.pc.setRemoteDescription(value);
            for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
            if (kind === "offer" && !s.isHost) {
                await peer.pc.setLocalDescription(await peer.pc.createAnswer());
                await signal(s, id, "answer", peer.pc.localDescription);
                s.status = "Connecting video…";
            } else if (kind === "answer" && s.isHost) {
                await Promise.all(peer.pc.getSenders().map(sender => limitSender(sender, s.settings).catch(() => {})));
            }
            notify(s);
        });
        await peer.queue;
    }
    function roomState(s, snapshot) {
        if (s.closed) return;
        s.snapshot = snapshot;
        if (!s.isHost) {
            s.settings = { ...snapshot.room };
            s.remoteHost = snapshot.hostId ?? null;
            if (!snapshot.live) { closePeers(s); s.status = "Waiting for the broadcaster"; }
        }
        notify(s);
    }
    async function publishSettings(s) {
        if (s.isHost && s.hub.state === "Connected")
            await s.hub.invoke("UpdateSettings", s.settings, s.audioMuted, !!s.local?.getAudioTracks().length);
    }
    async function join(s) {
        s.ice = await s.hub.invoke("GetIceServers");
        if (s.closed) return;
        roomState(s, await s.hub.invoke("JoinRoom", s.id, s.isHost ? s.token : null));
        if (s.closed) return;
        s.ready = true;
        s.status = s.isHost ? "Broadcasting live" : s.snapshot.live ? "Connecting video…" : "Waiting for the broadcaster";
        await publishSettings(s);
        notify(s);
    }
    async function endBroadcast(s) {
        if (s.closed || !s.isHost || s.ending) return;
        s.ending = true;
        closePeers(s);
        s.video.srcObject = null;
        try { if (s.hub.state === "Connected") await s.hub.invoke("LeaveRoom"); }
        finally {
            await s.hub.stop();
            s.ready = false;
            s.snapshot.live = false;
            s.status = "Broadcast ended";
            notify(s);
        }
    }
    async function disconnect(id) {
        const s = active;
        if (!s || (id && s.id !== id)) return;
        s.closed = true;
        active = null;
        closePeers(s);
        for (const cleanup of s.cleanup) cleanup();
        s.video.srcObject = null;
        if (s.isHost) window.veyraScreen.stop(s.id);
        try {
            if (s.hub.state === "Connected") await s.hub.invoke("LeaveRoom");
        } catch { /* Disconnection is also handled by the server. */ }
        await s.hub.stop();
    }
    function bind(s, target, name, handler) {
        target.addEventListener(name, handler);
        s.cleanup.push(() => target.removeEventListener(name, handler));
    }
    window.veyraRoom = {
        async connect(video, stage, fullscreen, audio, play, switchButton, id, settings, receiver) {
            await disconnect();
            const local = window.veyraScreen.localStream(id);
            const token = window.veyraScreen.hostCredential(id);
            const s = {
                id, local, token, isHost: !!local && !!token, video, stage, receiver,
                settings: { ...settings }, snapshot: { live: false, viewers: 0, hasAudio: false, audioMuted: false },
                peers: new Map(), cleanup: [], audioMuted: false, ready: false, closed: false,
                status: "Connecting to room…", error: null, remoteHost: null,
                hub: new signalR.HubConnectionBuilder().withUrl(new URL("hubs/rooms", document.baseURI).href)
                    .withAutomaticReconnect([0, 2000, 5000, 10000]).configureLogging(signalR.LogLevel.Error).build()
            };
            active = s;
            const refresh = setInterval(async () => {
                if (s.closed || !s.ready || s.ending || s.hub.state !== "Connected") return;
                try {
                    s.ice = await s.hub.invoke("GetIceServers");
                    for (const [id, peer] of s.peers) {
                        peer.pc.setConfiguration(s.ice);
                        if (s.isHost) await offer(s, id, true);
                        else await signal(s, id, "restart", {});
                    }
                } catch { /* Normal reconnect obtains fresh credentials as well. */ }
            }, 45 * 60 * 1000);
            s.cleanup.push(() => clearInterval(refresh));
            const watchdog = setInterval(() => inspectInbound(s), 2000);
            s.cleanup.push(() => clearInterval(watchdog));
            video.muted = true;
            if (switchButton?.addEventListener) bind(s, switchButton, "click", () => switchSource(s));
            bind(s, fullscreen, "click", async () => {
                try {
                    if (document.fullscreenElement) await document.exitFullscreen();
                    else if (stage.requestFullscreen) await stage.requestFullscreen();
                    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
                    else fail(s, "Fullscreen is not supported by this browser.");
                } catch { fail(s, "Fullscreen could not open. Try again from the player."); }
            });
            bind(s, document, "fullscreenchange", () => {
                if (!document.fullscreenElement) stage.classList.remove("controls-visible");
                notify(s);
            });
            // In fullscreen the controls are hidden by default. Only show them
            // when the pointer reaches the bottom control zone.
            bind(s, stage, "pointermove", event => {
                if (document.fullscreenElement !== stage) return;
                const bounds = stage.getBoundingClientRect();
                stage.classList.toggle("controls-visible", event.clientY >= bounds.bottom - 125);
            });
            bind(s, stage, "pointerleave", () => stage.classList.remove("controls-visible"));
            bind(s, stage, "touchstart", () => {
                if (document.fullscreenElement === stage) stage.classList.toggle("controls-visible");
            }, { passive: true });
            bind(s, audio, "click", async () => {
                s.error = null;
                if (s.isHost) {
                    if (!s.local?.getAudioTracks().length) {
                        try {
                            await window.veyraScreen.addAudio(s.id);
                            await window.veyraRoom.audioChanged(s.id);
                        } catch (error) {
                            fail(s, error?.message ?? "The browser did not provide a shareable audio track.");
                        }
                        notify(s);
                        return;
                    }
                    s.audioMuted = !s.audioMuted;
                    s.local.getAudioTracks().forEach(track => track.enabled = !s.audioMuted);
                    try { await publishSettings(s); }
                    catch { fail(s, "Audio changed, but the room status couldn’t be updated. Reconnect to sync it."); }
                } else {
                    video.muted = !video.muted;
                    try { await video.play(); }
                    catch { fail(s, "Press play to start the video."); }
                }
                notify(s);
            });
            bind(s, play, "click", async () => {
                if (video.paused) {
                    try { await video.play(); } catch { fail(s, "Video is not ready yet. Wait for the broadcaster or reconnect."); }
                } else video.pause();
                notify(s);
            });
            for (const event of ["playing", "pause", "resize"]) bind(s, video, event, () => notify(s));
            s.hub.on("RoomState", snapshot => roomState(s, snapshot));
            s.hub.on("ViewerJoined", id => { if (s.isHost) offer(s, id).catch(() => fail(s, "A viewer couldn’t connect. They can retry from their room.")); });
            s.hub.on("ViewerLeft", id => closePeer(s, id));
            s.hub.on("Signal", (id, kind, payload) => receiveSignal(s, id, kind, payload).catch(() => fail(s, "The video connection was interrupted. Reconnect to try again.")));
            s.hub.on("Replaced", () => { window.veyraScreen.stop(s.id); fail(s, "This broadcast was opened in another connection."); });
            s.hub.onreconnecting(() => {
                // Keep a healthy WebRTC path alive while only the signaling socket reconnects.
                // Closing peers here caused a visible freeze and forced a full renegotiation.
                s.ready = false;
                s.status = "Reconnecting room control…";
                notify(s);
            });
            s.hub.onreconnected(async () => {
                try {
                    await join(s);
                    if (!s.isHost && s.remoteHost) {
                        await signal(s, s.remoteHost, "restart", {});
                    }
                }
                catch { fail(s, "The room connection could not be restored. Reconnect to try again."); }
            });
            s.hub.onclose(() => {
                if (!s.closed && !s.ending) { s.ready = false; s.status = "Disconnected"; fail(s, "The room connection closed. Reconnect to try again."); }
            });
            try {
                if (s.isHost) await window.veyraScreen.attach(video, id, null);
                await s.hub.start();
                await join(s);
            } catch {
                s.ready = false;
                fail(s, "Couldn’t connect to this room. Check your connection and reconnect.");
            }
            notify(s);
        },
        async updateQuality(height, frameRate) {
            const s = active;
            if (!s?.isHost || !s.ready || s.ending) throw new Error("Broadcast is not active.");
            const width = widths[height];
            if (!width || ![30, 60, 120, 240].includes(frameRate)) throw new Error("Unsupported capture settings.");
            const track = s.local.getVideoTracks()[0];
            await track.applyConstraints({ width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate, max: frameRate } });
            s.settings = { ...s.settings, width, height, frameRate };
            s.error = null;
            const results = await Promise.allSettled([...s.peers.values()].flatMap(peer => peer.pc.getSenders().map(sender => limitSender(sender, s.settings))));
            if (results.some(result => result.status === "rejected")) s.error = "Capture updated. This browser could not apply every video encoding limit.";
            try { await publishSettings(s); }
            catch { s.error = "Capture updated, but the room status couldn’t sync. Reconnect to update it."; }
            notify(s);
        },
        async audioChanged(id) {
            const s = active;
            if (!s || s.id !== id || !s.isHost) return;
            const track = s.local?.getAudioTracks()[0];
            for (const [peerId, peer] of s.peers) {
                const sender = peer.pc.getSenders().find(item => item.track?.kind === "audio");
                if (track && !sender) peer.pc.addTrack(track, s.local);
                else if (sender && !track) await sender.replaceTrack(null);
                await offer(s, peerId, true);
            }
            try { await publishSettings(s); }
            catch { fail(s, "Audio changed locally, but the viewers could not be updated yet."); }
            notify(s);
        },
        captureEnded(id) {
            if (active?.id === id && active.isHost) endBroadcast(active).catch(() => {});
        },
        async stopBroadcast() {
            const s = active;
            if (!s?.isHost) return;
            window.veyraScreen.stop(s.id);
            await endBroadcast(s);
        },
        async reconnect() {
            const s = active;
            if (!s || s.closed || s.ending) return;
            s.error = null;
            closePeers(s);
            if (s.hub.state === "Disconnected") { await s.hub.start(); await join(s); }
            else if (s.hub.state === "Connected") {
                s.ice = await s.hub.invoke("GetIceServers");
                if (s.isHost) { await s.hub.invoke("LeaveRoom"); await join(s); }
                else await s.hub.invoke("RequestStream");
            }
            notify(s);
        },
        disconnect
    };
    window.addEventListener("pagehide", () => { disconnect().catch(() => {}); });
})();
