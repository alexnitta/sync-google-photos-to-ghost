import { typedjson } from "remix-typedjson";

/**
 * Get an environment variable from process.env, or throw a {@link typedjson} if it is not defined.
 * @param key the key of the environment variable
 * @returns the environment variable, if it is defined
 */
export const getEnvVar = (key: string): string => {
  const envVar: string | null = process.env?.[key] ?? null;

  if (envVar === null) {
    throw typedjson(
      { message: `${key} is not defined in process.env` },
      { status: 500 }
    );
  }
  return envVar;
};
