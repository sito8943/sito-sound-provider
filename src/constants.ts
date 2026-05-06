import type { AudioChannelDefinition } from "./types";

export const MIN_GAIN = 0.0001;
export const DEFAULT_ATTACK_MS = 4;
export const DEFAULT_RELEASE_MS = 40;

export const DEFAULT_SOUND_ENABLED = true;
export const DEFAULT_SOUND_VOLUME = 100;
export const DEFAULT_SOUND_MUTED = false;

export const MASTER_CHANNEL_ID = "master";
export const MUSIC_CHANNEL_ID = "music";
export const SFX_CHANNEL_ID = "sfx";

export const DEFAULT_STORAGE_KEY_PREFIX = "sito-sound-provider";

export const DEFAULT_CHANNELS_TEMPLATE: AudioChannelDefinition[] = [
  {
    id: MASTER_CHANNEL_ID,
    label: "Master",
    kind: "master",
    defaultEnabled: DEFAULT_SOUND_ENABLED,
    defaultVolume: DEFAULT_SOUND_VOLUME,
    defaultMuted: DEFAULT_SOUND_MUTED,
  },
  {
    id: MUSIC_CHANNEL_ID,
    label: "Music",
    kind: "music",
    defaultEnabled: true,
    defaultVolume: 80,
    defaultMuted: false,
  },
  {
    id: SFX_CHANNEL_ID,
    label: "Sound Effects",
    kind: "sfx",
    defaultEnabled: true,
    defaultVolume: 100,
    defaultMuted: false,
  },
];
