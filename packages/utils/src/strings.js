export const toSnakeCase = (str) => {
    return str
        .replace(/[^a-zA-Z0-9]/g, " ") // break words on punctuation/space
        .trim()
        .replace(/\s+/g, " ") // normalize spaces
        .split(" ")
        .map((word) => word.replace(/(?<!^)([A-Z])/g, "_$1") // underscore only if not first char
    )
        .join("_")
        .toLowerCase();
};
