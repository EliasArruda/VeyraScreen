let screenStream = null;

window.startScreenShare = async (videoElement, width, height, fps, audio) => {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            width: {
                ideal: width,
            },
            height: {
                ideal: height,
            },
            frameRate: {
                ideal: fps,
                max: fps,
            },
        },
        audio: audio,
        systemAudio: "include",
    });
};

window.attachScreenShare = async (videoElement) => {
    if (!screenStream) return;

    videoElement.srcObject = screenStream;
    await videoElement.play();
};
