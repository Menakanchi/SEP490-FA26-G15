"use client";

import React, { useEffect, useState } from "react";
import { PillButton } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";

/**
 * Video xem lại của một run CARLA (mp4 do worker ghép từ ảnh camera). Video cần token nên tải về dạng blob rồi phát; clip ngắn (vài giây,
 * vài MB). Dùng `key={runId}` ở nơi gọi để chuyển run thì trình phát dựng lại từ đầu.
 */
export function CarlaRunVideo({ runId, onError }: { runId: number; onError: (message: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    let objectUrl: string | undefined;
    void vehicsimApi.carlaVideo(runId).then(blob => {
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
        className="w-full rounded-[16px] bg-black">
        <track kind="captions" />
      </video>
      <div>
        <PillButton onClick={() => void vehicsimApi.downloadCarlaVideo(runId).catch(e => onError(e instanceof Error ? e.message : "Không tải được video"))}>
          Tải video (.mp4)
        </PillButton>
      </div>
    </div>
  );
}
