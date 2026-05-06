import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_ATTACK_MS,
  DEFAULT_CHANNELS_TEMPLATE,
  DEFAULT_RELEASE_MS,
  DEFAULT_SOUND_ENABLED,
  DEFAULT_SOUND_MUTED,
  DEFAULT_SOUND_VOLUME,
  DEFAULT_STORAGE_KEY_PREFIX,
  MASTER_CHANNEL_ID,
  MIN_GAIN,
  MUSIC_CHANNEL_ID,
  SFX_CHANNEL_ID,
} from "./constants";
import type {
  AudioChannelDefinition,
  AudioChannelKind,
  AudioChannelState,
  ChannelStorageKeys,
  MusicTrackMap,
  PlaySoundOptions,
  SoundContextType,
  SoundDefinition,
  SoundTemplateProviderProps,
  StorageAdapter,
  ToneDefinition,
} from "./types";
import { toWindowWithWebkitAudio } from "./utils";

type ChannelRuntimeState = {
  enabled: boolean;
  volume: number;
  muted: boolean;
};

type ResolvedChannel = {
  id: string;
  label: string;
  kind: AudioChannelKind;
  defaultEnabled: boolean;
  defaultVolume: number;
  defaultMuted: boolean;
  storageKeys: Required<ChannelStorageKeys>;
};

const clampVolume = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return fallback;
};

const normalizeNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number") {
    return clampVolume(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return clampVolume(parsed);
    }
  }

  return clampVolume(fallback);
};

