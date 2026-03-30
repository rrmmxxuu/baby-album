interface DateFieldProps {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

export function DateField({ disabled, label, onChange, value }: DateFieldProps) {
  const displayValue = value || "请选择日期";
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
          type="date"
          value={value}
        />
      </span>
    </label>
  );
}
