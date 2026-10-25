// Decode the supplied recording once; playback may need a user gesture to unlock.
export function createHeroShutter(recording: string) {
  let context: AudioContext | undefined;
  let buffer: AudioBuffer | undefined;
  let loading: Promise<void> | undefined;
  let output: GainNode | undefined;
  let activeSource: AudioBufferSourceNode | undefined;
  return {
    async enable(userInitiated = false) {
      context ??= new AudioContext({ latencyHint: 'interactive' });
      // Give the audio device time to start without hanging on blocked autoplay.
      const resuming = Promise.race([
        context.resume().catch(() => {}),
        new Promise<void>((resolve) => window.setTimeout(resolve, userInitiated ? 1000 : 150)),
      ]);
      loading ??= (async () => {
        // Decode the embedded bytes directly; production connect-src excludes data:.
        const encoded = recording.split(',')[1];
        if (!recording.startsWith('data:audio/mpeg;base64,') || !encoded) throw new Error('Shutter recording unavailable');
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        buffer = await context!.decodeAudioData(bytes.buffer);
        output = context!.createGain();
        output.gain.value = .96;
        output.connect(context!.destination);
      })().catch((error) => { loading = undefined; throw error; });
      await loading;
      await resuming;
      return context.state === 'running';
    },
    play() {
      if (!context || !buffer || !output || context.state !== 'running') return false;
      activeSource?.stop();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.onended = () => {
        source.disconnect();
        if (activeSource === source) activeSource = undefined;
      };
      activeSource = source;
      // Skip the quiet 40 ms lead-in and the nearly silent tail of this recording.
      source.start(0, .04, .46);
      return true;
    },
    mute() { activeSource?.stop(); activeSource = undefined; void context?.suspend().catch(() => {}); },
  };
}
