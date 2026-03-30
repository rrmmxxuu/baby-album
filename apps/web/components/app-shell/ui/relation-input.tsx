import { useEffect, useState } from "react";
import { RELATION_OPTIONS } from "../model/constants";

interface RelationInputProps {
  label: string;
  listId: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

const CUSTOM_RELATION_VALUE = "__custom__";

export function RelationInput({ label, listId, onChange, placeholder, value }: RelationInputProps) {
  const usesPresetOption = RELATION_OPTIONS.includes(value);
  const [customMode, setCustomMode] = useState(() => value !== "" && !usesPresetOption);

  useEffect(() => {
    if (usesPresetOption) {
      setCustomMode(false);
      return;
    }
    if (value !== "") {
      setCustomMode(true);
    }
  }, [usesPresetOption, value]);

  const selectValue = customMode ? CUSTOM_RELATION_VALUE : value;

  return (
    <div className="relationInputField">
      <label className="relationInputLabel">
        {label}
        <div className="relationInputSelectWrap">
          <select
            className="relationInputSelect"
            id={listId}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === "") {
                setCustomMode(false);
                onChange("");
                return;
              }
              if (nextValue === CUSTOM_RELATION_VALUE) {
                setCustomMode(true);
                if (usesPresetOption) {
                  onChange("");
                }
                return;
              }
              setCustomMode(false);
              onChange(nextValue);
            }}
            value={selectValue}
          >
            <option value="">请选择关系</option>
            {RELATION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value={CUSTOM_RELATION_VALUE}>自定义输入</option>
          </select>
          <span aria-hidden="true" className="relationInputChevron">›</span>
        </div>
      </label>
      {selectValue === CUSTOM_RELATION_VALUE ? (
        <label className="relationInputCustomLabel">
          自定义称呼
          <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
        </label>
      ) : null}
    </div>
  );
}
