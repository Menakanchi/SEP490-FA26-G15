"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Upload,
  Sliders,
  RotateCcw,
  Check,
  Sparkles,
} from "lucide-react";
import { useBackground, BACKGROUND_PRESETS } from "@/context/BackgroundContext";
import { BackgroundCropModal } from "@/components/BackgroundCropModal";

interface BackgroundSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function BackgroundSettingsModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
}: BackgroundSettingsModalProps = {}) {
  const {
    bgImage,
    bgBlur,
    overlayOpacity,
    glassBlur,
    isModalOpen,
    closeModal,
    setBgImage,
    setBgBlur,
    setOverlayOpacity,
    setGlassBlur,
    resetBackground,
  } = useBackground();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedBgForCrop, setSelectedBgForCrop] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeIsOpen = propIsOpen ?? isModalOpen;
  const activeOnClose = propOnClose ?? closeModal;

  if (!activeIsOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Vui lòng chọn file hình ảnh (.jpg, .png, .webp)");
      return;
    }

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setSelectedBgForCrop(result);
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in font-sans">
      <div className="relative w-full max-w-xl bg-white/80 dark:bg-slate-900/85 backdrop-blur-2xl border border-white/50 dark:border-slate-800/70 rounded-[32px] p-6 sm:p-7 shadow-2xl space-y-5 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center border border-blue-200/50 dark:border-cyan-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                BACKGROUND SETTINGS
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tùy chỉnh hình nền & hiệu ứng Glassmorphism hệ thống
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={activeOnClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Section 1: Presets Selection Grid */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            1. Chọn hình nền mẫu (Presets)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {BACKGROUND_PRESETS.map((preset) => {
              const isActive = bgImage === preset.url;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setBgImage(preset.url);
                  }}
                  className={`group relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer text-left h-24 ${
                    isActive
                      ? "border-blue-600 dark:border-cyan-400 ring-2 ring-blue-500/30 shadow-lg"
                      : "border-slate-200/80 dark:border-slate-700/80 hover:border-blue-400 opacity-80 hover:opacity-100"
                  }`}
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundImage: `url(${preset.url})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2">
                    <span className="text-[10px] font-mono uppercase text-cyan-300 block font-bold">
                      {preset.category}
                    </span>
                    <span className="text-xs font-bold text-white line-clamp-1">
                      {preset.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Upload File */}
        <div className="space-y-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            2. Tải ảnh từ máy tính
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition cursor-pointer shrink-0 border border-blue-500/30"
            >
              <Upload className="w-4 h-4" />
              <span>Tải ảnh từ máy (.png, .jpg, .webp)</span>
            </button>
          </div>
        </div>

        {/* Section 3: Sliders (Blur & Opacity) */}
        <div className="space-y-3.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            3. Tùy chỉnh hiệu ứng hiển thị (Effects)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
            {/* Background Blur Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Độ mờ Hình nền (Background Blur)</span>
                <span className="font-mono text-blue-600 dark:text-cyan-400">{bgBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={bgBlur}
                onChange={(e) => setBgBlur(Number(e.target.value))}
                className="w-full accent-blue-600 dark:accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Overlay Darkening Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Độ tối Lớp phủ (Overlay Darkening)</span>
                <span className="font-mono text-blue-600 dark:text-cyan-400">{Math.round(overlayOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.85}
                step={0.05}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-full accent-blue-600 dark:accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Glass Frosted Blur Slider */}
            <div className="space-y-1.5 sm:col-span-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/40">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Mức độ mờ Kính Frosted Glass (Glassmorphism Blur)</span>
                <span className="font-mono text-blue-600 dark:text-cyan-400">{glassBlur}px</span>
              </div>
              <input
                type="range"
                min={4}
                max={32}
                step={2}
                value={glassBlur}
                onChange={(e) => setGlassBlur(Number(e.target.value))}
                className="w-full accent-blue-600 dark:accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200/60 dark:border-slate-800/80">
          <button
            type="button"
            onClick={resetBackground}
            className="px-4 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt về Mặc định</span>
          </button>

          <button
            type="button"
            onClick={activeOnClose}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-2xl shadow-md shadow-blue-600/20 transition cursor-pointer"
          >
            Hoàn tất
          </button>
        </div>
      </div>

      {/* Background Crop Modal */}
      <BackgroundCropModal
        isOpen={isCropModalOpen}
        imageSrc={selectedBgForCrop}
        onClose={() => {
          setIsCropModalOpen(false);
          setSelectedBgForCrop(null);
        }}
        onCropConfirm={(croppedDataUrl) => {
          setBgImage(croppedDataUrl);
        }}
      />
    </div>
  );
}