const resolveStorage = (storage?: StorageAdapter): StorageAdapter | null => {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

const readStoredValue = (
  storage: StorageAdapter | null,
  key: string,
): unknown | null => {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const inferChannelKind = (id: string, kind?: AudioChannelKind): AudioChannelKind => {
  if (kind) {
    return kind;
  }

  if (id === MASTER_CHANNEL_ID) {
    return "master";
  }

  if (id === MUSIC_CHANNEL_ID) {
    return "music";
  }

  if (id === SFX_CHANNEL_ID) {
    return "sfx";
  }

  return "custom";
};

const inferChannelLabel = (id: string, label?: string): string => {
  if (label && label.trim().length > 0) {
    return label;
  }

  return id;
};

const resolveResolvedChannelStorageKeys = (
  channel: AudioChannelDefinition,
  storageKeyPrefix: string,
  legacyMasterStorageKeys: SoundTemplateProviderProps<string>["storageKeys"],
): Required<ChannelStorageKeys> => {
  if (channel.id === MASTER_CHANNEL_ID && legacyMasterStorageKeys) {
    return {
      enabled: legacyMasterStorageKeys.soundEnabled,
      volume: legacyMasterStorageKeys.soundVolume,
      muted: legacyMasterStorageKeys.soundMuted,
    };
  }

  const defaultPrefix = `${storageKeyPrefix}:channel:${channel.id}`;

  return {
    enabled: channel.storageKeys?.enabled ?? `${defaultPrefix}:enabled`,
    volume: channel.storageKeys?.volume ?? `${defaultPrefix}:volume`,
    muted: channel.storageKeys?.muted ?? `${defaultPrefix}:muted`,
  };
};

const mergeChannelDefinitions = (
  previous: AudioChannelDefinition,
  next: AudioChannelDefinition,
): AudioChannelDefinition => ({
  ...previous,
  ...next,
  storageKeys: {
    ...previous.storageKeys,
    ...next.storageKeys,
  },
});

const resolveChannels = ({
  channels,
  includeDefaultChannels,
  storageKeyPrefix,
  legacyMasterStorageKeys,
  defaultEnabled,
  defaultVolume,
  defaultMuted,
}: {
  channels: AudioChannelDefinition[] | undefined;
  includeDefaultChannels: boolean;
  storageKeyPrefix: string;
  legacyMasterStorageKeys: SoundTemplateProviderProps<string>["storageKeys"];
  defaultEnabled: boolean;
  defaultVolume: number;
  defaultMuted: boolean;
}): {
  channels: ResolvedChannel[];
  masterChannelId: string;
  defaultMusicChannelId: string;
  defaultSfxChannelId: string;
} => {
  const initialChannels = includeDefaultChannels
    ? DEFAULT_CHANNELS_TEMPLATE
    : DEFAULT_CHANNELS_TEMPLATE.filter(
        (channel) => channel.id === MASTER_CHANNEL_ID,
      );

  const mergedById = new Map<string, AudioChannelDefinition>();

  initialChannels.forEach((channel) => {
    mergedById.set(channel.id, { ...channel });
  });

  channels?.forEach((channel) => {
    const existing = mergedById.get(channel.id);
    if (!existing) {
      mergedById.set(channel.id, { ...channel });
      return;
    }

    mergedById.set(channel.id, mergeChannelDefinitions(existing, channel));
  });

  if (!mergedById.has(MASTER_CHANNEL_ID)) {
    mergedById.set(MASTER_CHANNEL_ID, {
      id: MASTER_CHANNEL_ID,
      kind: "master",
      label: "Master",
      defaultEnabled,
      defaultVolume,
      defaultMuted,
    });
  }

  const defaultOrder = includeDefaultChannels
    ? [MASTER_CHANNEL_ID, MUSIC_CHANNEL_ID, SFX_CHANNEL_ID]
    : [MASTER_CHANNEL_ID];

  const resolvedOrder: string[] = [];

  defaultOrder.forEach((channelId) => {
    if (mergedById.has(channelId)) {
      resolvedOrder.push(channelId);
    }
  });

  mergedById.forEach((_, channelId) => {
    if (!resolvedOrder.includes(channelId)) {
      resolvedOrder.push(channelId);
    }
  });

  const resolvedChannels: ResolvedChannel[] = resolvedOrder
    .map((channelId) => {
      const channel = mergedById.get(channelId);
      if (!channel) {
        return null;
      }

      return {
        id: channel.id,
        label: inferChannelLabel(channel.id, channel.label),
        kind: inferChannelKind(channel.id, channel.kind),
        defaultEnabled:
          channel.defaultEnabled ??
          (channel.id === MASTER_CHANNEL_ID ? defaultEnabled : true),
        defaultVolume:
          channel.defaultVolume ??
          (channel.id === MASTER_CHANNEL_ID ? defaultVolume : 100),
        defaultMuted:
          channel.defaultMuted ??
          (channel.id === MASTER_CHANNEL_ID ? defaultMuted : false),
        storageKeys: resolveResolvedChannelStorageKeys(
          channel,
          storageKeyPrefix,
          legacyMasterStorageKeys,
        ),
      };
    })
    .filter((value): value is ResolvedChannel => value !== null);

  const defaultMusicChannelId =
    resolvedChannels.find((channel) => channel.kind === "music")?.id ??
    MUSIC_CHANNEL_ID;

  const defaultSfxChannelId =
    resolvedChannels.find((channel) => channel.kind === "sfx")?.id ??
    SFX_CHANNEL_ID;

  return {
    channels: resolvedChannels,
    masterChannelId: MASTER_CHANNEL_ID,
    defaultMusicChannelId,
    defaultSfxChannelId,
  };
};

const resolveInitialChannelState = (
  channels: ResolvedChannel[],
  storage: StorageAdapter | null,
): Record<string, ChannelRuntimeState> => {
  const channelStateById: Record<string, ChannelRuntimeState> = {};

  channels.forEach((channel) => {
    const storedEnabled = readStoredValue(storage, channel.storageKeys.enabled);
    const storedVolume = readStoredValue(storage, channel.storageKeys.volume);
    const storedMuted = readStoredValue(storage, channel.storageKeys.muted);

    channelStateById[channel.id] = {
      enabled: normalizeBoolean(storedEnabled, channel.defaultEnabled),
      volume: normalizeNumber(storedVolume, channel.defaultVolume),
      muted: normalizeBoolean(storedMuted, channel.defaultMuted),
    };
  });

  return channelStateById;
};

const clearAudioFade = (
  fadeIntervalByAudio: Map<HTMLAudioElement, number>,
  audio: HTMLAudioElement,
) => {
  const intervalId = fadeIntervalByAudio.get(audio);
  if (intervalId !== undefined && typeof window !== "undefined") {
    window.clearInterval(intervalId);
  }

  fadeIntervalByAudio.delete(audio);
};

const runAudioFade = ({
  audio,
  to,
  durationMs,
  fadeIntervalByAudio,
  onDone,
}: {
  audio: HTMLAudioElement;
  to: number;
  durationMs: number;
  fadeIntervalByAudio: Map<HTMLAudioElement, number>;
  onDone?: () => void;
}) => {
  clearAudioFade(fadeIntervalByAudio, audio);

  if (
    durationMs <= 0 ||
    !Number.isFinite(durationMs) ||
    typeof window === "undefined"
  ) {
    audio.volume = Math.max(0, Math.min(1, to));
    onDone?.();
    return;
  }

  const from = audio.volume;
  const target = Math.max(0, Math.min(1, to));
  const startTime = Date.now();

  const intervalId = window.setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.max(0, Math.min(1, elapsed / durationMs));
    audio.volume = from + (target - from) * progress;

    if (progress >= 1) {
      clearAudioFade(fadeIntervalByAudio, audio);
      onDone?.();
    }
  }, 16);

  fadeIntervalByAudio.set(audio, intervalId);
};

