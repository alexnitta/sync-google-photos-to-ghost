import jwt from "jsonwebtoken";
import fs from "fs";
import PQueue from "p-queue";

import type {
  CreatePostDetailWithMediaItems,
  ProcessedImage,
  PostWithProcessedImages,
} from "~/types";

import { imageDirectory } from "./constants";
import { downloadImageToFile, uploadImageFromFileToGhost } from ".";

/** If this app were serving more than one user, we would want
 * to set up the queues on a per-user basis, but we don't need to do that yet.
 */

/**
 * We only process one album at a time.
 */
const albumQueue = new PQueue({ concurrency: 1 });
/**
 * Within the single album that is being processed, we process up to 5 images at a time, but we
 * throttle the start of each image processing on a 20ms interval. If there is some rate limiting
 * happening in the Ghost storage backend, this should help avoid hitting the rate limit.
 */
const imageQueue = new PQueue({
  concurrency: 5,
  interval: 20,
  intervalCap: 1,
});

interface UploadToGhostInput {
  /**
   * The Google Photos access token
   */
  accessToken: string;
  /**
   * The Ghost Admin API key
   */
  ghostAdminAPIKey: string;
  /**
   * The Ghost Admin API URL
   */
  ghostAdminAPIURL: string;
  /**
   * The array of post details with their respective media items
   */
  detailsWithMediaItems: CreatePostDetailWithMediaItems[];
  /**
   * The max height to use when downloading the image from Google Photos
   */
  imageMaxHeight: number;
  /**
   * The max width to use when downloading the image from Google Photos
   */
  imageMaxWidth: number;
}

/**
 * Downloads an image to a file in the local filesystem and uploads it to the Ghost blog.
 * @param input {@link UploadToGhostInput}
 * @returns an array of posts where each contains the result of uploading its media items to Ghost
 */
export const uploadToGhost = async ({
  accessToken,
  ghostAdminAPIKey,
  ghostAdminAPIURL,
  detailsWithMediaItems,
  imageMaxHeight,
  imageMaxWidth,
}: UploadToGhostInput): Promise<PostWithProcessedImages[]> => {
  const [id, secret] = ghostAdminAPIKey.split(":");
  const ghostAPIToken = jwt.sign({}, Buffer.from(secret, "hex"), {
    keyid: id,
    algorithm: "HS256",
    expiresIn: "5m",
    audience: `/admin/`,
  });

  // Create temporary /images directory to contain downloaded images

  if (!fs.existsSync(imageDirectory)) {
    fs.mkdirSync(imageDirectory);
  }

  const postsWithProcessedImages = detailsWithMediaItems.map(details =>
    albumQueue.add<PostWithProcessedImages>(async () => {
      const processImagePromises = details.mediaItems.map(
        (mediaItem): Promise<ProcessedImage | void> => {
          if (mediaItem.mimeType !== "image/jpeg") {
            // We only want to process the data for images, not videos.
            return new Promise(resolve => {
              resolve({
                mediaItem,
                downloadImageResult: null,
                uploadImageResult: null,
              });
            });
          }

          return imageQueue.add<ProcessedImage>(
            () =>
              new Promise<ProcessedImage>(resolve => {
                downloadImageToFile({
                  accessToken,
                  mediaItem,
                  imageMaxHeight,
                  imageMaxWidth,
                }).then(downloadImageResult => {
                  if (downloadImageResult.state === "error") {
                    resolve({
                      mediaItem,
                      downloadImageResult,
                      uploadImageResult: null,
                    });
                  } else {
                    uploadImageFromFileToGhost(
                      downloadImageResult,
                      ghostAPIToken,
                      ghostAdminAPIURL
                    ).then(uploadImageResult => {
                      resolve({
                        mediaItem,
                        downloadImageResult,
                        uploadImageResult,
                      });
                    });
                  }
                });
              })
          );
        }
      );

      const processedImages = Array.from(
        await Promise.all(processImagePromises)
      ).filter(value => value !== undefined) as ProcessedImage[];

      // Delete temporary /images directory
      fs.rmSync(imageDirectory, { recursive: true, force: true });

      return {
        ...details,
        processedImages,
      };
    })
  );

  return Array.from(await Promise.all(postsWithProcessedImages)).filter(
    value => value !== undefined
  ) as PostWithProcessedImages[];
};
