import { RELATION_OPTIONS } from "../model/constants";

interface RelationInputProps {
  label: string;
  listId: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

export function RelationInput({ label, listId, onChange, placeholder, value }: RelationInputProps) {
  return (
    <label>
      {label}
      <input list={listId} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
      <datalist id={listId}>
        {RELATION_OPTIONS.map((item) => <option key={item} value={item} />)}
      </datalist>
    </label>
  );
}
