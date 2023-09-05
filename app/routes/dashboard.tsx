import { useState } from "react";
import { Form, useNavigate, useNavigation } from "@remix-run/react";
import type { ActionArgs } from "@remix-run/node";
import {
  typedjson,
  useTypedActionData,
  useTypedLoaderData,
} from "remix-typedjson";
import { useDeepCompareCallback } from "use-deep-compare";

import { authenticator } from "~/services/auth.server";
import { uploadToGhost, addMediaItems, createBlogPosts } from "~/utils";
import type {
  GooglePhotosAlbum,
  CreatePostDetail,
  PartialCreatePostDetail,
} from "~/types";
import { PostTitle } from "~/components";

import { albumsSchema, loader } from "./api.get-albums";

export { loader };

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
  const initialAlbums = useTypedLoaderData<
    typeof loader
  >() as GooglePhotosAlbum[];
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [albums, setAlbums] = useState<GooglePhotosAlbum[]>(initialAlbums);

  const navigate = useNavigate();
  const navigation = useNavigation();

  const fetchAlbums = useDeepCompareCallback(() => {
    setLoadingAlbums(true);

    fetch("/api/get-albums").then(res => {
      if (res.status === 401) {
        fetch("/sign-out", { method: "POST" }).then(() => {
          navigate("/");
          alert("Your session has expired. Please sign in again.");
        });
      } else {
        res
          .json()
          .then(data => {
            try {
              albumsSchema.parse(data);
              setAlbums(data);
            } catch (e) {
              console.log(`Failed to parse albums; error:\n${e}`);
            }
            setLoadingAlbums(false);
          })
          .catch(e => {
            console.log(e);
          });

        setLoadingAlbums(false);
      }
    });
  }, [navigate]);

  return (
    <>
      <Form method="post">
        <h1>Google Photos Albums</h1>
        <Form
          method="post"
          action="/sign-out"
          style={{ marginTop: 20, marginBottom: 20 }}
        >
          <button type="submit">Sign Out</button>
        </Form>
        <button
          type="submit"
          onClick={fetchAlbums}
          style={{ marginBottom: 20 }}
        >
          Refresh album list
        </button>
        {loadingAlbums && <p>Loading albums...</p>}
        {!loadingAlbums && (
          <>
            {albums.length < 1 && <p>No albums were found.</p>}
            {albums.length > 0 && (
              <table
                style={{
                  display: "grid",
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
                    <td style={{ width: "100%" }}>
                      <PostTitle album={album} index={index} />
                    </td>
                  </tr>
                ))}
              </table>
            )}
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
          <table
            style={{
              display: "grid",
              gridTemplateColumns: "400px 100px",
            }}
          >
            <tr style={{ display: "contents" }}>
              <th>Blog Post</th>
              <th>CSV Report</th>
            </tr>
            {albumPostResults.map((result, index) => (
              <tr key={result.albumId} style={{ display: "contents" }}>
                <td style={{ width: "100%" }}>
                  <a href={result.url}>{result.title}</a>
                </td>
                <td>Download</td>
              </tr>
            ))}
          </table>
        </>
      )}
    </>
  );
}
