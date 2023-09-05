import GhostAdminAPI from "@tryghost/admin-api";

import type {
  GhostAdminAPIMethods,
  PostDetails,
  PostWithProcessedImages,
  AlbumPostResult,
} from "~/types";

const addPostForAlbum = async (
  api: GhostAdminAPIMethods,
  postDetails: PostDetails
): Promise<AlbumPostResult> => {
  const { title, elements, processedImages, albumId } = postDetails;

  try {
    const post = await api.posts.add(
      {
        title,
        html: elements.join(""),
      },
      {
        source: "html",
      }
    );

    console.log("post: ", JSON.stringify(post, null, 4));

    return {
      albumId,
      elements,
      processedImages,
      ...post,
    };
  } catch (e) {
    let message = "";
    if (e instanceof Error) {
      ({ message } = e);
    }

    throw new Error(`Caught error when adding post:\n${message}`);
  }
};

const getPostDetails = (post: PostWithProcessedImages): PostDetails => {
  const { postTitle, processedImages } = post;

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

  return { ...post, title: postTitle, elements };
};

interface CreateBlogPostsInput {
  ghostAdminAPIKey: string;
  ghostAdminAPIURL: string;
  postsWithImages: PostWithProcessedImages[];
}

export const createBlogPosts = async ({
  ghostAdminAPIKey,
  ghostAdminAPIURL,
  postsWithImages,
}: CreateBlogPostsInput): Promise<AlbumPostResult[]> => {
  const api = new GhostAdminAPI({
    key: ghostAdminAPIKey,
    url: ghostAdminAPIURL,
    version: "v5.0",
  });

  const postDetails = postsWithImages.map(getPostDetails);

  console.log("postDetails: ", JSON.stringify(postDetails, null, 4));

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
  }, [] as AlbumPostResult[]);

  return addedPosts;
};
