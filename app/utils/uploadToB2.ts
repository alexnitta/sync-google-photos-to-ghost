import fs from "fs";
import PQueue from "p-queue";
import snakeCase from "just-snake-case";

import type {
  BackblazeB2Config,
  CreatePostDetailWithMediaItems,
  ProcessedImage,
  PostWithProcessedImages,
} from "~/types";

import { imageDirectory } from "./constants";
import { downloadImageToFile, uploadImageFromFileToB2 } from ".";

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

interface UploadToB2Input {
  /**
   * The Google Photos access token
   */
  accessToken: string;
  /**
   * The Backblaze B2 configuration
   */
  backblazeB2Config: BackblazeB2Config;
  /**
   * The array of post details with their respective media items
   */
  detailsWithMediaItems: CreatePostDetailWithMediaItems[];
  /**
   * The URL prefix to use for the uploaded image. If passed in, it will be prepended to the key
   * to create the URL. If not passed in, the URL will read from the B2 upload result. This is
   * useful if you want to use a CDN like Cloudflare to serve the images, rather than serving them
   * directly from Backblaze B2.
   */
  ghostImageURLPrefix?: string;
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
 * Downloads an image to a file in the local filesystem and uploads it to the Backblaze B2 bucket.
 * @param input {@link UploadToGhostInput}
 * @returns an array of posts where each contains the result of uploading its media items to the
 * bucket
 */
export const uploadToB2 = async ({
  accessToken,
  backblazeB2Config,
  detailsWithMediaItems,
  ghostImageURLPrefix,
  imageMaxHeight,
  imageMaxWidth,
}: UploadToB2Input): Promise<PostWithProcessedImages[]> => {
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
                // Create a key prefix for the image, which is combined with the JPEG filename to
                // create the path where the file will be stored in the bucket.
                const keyPrefix = `remix_uploads/${snakeCase(
                  details.postTitle
                )}`;

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
                    uploadImageFromFileToB2({
                      downloadImageResult,
                      backblazeB2Config,
                      ghostImageURLPrefix,
                      keyPrefix,
                    }).then(uploadImageResult => {
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
