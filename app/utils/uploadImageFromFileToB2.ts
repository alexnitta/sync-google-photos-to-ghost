import fs from "fs";

import { uploadImageToB2 } from ".";

import type {
  UploadImageResult,
  DownloadImageSuccess,
  BackblazeB2Config,
} from "~/types";

interface UploadImageFromFileToB2Input {
  /**
   * The result of downloading the image.
   */
  downloadImageResult: DownloadImageSuccess;
  /**
   * The Backblaze B2 configuration
   */
  backblazeB2Config: BackblazeB2Config;
  /**
   * A prefix to use for the key in the bucket (i.e. the filename prefix)
   */
  keyPrefix: string;
  /**
   * The URL prefix to use for the uploaded image. If passed in, it will be prepended to the key
   * to create the URL. If not passed in, the URL will read from the B2 upload result. This is
   * useful if you want to use a CDN like Cloudflare to serve the images, rather than serving them
   * directly from Backblaze B2.
   */
  ghostImageURLPrefix?: string;
}

/**
 * Uploads an image to the Backblaze B2 bucket from a file in the local filesystem
 * @param input a {@link UploadImageFromFileToB2Input} object
 * @returns a Promise that resolves to an {@link UploadImageResult} object
 */
export const uploadImageFromFileToB2 = ({
  downloadImageResult,
  backblazeB2Config,
  keyPrefix,
  ghostImageURLPrefix,
}: UploadImageFromFileToB2Input): Promise<UploadImageResult> =>
  new Promise(resolve => {
    const { imagePath, filenameJPEG } = downloadImageResult;
    const { bucket, region, endpoint, accessKeyID, secretAccessKey } =
      backblazeB2Config;

    const key = `${keyPrefix}/${filenameJPEG}`;

    fs.promises
      .readFile(imagePath)
      .then(file => {
        uploadImageToB2({
          body: file,
          bucket,
          clientConfig: {
            region,
            endpoint,
            credentials: {
              accessKeyId: accessKeyID,
              secretAccessKey,
            },
          },
          key,
        }).then(result => {
          if (!("Location" in result)) {
            resolve({
              ...downloadImageResult,
              state: "error",
              error: "Could not read Location in result of B2 upload",
              failedTask: "parseResponse",
            });
          } else {
            const ghostImageURL = ghostImageURLPrefix
              ? `${ghostImageURLPrefix}/${key}`
              : result.Location;

            if (typeof ghostImageURL !== "string") {
              resolve({
                ...downloadImageResult,
                state: "error",
                error: "Location is undefined in result of B2 upload",
                failedTask: "parseResponse",
              });
            } else {
              resolve({
                ...downloadImageResult,
                ghostImageURL,
              });
            }
          }
        });
      })
      .catch(e => {
        let message = "Unknown error when reading image file";
        if (e instanceof Error) {
          ({ message } = e);
        }
        resolve({
          ...downloadImageResult,
          state: "error",
          error: message,
          failedTask: "readFile",
        });
      });
  });
