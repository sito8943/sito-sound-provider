export const toWindowWithWebkitAudio = (
  value: Window,
): Window & { webkitAudioContext?: typeof AudioContext } =>
  value as Window & { webkitAudioContext?: typeof AudioContext };

export function getInitialValue<T>(initialValue: T | (() => T)): T {
  if (typeof initialValue === "function") {
    return (initialValue as () => T)();
  }

  return initialValue;
}
