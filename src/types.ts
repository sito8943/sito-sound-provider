import type { ReactNode } from "react";

export type PlaySoundOptions = {
  delayMs?: number;
  channelId?: string;
};

export type ToneDefinition = {
  frequency: number;
  durationMs: number;
  gain: number;
  waveform: OscillatorType;
  delayMs?: number;
  attackMs?: number;
  releaseMs?: number;
};

export type ToneSoundDefinition = {
  type: "tone";
  tones: ToneDefinition[];
  channelId?: string;
};

export type AudioSoundDefinition = {
  type: "audio";
  src: string;
  channelId?: string;
  volume?: number;
  loop?: boolean;
  playbackRate?: number;
  preload?: "none" | "metadata" | "auto";
};

export type SoundDefinition = ToneSoundDefinition | AudioSoundDefinition;

export type SoundEventMap<TEvent extends string> = Record<
  TEvent,
  SoundDefinition | SoundDefinition[]
>;

export type MusicTrackDefinition = {
  src: string;
  channelId?: string;
  volume?: number;
  loop?: boolean;
  playbackRate?: number;
  preload?: "none" | "metadata" | "auto";
};

export type MusicTrackMap<TMusicTrack extends string> = Record<
  TMusicTrack,
  MusicTrackDefinition
>;

export type AudioChannelKind = "master" | "music" | "sfx" | "custom";

export type ChannelStorageKeys = {
  enabled?: string;
  volume?: string;
  muted?: string;
};

export type AudioChannelDefinition = {
  id: string;
  label?: string;
  kind?: AudioChannelKind;
  defaultEnabled?: boolean;
  defaultVolume?: number;
  defaultMuted?: boolean;
  storageKeys?: ChannelStorageKeys;
};

export type AudioChannelState = {
  id: string;
  label: string;
  kind: AudioChannelKind;
  enabled: boolean;
  volume: number;
  muted: boolean;
};

export type SoundStorageKeys = {
  soundEnabled: string;
  soundVolume: string;
  soundMuted: string;
};

export type StorageAdapter = Pick<Storage, "getItem" | "setItem">;

export type SoundContextType<
  TEvent extends string,
  TMusicTrack extends string = never,
> = {
  // Legacy master aliases for backward compatibility.
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  volume: number;
  setVolume: (volume: number) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;

  channels: AudioChannelState[];
  getChannels: () => AudioChannelState[];
  setChannelEnabled: (channelId: string, enabled: boolean) => void;
  setChannelVolume: (channelId: string, volume: number) => void;
  setChannelMuted: (channelId: string, muted: boolean) => void;

  playSound: (event: TEvent, options?: PlaySoundOptions) => void;

  playMusic: (
    track: TMusicTrack,
    options?: {
      channelId?: string;
      restart?: boolean;
      fadeMs?: number;
    },
  ) => void;
  pauseMusic: (channelId?: string, fadeMs?: number) => void;
  resumeMusic: (channelId?: string, fadeMs?: number) => void;
  stopMusic: (channelId?: string, fadeMs?: number) => void;
  getActiveMusicTrack: (channelId?: string) => TMusicTrack | null;
};

export type SoundTemplateProviderProps<
  TEvent extends string,
  TMusicTrack extends string = never,
> = {
  children: ReactNode;
  featureEnabled: boolean;
  eventMap: SoundEventMap<TEvent>;
  musicMap?: MusicTrackMap<TMusicTrack>;
  channels?: AudioChannelDefinition[];
  includeDefaultChannels?: boolean;
  storage?: StorageAdapter;
  storageKeyPrefix?: string;
  storageKeys?: SoundStorageKeys;
  defaultEnabled?: boolean;
  defaultVolume?: number;
  defaultMuted?: boolean;
};
