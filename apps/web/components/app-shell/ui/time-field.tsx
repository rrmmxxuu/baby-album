interface TimeFieldProps {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

export function TimeField({ disabled, label, onChange, value }: TimeFieldProps) {
  const displayValue = value || "请选择时间";
  const surfaceClassName = `dateFieldSurface${value ? "" : " dateFieldSurfacePlaceholder"}${disabled ? " dateFieldSurfaceDisabled" : ""}`;

  return (
    <label className="dateFieldLabel">
      {label}
      <span className={surfaceClassName}>
        <span className="dateFieldValue">{displayValue}</span>
        <span aria-hidden="true" className="dateFieldChevron">›</span>
        <input
          className="dateFieldNativeInput"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          step={60}
          type="time"
          value={value}
        />
      </span>
    </label>
  );
}
