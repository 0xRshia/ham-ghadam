import type { ReactNode } from "react";

type ButtonLabelProps = {
  busy: boolean;
  pending: ReactNode;
  children: ReactNode;
  state?: never;
  states?: never;
} | {
  state: string;
  states: Record<string, ReactNode>;
  busy?: never;
  pending?: never;
  children?: never;
};

/** Text and decorative icons only; mounted layers reserve the largest state's size. */
export function ButtonLabel(props: ButtonLabelProps) {
  const state = props.states ? props.state : props.busy ? "pending" : "idle";
  const states = props.states ?? { idle: props.children, pending: props.pending };
  return (
    <span className="button-label">
      {Object.entries(states).map(([key, content]) => (
        <span key={key} aria-hidden={key !== state}>{content}</span>
      ))}
    </span>
  );
}
