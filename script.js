// DOM Element References
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const discardBtn = document.getElementById('discardBtn');
const downloadLink = document.getElementById('downloadLink');
const videoPreview = document.getElementById('preview');
const statusMsg = document.getElementById('status');
const timerDisplay = document.getElementById('timer');
const audioSourceSelect = document.getElementById('audioSource');
const includeCameraCheck = document.getElementById('includeCamera');
const cameraContainer = document.getElementById('camera-container');
const cameraPreview = document.getElementById('camera-preview');

// State variables
let mediaRecorder;
let recordedChunks = [];
let screenStream;
let cameraStream;
let combinedStream;
let timerInterval;
let seconds = 0;

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
pauseBtn.addEventListener('click', togglePauseResume);
discardBtn.addEventListener('click', discardRecording);
includeCameraCheck.addEventListener('change', toggleCameraPreview);

// Initialize Lucide Icons
lucide.createIcons();

/**
 * Asynchronously starts the screen recording process.
 */
async function startRecording() {
    try {
        recordedChunks = []; // Clear previous recording chunks
        
        // Get screen stream based on selected audio option
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { mediaSource: "screen", width: 1920, height: 1080, frameRate: 30 },
            audio: audioSourceSelect.value === 'system' || audioSourceSelect.value === 'both',
        });

        // Get microphone stream if selected
        let micStream = null;
        if (audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }

        // Get camera stream if selected
        if (includeCameraCheck.checked) {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            cameraPreview.srcObject = cameraStream;
        }

        // Collect all audio tracks
        const audioTracks = [];
        if (screenStream.getAudioTracks().length > 0) audioTracks.push(...screenStream.getAudioTracks());
        if (micStream && micStream.getAudioTracks().length > 0) audioTracks.push(...micStream.getAudioTracks());

        let finalStream;

        // If camera is included, merge screen and camera onto a canvas
        if (includeCameraCheck.checked && cameraStream) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1920;
            canvas.height = 1080;
            
            const screenVideoEl = document.createElement('video');
            screenVideoEl.srcObject = new MediaStream(screenStream.getVideoTracks());
            screenVideoEl.play();
            
            const cameraVideoEl = document.createElement('video');
            cameraVideoEl.srcObject = cameraStream;
            cameraVideoEl.play();
            
            // Function to continuously draw video frames to the canvas
            function drawToCanvas() {
                if (mediaRecorder?.state !== 'recording') return;
                ctx.drawImage(screenVideoEl, 0, 0, canvas.width, canvas.height);
                
                const camWidth = 320;
                const camHeight = 240;
                
                // Draw camera feed with a mirrored effect in the bottom-right corner
                ctx.save();
                ctx.translate(canvas.width - 20, canvas.height - 20);
                ctx.scale(-1, 1);
                ctx.drawImage(cameraVideoEl, -camWidth, 0, camWidth, camHeight);
                ctx.restore();
                
                requestAnimationFrame(drawToCanvas);
            }

            drawToCanvas();
            const canvasStream = canvas.captureStream(30);
            finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
        } else {
            // Otherwise, use the screen stream directly
            finalStream = new MediaStream([...screenStream.getVideoTracks(), ...audioTracks]);
        }
        
        combinedStream = finalStream;
        videoPreview.srcObject = screenStream;
        videoPreview.play();
        videoPreview.poster = '';

        // Initialize MediaRecorder
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9' });
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunks.push(event.data);
        };
        mediaRecorder.onstop = handleStop;
        
        // Stop recording if the user stops screen sharing from the browser UI
        screenStream.getVideoTracks()[0].onended = () => {
            if (mediaRecorder.state === 'recording') stopRecording();
        };

        mediaRecorder.start();
        startTimer();
        updateUIForStart();

    } catch (error) {
        console.error("Error starting recording:", error);
        statusMsg.textContent = `Error: ${error.message}`;
        resetUI();
    }
}

/**
 * Stops the active screen recording.
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    // Stop all media tracks to release resources
    if (combinedStream) {
        combinedStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
     if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
}

/**
 * Handles the logic after recording has stopped, creating a downloadable blob.
 */
function handleStop() {
    stopTimer();
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    // Update video preview to show the recorded video
    videoPreview.srcObject = null;
    videoPreview.src = url;
    videoPreview.controls = true;
    videoPreview.play();
    
    // Set up download link
    downloadLink.href = url;
    downloadLink.download = `recording-${new Date().toISOString()}.webm`;
    
    updateUIForStop();
}

