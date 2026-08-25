"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Point, Area } from "react-easy-crop";
import {
  X,
  Check,
  RotateCw,
  ZoomIn,
  RotateCcw,
  Loader2,
  Crop as CropIcon,
} from "lucide-react";

interface AvatarCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropConfirm: (croppedImageBase64: string) => void;
}

export function AvatarCropModal({
  isOpen,
  imageSrc,
  onClose,
  onCropConfirm,
}: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropCompleteHandler = useCallback(
    (_croppedArea: Area, croppedAreaPixelsParam: Area) => {
      setCroppedAreaPixels(croppedAreaPixelsParam);
    },
    [],
  );

  if (!isOpen || !imageSrc) return null;

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const croppedBase64 = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
      );
      onCropConfirm(croppedBase64);
      onClose();
    } catch (err) {
      console.error("Lỗi khi cắt ảnh avatar:", err);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in font-sans">
      <div className="relative w-full max-w-lg bg-white/85 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/50 dark:border-slate-800/70 rounded-[32px] p-6 sm:p-7 shadow-2xl space-y-5 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <CropIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                CẮT & CHỈNH SỬA AVATAR
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kéo di chuyển, phóng to/thu nhỏ và xoay để căn vị trí ảnh đại diện
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cropper Workspace Canvas Container */}
        <div className="relative w-full h-72 rounded-2xl overflow-hidden bg-slate-950/90 border border-slate-700/60 shadow-inner">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
          />
        </div>

        {/* Sliders: Zoom & Rotation Controls */}
        <div className="space-y-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
          {/* Zoom Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <ZoomIn className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                <span>Thu phóng (Zoom)</span>
              </span>
              <span className="font-mono text-blue-600 dark:text-cyan-400">
                {zoom.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-cyan-400"
            />
          </div>

          {/* Rotation Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <RotateCw className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Góc xoay (Rotate)</span>
              </span>
              <span className="font-mono text-purple-600 dark:text-purple-400">
                {rotation}°
              </span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600 dark:accent-purple-400"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-xs font-extrabold transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={processing}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{processing ? "Đang xử lý..." : "Xác nhận / Cắt ảnh"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML5 Canvas Cropping Helper Function (Exports 256x256 Base64 DataURL)
// ---------------------------------------------------------------------------

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Không thể tạo 2d context trên HTML5 Canvas");
  }

  const rotRad = (rotation * Math.PI) / 180;

  // Calculate bounding box dimensions of the rotated image
  const bBoxWidth =
    Math.abs(Math.cos(rotRad) * image.width) +
    Math.abs(Math.sin(rotRad) * image.height);
  const bBoxHeight =
    Math.abs(Math.sin(rotRad) * image.width) +
    Math.abs(Math.cos(rotRad) * image.height);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  ctx.drawImage(image, 0, 0);

  // Create destination 256x256 canvas for optimized Avatar size
  const destCanvas = document.createElement("canvas");
  destCanvas.width = 256;
  destCanvas.height = 256;
  const destCtx = destCanvas.getContext("2d");

  if (!destCtx) {
    throw new Error("Không thể khởi tạo destination canvas context");
  }

  destCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    256,
    256,
  );

  return destCanvas.toDataURL("image/png", 0.92);
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}
