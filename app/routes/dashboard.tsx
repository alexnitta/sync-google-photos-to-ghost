import { Form, useNavigation } from "@remix-run/react";
import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import axios, { AxiosError } from "axios";
import {
  typedjson,
  useTypedActionData,
  useTypedLoaderData,
  redirect,
} from "remix-typedjson";
import CSVDownloader from "react-csv-downloader";
import { z } from "zod";

import { authenticator } from "~/services/auth.server";
import { uploadToGhost, addMediaItems, createBlogPosts } from "~/utils";
import type {
  GooglePhotosAlbum,
  CreatePostDetail,
  PartialCreatePostDetail,
} from "~/types";
import { PostTitle } from "~/components";

export const albumsSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
  })
);

/**
 * Docs: https://developers.google.com/photos/library/reference/rest/v1/albums/list
 * @param args {@link LoaderArgs}
 * @returns All albums from Google Photos
 */
export const loader = async ({ request }: LoaderArgs) => {
  const user = await authenticator.isAuthenticated(request, {
    failureRedirect: "/sign-out",
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
    if (e instanceof AxiosError && e.message.includes("401")) {
      return redirect("/sign-out");
    }

    return typedjson(
      {
        message: "Failed to get albums from Google Photos",
      },
      { status: 500 }
    );
  }
};

/**
 * Create Ghost blog posts from Google Photos albums.
 * @param args the {@link ActionArgs}
 * @returns
 */
export const action = async ({ request }: ActionArgs) => {
  // get the user data or redirect to / if it failed
  const user = await authenticator.isAuthenticated(request, {
    failureRedirect: "/",
  });

  const formData = await request.formData();

  const postDetails = {} as Record<string, PartialCreatePostDetail>;

  Array.from(formData.entries()).forEach(([key, value]) => {
    const [index, field] = key.split(".");

    if (!postDetails[index]) {
      postDetails[index.toString()] = {};
    }

    // Any selected albums will have an `albumId` property
    if (
      (field === "albumId" || field === "postTitle") &&
      typeof value === "string"
    ) {
      postDetails[index.toString()][field] = value;
    }
  });

  const createPostDetails = Object.entries(postDetails).reduce(
    (acc, [key, albumDetail]) => {
      const albumId = albumDetail?.albumId ?? null;
      const postTitle = albumDetail?.postTitle ?? null;

      if (albumId && postTitle) {
        acc.push({
          albumId,
          postTitle,
        });
      }

      return acc;
    },
    [] as CreatePostDetail[]
  );

  const { accessToken } = user;
  const ghostAdminAPIKey: string | null =
    process.env?.GHOST_ADMIN_API_KEY ?? null;
  const ghostAdminAPIURL: string | null =
    process.env?.GHOST_ADMIN_API_URL ?? null;

  if (ghostAdminAPIKey === null) {
    throw typedjson({
      message: "GHOST_ADMIN_API_KEY is not defined in process.env",
    });
  }

  if (ghostAdminAPIURL === null) {
    throw typedjson({
      message: "GHOST_ADMIN_API_URL is not defined in process.env",
    });
  }

  const detailsWithMediaItems = await addMediaItems({
    accessToken,
    createPostDetails,
  });

  const postsWithImages = await uploadToGhost({
    accessToken,
    ghostAdminAPIKey,
    ghostAdminAPIURL,
    detailsWithMediaItems,
  });

  const albumPostResults = await createBlogPosts({
    ghostAdminAPIKey,
    ghostAdminAPIURL,
    postsWithImages,
  });

  return typedjson(albumPostResults);
};

export default function Index() {
  const albumPostResults = useTypedActionData<typeof action>();
  const albums = useTypedLoaderData<typeof loader>() as GooglePhotosAlbum[];

  const navigation = useNavigation();

  return (
    <>
      <Form method="post">
        <h1>Sync Google Photos Albums to Ghost Blog Posts</h1>
        <Form
          method="post"
          action="/sign-out"
          style={{ marginTop: 20, marginBottom: 20 }}
        >
          <button type="submit">Sign Out</button>
        </Form>
        <h2>Google Photos Albums</h2>
        {albums.length < 1 && <p>No albums were found.</p>}
        {albums.length > 0 && (
          <>
            <p>
              Each album that you select from the list below will be imported as
              a new Ghost blog post. You can edit the blog post title in the
              right column.
            </p>
            <div style={{ width: 880 }}>
              <table
                className="grid-table"
                style={{
                  gridTemplateColumns: "80px 400px 400px",
                }}
              >
                <tr style={{ display: "contents" }}>
                  <th>Import</th>
                  <th>Album Title</th>
                  <th>as Blog Post Title</th>
                </tr>
                {albums.map((album, index) => (
                  <tr key={album.id} style={{ display: "contents" }}>
                    <td>
                      <input
                        type="checkbox"
                        value={album.id}
                        name={`${index}.albumId`}
                        id={`${index}.id`}
                      ></input>
                    </td>
                    <td>
                      <label htmlFor={album.id}>{album.title}</label>
                    </td>
                    <td style={{ width: "100%", paddingRight: 10 }}>
                      <PostTitle album={album} index={index} />
                    </td>
                  </tr>
                ))}
              </table>
            </div>
          </>
        )}
        <p>
          To create blog posts from the currently selected albums, click
          "Submit."
        </p>
        <button disabled={navigation.state !== "idle"} type="submit">
          Submit
        </button>
      </Form>
      {navigation.state === "submitting" && (
        <p>Processing request, please wait...</p>
      )}
      {albumPostResults && albumPostResults?.length > 0 && (
        <>
          <h2>Results</h2>
          <div style={{ width: 660 }}>
            <table
              className="grid-table"
              style={{
                gridTemplateColumns: "400px 100px 160px",
              }}
            >
              <tr style={{ display: "contents" }}>
                <th>Blog Post</th>
                <th>Album</th>
                <th>Images</th>
              </tr>
              {albumPostResults.map(
                ({ albumId, url, title, images }, index) => (
                  <tr key={albumId} style={{ display: "contents" }}>
                    <td style={{ width: "100%" }}>
                      <a href={url} target="_blank" rel="noreferrer">
                        {title}
                      </a>
                    </td>
                    <td>
                      <CSVDownloader
                        filename={`album_${albumId}`}
                        extension=".csv"
                        datas={[{ albumId, url, title }]}
                      >
                        <button>Album CSV</button>
                      </CSVDownloader>
                    </td>
                    <td>
                      <CSVDownloader
                        filename={`album_${albumId}_images`}
                        extension=".csv"
                        // @ts-ignore
                        datas={images}
                      >
                        <button>{`Images CSV: ${images.length} rows`}</button>
                      </CSVDownloader>
                    </td>
                  </tr>
                )
              )}
            </table>
          </div>
        </>
      )}
    </>
  );
}
