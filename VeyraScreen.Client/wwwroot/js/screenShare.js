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
    videoElement.srcObject = screenStream;
    await videoElement.play();
};
