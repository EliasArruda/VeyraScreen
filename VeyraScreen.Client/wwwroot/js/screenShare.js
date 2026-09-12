(() => {
    let stream = null;
    let roomId = null;
    let hostToken = null;
    let pendingCapture = null;
    let observer = null;
    let video = null;
    let pendingAudio = null;
    let pendingSwitch = null;
    const bindings = new WeakMap();
    let generation = 0;

    const captureError = error => {
        if (error?.name === "NotAllowedError" || error?.name === "AbortError")
            return "Screen selection was canceled. Choose a screen when you’re ready.";
        if (error?.name === "NotReadableError")
            return "Your screen could not be captured. Check your system’s screen recording permissions.";
        return "Screen capture is unavailable. Try a supported desktop browser over HTTPS or localhost.";
    };
    function watchAudio(track) {
        track.contentHint = "music";
        track.addEventListener("ended", () => {
            stream?.removeTrack(track);
            window.veyraRoom?.audioChanged(roomId);
        }, { once: true });
    }
    function watchVideo(track) {
        track.contentHint = "motion";
        track.addEventListener("ended", () => {
            const receiver = observer;
            stop();
            receiver?.invokeMethodAsync("OnCaptureEnded").catch(() => {});
        }, { once: true });
    }
    function stop() {
        const endedRoom = roomId;
        generation++;
        if (stream) stream.getTracks().forEach(track => track.stop());
        stream = null;
        roomId = null;
        hostToken = null;
        if (video) video.srcObject = null;
        video = null;
        observer = null;
        if (endedRoom) window.veyraRoom?.captureEnded(endedRoom);
    }

    window.veyraScreen = {
        bindCapture(button) {
            if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) return false;
            if (bindings.has(button)) return true;
            const handler = () => {
                if (button.disabled || pendingCapture) return;
                stop();
                const current = generation;
                try {
                    pendingCapture = navigator.mediaDevices.getDisplayMedia({
                        video: {
                            width: { ideal: Number(button.dataset.width) },
                            height: { ideal: Number(button.dataset.height) },
                            frameRate: { ideal: Number(button.dataset.fps) }
                        },
                        audio: button.dataset.audio === "true",
                        systemAudio: "include",
                        suppressLocalAudioPlayback: false,
                        preferCurrentTab: false,
                        selfBrowserSurface: "exclude",
                        monitorTypeSurfaces: "include",
                        surfaceSwitching: "include"
                    }).then(captured => {
                        if (current !== generation) {
                            captured.getTracks().forEach(track => track.stop());
                            return "Screen selection was canceled.";
                        }
                        stream = captured;
                        const track = stream.getVideoTracks()[0];
                        watchVideo(track);
                        (stream.getAudioTracks?.() ?? []).forEach(watchAudio);
                        return null;
                    }).catch(captureError);
                } catch (error) { pendingCapture = Promise.resolve(captureError(error)); }
            };
            button.addEventListener("click", handler, true);
            bindings.set(button, handler);
            return true;
        },
        unbindCapture(button) {
            const handler = bindings.get(button);
            if (handler) button.removeEventListener("click", handler, true);
            bindings.delete(button);
        },
        async completeCapture() {
            if (!pendingCapture) return "Choose a screen to start the preview.";
            try { return await pendingCapture; }
            finally { pendingCapture = null; }
        },
        // Called directly by a native button click, never after a server round trip.
        addAudio(id) {
            if (pendingAudio) return pendingAudio;
            if (id !== roomId || !stream) return Promise.reject(new Error("No active capture."));
            const current = generation;
            let selection;
            try {
                selection = navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: { suppressLocalAudioPlayback: false },
                    systemAudio: "include",
                    preferCurrentTab: false,
                    selfBrowserSurface: "exclude",
                    monitorTypeSurfaces: "include"
                });
            } catch (error) { return Promise.reject(new Error(captureError(error))); }
            pendingAudio = selection.then(captured => {
                if (current !== generation || id !== roomId) {
                    captured.getTracks().forEach(track => track.stop());
                    throw new Error("The broadcast ended before audio could be added.");
                }
                const tracks = captured.getAudioTracks().filter(track => track.readyState === "live");
                if (!tracks.length) {
                    captured.getTracks().forEach(track => track.stop());
                    throw new Error("The browser didn’t provide audio. Choose a browser tab and enable Share tab audio. Some browsers cannot capture sound from windows or the entire screen.");
                }
                // Keep the original video. This selection supplies audio only.
                captured.getVideoTracks().forEach(track => track.stop());
                stream.getAudioTracks().forEach(track => { stream.removeTrack(track); track.stop(); });
                const track = tracks[0];
                track.enabled = true;
                tracks.slice(1).forEach(extra => extra.stop());
                watchAudio(track);
                stream.addTrack(track);
                return track;
            }).catch(error => {
                if (error?.name === "NotAllowedError" || error?.name === "AbortError") throw new Error("Audio selection was canceled. Your screen is still broadcasting.");
                throw error;
            }).finally(() => { pendingAudio = null; });
            return pendingAudio;
        },
        switchVideo(id, settings) {
            if (pendingSwitch) return pendingSwitch;
            if (id !== roomId || !stream) return Promise.reject(new Error("No active capture."));
            const current = generation;
            let selection;
            try {
                selection = navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: { ideal: Number(settings?.width) || 1920 },
                        height: { ideal: Number(settings?.height) || 1080 },
                        frameRate: { ideal: Number(settings?.frameRate) || 30 }
                    },
                    audio: false,
                    systemAudio: "include",
                    preferCurrentTab: false,
                    selfBrowserSurface: "exclude",
                    monitorTypeSurfaces: "include",
                    surfaceSwitching: "include"
                });
            } catch (error) { return Promise.reject(new Error(captureError(error))); }
            pendingSwitch = selection.then(captured => {
                if (current !== generation || id !== roomId) {
                    captured.getTracks().forEach(track => track.stop());
                    throw new Error("The broadcast ended before the source could be changed.");
                }
                const next = captured.getVideoTracks().find(track => track.readyState === "live");
                if (!next) {
                    captured.getTracks().forEach(track => track.stop());
                    throw new Error("The browser did not provide a video source.");
                }
                const previous = stream.getVideoTracks()[0];
                if (previous) stream.removeTrack(previous);
                stream.addTrack(next);
                watchVideo(next);
                captured.getAudioTracks().forEach(track => track.stop());
                previous?.stop();
                if (video) {
                    video.srcObject = stream;
                    video.play().catch(() => {});
                }
                return next;
            }).catch(error => {
                if (error?.name === "NotAllowedError" || error?.name === "AbortError") throw new Error("Source selection was canceled. Your current source is still broadcasting.");
                throw error;
            }).finally(() => { pendingSwitch = null; });
            return pendingSwitch;
        },
        startRoomShare(id, settings) {
            if (stream || pendingSwitch) return Promise.reject(new Error("A screen is already being shared."));
            const current = generation;
            let selection;
            try {
                selection = navigator.mediaDevices.getDisplayMedia({
                    video: { width: { ideal: Number(settings?.width) || 1920 }, height: { ideal: Number(settings?.height) || 1080 }, frameRate: { ideal: Number(settings?.frameRate) || 30 } },
                    audio: { suppressLocalAudioPlayback: false }, systemAudio: "include", preferCurrentTab: false,
                    selfBrowserSurface: "exclude", monitorTypeSurfaces: "include"
                });
            } catch (error) { return Promise.reject(new Error(captureError(error))); }
            pendingSwitch = selection.then(captured => {
                if (current !== generation) { captured.getTracks().forEach(track => track.stop()); throw new Error("Share selection was canceled."); }
                const track = captured.getVideoTracks()[0];
                if (!track) { captured.getTracks().forEach(item => item.stop()); throw new Error("The browser did not provide a video source."); }
                stream = captured; roomId = id; hostToken = null; watchVideo(track);
                stream.getAudioTracks().forEach(watchAudio);
                if (video) { video.srcObject = stream; video.muted = true; video.play().catch(() => {}); }
                return stream;
            }).catch(error => { throw new Error(error?.name === "NotAllowedError" || error?.name === "AbortError" ? "Share selection was canceled." : error?.message ?? "Screen sharing failed."); }).finally(() => { pendingSwitch = null; });
            return pendingSwitch;
        },
        stopRoomShare(id) {
            if (id !== roomId || !stream) return;
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            roomId = null;
            hostToken = null;
            if (video) video.srcObject = null;
        },
        assignRoom(id, token) {
            if (!stream?.getVideoTracks().some(track => track.readyState === "live")) return false;
            roomId = id;
            hostToken = token;
            return true;
        },
        localStream(id) { return roomId === id ? stream : null; },
        hostCredential(id) { return roomId === id ? hostToken : null; },
        async attach(element, id, receiver) {
            if (roomId !== id || !stream?.getVideoTracks().some(track => track.readyState === "live")) return false;
            observer = receiver;
            video = element;
            if (video.srcObject !== stream) video.srcObject = stream;
            video.muted = true;
            try { await video.play(); }
            catch (error) { stop(); throw error; }
            return true;
        },
        stop(id) { if (id === undefined || roomId === id) stop(); },
        async copyLink(value) {
            try { await navigator.clipboard.writeText(value); return true; }
            catch { return false; }
        }
    };
    window.addEventListener("pagehide", stop);
})();
