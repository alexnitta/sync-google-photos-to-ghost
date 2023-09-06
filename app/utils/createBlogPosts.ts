import GhostAdminAPI from "@tryghost/admin-api";

import type {
  GhostAdminAPIMethods,
  PostDetails,
  PostWithProcessedImages,
  AlbumPostResult,
  AlbumPostCSVRow,
  ProcessedImage,
} from "~/types";

import { albumPostsToCSVData } from "./albumPostsToCSVData";

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

    return {
      albumId,
      elements,
      processedImages,
      state: "success",
      ...post,
    };
  } catch (e) {
    let message = "Unknown error when adding post";
    if (e instanceof Error) {
      ({ message } = e);
    }

    return {
      ...postDetails,
      state: "error",
      error: message,
    };
  }
};

const getPostDetails = (post: PostWithProcessedImages): PostDetails => {
  const { postTitle, processedImages } = post;

  const elements = processedImages.reduce(
    (acc: string[], processedImage: ProcessedImage): string[] => {
      const { mediaItem, uploadImageResult } = processedImage;

      if (uploadImageResult === null || uploadImageResult?.state === "error") {
        return acc;
      }

      const { ghostImageURL } = uploadImageResult;

      const img = `<img src="${ghostImageURL}" />`;

      if (mediaItem.description && mediaItem.description.length > 0) {
        const figcaption = `<figcaption>${processedImage.mediaItem.description}</figcaption>`;
        acc.push(`<figure>${img}${figcaption}</figure>`);
      } else {
        acc.push(img);
      }

      return acc;
    },
    [] as string[]
  );

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
}: CreateBlogPostsInput): Promise<AlbumPostCSVRow[]> => {
  const api = new GhostAdminAPI({
    key: ghostAdminAPIKey,
    url: ghostAdminAPIURL,
    version: "v5.0",
  });

  const postDetails = postsWithImages.map(getPostDetails);

  const addPostPromises = postDetails.map(postDetails =>
    addPostForAlbum(api, postDetails)
  );

  const addedPosts = Array.from(await Promise.all(addPostPromises));

  return addedPosts.map(albumPostsToCSVData);
};
