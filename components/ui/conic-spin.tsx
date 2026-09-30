import styles from "./conic-spin.module.css";

export function ConicSpin({ className }: { className?: string }) {
  return (
    <div
      data-slot="conic-spin"
      aria-hidden="true"
      dir="rtl"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${styles.layer}${className ? ` ${className}` : ""}`}
    >
      <div className={`blur-3xl ${styles.circle}`} />
    </div>
  );
}
