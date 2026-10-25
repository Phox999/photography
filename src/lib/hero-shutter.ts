// Decode the supplied recording once; playback may need a user gesture to unlock.
export function createHeroShutter() {
  let context: AudioContext | undefined;
  let buffer: AudioBuffer | undefined;
  let loading: Promise<void> | undefined;
  let output: GainNode | undefined;
  let activeSource: AudioBufferSourceNode | undefined;
  return {
    async enable() {
      context ??= new AudioContext();
      // Do not await resume: browsers may leave it pending until a user gesture.
      const waitForUnlock = navigator.userActivation?.isActive;
      const resuming = context.resume().catch(() => {});
      loading ??= (async () => {
        const response = await fetch('/assets/audio/kave_msri-camera-shutter-314056.mp3');
        if (!response.ok) throw new Error('Shutter recording unavailable');
        buffer = await context!.decodeAudioData(await response.arrayBuffer());
        output = context!.createGain();
        output.gain.value = .96;
        output.connect(context!.destination);
      })().catch((error) => { loading = undefined; throw error; });
      await loading;
      if (waitForUnlock) await resuming;
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
