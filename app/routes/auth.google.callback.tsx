import type { LoaderArgs } from "@remix-run/node";
import { authenticator } from "~/services/auth.server";

export let loader = ({ context, request }: LoaderArgs) => {
  return authenticator.authenticate("google", request, {
    successRedirect: "/dashboard",
    failureRedirect: "/",
    context,
  });
};
