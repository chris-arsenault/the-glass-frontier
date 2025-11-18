export const toSnakeCase = (str: string): string => {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
};