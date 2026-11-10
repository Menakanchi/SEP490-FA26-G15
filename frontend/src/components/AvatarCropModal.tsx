"use client";

import { useState } from "react";
import Cropper, { type Point, type Area } from "react-easy-crop";
import { Modal } from "@/components/project/ProjectUi";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";

export function AvatarCropModal({ imageSrc, onClose, onCropConfirm }: {
  imageSrc: string;
  onClose: () => void;
  onCropConfirm: (cropped: string) => void;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCrop() {
    if (!area) return;
    setProcessing(true);
    setError(null);
    try {
      onCropConfirm(await getCroppedImg(imageSrc, area, rotation));
      onClose();
    } catch {
      setError("Không cắt được ảnh. Hãy thử căn lại ảnh hoặc chọn tệp khác.");
      setProcessing(false);
    }
  }

  return (
    <Modal title="Cắt ảnh đại diện" onClose={onClose} busy={processing}>
      <p className="text-sm text-vehicsim-muted">Căn ảnh trong khung tròn trước khi lưu.</p>
      <div className="relative h-[min(40dvh,16rem)] shrink-0 overflow-hidden rounded-lg bg-vehicsim-ink">
        <Cropper image={imageSrc} crop={crop} zoom={zoom} rotation={rotation}
          aspect={1} cropShape="round" showGrid={false}
          onCropChange={setCrop} onCropComplete={(_, pixels) => setArea(pixels)}
          onZoomChange={setZoom} onRotationChange={setRotation}
        />
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="flex justify-between gap-3"><span>Thu phóng</span><span className="tabular-nums text-vehicsim-muted">{zoom.toFixed(1)}×</span></span>
        <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-vehicsim-primary" />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="flex justify-between gap-3"><span>Góc xoay</span><span className="tabular-nums text-vehicsim-muted">{rotation}°</span></span>
        <input type="range" min={-180} max={180} step={1} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="w-full accent-vehicsim-primary" />
      </label>
      <ErrorNote message={error} />
      <div className="flex flex-wrap justify-between gap-2 border-t border-vehicsim-line pt-4">
        <PillButton disabled={processing} onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); }}>Đặt lại</PillButton>
        <div className="flex flex-wrap gap-2">
          <PillButton disabled={processing} onClick={onClose}>Hủy</PillButton>
          <PillButton variant="dark" disabled={processing || !area} onClick={confirmCrop}>{processing ? "Đang cắt…" : "Dùng ảnh này"}</PillButton>
        </div>
      </div>
    </Modal>
  );
}


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
