# sito-sound-provider

Plantilla de audio para React con soporte de:

- Canales (`master`, `music`, `sfx` + canales custom)
- Sonidos sintéticos (WebAudio: osciladores)
- Sonidos por archivo (`Audio`)
- Música por track con `play/pause/resume/stop` y `fade`
- Persistencia por canal (`enabled`, `volume`, `muted`) con keys autogeneradas u override
- Introspección reactiva para UI (`channels`, `getChannels`)

## Scripts

- `npm run lint`: Ejecuta ESLint.
- `npm run prettier`: Verifica formato con Prettier.
- `npm run prettier:write`: Aplica formato con Prettier.
- `npm run build`: Compila TypeScript a `dist/`.
- `npm run test`: Ejecuta tests con Vitest.
- `npm run lint-staged`: Ejecuta tareas de `lint-staged`.

## Uso rápido

```tsx
import {
  createSoundTemplate,
  type AudioChannelDefinition,
  type MusicTrackMap,
  type SoundEventMap,
} from "sito-sound-provider";

type GameSoundEvent = "letter_put" | "letter_delete" | "round_win";
type GameMusicTrack = "menu" | "match";

const channels: AudioChannelDefinition[] = [
  {
    id: "master",
    label: "Master",
    kind: "master",
  },
  {
    id: "music",
    label: "Music",
    kind: "music",
    defaultVolume: 70,
  },
  {
    id: "sfx",
    label: "Sound Effects",
    kind: "sfx",
  },
];

const eventMap: SoundEventMap<GameSoundEvent> = {
  letter_put: {
    type: "tone",
    channelId: "sfx",
    tones: [
      { frequency: 720, durationMs: 28, gain: 0.03, waveform: "triangle" },
    ],
  },
  letter_delete: {
    type: "tone",
    channelId: "sfx",
    tones: [
      { frequency: 260, durationMs: 36, gain: 0.03, waveform: "square" },
    ],
  },
  round_win: {
    type: "audio",
    channelId: "sfx",
    src: "/audio/win.mp3",
    volume: 0.8,
  },
};

const musicMap: MusicTrackMap<GameMusicTrack> = {
  menu: {
    src: "/music/menu.mp3",
    channelId: "music",
    loop: true,
    volume: 0.5,
  },
  match: {
    src: "/music/match.mp3",
    channelId: "music",
    loop: true,
    volume: 0.6,
  },
};

const { SoundTemplateProvider, useSound } =
  createSoundTemplate<GameSoundEvent, GameMusicTrack>();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SoundTemplateProvider
      featureEnabled={true}
      channels={channels}
      eventMap={eventMap}
      musicMap={musicMap}
      storageKeyPrefix="wordle"
      storageKeys={{
        soundEnabled: "wordle:sound-enabled",
        soundVolume: "wordle:sound-volume",
        soundMuted: "wordle:sound-muted",
      }}
    >
      {children}
    </SoundTemplateProvider>
  );
}

function VolumeDialog() {
  const {
    channels,
    setChannelMuted,
    setChannelVolume,
    playMusic,
    stopMusic,
  } = useSound();

  return (
    <div>
      {channels.map((channel) => (
        <div key={channel.id}>
          <strong>{channel.label}</strong>
          <button onClick={() => setChannelMuted(channel.id, !channel.muted)}>
            {channel.muted ? "Unmute" : "Mute"}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={channel.volume}
            onChange={(event) =>
              setChannelVolume(channel.id, Number(event.target.value))
            }
          />
        </div>
      ))}

      <button onClick={() => playMusic("menu", { fadeMs: 400 })}>
        Play Menu Music
      </button>
      <button onClick={() => stopMusic("music", 300)}>Stop Music</button>
    </div>
  );
}
```

## Notas

- Si no defines `channels`, el template crea `master`, `music` y `sfx`.
- Las keys de storage se autogeneran con `storageKeyPrefix`.
- Puedes sobreescribir keys por canal con `channel.storageKeys`.
- `soundEnabled`, `volume` y `muted` siguen disponibles como alias del canal `master`.
- TODO pendiente: registro dinámico de canales en runtime sin remount.
