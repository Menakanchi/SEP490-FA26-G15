"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Loader2 } from "lucide-react";
import { Card, CardTitle, Tag } from "@/components/VehicSimUi";
import { vehicleModel } from "@/components/vehicleModels";

type ModelViewerProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string;
  alt?: string;
  "camera-controls"?: boolean;
  "auto-rotate"?: boolean;
  "shadow-intensity"?: string;
  exposure?: string;
  "interaction-prompt"?: string;
  loading?: "auto" | "lazy" | "eager";
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- khai báo thẻ <model-viewer> cho JSX
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerProps;
    }
  }
}

type LoadState = "loading" | "ready" | "error";

/** Khung xem model 3D của một mẫu xe (kéo để xoay, cuộn để phóng to). Xe chưa có model thì hiện ô trống kèm lý do. */
export function VehicleModelViewer({ blueprintId, name }: { blueprintId: string; name: string }) {
  const model = vehicleModel(blueprintId);
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [progress, setProgress] = useState(0);
  const [libReady, setLibReady] = useState(false);

  // <model-viewer> dùng API trình duyệt: chỉ nạp ở client, sau khi trang đã mount.
  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    import("@google/model-viewer")
      .then(() => !cancelled && setLibReady(true))
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [model]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !libReady) return;
    const onLoad = () => setState("ready");
    const onError = () => setState("error");
    const onProgress = (e: Event) => setProgress(Math.round(((e as CustomEvent<{ totalProgress: number }>).detail?.totalProgress ?? 0) * 100));
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    el.addEventListener("progress", onProgress);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
      el.removeEventListener("progress", onProgress);
    };
  }, [libReady]);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <CardTitle aside={<Tag tone="neutral">minh họa</Tag>}>Model 3D</CardTitle>
      {!model ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-vehicsim-line-strong bg-vehicsim-soft text-center">
          <Box aria-hidden className="size-7 text-vehicsim-faint" />
          <p className="text-[14px] font-semibold text-vehicsim-ink">Chưa có model 3D cho {name}</p>
          <p className="max-w-[46ch] text-[12.5px] text-vehicsim-muted">
            Mesh của CARLA nằm trong gói Unreal nên không hiển thị trực tiếp được; cần bổ sung file .glb cho mẫu xe này.
          </p>
        </div>
      ) : (
        <>
          <div className="relative h-[clamp(260px,42vh,460px)] overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-gradient-to-b from-slate-100 to-slate-200">
            {libReady && state !== "error" && (
              <model-viewer
                ref={ref}
                src={model.src}
                alt={`Model 3D ${name}`}
                camera-controls
                auto-rotate
                interaction-prompt="none"
                shadow-intensity="1"
                exposure="1"
                loading="eager"
                style={{ width: "100%", height: "100%", background: "transparent" }}
              />
            )}
            {state === "loading" && (
              <div role="status" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px] text-vehicsim-muted">
                <Loader2 aria-hidden className="size-6 motion-safe:animate-spin" />
                Đang tải model{progress > 0 ? ` ${progress}%` : "…"}
              </div>
            )}
            {state === "error" && (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="text-[14px] font-semibold text-vehicsim-ink">Không tải được model 3D</p>
                <p className="text-[12.5px] text-vehicsim-muted">Kiểm tra file {model.src} có tồn tại và đúng định dạng .glb.</p>
              </div>
            )}
          </div>
          {/* CC BY yêu cầu ghi rõ đã chỉnh sửa: ghi ở tooltip để dòng nguồn gọn. */}
          <p className="text-[12px] text-vehicsim-muted" title="Đã giảm lưới và nén texture để hiển thị trên web">
            Nguồn:{" "}
            <a href={model.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-vehicsim-ink underline">
              {model.title}
            </a>{" "}
            — {model.author},{" "}
            <a href={model.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {model.license}
            </a>
          </p>
        </>
      )}
    </Card>
  );
}
