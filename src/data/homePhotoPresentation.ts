/** Presentation only: keys are existing image filenames, never portfolio records. */
export const heroFocalPoints: Record<string, string> = {
  'b0c1ca7e-aebd-4410-8533-d0688ba55cef.webp': '50% 38%',
  'af0451f8-f206-4d2f-905a-27278e877b96.webp': '50% 32%',
  '66463a14-bb51-44d0-90c4-be169155ad9e.webp': '50% 35%',
  '84b4ee3a-850a-4b6c-bc19-ed427617731a.webp': '50% 35%',
  'a197a777-252f-4768-8676-5b309771d378.webp': '50% 35%',
};
export function heroFocalPoint(source: string) {
  return heroFocalPoints[source.split('/').at(-1) ?? ''] ?? '50% 38%';
}
