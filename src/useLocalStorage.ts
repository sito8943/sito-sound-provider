import { useEffect, useState } from "react";
import type { StorageAdapter } from "./types";
import { getInitialValue } from "./utils";

const resolveStorage = (storage?: StorageAdapter): StorageAdapter | null => {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  storage?: StorageAdapter,
) {
  const [value, setValue] = useState<T>(() => {
    const fallback = getInitialValue(initialValue);
    const storageClient = resolveStorage(storage);

    if (!storageClient) {
      return fallback;
    }

    try {
      const saved = storageClient.getItem(key);
      if (!saved) {
        return fallback;
      }

      return JSON.parse(saved) as T;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    const storageClient = resolveStorage(storage);
    if (!storageClient) {
      return;
    }

    try {
      storageClient.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage errors (private mode/quota exceeded) and keep in-memory state.
    }
  }, [key, storage, value]);

  return [value, setValue] as const;
}

export { useLocalStorage };
