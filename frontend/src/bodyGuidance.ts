// Per-body-system self-exam guidance. Not shown in the UI right now (System
// Assessment panel was removed) but kept here so it can be reused, e.g. as an
// overlay on the Bio-Twin when a body part is clicked.
export const getGuidanceText = (part: string): string => {
  if (part.includes("Neuro-Ocular")) {
    return "Exam: Detect Spaceflight-Associated Neuro-ocular Syndrome (SANS).\nAction: Place ultrasound probe vertically over closed eyelid. Angle 15° laterally.";
  }
  if (part.includes("Cardiopulmonary")) {
    return "Exam: Detect hypoxia from microgravity fluid shifts.\nAction: Secure pulse oximeter to left index finger. Use digital stethoscope.";
  }
  return "Exam: Detect bone resorption and muscle atrophy.\nAction: Log weekly ARED resistive loading metrics.";
};
