import dotenv from "dotenv";
import { Authenticator } from "remix-auth";
import { GoogleStrategy } from "remix-auth-google";
import { sessionStorage } from "./session.server";

import type { User } from "~/types";

dotenv.config();

export let authenticator = new Authenticator<User>(sessionStorage);

let googleStrategy = new GoogleStrategy(
  {
    callbackURL: "http://localhost:3000/auth/google/callback",
    clientID: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    scope:
      "email openid profile https://www.googleapis.com/auth/photoslibrary.readonly",
  },
  async ({ accessToken, refreshToken, profile }) => {
    return {
      accessToken,
      refreshToken,
      profile,
    };
  }
);

authenticator.use(googleStrategy);
