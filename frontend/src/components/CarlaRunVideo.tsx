"use client";

import React, { useEffect, useState } from "react";
import { PillButton } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";

/**
 * Video trên object storage phát bằng URL ngắn hạn sau khi backend kiểm tra quyền; video local cũ dùng blob có token.
 */
export function CarlaRunVideo({ runId, onError }: { runId: number; onError: (message: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    let objectUrl: string | undefined;
    void vehicsimApi.carlaVideoUrl(runId).then(async result => {
      if (result.url) {
        if (current) setUrl(result.url);
        return;
      }
      const blob = await vehicsimApi.carlaVideo(runId);
      if (!current) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(e => {
      if (!current) return;
      setFailed(true);
      onError(e instanceof Error ? e.message : "Không tải được video");
    });
    return () => { current = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [runId, onError]);

  if (failed) return <p className="text-[12px] text-vehicsim-muted">Không tải được video của lượt này. Vẫn xem được ảnh từng khung bên dưới.</p>;
  if (!url) return <p className="text-[12px] text-vehicsim-muted">Đang tải video…</p>;
  return (
    <div className="flex flex-col gap-2">
      {/* Clip camera CARLA không có lời thoại nên không có phụ đề; số đo đi kèm nằm ở các thẻ phía trên. */}
      <video src={url} controls playsInline preload="metadata" aria-label={`Video camera CARLA lượt ${runId}`}
        onError={() => { setFailed(true); onError("Không phát được video; hãy mở lại để thử lần nữa."); }}
        className="w-full rounded-[16px] bg-black">
        <track kind="captions" />
      </video>
      <div>
        <PillButton onClick={() => void vehicsimApi.carlaVideoUrl(runId, true).then(result => {
          if (!result.url) return vehicsimApi.downloadCarlaVideo(runId);
          const link = document.createElement("a");
          link.href = result.url;
          link.click();
        }).catch(e => onError(e instanceof Error ? e.message : "Không tải được video"))}>
          Tải video (.mp4)
        </PillButton>
      </div>
    </div>
  );
}
