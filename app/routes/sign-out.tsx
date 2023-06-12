import type { ActionArgs } from "@remix-run/node";

import { authenticator } from "~/services/auth.server";

/**
 * Signs the user out and redirects them to the index.
 * @param args the {@link ActionArgs}
 * @returns
 */
export const action = async ({ request }: ActionArgs) => {
  await authenticator.logout(request, { redirectTo: "/" });
};
