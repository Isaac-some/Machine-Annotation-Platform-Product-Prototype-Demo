import { Suspense } from "react";
import { StageMapPage } from "@/components/sites/hawk/stagemap/stage-map-page";

export default function Page() {
  return (
    <Suspense>
      <StageMapPage />
    </Suspense>
  );
}
