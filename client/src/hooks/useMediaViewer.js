import { useCallback, useState } from "react";

export function useMediaViewer() {
  const [mediaViewer, setMediaViewer] = useState(null);

  const openMediaViewer = useCallback((url, fileName = "") => {
    if (!url) return;
    setMediaViewer({ url, fileName });
  }, []);

  const closeMediaViewer = useCallback(() => setMediaViewer(null), []);

  return { mediaViewer, setMediaViewer, openMediaViewer, closeMediaViewer };
}
