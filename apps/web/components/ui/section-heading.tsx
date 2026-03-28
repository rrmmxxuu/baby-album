import type { ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
}

export function SectionHeading({ eyebrow, title, aside }: SectionHeadingProps) {
  return (
    <div className="sectionHeading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}
