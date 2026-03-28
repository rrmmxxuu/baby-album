interface FloatingAddButtonProps {
  onClick: () => void;
}

export function FloatingAddButton({ onClick }: FloatingAddButtonProps) {
  return <button className="floatingAddButton" onClick={onClick} type="button">+</button>;
}
