import { Suspense } from "react";
import { ProjectPage } from "@/components/sites/hawk/project/project-page";

export default function Page() {
  return (
    <Suspense>
      <ProjectPage />
    </Suspense>
  );
}