/**
 * Pauses or resumes the recording.
 */
function togglePauseResume() {
    if (!mediaRecorder) return;

    if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        pauseTimer();
        pauseBtn.innerHTML = '<i data-lucide="play-circle" class="mr-2"></i> Resume';
        statusMsg.textContent = 'Status: Paused';
    } else if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        startTimer();
        pauseBtn.innerHTML = '<i data-lucide="pause-circle" class="mr-2"></i> Pause';
        statusMsg.textContent = 'Status: Recording...';
    }
    lucide.createIcons(); // Re-render icons after changing innerHTML
}

/**
 * Discards the current recording and resets the UI.
 */
function discardRecording() {
    if(downloadLink.href && downloadLink.href !== '#') {
        URL.revokeObjectURL(downloadLink.href);
    }
    resetUI();
}

// --- UI Update and Helper Functions ---

function updateUIForStart() {
    statusMsg.textContent = 'Status: Recording...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    pauseBtn.hidden = false;
    downloadLink.hidden = true;
    discardBtn.hidden = true;
    audioSourceSelect.disabled = true;
    includeCameraCheck.disabled = true;
}

function updateUIForStop() {
    statusMsg.textContent = 'Status: Stopped. Preview ready.';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    pauseBtn.hidden = true;
    pauseBtn.innerHTML = '<i data-lucide="pause-circle" class="mr-2"></i> Pause';
    lucide.createIcons();
    downloadLink.hidden = false;
    discardBtn.hidden = false;
    audioSourceSelect.disabled = false;
    includeCameraCheck.disabled = false;
    cameraContainer.hidden = true;
}

function resetUI() {
    statusMsg.textContent = 'Status: Idle';
    timerDisplay.textContent = '00:00:00';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    pauseBtn.hidden = true;
    downloadLink.hidden = true;
    downloadLink.href = '#';
    discardBtn.hidden = true;
    videoPreview.srcObject = null;
    videoPreview.src = '';
    videoPreview.controls = false;
    videoPreview.poster = 'https://placehold.co/1280x720/111827/4b5563?text=Your+Screen+Preview';
    audioSourceSelect.disabled = false;
    includeCameraCheck.disabled = false;
    cameraContainer.hidden = true;
    recordedChunks = [];
    seconds = 0;
}

async function toggleCameraPreview() {
    if (includeCameraCheck.checked) {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraPreview.srcObject = cameraStream;
            cameraContainer.hidden = false;
        } catch (err) {
            console.error("Could not get camera stream:", err);
            statusMsg.textContent = "Error: Could not access camera.";
            includeCameraCheck.checked = false;
        }
    } else {
         if (cameraStream) {
             cameraStream.getTracks().forEach(track => track.stop());
         }
        cameraContainer.hidden = true;
    }
}

// --- Timer Logic ---

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        timerDisplay.textContent = formatTime(seconds);
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    seconds = 0;
}

function pauseTimer() {
    clearInterval(timerInterval);
}

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [hours, minutes, secs]
        .map(v => v.toString().padStart(2, '0'))
        .join(':');
}

// --- Draggable Camera Logic ---
let isDragging = false;
let offsetX, offsetY;

cameraContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    // Calculate offset from the top-left corner of the container
    offsetX = e.clientX - cameraContainer.getBoundingClientRect().left;
    offsetY = e.clientY - cameraContainer.getBoundingClientRect().top;
    cameraContainer.style.cursor = 'grabbing';
    // Set position to absolute to allow dragging
    cameraContainer.style.position = 'absolute';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    // Calculate new position relative to the parent container
    const parentRect = cameraContainer.parentElement.getBoundingClientRect();
    let newX = e.clientX - parentRect.left - offsetX;
    let newY = e.clientY - parentRect.top - offsetY;

    // Constrain movement within the parent bounds
    newX = Math.max(0, Math.min(newX, parentRect.width - cameraContainer.offsetWidth));
    newY = Math.max(0, Math.min(newY, parentRect.height - cameraContainer.offsetHeight));
    
    cameraContainer.style.left = `${newX}px`;
    cameraContainer.style.top = `${newY}px`;
    // Remove bottom/right properties to avoid conflicts
    cameraContainer.style.right = 'auto';
    cameraContainer.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => {
    if(isDragging) {
        isDragging = false;
        cameraContainer.style.cursor = 'move';
    }
});

// Initial state
resetUI();
