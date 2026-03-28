interface DraftCaptionFieldProps {
  className: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

export function DraftCaptionField({ className, placeholder, value, onChange }: DraftCaptionFieldProps) {
  return <textarea className={className} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />;
}
