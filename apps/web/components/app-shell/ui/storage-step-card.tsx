interface StorageStepCardProps {
  index: number;
  title: string;
  description: string;
  state?: "active" | "current" | "done";
}

export function StorageStepCard({ index, title, description, state }: StorageStepCardProps) {
  const stateClassName = state === "active"
    ? " storageStepCardActive"
    : state === "current"
      ? " storageStepCardCurrent"
      : state === "done"
        ? " storageStepCardDone"
        : "";

  return (
    <article className={`storageStepCard${stateClassName}`}>
      <span className="storageStepIndex">{index}</span>
      <div className="storageStepBody">
        <strong>{title}</strong>
        <p className="helperText">{description}</p>
      </div>
    </article>
  );
}
