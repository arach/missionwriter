import { Suspense } from "react";
import RunsViewer from "./runs-viewer";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RunsViewer />
    </Suspense>
  );
}
