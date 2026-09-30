/** Read the same timing tokens used by CSS, including scoped motion overrides. */
export function motionSettings(element: Element) {
  const style = getComputedStyle(element);
  const milliseconds = (name: string) => {
    const value = style.getPropertyValue(name).trim();
    return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
  };
  return {
    feedback: milliseconds("--motion-press"),
    entrance: milliseconds("--motion-enter"),
    panel: milliseconds("--motion-panel"),
    stagger: milliseconds("--motion-stagger"),
    easing: style.getPropertyValue("--motion-ease").trim(),
  };
}
