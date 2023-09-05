import axios, { AxiosError } from "axios";
import { typedjson } from "remix-typedjson";
import type { LoaderArgs } from "@remix-run/node";
import { z } from "zod";

import type { GooglePhotosAlbum } from "~/types";
import { authenticator } from "~/services/auth.server";

export const albumsSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
  })
);

/**
 * Docs: https://developers.google.com/photos/library/reference/rest/v1/albums/list
 * @param googleAccessToken the Google Photos access token
 * @returns All albums from Google Photos
 */
export const loader = async ({ request }: LoaderArgs) => {
  // get the user data or redirect to / if it failed
  const user = await authenticator.isAuthenticated(request, {
    failureRedirect: "/",
  });

  const { accessToken } = user;

  try {
    const response = await axios({
      url: `https://photoslibrary.googleapis.com/v1/albums`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const albums = (response?.data?.albums ?? []).reduce(
      (
        acc: GooglePhotosAlbum[],
        curr: Record<string, unknown>
      ): GooglePhotosAlbum[] => {
        if (typeof curr?.id === "string" && typeof curr?.title === "string") {
          acc.push({ id: curr.id, title: curr.title });
        }

        return acc;
      },
      [] as GooglePhotosAlbum[]
    );

    const validatedAlbums = albumsSchema.safeParse(albums);

    if (!validatedAlbums.success) {
      return typedjson(
        {
          message: "Failed to validate albums from Google Photos",
        },
        { status: 500 }
      );
    }

    return typedjson(validatedAlbums.data);
  } catch (e) {
    if (e instanceof AxiosError) {
      return typedjson(
        {
          message: e.message,
        },
        {
          status: e.message.includes("401") ? 401 : 500,
        }
      );
    }

    return typedjson(
      {
        message: "Failed to get albums from Google Photos",
      },
      { status: 500 }
    );
  }
};
