import GhostAdminAPI from "@tryghost/admin-api";

import type {
  GhostAdminAPIMethods,
  Post,
  PostDetails,
  AlbumWithProcessedImages,
} from "~/types";

const addPostForAlbum = async (
  api: GhostAdminAPIMethods,
  postDetails: PostDetails
): Promise<Post> => {
  const { cleanedTitle, elements } = postDetails;

  try {
    return api.posts.add(
      {
        title: cleanedTitle,
        html: elements.join(""),
      },
      {
        source: "html",
      }
    );
  } catch (e) {
    let message = "";
    if (e instanceof Error) {
      ({ message } = e);
    }

    throw new Error(`Caught error when adding post:\n${message}`);
  }
};

const getPostDetails = (album: AlbumWithProcessedImages): PostDetails => {
  const { cleanedTitle, processedImages } = album;

  const elements = processedImages.map(processedImage => {
    const img = `<img src="${processedImage.ghostImageURL}" />`;

    if (
      processedImage.mediaItem.description &&
      processedImage.mediaItem.description.length > 0
    ) {
      const figcaption = `<figcaption>${processedImage.mediaItem.description}</figcaption>`;

      return `<figure>${img}${figcaption}</figure>`;
    }

    return img;
  });

  return { cleanedTitle, elements };
};

export const createBlogPosts = async (
  ghostAdminAPIKey: string,
  ghostAdminAPIURL: string,
  processedAlbums: AlbumWithProcessedImages[]
): Promise<Post[]> => {
  console.log("ghostAdminAPIKey: ", JSON.stringify(ghostAdminAPIKey, null, 4));
  console.log("ghostAdminAPIURL: ", JSON.stringify(ghostAdminAPIURL, null, 4));

  const api = new GhostAdminAPI({
    key: ghostAdminAPIKey,
    url: ghostAdminAPIURL,
    version: "v5.0",
  });

  const postDetails = processedAlbums.map(getPostDetails);

  const addPostPromises = postDetails.map(postDetails =>
    addPostForAlbum(api, postDetails)
  );

  const addPostPromiseResults = Array.from(
    await Promise.allSettled(addPostPromises)
  );

  const addedPosts = addPostPromiseResults.reduce((acc, result) => {
    if (result.status === "fulfilled") {
      acc.push(result.value);
    } else {
      console.error(
        "Failed to add post; result: ",
        JSON.stringify(result, null, 4)
      );
    }

    return acc;
  }, [] as Post[]);

  return addedPosts;
};
