import axios from "axios";

import type {
  GooglePhotosMediaItem,
  CreatePostDetail,
  CreatePostDetailWithMediaItems,
} from "~/types";

interface AddMediaItemsInput {
  /**
   * the Google Photos access token
   */
  accessToken: string;
  /**
   * the array of post details to fetch media items for
   */
  createPostDetails: CreatePostDetail[];
}

/**
 * @param input {@link AddMediaItemsInput}
 * @returns an array of promises that will resolve to the post details with media items added
 */
export const addMediaItems = async ({
  accessToken,
  createPostDetails,
}: AddMediaItemsInput): Promise<CreatePostDetailWithMediaItems[]> => {
  const promises = createPostDetails.map(
    (
      createPostDetail: CreatePostDetail
    ): Promise<CreatePostDetailWithMediaItems> =>
      new Promise((resolve, reject) => {
        axios<{ mediaItems: GooglePhotosMediaItem[] }>({
          url: `https://photoslibrary.googleapis.com/v1/mediaItems:search`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          method: "post",
          data: { pageSize: 100, albumId: createPostDetail.albumId },
        })
          .then(mediaResponse => {
            const albumWithMediaItems = {
              ...createPostDetail,
              mediaItems: mediaResponse.data.mediaItems,
            };

            resolve(albumWithMediaItems);
          })
          .catch(e => {
            let message = "";
            if (e instanceof Error) {
              ({ message } = e);
            }
            reject(
              new Error(`Failed to fetch media items due to error:\n${message}`)
            );
          });
      })
  );

  const promiseSettledResults = await Promise.allSettled(promises);

  const result = Array.from(promiseSettledResults).reduce(
    (acc, result) => {
      if (result.status === "fulfilled") {
        acc.fulfilled.push(result.value);
      } else {
        acc.rejected.push(result);
      }
      return acc;
    },
    {
      fulfilled: [] as CreatePostDetailWithMediaItems[],
      rejected: [] as PromiseRejectedResult[],
    }
  );

  if (result.rejected.length > 0) {
    throw new Error(
      `Failed to fetch media items for ${result.rejected.length} album(s)`
    );
  }

  return result.fulfilled;
};
