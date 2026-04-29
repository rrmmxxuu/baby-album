import type { RefObject } from "react";

interface HiddenFileInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: File[]) => void;
}

export function HiddenFileInput({ inputRef, onFilesSelected }: HiddenFileInputProps) {
  return (
    <input
      hidden
      accept="image/*,image/heic,image/heif,.heic,.heif,video/*"
      multiple
      onChange={(event) => {
        onFilesSelected(Array.from(event.target.files ?? []));
        event.currentTarget.value = "";
      }}
      ref={inputRef}
      type="file"
    />
  );
}
