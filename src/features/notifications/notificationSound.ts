/** Short UI ping. Best-effort — browsers may block until a user gesture. */
export function playNotificationSound(): void {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
        const context = new AudioContextCtor();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.05, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.14);
        oscillator.onended = () => {
            void context.close();
        };
    } catch {
        // Ignore autoplay / unsupported audio.
    }
}
