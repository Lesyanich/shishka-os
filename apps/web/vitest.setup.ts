// Vitest setup — registers @testing-library/jest-dom matchers (toBeInTheDocument,
// toBeDisabled, …) and augments expect's types. Kept at the app root (not under
// src/) so it isn't subject to the AI-TDD test-pair gate.
import '@testing-library/jest-dom/vitest'
