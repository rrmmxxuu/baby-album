interface PanelMessageProps {
  message: string;
}

export function PanelMessage({ message }: PanelMessageProps) {
  return (
    <article className="panel panelStack">
      <p className="helperText">{message}</p>
    </article>
  );
}
