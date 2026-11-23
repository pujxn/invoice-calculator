import { useRef, useState } from 'react';

// Lets pictures be dragged from the computer onto an area of the page. Spread `dropProps` on the
// element; `over` is true while something is being dragged above it. `onFiles(files)` gets the
// dropped files. Does nothing on a touch screen, where there is nothing to drag.
export default function useDropZone(onFiles) {
  const [over, setOver] = useState(false);
  const depth = useRef(0); // dragenter/dragleave also fire for children, so count them

  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const dropProps = {
    onDragEnter(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver(e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); // required, or the browser refuses the drop
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave(e) {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) onFiles(files);
    },
  };
  return { over, dropProps };
}
