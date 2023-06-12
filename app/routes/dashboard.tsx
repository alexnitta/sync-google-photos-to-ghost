import { Form } from "@remix-run/react";
import type { ActionArgs } from "@remix-run/node";
import { typedjson, useTypedActionData } from "remix-typedjson";

import { authenticator } from "~/services/auth.server";
import { processAlbums, createBlogPosts } from "~/utils";

/**
 * Finds any albums from Google Photos that have not yet been uploaded to the Ghost blog, then
 * creates a blog post for each album.
 * @param args the {@link ActionArgs}
 * @returns
 */
export const action = async ({ request }: ActionArgs) => {
  // get the user data or redirect to / if it failed
  const user = await authenticator.isAuthenticated(request, {
    failureRedirect: "/",
  });

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

  const processedAlbums = await processAlbums(
    accessToken,
    ghostAdminAPIKey,
    ghostAdminAPIURL
  );

  const addedPosts = await createBlogPosts(
    ghostAdminAPIKey,
    ghostAdminAPIURL,
    processedAlbums
  );

  return typedjson(addedPosts);
};

export default function Index() {
  const addedPosts = useTypedActionData<typeof action>();

  console.log("addedPosts: ", JSON.stringify(addedPosts, null, 4));

  return (
    <>
      <h1>Sync Google Photos to Ghost</h1>
      <p>
        Click "Sync Now" to sync your Google Photos albums to Ghost blog posts.
      </p>
      <p>
        This will trigger an asynchronous script that reads your Google Photos
        albums and filters them to a list of "unposted" albums, i.e. those that
        have not yet been synced to blog posts. Only albums that have the string{" "}
        <code>{`(Blog post)`}</code> (not case sensitive) will be included. They
        will be treated as unposted if there is not a blog post with the same
        title (missing the special filtering string). For example, if a Google
        Photos album with the title "A test album (blog post)" is found, and
        there is not a blog post with the title "A test album", the script will
        go ahead and create the blog post for you.
      </p>
      <p>
        To create the post, the script will download each of the images in the
        Google Photos album, then upload them to the Ghost blog's image storage.
        Next, it will create a blog post that contains an <code>{`<img>`}</code>{" "}
        element for each image. If the image has a description in Google Photos,
        the description will be used as the <code>{`<figcaption>`}</code> and
        both the
        <code>{`<img>`}</code> and <code>{`<figcaption>`}</code> will be wrapped
        with a <code>{`<figure>`}</code>.
      </p>
      <Form method="post">
        <button type="submit">Sync Now</button>
      </Form>
      <Form method="post" action="/sign-out" style={{ marginBlockStart: 20 }}>
        <button type="submit">Sign Out</button>
      </Form>
      <p>Once the script has run, you'll see some output here:</p>
      {(addedPosts?.length ?? null) === 0 && (
        <p>
          You successfully submitted a request, but no Google Photos albums were
          found that have not been used to create blog posts.
        </p>
      )}
      {(addedPosts?.length ?? 0) > 0 && (
        <>
          <p>You successfully created these blog posts:</p>
          {(addedPosts ?? []).map(post => {
            const { id, title, url } = post;

            return (
              <a key={id} href={url}>
                <pre>{JSON.stringify({ id, title, url })}</pre>
              </a>
            );
          })}
        </>
      )}
    </>
  );
}
