export const validateInput = (input: string, fieldName: string): string | null => {
  if (!input.trim()) {
    return `${fieldName} cannot be empty`;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
    return `${fieldName} contains invalid characters. Use only letters, numbers, underscores, and hyphens`;
  }

  return null;
};