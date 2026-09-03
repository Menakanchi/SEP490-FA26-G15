"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export interface BackgroundPreset {
  id: string;
  name: string;
  url: string;
  category: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "city_3d",
    name: "Giao lộ 3D Isometric",
    url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?q=80&w=1600&auto=format&fit=crop",
    category: "3D City",
  },
  {
    id: "night_city",
    name: "Thành phố Đêm Cyber",
    url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1600&auto=format&fit=crop",
    category: "Night",
  },
  {
    id: "highway",
    name: "Đường Cao Tốc Hướng Đông",
    url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=1600&auto=format&fit=crop",
    category: "Highway",
  },
  {
    id: "carla_sim",
    name: "Sân Thử Nghiệm CARLA",
    url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1600&auto=format&fit=crop",
    category: "Simulator",
  },
];

interface BackgroundSettings {
  bgImage: string;
  bgBlur: number; // 0 - 20px
  overlayOpacity: number; // 0.1 - 0.9
  glassBlur: number; // 4 - 32px
}

const DEFAULT_SETTINGS: BackgroundSettings = {
  bgImage: BACKGROUND_PRESETS[0].url,
  bgBlur: 2,
  overlayOpacity: 0.35,
  glassBlur: 16,
};

function getUserStorageKeys(username?: string | null, id?: string | null): string[] {
  const keys: string[] = [];
  if (username) {
    keys.push(`scenario_forge_bg_${username}`);
  }
  if (id && id !== username) {
    keys.push(`scenario_forge_bg_${id}`);
  }
  if (keys.length === 0) {
    keys.push("scenario_forge_bg_guest");
  }
  return keys;
}

interface BackgroundContextType extends BackgroundSettings {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  setBgImage: (url: string) => void;
  setBgBlur: (val: number) => void;
  setOverlayOpacity: (val: number) => void;
  setGlassBlur: (val: number) => void;
  uploadCustomImage: (file: File) => Promise<void>;
  resetBackground: () => void;
}

const BackgroundContext = createContext<BackgroundContextType | undefined>(undefined);

export function BackgroundProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<BackgroundSettings>(DEFAULT_SETTINGS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const userId = user?.id || null;
  const username = user?.username || null;

  // Restore settings when active user changes or mounts
  useEffect(() => {
    // Purge legacy static global keys from previous non-isolated versions
    try {
      localStorage.removeItem("scenario_forge_bg_settings");
      localStorage.removeItem("forge_bg_settings");
    } catch {
      // ignore
    }

    const storageKeys = getUserStorageKeys(username, userId);
    let restoredSettings = DEFAULT_SETTINGS;

    for (const key of storageKeys) {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          restoredSettings = { ...DEFAULT_SETTINGS, ...parsed };
          break;
        } catch {
          // ignore
        }
      }
    }

    queueMicrotask(() => setSettings(restoredSettings));

    // Cross-tab real-time sync listener for current user's storage keys
    const handleStorage = (e: StorageEvent) => {
      if (e.key && storageKeys.includes(e.key) && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch {
          // ignore
        }
      } else if (e.key && storageKeys.includes(e.key) && !e.newValue) {
        setSettings(DEFAULT_SETTINGS);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [username, userId]);

  const saveSettings = useCallback(
    (newSettings: Partial<BackgroundSettings>) => {
      setSettings((prev) => {
        const updated = { ...prev, ...newSettings };
        const serialized = JSON.stringify(updated);
        const storageKeys = getUserStorageKeys(username, userId);

        // Save to user-scoped keys
        for (const key of storageKeys) {
          try {
            localStorage.setItem(key, serialized);
          } catch {
            // ignore quota errors
          }
        }
        return updated;
      });
    },
    [username, userId]
  );

  const setBgImage = useCallback((url: string) => saveSettings({ bgImage: url }), [saveSettings]);
  const setBgBlur = useCallback((val: number) => saveSettings({ bgBlur: val }), [saveSettings]);
  const setOverlayOpacity = useCallback((val: number) => saveSettings({ overlayOpacity: val }), [saveSettings]);
  const setGlassBlur = useCallback((val: number) => saveSettings({ glassBlur: val }), [saveSettings]);

  const uploadCustomImage = useCallback(
    (file: File): Promise<void> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            setBgImage(result);
            resolve();
          } else {
            reject(new Error("Không thể đọc file ảnh"));
          }
        };
        reader.onerror = () => reject(new Error("Lỗi đọc file ảnh"));
        reader.readAsDataURL(file);
      });
    },
    [setBgImage]
  );

  const resetBackground = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    const storageKeys = getUserStorageKeys(username, userId);
    for (const key of storageKeys) {
      localStorage.removeItem(key);
    }
  }, [username, userId]);

  return (
    <BackgroundContext.Provider
      value={{
        ...settings,
        isModalOpen,
        openModal,
        closeModal,
        setBgImage,
        setBgBlur,
        setOverlayOpacity,
        setGlassBlur,
        uploadCustomImage,
        resetBackground,
      }}
    >
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground(): BackgroundContextType {
  const context = useContext(BackgroundContext);
  if (!context) {
    throw new Error("useBackground phải được sử dụng bên trong BackgroundProvider");
  }
  return context;
}
