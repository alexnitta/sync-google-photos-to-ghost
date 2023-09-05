import type { ActionArgs, LoaderArgs } from "@remix-run/node";

import { authenticator } from "~/services/auth.server";

/**
 * Signs the user out and redirects them to the index.
 * @param args the {@link ActionArgs}
 * @returns
 */
export const action = async ({ request }: ActionArgs) => {
  await authenticator.logout(request, { redirectTo: "/" });
};

/**
 * Signs the user out and redirects them to the index.
 * @param args the {@link ActionArgs}
 * @returns
 */
export const loader = async ({ request }: LoaderArgs) => {
  await authenticator.logout(request, { redirectTo: "/" });
};