export const createSoundTemplate = <
  TEvent extends string,
  TMusicTrack extends string = never,
>() => {
  const SoundContext = createContext<
    SoundContextType<TEvent, TMusicTrack> | undefined
  >(undefined);

  const fallbackChannels: AudioChannelState[] = [
    {
      id: MASTER_CHANNEL_ID,
      label: "Master",
      kind: "master",
      enabled: DEFAULT_SOUND_ENABLED,
      volume: DEFAULT_SOUND_VOLUME,
      muted: DEFAULT_SOUND_MUTED,
    },
    {
      id: MUSIC_CHANNEL_ID,
      label: "Music",
      kind: "music",
      enabled: true,
      volume: 80,
      muted: false,
    },
    {
      id: SFX_CHANNEL_ID,
      label: "Sound Effects",
      kind: "sfx",
      enabled: true,
      volume: 100,
      muted: false,
    },
  ];

  const fallbackSoundContextValue: SoundContextType<TEvent, TMusicTrack> = {
    soundEnabled: DEFAULT_SOUND_ENABLED,
    setSoundEnabled: () => undefined,
    volume: DEFAULT_SOUND_VOLUME,
    setVolume: () => undefined,
    muted: DEFAULT_SOUND_MUTED,
    setMuted: () => undefined,

    channels: fallbackChannels,
    getChannels: () => fallbackChannels,
    setChannelEnabled: () => undefined,
    setChannelVolume: () => undefined,
    setChannelMuted: () => undefined,

    playSound: () => undefined,

    playMusic: () => undefined,
    pauseMusic: () => undefined,
    resumeMusic: () => undefined,
    stopMusic: () => undefined,
    getActiveMusicTrack: () => null,
  };

  const useSound = (): SoundContextType<TEvent, TMusicTrack> => {
    const context = useContext(SoundContext);

    if (context === undefined) {
      return fallbackSoundContextValue;
    }

    return context;
  };

  const SoundTemplateProvider = ({
    children,
    featureEnabled,
    eventMap,
    musicMap,
    channels,
    includeDefaultChannels = true,
    storage,
    storageKeyPrefix = DEFAULT_STORAGE_KEY_PREFIX,
    storageKeys,
    defaultEnabled = DEFAULT_SOUND_ENABLED,
    defaultVolume = DEFAULT_SOUND_VOLUME,
    defaultMuted = DEFAULT_SOUND_MUTED,
  }: SoundTemplateProviderProps<TEvent, TMusicTrack>) => {
    const storageRef = useRef<StorageAdapter | null>(resolveStorage(storage));
    const configRef = useRef<{
      channels: ResolvedChannel[];
      masterChannelId: string;
      defaultMusicChannelId: string;
      defaultSfxChannelId: string;
    } | null>(null);

    if (!configRef.current) {
      // TODO: support runtime channel registration/removal without remounting.
      configRef.current = resolveChannels({
        channels,
        includeDefaultChannels,
        storageKeyPrefix,
        legacyMasterStorageKeys: storageKeys,
        defaultEnabled,
        defaultVolume,
        defaultMuted,
      });
    }

    const resolvedChannels = configRef.current.channels;
    const masterChannelId = configRef.current.masterChannelId;
    const defaultMusicChannelId = configRef.current.defaultMusicChannelId;
    const defaultSfxChannelId = configRef.current.defaultSfxChannelId;

    const [channelStateById, setChannelStateById] = useState<
      Record<string, ChannelRuntimeState>
    >(() =>
      resolveInitialChannelState(resolvedChannels, storageRef.current),
    );
    const [activeMusicTrackByChannel, setActiveMusicTrackByChannel] = useState<
      Record<string, TMusicTrack | null>
    >(() => {
      const initial: Record<string, TMusicTrack | null> = {};
      resolvedChannels.forEach((channel) => {
        initial[channel.id] = null;
      });
      return initial;
    });

    const audioContextRef = useRef<AudioContext | null>(null);
    const hasUserInteractedRef = useRef(false);
    const pendingTimeoutsRef = useRef<number[]>([]);
    const clipPlaybackRef = useRef<
      Map<HTMLAudioElement, { channelId: string; baseVolume: number }>
    >(new Map());
    const musicPlaybackRef = useRef<
      Map<
        string,
        { audio: HTMLAudioElement; track: TMusicTrack; baseVolume: number }
      >
    >(new Map());
    const fadeIntervalByAudioRef = useRef<Map<HTMLAudioElement, number>>(
      new Map(),
    );

    const queueTimeout = useCallback((handler: () => void, delayMs: number) => {
      if (typeof window === "undefined") {
        handler();
        return;
      }

      const timeoutId = window.setTimeout(() => {
        pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter(
          (candidate) => candidate !== timeoutId,
        );
        handler();
      }, Math.max(0, delayMs));

      pendingTimeoutsRef.current.push(timeoutId);
    }, []);

    const clearAllTimeouts = useCallback(() => {
      if (typeof window === "undefined") {
        pendingTimeoutsRef.current = [];
        return;
      }

      pendingTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      pendingTimeoutsRef.current = [];
    }, []);

    const getChannelRuntimeState = useCallback(
      (channelId: string): ChannelRuntimeState | null =>
        channelStateById[channelId] ?? null,
      [channelStateById],
    );

    const resolveEffectiveVolumeScalar = useCallback(
      (channelId: string, sourceVolume = 1): number => {
        if (!featureEnabled) {
          return 0;
        }

        const masterChannelState = getChannelRuntimeState(masterChannelId);
        const channelState = getChannelRuntimeState(channelId);

        if (!masterChannelState || !channelState) {
          return 0;
        }

        if (
          !masterChannelState.enabled ||
          masterChannelState.muted ||
          !channelState.enabled ||
          channelState.muted
        ) {
          return 0;
        }

        const masterVolumeScalar = masterChannelState.volume / 100;
        const channelVolumeScalar = channelState.volume / 100;
        const sourceVolumeScalar = Math.max(0, sourceVolume);

        return Math.max(
          0,
          Math.min(1, masterVolumeScalar * channelVolumeScalar * sourceVolumeScalar),
        );
      },
      [featureEnabled, getChannelRuntimeState, masterChannelId],
    );

    const syncHtmlAudioVolume = useCallback(
      (audio: HTMLAudioElement, channelId: string, baseVolume: number) => {
        audio.volume = resolveEffectiveVolumeScalar(channelId, baseVolume);
      },
      [resolveEffectiveVolumeScalar],
    );

    const clearAudioFadeInternal = useCallback((audio: HTMLAudioElement) => {
      clearAudioFade(fadeIntervalByAudioRef.current, audio);
    }, []);

    const runAudioFadeInternal = useCallback(
      (
        audio: HTMLAudioElement,
        targetVolume: number,
        fadeMs: number,
        onDone?: () => void,
      ) => {
        runAudioFade({
          audio,
          to: targetVolume,
          durationMs: fadeMs,
          fadeIntervalByAudio: fadeIntervalByAudioRef.current,
          onDone,
        });
      },
      [],
    );

    const forgetClipAudio = useCallback(
      (audio: HTMLAudioElement) => {
        clearAudioFadeInternal(audio);
        clipPlaybackRef.current.delete(audio);
        audio.onended = null;
        audio.onerror = null;
      },
      [clearAudioFadeInternal],
    );

    const clearMusicPlayback = useCallback(
      (channelId: string, audio: HTMLAudioElement | null = null) => {
        const entry = musicPlaybackRef.current.get(channelId);
        if (!entry) {
          return;
        }

        if (audio && entry.audio !== audio) {
          return;
        }

        clearAudioFadeInternal(entry.audio);
        entry.audio.onended = null;
        entry.audio.onerror = null;
        musicPlaybackRef.current.delete(channelId);
        setActiveMusicTrackByChannel((previous) => ({
          ...previous,
          [channelId]: null,
        }));
      },
      [clearAudioFadeInternal],
    );

    const stopMusicChannel = useCallback(
      (channelId: string, fadeMs = 0) => {
        const entry = musicPlaybackRef.current.get(channelId);
        if (!entry) {
          return;
        }

        const completeStop = () => {
          entry.audio.pause();
          entry.audio.currentTime = 0;
          clearMusicPlayback(channelId, entry.audio);
        };

        if (fadeMs > 0) {
          runAudioFadeInternal(entry.audio, 0, fadeMs, completeStop);
          return;
        }

        completeStop();
      },
      [clearMusicPlayback, runAudioFadeInternal],
    );

    const getAudioContext = useCallback((): AudioContext | null => {
      if (typeof window === "undefined") {
        return null;
      }

      if (audioContextRef.current) {
        return audioContextRef.current;
      }

      const windowWithWebkitAudio = toWindowWithWebkitAudio(window);
      const AudioContextConstructor =
        window.AudioContext ?? windowWithWebkitAudio.webkitAudioContext;

      if (!AudioContextConstructor) {
        return null;
      }

      audioContextRef.current = new AudioContextConstructor();
      return audioContextRef.current;
    }, []);

    const unlockAudio = useCallback(() => {
      hasUserInteractedRef.current = true;
      const context = getAudioContext();

      if (!context || context.state !== "suspended") {
        return;
      }

      void context.resume().catch(() => undefined);
    }, [getAudioContext]);

    useEffect(() => {
      if (typeof window === "undefined") {
        return;
      }

      window.addEventListener("pointerdown", unlockAudio, { passive: true });
      window.addEventListener("keydown", unlockAudio);
      window.addEventListener("touchstart", unlockAudio, { passive: true });

      return () => {
        window.removeEventListener("pointerdown", unlockAudio);
        window.removeEventListener("keydown", unlockAudio);
        window.removeEventListener("touchstart", unlockAudio);
      };
    }, [unlockAudio]);

    useEffect(() => {
      return () => {
        clearAllTimeouts();

        clipPlaybackRef.current.forEach((_, audio) => {
          audio.pause();
          forgetClipAudio(audio);
        });
        clipPlaybackRef.current.clear();

        musicPlaybackRef.current.forEach(({ audio }, channelId) => {
          audio.pause();
          audio.currentTime = 0;
          clearMusicPlayback(channelId, audio);
        });
        musicPlaybackRef.current.clear();

        const context = audioContextRef.current;
        if (!context) {
          return;
        }

        void context.close().catch(() => undefined);
        audioContextRef.current = null;
      };
    }, [clearAllTimeouts, clearMusicPlayback, forgetClipAudio]);

    const scheduleTone = useCallback(
      (tone: ToneDefinition, channelId: string) => {
        const context = getAudioContext();

        if (!context) {
          return;
        }

        if (!hasUserInteractedRef.current && context.state === "suspended") {
          return;
        }

        if (context.state === "suspended") {
          void context.resume().catch(() => undefined);
        }

        const volumeScalar = resolveEffectiveVolumeScalar(channelId, 1);
        if (volumeScalar <= 0) {
          return;
        }

        const oscillatorNode = context.createOscillator();
        const gainNode = context.createGain();

        const delayMs = tone.delayMs ?? 0;
        const attackMs = tone.attackMs ?? DEFAULT_ATTACK_MS;
        const releaseMs = tone.releaseMs ?? DEFAULT_RELEASE_MS;

        const startTime = context.currentTime + delayMs / 1000;
        const attackEndTime = startTime + attackMs / 1000;
        const noteEndTime = attackEndTime + tone.durationMs / 1000;
        const releaseEndTime = noteEndTime + releaseMs / 1000;

        oscillatorNode.type = tone.waveform;
        oscillatorNode.frequency.setValueAtTime(tone.frequency, startTime);

        const scaledGain = tone.gain * volumeScalar;
        gainNode.gain.setValueAtTime(MIN_GAIN, startTime);
        gainNode.gain.linearRampToValueAtTime(scaledGain, attackEndTime);
        gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEndTime);

        oscillatorNode.connect(gainNode);
        gainNode.connect(context.destination);

        oscillatorNode.start(startTime);
        oscillatorNode.stop(releaseEndTime);
      },
      [getAudioContext, resolveEffectiveVolumeScalar],
    );

    const playToneSequence = useCallback(
      (tones: ToneDefinition[], baseDelayMs: number, channelId: string) => {
        tones.forEach((tone) => {
          scheduleTone(
            {
              ...tone,
              delayMs: baseDelayMs + (tone.delayMs ?? 0),
            },
            channelId,
          );
        });
      },
      [scheduleTone],
    );

    const playAudioDefinition = useCallback(
      (
        definition: Extract<SoundDefinition, { type: "audio" }>,
        baseDelayMs: number,
        channelId: string,
      ) => {
        const execute = () => {
          const audio = new Audio(definition.src);
          audio.preload = definition.preload ?? "auto";
          audio.loop = definition.loop ?? false;
          audio.playbackRate = definition.playbackRate ?? 1;

          const baseVolume = definition.volume ?? 1;
          syncHtmlAudioVolume(audio, channelId, baseVolume);
          if (audio.volume <= 0) {
            return;
          }

          clipPlaybackRef.current.set(audio, {
            channelId,
            baseVolume,
          });

          const cleanup = () => {
            forgetClipAudio(audio);
          };

          audio.onended = cleanup;
          audio.onerror = cleanup;
          void audio.play().catch(cleanup);
        };

        if (baseDelayMs <= 0) {
          execute();
          return;
        }

        queueTimeout(execute, baseDelayMs);
      },
      [forgetClipAudio, queueTimeout, syncHtmlAudioVolume],
    );

    const playSound = useCallback(
      (event: TEvent, options: PlaySoundOptions = {}) => {
        if (!featureEnabled) {
          return;
        }

        const rawDefinitions = eventMap[event];
        if (!rawDefinitions) {
          return;
        }

        const definitions = Array.isArray(rawDefinitions)
          ? rawDefinitions
          : [rawDefinitions];
        const baseDelayMs = options.delayMs ?? 0;

        definitions.forEach((definition) => {
          const resolvedChannelId =
            options.channelId ?? definition.channelId ?? defaultSfxChannelId;

          if (definition.type === "tone") {
            playToneSequence(definition.tones, baseDelayMs, resolvedChannelId);
            return;
          }

          playAudioDefinition(definition, baseDelayMs, resolvedChannelId);
        });
      },
      [
        defaultSfxChannelId,
        eventMap,
        featureEnabled,
        playAudioDefinition,
        playToneSequence,
      ],
    );

    const playMusic = useCallback(
      (
        track: TMusicTrack,
        options: {
          channelId?: string;
          restart?: boolean;
          fadeMs?: number;
        } = {},
      ) => {
        if (!musicMap) {
          return;
        }

        const definition = (musicMap as MusicTrackMap<TMusicTrack>)[track];
        if (!definition) {
          return;
        }

        const channelId =
          options.channelId ?? definition.channelId ?? defaultMusicChannelId;

        const existingEntry = musicPlaybackRef.current.get(channelId);
        if (existingEntry) {
          const alreadySameTrack = existingEntry.track === track;
          if (alreadySameTrack && options.restart !== true) {
            const targetVolume = resolveEffectiveVolumeScalar(
              channelId,
              existingEntry.baseVolume,
            );

            if (existingEntry.audio.paused) {
              if ((options.fadeMs ?? 0) > 0) {
                existingEntry.audio.volume = 0;
                void existingEntry.audio.play().catch(() => undefined);
                runAudioFadeInternal(
                  existingEntry.audio,
                  targetVolume,
                  options.fadeMs ?? 0,
                );
                return;
              }

              syncHtmlAudioVolume(
                existingEntry.audio,
                channelId,
                existingEntry.baseVolume,
              );
              void existingEntry.audio.play().catch(() => undefined);
              return;
            }

            syncHtmlAudioVolume(
              existingEntry.audio,
              channelId,
              existingEntry.baseVolume,
            );
            return;
          }

          stopMusicChannel(channelId, 0);
        }

        if (!featureEnabled) {
          return;
        }

        const audio = new Audio(definition.src);
        audio.loop = definition.loop ?? true;
        audio.preload = definition.preload ?? "auto";
        audio.playbackRate = definition.playbackRate ?? 1;

        const baseVolume = definition.volume ?? 1;
        const targetVolume = resolveEffectiveVolumeScalar(channelId, baseVolume);
        audio.volume = (options.fadeMs ?? 0) > 0 ? 0 : targetVolume;

        const cleanup = () => {
          clearMusicPlayback(channelId, audio);
        };

        audio.onended = () => {
          if (!audio.loop) {
            cleanup();
          }
        };
        audio.onerror = cleanup;

        musicPlaybackRef.current.set(channelId, {
          audio,
          track,
          baseVolume,
        });
        setActiveMusicTrackByChannel((previous) => ({
          ...previous,
          [channelId]: track,
        }));

        void audio
          .play()
          .then(() => {
            if ((options.fadeMs ?? 0) > 0) {
              runAudioFadeInternal(
                audio,
                targetVolume,
                options.fadeMs ?? 0,
              );
            }
          })
          .catch(() => {
            cleanup();
          });
      },
      [
        clearMusicPlayback,
        defaultMusicChannelId,
        featureEnabled,
        musicMap,
        resolveEffectiveVolumeScalar,
        runAudioFadeInternal,
        stopMusicChannel,
        syncHtmlAudioVolume,
      ],
    );

    const pauseMusic = useCallback(
      (channelId?: string, fadeMs = 0) => {
        const resolvedChannelId = channelId ?? defaultMusicChannelId;
        const entry = musicPlaybackRef.current.get(resolvedChannelId);
        if (!entry) {
          return;
        }

        if (fadeMs > 0) {
          runAudioFadeInternal(entry.audio, 0, fadeMs, () => {
            entry.audio.pause();
          });
          return;
        }

        entry.audio.pause();
      },
      [defaultMusicChannelId, runAudioFadeInternal],
    );

    const resumeMusic = useCallback(
      (channelId?: string, fadeMs = 0) => {
        const resolvedChannelId = channelId ?? defaultMusicChannelId;
        const entry = musicPlaybackRef.current.get(resolvedChannelId);
        if (!entry) {
          return;
        }

        const targetVolume = resolveEffectiveVolumeScalar(
          resolvedChannelId,
          entry.baseVolume,
        );

        if (fadeMs > 0) {
          entry.audio.volume = 0;
          void entry.audio.play().catch(() => undefined);
          runAudioFadeInternal(entry.audio, targetVolume, fadeMs);
          return;
        }

        syncHtmlAudioVolume(entry.audio, resolvedChannelId, entry.baseVolume);
        void entry.audio.play().catch(() => undefined);
      },
      [
        defaultMusicChannelId,
        resolveEffectiveVolumeScalar,
        runAudioFadeInternal,
        syncHtmlAudioVolume,
      ],
    );

    const stopMusic = useCallback(
      (channelId?: string, fadeMs = 0) => {
        const resolvedChannelId = channelId ?? defaultMusicChannelId;
        stopMusicChannel(resolvedChannelId, fadeMs);
      },
      [defaultMusicChannelId, stopMusicChannel],
    );

    const getActiveMusicTrack = useCallback(
      (channelId?: string): TMusicTrack | null => {
        const resolvedChannelId = channelId ?? defaultMusicChannelId;
        return activeMusicTrackByChannel[resolvedChannelId] ?? null;
      },
      [activeMusicTrackByChannel, defaultMusicChannelId],
    );

    const updateChannelRuntimeState = useCallback(
      (
        channelId: string,
        updater: (previous: ChannelRuntimeState) => ChannelRuntimeState,
      ) => {
        setChannelStateById((previous) => {
          const current = previous[channelId];
          if (!current) {
            return previous;
          }

          const next = updater(current);
          if (
            next.enabled === current.enabled &&
            next.volume === current.volume &&
            next.muted === current.muted
          ) {
            return previous;
          }

          return {
            ...previous,
            [channelId]: next,
          };
        });
      },
      [],
    );

    const setChannelEnabled = useCallback(
      (channelId: string, enabled: boolean) => {
        updateChannelRuntimeState(channelId, (previous) => ({
          ...previous,
          enabled,
        }));
      },
      [updateChannelRuntimeState],
    );

    const setChannelVolume = useCallback(
      (channelId: string, volume: number) => {
        updateChannelRuntimeState(channelId, (previous) => ({
          ...previous,
          volume: clampVolume(volume),
        }));
      },
      [updateChannelRuntimeState],
    );

    const setChannelMuted = useCallback(
      (channelId: string, muted: boolean) => {
        updateChannelRuntimeState(channelId, (previous) => ({
          ...previous,
          muted,
        }));
      },
      [updateChannelRuntimeState],
    );

    useEffect(() => {
      const storageClient = storageRef.current;
      if (!storageClient) {
        return;
      }

      resolvedChannels.forEach((channel) => {
        const state = channelStateById[channel.id];
        if (!state) {
          return;
        }

        try {
          storageClient.setItem(
            channel.storageKeys.enabled,
            JSON.stringify(state.enabled),
          );
          storageClient.setItem(
            channel.storageKeys.volume,
            JSON.stringify(state.volume),
          );
          storageClient.setItem(
            channel.storageKeys.muted,
            JSON.stringify(state.muted),
          );
        } catch {
          // Ignore storage errors (private mode/quota exceeded).
        }
      });
    }, [channelStateById, resolvedChannels]);

    useEffect(() => {
      clipPlaybackRef.current.forEach((metadata, audio) => {
        syncHtmlAudioVolume(audio, metadata.channelId, metadata.baseVolume);
      });

      musicPlaybackRef.current.forEach((entry, channelId) => {
        syncHtmlAudioVolume(entry.audio, channelId, entry.baseVolume);
      });
    }, [channelStateById, featureEnabled, syncHtmlAudioVolume]);

    const channelsState = useMemo<AudioChannelState[]>(
      () =>
        resolvedChannels.map((channel) => {
          const runtimeState = channelStateById[channel.id] ?? {
            enabled: channel.defaultEnabled,
            volume: channel.defaultVolume,
            muted: channel.defaultMuted,
          };

          return {
            id: channel.id,
            label: channel.label,
            kind: channel.kind,
            enabled: runtimeState.enabled,
            volume: runtimeState.volume,
            muted: runtimeState.muted,
          };
        }),
      [channelStateById, resolvedChannels],
    );

    const getChannels = useCallback(() => channelsState, [channelsState]);

    const masterChannelState =
      channelStateById[masterChannelId] ??
      resolveInitialChannelState(resolvedChannels, null)[masterChannelId];

    const contextValue = useMemo<SoundContextType<TEvent, TMusicTrack>>(
      () => ({
        soundEnabled: masterChannelState.enabled,
        setSoundEnabled: (enabled: boolean) => {
          setChannelEnabled(masterChannelId, enabled);
        },
        volume: masterChannelState.volume,
        setVolume: (volume: number) => {
          setChannelVolume(masterChannelId, volume);
        },
        muted: masterChannelState.muted,
        setMuted: (muted: boolean) => {
          setChannelMuted(masterChannelId, muted);
        },

        channels: channelsState,
        getChannels,
        setChannelEnabled,
        setChannelVolume,
        setChannelMuted,

        playSound,

        playMusic,
        pauseMusic,
        resumeMusic,
        stopMusic,
        getActiveMusicTrack,
      }),
      [
        channelsState,
        getActiveMusicTrack,
        getChannels,
        masterChannelId,
        masterChannelState.enabled,
        masterChannelState.muted,
        masterChannelState.volume,
        pauseMusic,
        playMusic,
        playSound,
        resumeMusic,
        setChannelEnabled,
        setChannelMuted,
        setChannelVolume,
        stopMusic,
      ],
    );

    return (
      <SoundContext.Provider value={contextValue}>{children}</SoundContext.Provider>
    );
  };

  return {
    SoundTemplateProvider,
    useSound,
  };
};
