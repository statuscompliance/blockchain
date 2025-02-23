export const _temporary_filename = '_TMP_';

/**
 * Stringify an object with 2 spaces indentation
 * @returns - A pretty-printed string representation of the object
 */
export function stringify(object: unknown): string {
  return JSON.stringify(object, undefined, 2);
}
